# diff-visualizer — E2E behaviour, in BDD

Generated from the final e2e spec for `agent-zero-plugin-diff-visualizer` (v0.1.2). Each `Scenario`
is one falsifiable assertion that runs against a live Agent Zero instance (`agent0ai/agent-zero:latest`,
brought up by `e2e-up.sh` on `:50011`) with the plugin **installed from its zip and enabled through the
real Plugins UI**. DOM scenarios drive the real browser by injecting a `code.language-diff` block exactly
as A0's markdown renderer emits it (`messages.js:1769-1775`) and asserting the plugin's observer transform.
Runtime/seam scenarios drive the in-plugin, env-gated probe (`api/diffviz_probe.py`) — no LLM, no live MCP.
`<P>` is the project under test.

This `.feature` is the source-of-truth executed by playwright-bdd; each `## Feature` maps to a grouped
spec file (`group-a.spec.ts … group-j.spec.ts`, ≤10 total) registered in the devkit `BEHAVIOUR_SPECS`,
one `.webm` video per group.

## Hard rules (binding for this and every e2e/BDD spec in the fleet)

1. **No silent swallow.** Every scenario is a real, falsifiable assertion. Failures are recorded
   and turn the group RED — never caught-and-ignored. Each group emits a `[coverage]` tally.
2. **No fake green.** A scenario is either genuinely asserted or an explicit `@skip` with a tracked
   reason (issue link) — never a bare pass for an untested case.
3. **Self-provisioning fixtures, through the UI.** The suite creates whatever app state it needs
   (e.g. A0 projects) by driving the **real UI**, not backend/"magic" API calls. Skips for
   "needs a fixture" are not allowed once the fixture is buildable.
4. **LLM-less & hermetic.** Runtime/fork-seam behaviours are exercised via a deterministic
   pure-helper probe (`dump_live`), enabled for e2e only via `.devkit.yml e2e_pod_env`. No API key,
   no live MCP pod. A deterministic LLM stub is added only if a plugin truly needs an agent turn.
5. **≤10 grouped specs, one video each** (webm; no GIF conversion).
6. **Best-effort `try/catch` is reserved** for genuinely un-enableable env only (a real agent turn,
   OS clipboard) — anything reachable via a seam MUST hard-assert.
7. **Validated on the local fast loop** (disposable A0) before pushing; CI is the final gate.

---

## Feature: Inline render — container, toolbar, side-by-side surface  *(group 01)*

```gherkin
Background:
  Given a freshly booted Agent Zero with the diff_visualizer plugin installed from its zip
  And the plugin is enabled through the real Plugins UI (store-gated toggle, dialog auto-accepted)
  And the page is reloaded so the sidebar-end extension injects its MutationObserver

Scenario: Diff code block is replaced by the plugin container (E2E-1)
  # → BEH-1, UI-1
  Given a code.language-diff block is injected exactly as A0's markdown renderer emits it
  When the observer detects the inserted diff block
  Then the original markdown-block-wrap pre>code.language-diff is gone (replaced)
  And exactly one .diff-visualizer-container is visible

Scenario: Inline toolbar carries label, maximize and copy chrome (E2E-2)
  # → UI-2
  Given the inline container from E2E-1
  Then the .diff-visualizer-toolbar is visible
  And the .diff-visualizer-label text node is "Diff" with computed text-transform uppercase
  And .diff-maximize has title "Maximize" and icon open_in_full
  And .diff-copy-source has title "Copy raw diff" and icon content_copy
  And each button's computed width/height is 28px with overflow hidden (computed style, not bounding box)

Scenario: diff2html renders side-by-side with the plugin's exact options (E2E-3)
  # → BEH-1, UI-4
  Given the inline container from E2E-1
  Then .diff-visualizer-rendered .d2h-wrapper is visible
  And at least one .d2h-file-side-diff exists (proving outputFormat side-by-side took effect)
  And .d2h-file-list count is 0 and .d2h-tag is display:none (drawFileList false + CSS override)
  # [note] matching:'lines' is not deterministically DOM-observable — explicitly NOT asserted, logged, not silently uncovered (G-3)
```

---

## Feature: Lazy library load semantics  *(group 02)*

