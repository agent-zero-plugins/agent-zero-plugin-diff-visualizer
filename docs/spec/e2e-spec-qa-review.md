# QA Review — E2E Test Spec for `agent-zero-plugin-diff-visualizer` (v0.1.2)

**Reviewer stance:** senior QA / E2E expert. Grounded against the live plugin source (`/tmp/fan-diff-visualizer/...`), the live A0 tree (`/a0`), and the real devkit harness (`/a0/src/github.com/agent-zero-plugins/agent-zero-plugin-development-testkit`). Findings are numbered and severity-tagged. Each carries a concrete fix.

**Headline:** the spec is unusually well-grounded and its hard-rules framing (no silent swallow / no fake green / UI-only fixtures / LLM-less probe) is sound and matches devkit DEC-056/057. The DOM-side scenarios are largely correct and faithful to the real renderer. However there are **three Critical** defects that would make the suite either fail to run as written or produce a false negative, plus several Major correctness/robustness gaps. The biggest problems are (a) the probe is placed where the harness cannot mount/serve it, (b) E2E-21 asserts skill fields the A0 API does not return, and (c) two negative scenarios assert outcomes the live code/DOM contradicts.

---

## CRITICAL

### C-1 — `dump_live` probe is placed at `tests/e2e/probe/dump_live.py`, where A0 will never discover or serve it; the registered route does not exist → E2E-20 goes RED for the wrong reason
The spec mounts the probe at `tests/e2e/probe/dump_live.py` and assumes a route `GET /diffviz_probe/system_prompt`. But A0 only auto-discovers API handlers inside a plugin's own `api/` folder (verified: `helpers/plugins.py:201` globs `*(api)*`; the installer's own route lives at `plugins/_plugin_installer/api/plugin_install.py`). A file under `tests/e2e/` is **outside the installed plugin tree** — it is never copied into the pod nor registered as a route. As written, the route is always 404, so E2E-20 is always RED — violating Rule 6's intent (RED must mean "seam genuinely disabled," not "probe never existed").

**Fix:** ship the probe **inside the plugin** as a gated API handler: `usr/plugins/diff_visualizer/api/diffviz_probe.py`, an `ApiHandler` subclass whose `process()` returns `404`/raises unless `os.environ.get("A0_DIFFVIZ_TEST_PROBE") == "1"`. That file is part of the zip, gets installed, and is route-mounted by A0's normal plugin-api discovery. Note this adds an `api/` surface to a plugin the behaviour spec describes as "no API handlers" — call that out as a **test-only, env-gated** handler so it doesn't contradict §D. Alternatively, drop the HTTP route entirely and have the probe be an in-pod CLI invoked over SSH (the harness already has SSH up), returning JSON on stdout — but the api-handler route is closer to the spec's contract.

### C-2 — E2E-21 asserts skill `triggers` and body `content` from the skills-list API, which returns neither
The A0 skills API (`POST /skills`, `action:"list"`, verified `/a0/api/skills.py:60-63`) returns per-skill **only** `{name, description, path}`. It deliberately drops `triggers` and `content` (the `Skill` dataclass has them — `helpers/skills.py:50,58` — but the API projection omits them). E2E-21 hard-asserts "triggers include `diff`, `patch`, …" and "body documents `--- a/` `+++ b/` `@@` …" via the API. That assertion can never pass against the real endpoint → false RED, or worse, tempts a "fake green" relaxation.

**Fix:** split E2E-21 into two falsifiable checks: (1) **discovery** — assert a skill named `diff` appears in the `/skills` `action:"list"` response (this is genuinely served and falsifiable); (2) **content/triggers** — assert these by reading the in-pod file `usr/plugins/diff_visualizer/skills/diff/SKILL.md` through the probe/SSH (the spec already names this as the fallback — promote it to the primary mechanism for the content assertions, since the API cannot supply them). Do not assert triggers/content via the list API.

### C-3 — Harness shape is mis-stated as Gherkin `.feature` + step-defs; the real devkit is Playwright-`test` multi-spec — the PREAMBLE "reproduced verbatim at the top of every `.feature` file" is unbuildable
The spec's artifact-form claim ("source-of-truth for `tests/e2e/specs/*.feature` (Gherkin) backed by Playwright step defs") does not match the real harness. The devkit ships Playwright `test()` specs discovered via `BEHAVIOUR_SPECS` JSON `[{name,path}]` (verified `e2e/harness/run-lifecycle.sh:49`, `playwright-base.config.ts testDir`), with first-class fixtures (`createA0Fixtures`, `loggedInPage`, `pluginsPage`) and page objects (`PluginsPage`). There is no Gherkin/Cucumber layer anywhere in the testkit. A suite authored as `.feature` files would not run.

**Fix:** restate the artifact form as **grouped Playwright spec files** (≤10 per DEC-056), e.g. `tests/e2e/group-a.spec.ts … group-j.spec.ts`, each registered in `BEHAVIOUR_SPECS`. Keep the HARD RULES block as a shared header comment in a `tests/e2e/_hardrules.ts` or the top of each spec — but drop "verbatim in every `.feature` file." Re-use the real `PluginsPage` (it already exposes `topNavButton`, `customTab`, `installButton`, `zipTab`, `zipFileInput`, `installedCard`, `open()`), rather than inventing a parallel `PluginsPage.open()` API. (Good news: the spec's invented selectors happen to match the real page object almost exactly — see N-1 — so this is mostly a relabeling, not a redesign.)

---

## MAJOR

### M-1 — E2E-24's "no Config affordance" risks a false GREEN unless it asserts the live gating condition precisely
The live card only renders the Config button under `x-if="plugin.has_config_screen"` (verified `plugin-list.html`), and `has_config_screen = exists(webui/config.html)` (verified `helpers/plugins.py:263`). diff_visualizer ships only `webui/.gitkeep` + `thumbnail.png`, so the button is correctly absent — the assertion is *true*. But asserting "no `getByRole('button',{name:/Config|Settings|Configure/i})` in the card" is weak: a card with the More-actions kebab collapsed, or a slow Alpine render, can make the locator transiently absent regardless of the real reason, yielding a pass that doesn't prove the gate. 

**Fix:** make it positively falsifiable: assert the plugins_list payload for `diff_visualizer` has `has_config_screen === false` (query `plugins_list` via `page.request`/`callJsonApi`), AND assert the rendered card shows the Info button (kebab present) but no Config button. Anchoring on the API field makes "no config surface" a deterministic, non-timing assertion.

### M-2 — E2E-13 (malformed diff) leans on an in-test `Diff2Html.html(...)` evaluate to "decide the branch," which couples the assertion to library internals and can flip non-deterministically
The "determinism guard" (run `window.Diff2Html.html(...)` in-page, then flip the assertion based on whether it contains `d2h-wrapper`) is clever but fragile: it asserts whatever diff2html *happens* to do for that input on that version, not the plugin's documented contract. If a future diff2html patch changes how it treats non-diff prose, the scenario's expected outcome silently changes. That is close to "asserting the implementation, not the behaviour."

**Fix:** pick an input whose branch is *deterministic by construction*. To exercise BEH-3b (the `!rendered.includes('d2h-wrapper')` gate) deterministically, stub `window.Diff2Html.html` via `addInitScript` to return a fixed string **without** `d2h-wrapper` (e.g. `"<div>nope</div>"`), then inject a valid `language-diff` block and assert: no container, original block intact, marker removed. That pins the plugin's gate directly and removes the library-version coupling. Keep the "prose input" case only as a soft, non-flipping smoke check if desired.

### M-3 — E2E-14 (empty block) asserts "no new CDN request," but `renderDiffBlock` calls `diff2htmlReady()` only AFTER the empty-source early return — the assertion is right but the rationale (and prior-state bookkeeping) is under-specified and order-dependent
Verified: `renderDiffBlock` strips trailing whitespace, returns on empty **before** `diff2htmlReady()` (lines 111-113). So an empty block triggers zero CDN load. But the spec says "no *new* d2h JS request beyond any prior" — in a fresh `diffPage` with no prior diff, the count should be exactly 0, full stop. The "beyond any prior" hedge invites order-dependence and a non-deterministic baseline if the fixture isn't truly fresh.

**Fix:** run E2E-14 on a guaranteed-fresh page (no prior injections), set up the CDN network listener before injection, and assert **exactly 0** requests to `…diff2html…`. Drop "beyond any prior." Also: the spec correctly notes the marker may remain `data-diff-processed="true"` on the empty block (early return happens after `setAttribute`, before the removal paths) — keep that assertion, it's accurate and a nice falsifiable detail.

### M-4 — E2E-9's Escape-listener "leak check" does not actually prove the listener was detached; it proves something weaker
The cleanup contract (BEH-5) is that `close()` calls `window.removeEventListener('keydown', esc)`. The spec's leak check ("open, close via button, press Escape, assert no error and overlay stays 0") cannot distinguish "listener removed" from "listener still attached but harmless because the overlay is already gone" — a stale `esc` closure calling `overlay.remove()` on a detached node throws nothing and changes nothing. So a real leak would pass this check.

**Fix:** to make detachment falsifiable, instrument it: in `addInitScript`, wrap `window.addEventListener`/`removeEventListener` for `keydown` to maintain a counter on `window.__diffvizKeydownListeners`; after opening then closing the overlay, assert the count returned to its pre-open baseline. That directly asserts the remove ran. (Alternatively accept that listener-leak is not browser-observable and downgrade E2E-9 to assert only the Escape-close behaviour, explicitly noting the leak itself is not e2e-falsifiable — but the instrumented counter is the honest hard-assert.)

### M-5 — E2E-19 (theme adaptivity) compares computed `background-color` to the resolved `--color-panel` string, which will mismatch on rgb/rgba serialization and alpha-compositing
`getComputedStyle(el).backgroundColor` always returns a serialized `rgb()`/`rgba()` string; `getPropertyValue('--color-panel')` returns the *raw declared token* (could be a hex, a named color, another var, or have whitespace). Direct string equality (`container bg === resolvedVar`) will routinely fail even when the var is genuinely consumed. Worse, if the theme's `--color-panel` has alpha, the container's painted color composites over its parent, so the computed value won't equal the token.

**Fix:** assert the *mechanism* without brittle equality: (1) assert the two themes produce **different** computed `background-color` for `.diff-visualizer-container` (proves var-driven, not hardcoded) — this is the robust core check the spec already includes; keep it as the primary. (2) Drop the "equals resolved `--color-panel`" equality; if you want a tighter check, normalize both sides by painting each into a throwaway element and reading back `getComputedStyle`, then compare. (3) The fixed-tint assertions (`.d2h-ins === rgba(46,160,67,0.15)`, `.d2h-del === rgba(248,81,73,0.15)`) are correct and version-stable (verified CSS lines 285-286) — keep those as the deterministic anchor.

### M-6 — The "enable through the real Plugins UI" fixture omits the confirm-dialog branch that the live toggle can raise
`installedDiffViz` enables via "the card's enable toggle." The live toggle path (`pluginListStore`→`toggle_plugin`, verified) pops a JS `confirm` *only when* the plugin has advanced per-scope overrides (`plugin.toggle_state === 'advanced'`). A freshly installed store-gated plugin won't have overrides, so normally no dialog — but if a prior test run left overrides, the enable click stalls on an unhandled dialog and the fixture hangs.

**Fix:** register a `page.on('dialog', d => d.accept())` (or assert-and-accept) in the enable fixture, and make `installedDiffViz` idempotent by first checking the plugins_list `enabled`/toggle state and short-circuiting if already enabled. Also pin the exact enable affordance: the live UI's global toggle is the per-plugin enable control surfaced in the card/toggle component — assert against the real control, not a hypothetical "enable toggle."

### M-7 — E2E-4's "exactly one JS request" can flake on Playwright response filtering and HTTP caching across the two injections
Asserting `responses.filter(js).length === 1` across two injections is correct *intent* (memoised promise + id-guard, verified lines 25-40, 16), but the listener must be attached **before navigation/first injection**, must match the pinned URL precisely (`…@3.4.51/bundles/js/diff2html.min.js`), and must not double-count redirects/preflights. Also the second injection only avoids a refetch because `window.Diff2Html.html` is already defined (line 27 short-circuit) — that's the real guarantee, not the in-flight promise.

**Fix:** attach the `page.on('request')` (or `requestfinished`) listener in `beforeEach`/before the first injection; filter on `r.url().includes('diff2html') && r.url().endsWith('.js')`; assert count `=== 1` after both `.d2h-wrapper`s exist. Add an explicit wait that the *second* container rendered before counting (otherwise a race can count before the second injection settled and report 1 spuriously). Keep the `#diff2html-css` count `=== 1` and href assertions — those are solid.

---

## MINOR

### m-1 — E2E-2's `width===28px && height===28px` is layout-fragile
Computed box can be 28px content + border (`border:1px`), so `getBoundingClientRect().width` may read 30px depending on box-sizing. The CSS sets `width:28px;height:28px;border:1px` with no explicit `box-sizing` (verified lines 236-238). Assert computed *style* `width`/`height` `=== "28px"` (style, not bounding box) and `overflow === "hidden"`, rather than rendered geometry.

### m-2 — `text-transform: uppercase` check vs the literal text
E2E-2 asserts label text matches `/^Diff$/i` *and* computed `text-transform: uppercase`. The DOM text node is literally `"Diff"` (verified line 149); uppercase is purely presentational. The regex + computed-style pair is fine, but don't additionally assert the *rendered* text is `"DIFF"` (it isn't in the DOM) — the spec correctly avoids that; just keep it that way.