```gherkin
Background:
  Given a fresh diffPage per scenario (page reload resets module scope)
  And a requestfinished network listener is attached BEFORE the first injection

Scenario: diff2html CSS + UMD JS load exactly once from the pinned CDN URL (E2E-4)
  # → BEH-2
  When a first diff block is injected and its .d2h-wrapper rendered
  And a second distinct diff block is injected and its container awaited (count == 2)
  Then exactly one diff2html .js request was made, ending @3.4.51/bundles/js/diff2html.min.js
  And exactly one <link id="diff2html-css"> exists, href the pinned @3.4.51 css
  And both injected blocks rendered (.diff-visualizer-container count == 2)

Scenario: The broken /+esm build is never requested (E2E-5)
  # → BEH-2 design constraint
  When a diff block is injected
  Then zero requests contain "/+esm"
  And the console has no "n.Template is not a constructor" diff2html error
```

---

## Feature: Maximize overlay open  *(group 03)*

```gherkin
Background:
  Given the plugin is installed+enabled and an inline container is present

Scenario: Maximize opens a single fullscreen overlay that re-renders the diff (E2E-6)
  # → BEH-4, UI-3
  When I click .diff-maximize
  Then exactly one .diff-visualizer-overlay is visible
  And its computed style is position fixed, inset 0 (top/left/right/bottom 0px), zIndex 10000, opacity polled to 1
  And the overlay bar shows .diff-visualizer-label, .diff-copy-source and .diff-overlay-close (title "Close (Esc)", icon close)
  And the overlay body .d2h-wrapper re-rendered with computed font-size 13px
  And clicking Maximize a second time keeps overlay count == 1 (single-overlay invariant)
```

---

## Feature: Overlay close paths  *(group 04)*

```gherkin
Background:
  Given an inline container is present and the overlay is re-opened per scenario via Maximize
  And the inline container must survive each close

Scenario: Close via the close button (E2E-7)
  # → BEH-5a
  When I click .diff-overlay-close
  Then the overlay count goes to 0
  And the inline .diff-visualizer-container is still visible

Scenario: Close via backdrop click (E2E-8)
  # → BEH-5b
  When I click the overlay element at a point outside the bar/body (e.target === overlay)
  Then the overlay count goes to 0
  And the inline container is intact

Scenario: Close via Escape, and the keydown listener is actually detached (E2E-9)
  # → BEH-5c, cleanup
  Given window.addEventListener/removeEventListener for keydown are instrumented into a counter (M-4)
  And opening the overlay raised the counter to base+1
  When I press Escape
  Then the overlay count goes to 0 and the inline container is intact
  And window.__diffvizKeydownListeners returns to base (listener removed)
  And re-opening then closing via the button returns the counter to base again (cleanup runs on every route)
```

---

## Feature: Copy raw diff  *(group 05)*

```gherkin
Background:
  Given an inline container is present
  And the Playwright context was granted clipboard-read and clipboard-write

Scenario: Copy writes the RAW diff source and swaps the icon for ~2000 ms (E2E-10)
  # → BEH-6
  When I click .diff-copy-source
  Then the copy icon text immediately becomes "check"
  And navigator.clipboard.readText() equals the raw DIFF_SAMPLE (no d2h/HTML markup)
  And after 2000-2600 ms the icon reverts to "content_copy"

Scenario: execCommand fallback runs when clipboard.writeText rejects, with no textarea leak (E2E-11)
  # → BEH-6, EC-5
  Given navigator.clipboard.writeText is overridden to throw and document.execCommand is spied
  And the textarea baseline count is captured BEFORE the click (the chat input is itself a textarea — G-4)
  When I click .diff-copy-source
  Then document.execCommand('copy') was invoked (fallback taken)
  And document.querySelectorAll('textarea').length equals the captured baseline (no transient leak)
  And the copy icon still swaps to "check"

@skip(reason="OS clipboard buffer not readable for the execCommand path in headless Chromium — Rule 6 un-enableable env; fallback INVOCATION is hard-asserted in E2E-11", issue="<plugin-repo>#TBD")
Scenario: OS clipboard buffer read-back for the execCommand fallback (E2E-11-osbuffer)
  Then the OS clipboard buffer received the raw diff via execCommand
```

---

## Feature: Graceful degradation / negative renders  *(group 06)*

```gherkin
Background:
  Given the plugin is installed+enabled and each scenario gets a fresh diffPage
  And a pageerror listener is attached to prove no uncaught crash

Scenario: CDN unreachable → raw pre>code stays readable, marker cleared, no crash (E2E-12)
  # → BEH-3a, EC-1
  Given requests to cdn.jsdelivr.net are aborted before injection
  When a valid diff block is injected
  Then .diff-visualizer-container count is 0 (no swap)
  And the original pre>code.language-diff is still visible containing "+new line"
  And code.language-diff[data-diff-processed] count is 0 (marker removed, retry-able)
  And the pageerror listener captured nothing

Scenario: Render output without d2h-wrapper → original block untouched (E2E-13)
  # → BEH-3b, EC-2
  Given window.Diff2Html.html is stubbed to return a fixed string with no "d2h-wrapper" (M-2)
  When a valid diff block is injected
  Then .diff-visualizer-container count is 0 (gate took the no-swap branch)
  And the original pre>code.language-diff is visible
  And code.language-diff[data-diff-processed] count is 0 (marker removed)

Scenario: Empty/whitespace diff block is skipped entirely with zero CDN load (E2E-14)
  # → BEH-3c, EC-3
  Given a guaranteed-fresh diffPage with no prior injection and the CDN listener attached first
  When a whitespace-only block is injected
  Then .diff-visualizer-container count is 0
  And the original pre>code block is present (no processing / no container)
  And exactly 0 requests matching diff2html were made
```

---

## Feature: Streaming / debounce / wrapper variation  *(group 07)*

```gherkin
Background:
  Given the plugin is installed+enabled on diffPage

Scenario: Rapid multi-block insertion is debounce-coalesced; each processed exactly once (E2E-15)
  # → EC-4, BEH-1 idempotency
  When 5 distinct markdown-block-wrap diff blocks are appended within the same tick
  Then after settle there are exactly 5 .diff-visualizer-container
  And the total .d2h-wrapper count is exactly 5 (no block rendered twice)
  And injecting a 6th block takes the count 5→6 without reprocessing the prior 5 (:not([data-diff-processed]))

Scenario: A multi-file fence renders as multiple files in one container (E2E-16)
  # → EC-6
  When MULTI_FILE_SAMPLE (the 2-file auth.py+util.py diff) is injected
  Then there is a single .diff-visualizer-container
  And .d2h-file-wrapper count is exactly 2 (one per file, NOT .d2h-file-side-diff which emits two per file)
  And both filenames appear in .d2h-file-name

Scenario: Wrapper-class fallback chain tolerates A0 markup variation (E2E-17)
  # → EC-7
  When a block is injected with outer .markdown-block-wrap
  Then the .markdown-block-wrap is the replaced element (no orphan wrapper) and the container is visible
  When a block is injected with only .code-block-wrapper>pre>code.language-diff
  Then the .code-block-wrapper is replaced and the container is visible
  When a bare pre>code.language-diff is injected
  Then the pre itself is replaced and the container is visible
```

---

## Feature: Disabled-plugin & language-selector edge cases  *(group 08)*

```gherkin
Background:
  Given the plugin is installed

Scenario: Disabled plugin → no script injected; diff renders as plain code (E2E-18)
  # → EC-8
  Given the plugin is disabled via the real Plugins UI toggle (dialog auto-accepted; plugins_list enabled === false)
  When a valid diff block is injected and 1.5s elapse
  Then .diff-visualizer-container count is 0 (no observer running)
  And the original pre>code.language-diff is visible (plain code)
  And there is no #diff2html-css link and no CDN request
  # teardown: re-enable the plugin to restore fixture state

Scenario: A "patch" or unlabeled fence is NOT rendered as a visual diff (E2E-22)
  # → EC-9, negative
  When a pre>code.language-patch block and a pre>code (no language) block — both valid diff text — are injected
  Then .diff-visualizer-container count is 0
  And both original blocks remain (selector keys strictly on code.language-diff)

Scenario: No view-format toggle exists anywhere in the chrome (E2E-23)
  # → EC-10, SR-11, negative
  Given an inline container from a valid diff
  Then .diff-visualizer-actions contains exactly two buttons (.diff-maximize, .diff-copy-source)
  And no element matching [title*="side" i], [title*="unified" i], [class*="toggle" i], [role="switch"] exists in the container or overlay
  # render is side-by-side only; this legitimately catches the _15_diff_nudge.py "side-by-side toggle" doc drift
```

---

## Feature: Theme adaptivity & seam behaviours  *(group 09)*