### m-3 — E2E-6 overlay viewport-cover assertion needs tolerance
Asserting the overlay bounding box "covers viewport (inset:0)" can be off by sub-pixel/scrollbar widths. Assert computed `position:"fixed"` and `inset`/`top/left/right/bottom` style values are `"0px"` rather than measuring the box against `window.innerWidth/Height`.

### m-4 — E2E-16 multi-file count selector ambiguity
The spec offers `.d2h-file-wrapper` OR `.d2h-file-side-diff` "file groups" `=== 2`. In side-by-side mode diff2html emits one `.d2h-file-wrapper` per file but **two** `.d2h-file-side-diff` per file (left/right). Pin the count to `.d2h-file-wrapper === 2` (or `.d2h-file-name === 2`); do not count `.d2h-file-side-diff` for "files" (it'll be 4).

### m-5 — Coverage tally arithmetic
The footer says `TOTAL: asserted=27 skipped=1`. The coverage map enumerates E2E-1..E2E-24 but with gaps/renumbering (E2E-12..E2E-14, E2E-15..E2E-17, E2E-18/22/23, E2E-19/20/21, E2E-24) and group sub-tallies summing to 25 asserted + 1 skipped by my count (A:3,B:2,C:1,D:3,E:2+1skip,F:3,G:3,H:3,I:3,J:1 = 24 asserted +1). Reconcile the per-group tallies, the coverage-map rows, and the footer so the harness's "tally vs declared scenario count" reconciliation (which the spec itself mandates) doesn't RED on a counting mismatch.

### m-6 — `meta.yaml` has no `display_name`; card label resolves from `title`
The spec's `.devkit.yml` sets `display_name: "DiffVisualizer"` and `installedCard("DiffVisualizer")`. Live resolution is `display_name = meta.title or dir.name` (verified `helpers/plugins.py:291`); `meta.yaml` has `title: "DiffVisualizer"` (verified), so the card label is `"DiffVisualizer"` — consistent. Just note `installedCard` matches on `<img alt="DiffVisualizer">` (verified PluginsPage scoping); confirm the plugin's `thumbnail.png` produces an `alt` of the display name, else scope the card by the kebab + title text instead.

---

## GAPS (coverage)

### G-1 — No scenario asserts the streaming-render path through A0's *real* markdown pipeline
Every DOM scenario injects a hand-built `markdown-block-wrap` node. That faithfully reproduces `messages.js` output (verified lines 1769-1775: `code → pre.code-block-wrapper → markdown-block-wrap`), and is the right call for determinism (no LLM). But nothing proves the plugin survives A0 *also* appending its own `.step-action-buttons` copy button into the same `markdown-block-wrap` (verified lines 1768-1776). The plugin does `blockWrapper.replaceWith(container)` on the whole `markdown-block-wrap` — which would *discard* A0's copy button. That's likely intended, but untested.

**Fix:** add one scenario whose injected fixture mirrors A0 exactly *including* the trailing `.step-action-buttons` child, and assert the post-transform state (container present; A0's copy button gone, which is the real behaviour). This closes the fidelity gap between the fixture and true `messages.js` output.

### G-2 — BEH-8 ordering assertion is hand-waved
E2E-20 says "best-effort positional check" for the `_15_` ordering and "hard-assert only presence if no other extensions exist." On stock `agent0ai/agent-zero:latest` there are almost certainly other `system_prompt` extensions, so "ordering" silently degrades to best-effort — a soft spot in an otherwise hard-assert suite. The probe already returns the full ordered list; ordering IS deterministically assertable.

**Fix:** have the probe return the assembled list; hard-assert the nudge entry's index is **greater than** any entry contributed by a lower-numbered prefix that the probe can identify, or at minimum assert the nudge is present and appears after the first element. Make it a hard assertion, not best-effort, since the data is fully available.

### G-3 — No scenario exercises `matching:'lines'` or distinguishes it from default
BEH-1/UI-4 pin three render options; the suite asserts `outputFormat:'side-by-side'` (via `.d2h-file-side-diff`) and `drawFileList:false` (via absent `.d2h-file-list`), but nothing observes `matching:'lines'` (verified line 48). This is minor (hard to observe in DOM) — acknowledge it as an explicit, tracked non-assertion rather than leaving it silently uncovered, per the no-fake-green spirit.

### G-4 — EC-5 fallback OS-buffer skip is correctly tracked, but the `<textarea>` no-leak assertion timing is racy
E2E-11 asserts `document.querySelectorAll('textarea').length` unchanged after click — correct intent (created+removed synchronously, verified lines 60-65), but if the page has a legitimate textarea (the chat input is a textarea), the baseline is nonzero and the assertion must compare to the captured baseline, not to 0. 

**Fix:** capture the textarea count before the click and assert equality after; do not assert `=== 0`.

---

## What's genuinely strong (keep)
- **Probe gating + RED-on-disabled** (Rule 6) is the correct, honest design; `e2e_pod_env`→`A0_POD_ENV` is real (verified `a0-up.sh:25-34`, DEC-057).
- **UI-only fixtures** via the real `PluginsPage` (install→ZIP→enable) and real project-create selectors (`.projects-create-btn-top`, `input.projects-form-input`, `.button.confirm` "Create and continue", trash + `$confirmClick`) are all verified-correct against live A0.
- **Fire-and-forget modal opening** is already the harness's documented behaviour (`PluginsPage.open()` explicitly never awaits `openModal`, verified lines 129-133) — the spec's concern is satisfied by reusing it; just make sure invented config-open paths also stay non-awaited (the live `openPlugin`/`openPluginInfo` are sync; `openPluginConfig` is async — never await it, but it's irrelevant here since there's no config screen).
- **DOM selector chain** (`code → pre → .code-block-wrapper → .markdown-block-wrap`) and the `pre > code.language-diff:not([data-diff-processed])` predicate keyed by E2E-15/E2E-22 are exactly right (verified renderer + plugin source).
- **Negative scenarios** E2E-22 (`language-patch`/unlabeled not rendered) and E2E-23 (no toggle) are correctly grounded; the nudge's "side-by-side toggle" wording IS a real defect (verified `_15_diff_nudge.py:27`), so E2E-23's negative assertion is legitimately catching a doc/behaviour drift.

---

## VERDICT

**Conditional accept — do not implement as written; revise C-1, C-2, C-3 first (blocking), then M-1..M-7.** The spec demonstrates real traceability and correctly internalizes the devkit's honesty rules, and the majority of its selectors/assertions check out against live code. But three Critical defects would prevent the suite from running truthfully: the probe is mislocated and unservable (C-1), E2E-21 asserts API fields that don't exist (C-2), and the entire artifact form (Gherkin) doesn't match the real Playwright harness (C-3). The Major items are correctness/robustness fixes that, left as-is, would produce intermittent false reds (M-5, M-6, M-7) or false greens/version-coupled assertions (M-1, M-2, M-5). Once the probe is moved into `usr/plugins/diff_visualizer/api/` (gated), E2E-21 is split into discovery-via-API + content-via-file, the suite is re-cast as ≤10 grouped Playwright specs on the real fixtures, and M-2/M-5/M-9-style brittle equalities are replaced with mechanism/difference assertions, this becomes a solid, fully hard-asserting, no-fake-green suite that will pass on stock `agent0ai/agent-zero:latest` (the legitimate upstream-compat proof, consistent with `a0_compat: upstream`).