```gherkin
Background:
  Given the plugin is installed+enabled
  And A0_DIFFVIZ_TEST_PROBE=1 is forwarded into the pod via .devkit.yml e2e_pod_env (Rule 4)

Scenario: Plugin chrome consumes A0 CSS vars across ≥2 themes; fixed tints are theme-independent (E2E-19)
  # → BEH-7, UI-4
  Given an inline container and captured computed background-color + label color under theme 1
  When I switch to a contrasting A0 theme through the real Settings UI and re-inject a block
  Then the captured background-color and label color DIFFER between the two themes (var-driven, not hardcoded — the binding anchor, M-5)
  And under both themes .d2h-ins background is rgba(46, 160, 67, 0.15) and .d2h-del is rgba(248, 81, 73, 0.15)
  And any var left unset resolves to its documented fallback (branch asserted, not skipped)
  # the brittle bg === resolved --color-panel string equality is intentionally dropped (M-5)

Scenario: System-prompt nudge is appended at runtime, in order (E2E-20)
  # → BEH-8, via the gated in-plugin probe
  When I GET /diffviz_probe/system_prompt with session creds
  Then it responds 200 (a 404/probe-disabled is RED, never swallowed — Rule 6)
  And nudge_present is true
  And the assembled list has an entry starting "## Showing file changes as diffs"
  And that entry contains the diff fence instruction, "--- a/path", "+++ b/path", "@@", and "Load the `diff` skill"
  And nudge_index >= 0 and is greater than the index of the first list element (deterministic ordering, hard-asserted — G-2)

Scenario: The diff skill is discoverable and teaches valid unified-diff syntax (E2E-21)
  # → BEH-9, split per C-2 across the two serving mechanisms
  When I POST /skills action:"list" (the real skills-list API)
  Then a skill named "diff" is present (discovery; triggers/content NOT asserted here — the API projection omits them)
  When I GET /diffviz_probe/skill_file (the gated probe file read; 404/exists:false is RED)
  Then exists is true and the raw SKILL.md content carries triggers diff/patch/show changes/before and after/show diff/proposed changes
  And it states the fence MUST be "diff", shows the --- a/ / +++ b/ / @@ anatomy, multi-file fences, git diff / git diff --staged capture, and the CDN/air-gapped fallback pitfall
```

---

## Feature: Lifecycle, project-independence, no-config-surface & render fidelity  *(group 10)*

```gherkin
Background:
  Given the plugin is installed+enabled

Scenario: Plugin renders identically inside a UI-provisioned project and exposes NO config surface (E2E-24)
  # → §C, manifest per_project_config:false; positive API-anchored assertions, not omissions
  Given a project <P> created through the real UI (.projects-create-btn-top → input.projects-form-input → .button.confirm "Create and continue")
  When I enter the project-scoped chat, reload, and inject DIFF_SAMPLE
  Then .diff-visualizer-container with .d2h-file-side-diff renders identically (same selectors as group 01)
  And the plugins_list entry for diff_visualizer has has_config_screen === false (derived from absent webui/config.html — M-1)
  And the rendered card shows the Info/kebab affordance but no Config/Settings/Configure button
  # teardown: delete <P> through the real UI (trash button, $confirmClick = click twice)

Scenario: Render survives real messages.js output including the appended .step-action-buttons (E2E-25)
  # → BEH-1 fidelity, G-1
  Given a fixture mirroring A0 exactly, with a trailing .step-action-buttons child inside the .markdown-block-wrap (messages.js:1768-1776)
  When the block is processed
  Then .diff-visualizer-container with .d2h-file-side-diff is present (render succeeded on the faithful node)
  And within the swapped region .step-action-buttons count is 0 (the whole markdown-block-wrap was replaced — intended, now falsifiable)
```

---

## Tracked skips (explicitly not-covered, not silently passed)

```gherkin
@un-enableable-env  E2E-11-osbuffer  OS clipboard read-back for execCommand path  -> headless Chromium can't read the buffer; fallback INVOCATION hard-asserted in E2E-11 (Rule 6); issue <plugin-repo>#TBD
@tracked-non-assertion  E2E-3-matching  diff2html matching:'lines' option        -> not deterministically/version-stably DOM-observable; logged "[note] matching:'lines' not e2e-observable", never silently uncovered (G-3)
```

## [coverage] reconciliation

```
[coverage] TOTAL: asserted=26 skipped=1
  group-01=3  group-02=2  group-03=1  group-04=3  group-05=2(+1 skip)
  group-06=3  group-07=3  group-08=3  group-09=3  group-10=2
  sum asserted = 3+2+1+3+2+3+3+3+3+2 = 26 ; skipped = 1
The harness FAILS the run if any group log contains "probe disabled" or a bare ✓ for an un-asserted
case. Each group's [coverage] tally is reconciled against its declared scenario count; a mismatch is RED.
```
