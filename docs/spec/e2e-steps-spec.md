# E2E Test Spec — `agent-zero-plugin-diff-visualizer` (v0.1.2)

> **Artifact form (revised per C-3):** this document is the source-of-truth for **grouped Playwright spec files** under `tests/e2e/` — `group-a.spec.ts … group-j.spec.ts`, one per group (≤10 total, DEC-056), each registered in the devkit `BEHAVIOUR_SPECS` JSON (`[{name,path}]`, consumed by `e2e/harness/run-lifecycle.sh:49` → `playwright-base.config.ts testDir`). There is **no Gherkin/Cucumber layer** in the testkit; scenarios are Playwright `test()` blocks using the devkit's first-class fixtures (`createA0Fixtures()` → `loggedInPage`) and page objects (`PluginsPage` with its real `topNavButton`, `customTab`, `installButton`, `zipTab`, `zipFileInput`, `installedCard`, `open()`). Every scenario runs against a **live A0** (`agent0ai/agent-zero:latest`, brought up by `e2e-up.sh` on `:50011`), with the plugin **installed from its zip and enabled through the real Plugins UI**. The HARD RULES block below is a shared header in `tests/e2e/_hardrules.ts`, imported/echoed by each spec (not duplicated into any `.feature` file — there are none). Selectors are verified against live A0 source: markdown DOM `pre>code` → `.code-block-wrapper` → `.markdown-block-wrap` (`/a0/webui/js/messages.js:1769-1775`), sidebar-end seam (`/a0/webui/components/sidebar/left-sidebar.html:35`), system_prompt dispatch (`/a0/agent.py:get_system_prompt`), top-nav Plugins button (`#header-plugins`, `title/aria-label="Plugins"`, `header-icons.html`), project-create UI (`.projects-create-btn-top`, `input.projects-form-input`, `.button.confirm` "Create and continue").

---

## PREAMBLE — Hard rules (binding; imported from `tests/e2e/_hardrules.ts` into every group spec)

```
# ── HARD RULES (binding — diff-visualizer e2e) ─────────────────────────────
# 1. NO SILENT SWALLOW. Every scenario is a real, falsifiable assertion.
#    Failures are recorded and turn the owning group RED — never caught-and-
#    ignored. Each group emits a [coverage] <group>: asserted=N skipped=M tally.
# 2. NO FAKE GREEN. A scenario is either genuinely asserted (logs ✓) or an
#    explicit @skip with a tracked reason (issue link) — never a bare pass for
#    an untested case.
# 3. SELF-PROVISIONING FIXTURES, THROUGH THE UI. The suite creates whatever app
#    state it needs (A0 projects, installed+enabled plugin, a rendered diff
#    block) by driving the REAL UI — not backend/"magic" API calls.
# 4. LLM-LESS & HERMETIC. Runtime/seam behaviours are exercised via a
#    deterministic pure-helper probe (gated API handler), enabled for e2e ONLY
#    via .devkit.yml e2e_pod_env. No API key, no live MCP pod. A deterministic
#    LLM stub is added only if the plugin truly needs an agent turn (it does NOT
#    — the diff block is injected/typed into the live DOM as A0's renderer emits).
# 5. ≤10 GROUPED SPECS (group-a..group-j .spec.ts), one .webm video each (no GIF).
# 6. BEST-EFFORT try/catch RESERVED for genuinely un-enableable env only (OS
#    clipboard read, a real agent turn) — anything reachable via a seam MUST
#    hard-assert. A disabled/missing probe ⇒ RED, never skipped-green.
# 7. VALIDATED ON THE LOCAL FAST LOOP (disposable A0 via `make e2e-fresh`)
#    before pushing; CI plugin-e2e.yml is the final gate.
# ───────────────────────────────────────────────────────────────────────────
```

### How the hard rules bind THIS plugin specifically

- **The plugin has NO config screen and NO project/agent scoping** (§C of behaviour spec: no `webui/config.html`, `per_project_config:false`, `per_agent_config:false`, `meta.yaml env:[]`). Therefore the A0 project-creation UI is **NOT a required fixture** for any rendering behaviour. Group J carries a single scenario that *provisions a project through the real UI anyway* and **hard-asserts the plugin still renders identically inside a project-scoped chat** (proving project-independence) — this satisfies Rule 3's "self-provisioning through the UI" while documenting the absence of a config surface as a positive, API-anchored assertion (see E2E-24), not a gap.
- **The only env-gated runtime seam is BEH-8** (the system_prompt append happens inside an agent loop, which needs an LLM turn). Per Rule 4/6 this is exercised by a deterministic **gated probe API handler** (no LLM). **(Closes C-1)** The probe ships **inside the plugin** as `usr/plugins/diff_visualizer/api/diffviz_probe.py` — an `ApiHandler` subclass that A0's normal plugin-api discovery route-mounts (`helpers/plugins.py:201` globs `*(api)*`; precedent: `plugins/_plugin_installer/api/plugin_install.py`). It is part of the zip, gets installed, and registers `GET /diffviz_probe/system_prompt` **only when** `os.environ.get("A0_DIFFVIZ_TEST_PROBE")=="1"` (declared in `.devkit.yml e2e_pod_env`, flattened to `A0_POD_ENV`, forwarded `-e` into the nested pod by `a0-up.sh`). The handler raises/returns 404 unless the gate is set. This adds a **test-only, env-gated** `api/` surface; the behaviour spec's §D ("no API handlers") is annotated accordingly so the probe does not contradict it. If the probe is disabled/missing the scenario goes **RED** (Rule 6), never skipped-green.
- **Everything DOM-side is hard-asserted** by injecting/typing a `code.language-diff` block exactly as A0's markdown renderer emits it (the established `behaviour.mjs` technique), then asserting the plugin's observer transform.
- **Genuinely un-enableable** (OS clipboard *read-back* for the `execCommand` path, a real LLM agent turn) → the only permitted `@skip`/try-catch sites, each with a tracked issue link.

### `.devkit.yml` (e2e enablement — committed at repo root)

```yaml
plugin_dir: usr/plugins/diff_visualizer
display_name: "DiffVisualizer"        # matches meta.yaml title (helpers/plugins.py:291: display_name = meta.title or dir.name)
a0_compat: upstream            # plugin uses only upstream-stable seams (D-table); no @extensible fork seam
e2e_pod_env:
  A0_DIFFVIZ_TEST_PROBE: "1"   # enables the in-plugin diffviz_probe api handler in the nested e2e pod ONLY
```

### `diffviz_probe` probe contract — `usr/plugins/diff_visualizer/api/diffviz_probe.py` (gated, in-plugin) **(Closes C-1)**

```
GET /diffviz_probe/system_prompt   (route registered ONLY when A0_DIFFVIZ_TEST_PROBE=1)
→ builds a minimal real Agent, awaits call_extensions_async("system_prompt", agent, system_prompt=[], loop_data=LoopData())
→ 200 {"system_prompt": [<str>...], "nudge_present": <bool>, "nudge_index": <int|-1>, "count": <int>}

GET /diffviz_probe/skill_file       (same gate) — reads the in-pod skills/diff/SKILL.md
→ 200 {"exists": <bool>, "content": "<raw SKILL.md text>"}

Pure: no model call, deterministic. Gate unset / handler absent ⇒ 404 ⇒ owning scenario RED.
```

---

## Coverage map (every BEH-/UI-/EC- traced to an E2E-N) — reconciled per m-5

| Source | Covered by | Mode |
|---|---|---|
| BEH-1 (auto-render) | E2E-1, E2E-2, E2E-3 | hard-assert (DOM) |
| BEH-2 (lazy CDN load, once) | E2E-4, E2E-5 | hard-assert (probe network + idempotency) |
| BEH-3a (CDN fail → raw) | E2E-12 | hard-assert (offline route-block) |
| BEH-3b (no d2h-wrapper → untouched) | E2E-13 | hard-assert (stubbed gate, M-2) |
| BEH-3c (empty source skip) | E2E-14 | hard-assert |
| BEH-4 (maximize overlay) | E2E-6 | hard-assert |
| BEH-5a/5b/5c (3 close paths) | E2E-7, E2E-8, E2E-9 | hard-assert (listener counter, M-4) |
| BEH-6 (copy raw, icon swap, fallback) | E2E-10, E2E-11 | hard-assert (swap) + tracked @skip (OS read-back) |
| BEH-7 (theme-adaptive) | E2E-19 | hard-assert (difference + fixed tints, M-5) |
| BEH-8 (system_prompt nudge runtime append) | E2E-20 | hard-assert via probe (ordering hard, G-2) |
| BEH-9 (diff skill loadable) | E2E-21 | hard-assert (discovery via API + content via probe file, C-2) |
| UI-1 container | E2E-1 | hard-assert |
| UI-2 toolbar (label, maximize, copy) | E2E-2 | hard-assert (computed-style box, m-1) |
| UI-3 overlay (bar, body, 13px) | E2E-6 | hard-assert (inset style, m-3) |
| UI-4 d2h side-by-side surface + CSS overrides | E2E-3, E2E-19 | hard-assert |
| EC-4 (debounce coalescing) | E2E-15 | hard-assert |
| EC-5 (clipboard fallback) | E2E-11 | hard-assert (invocation) + tracked @skip (OS buffer) |
| EC-6 (multi-file fence) | E2E-16 | hard-assert (`.d2h-file-wrapper`, m-4) |
| EC-7 (wrapper-class fallback chain) | E2E-17 | hard-assert |
| EC-8 (plugin disabled → plain code) | E2E-18 | hard-assert |
| EC-9 (`patch`/unlabeled NOT rendered) | E2E-22 | hard-assert |
| EC-10 (no view toggle exists) | E2E-23 | hard-assert (negative) |
| BEH-1 fidelity vs real `messages.js` (incl. `.step-action-buttons`) | E2E-25 | hard-assert (G-1) |
| `matching:'lines'` option | E2E-3 note | tracked non-assertion (G-3) |
| Project-independence / no-config-surface | E2E-24 | hard-assert (UI-provisioned project + API field) |
| Install→enable lifecycle (fixture) | Group A bootstrap (all groups depend) | hard-assert |

---

## Shared fixtures (provisioned through the REAL UI — Rule 3; built on the devkit's real `PluginsPage` — C-3)

- **`installedDiffViz`** — builds the plugin zip (`make zip`), opens the Plugins panel via the **real** `PluginsPage.open()` (top-nav `getByRole("button",{name:"Plugins"})` → `#header-plugins`; `open()` is fire-and-forget by design and is **not awaited**), `customTab` → `installButton` → `zipTab`, `zipFileInput.setInputFiles(zip)`, waits for `installedCard("DiffVisualizer")` (card scoped by `<img alt="DiffVisualizer">`; if the thumbnail yields no matching `alt`, fall back to scoping the card by kebab + title text — m-6). Then **enables** via the card's real enable/toggle control (store-gated, `always_enabled:false`). **(Closes M-6)** Before clicking enable, registers `page.on("dialog", d => d.accept())` to absorb the `confirm()` that the live toggle raises only when `plugin.toggle_state==='advanced'` (stale per-scope overrides). Fixture is **idempotent**: first queries `plugins_list` for `diff_visualizer` and short-circuits if already `enabled`/installed. Onboarding suppressed via `suppressOnboarding()` before first nav. `openPluginConfig` is async and never awaited (irrelevant here — no config screen).
- **`diffPage`** — `loggedInPage` already on `/`; reloads so the now-enabled `sidebar-end` extension script is injected; waits for `<x-extension id="sidebar-end">` async loader to attach the MutationObserver (poll for attach, max 2s).
- **`injectDiffBlock(sample, wrapperClass=".markdown-block-wrap")`** — `page.evaluate` that builds the exact DOM A0 emits (`div.markdown-block-wrap > div.code-block-wrapper > pre > code.language-diff` with `textContent=sample`) and appends to `document.body`. Reproduces `messages.js:1769-1775` output deterministically — **no LLM** (Rule 4). The fixture tags its outer wrapper `.a0-diff-fixture` for scoping.
- **`DIFF_SAMPLE`** / **`DIFF_SAMPLE_2`** — two distinct canonical single-file unified diffs (`--- a/hello.txt … +new line`) from `behaviour.mjs`.
- **`MULTI_FILE_SAMPLE`** — the 2-file `auth.py`+`util.py` diff from `SKILL.md`.

---

# GROUP A — Inline render: container, toolbar, side-by-side surface (BEH-1, UI-1, UI-2, UI-4)

*Preconditions for all: `installedDiffViz`, `diffPage`. Fixture provisioning = real Plugins UI install+enable (Rule 3). Video: `group-a.webm`.*

### E2E-1 — `code.language-diff` block is replaced by `.diff-visualizer-container` (→ BEH-1, UI-1)
- **Goal:** the observer detects an inserted diff block and swaps the outermost markdown wrapper for the plugin container.
- **Steps:** `injectDiffBlock(DIFF_SAMPLE)`.
- **Assertions (hard):**
  - `await expect(page.locator(".diff-visualizer-container")).toBeVisible({timeout:20_000})`.
  - The original wrapper is gone: `await expect(page.locator(".markdown-block-wrap.a0-diff-fixture pre > code.language-diff")).toHaveCount(0)` (the container *replaced* it via `replaceWith`).
  - `await expect(page.locator(".diff-visualizer-container")).toHaveCount(1)`.
- **Rule binding:** real DOM assertion; no swallow — `toHaveCount(0)` for the old block is falsifiable (if swap didn't happen, both old block and no container ⇒ RED).

### E2E-2 — Inline toolbar chrome: label + maximize + copy buttons (→ UI-2)
- **Goal:** the container holds the plugin's toolbar with correct label text and both action buttons with correct titles/icons.
- **Steps:** reuse E2E-1 container.
- **Assertions (hard):**
  - `container.locator(".diff-visualizer-toolbar")` visible.
  - `container.locator(".diff-visualizer-label")` visible with DOM text matching `/^Diff$/i` (literal text node is `"Diff"`; do NOT assert rendered `"DIFF"`) and computed `text-transform: uppercase` (presentational). **(m-2)**
  - `container.locator(".diff-maximize")` visible, `getAttribute("title") === "Maximize"`, contains `.material-symbols-outlined` with text `open_in_full`.
  - `container.locator(".diff-copy-source")` visible, `title === "Copy raw diff"`, icon text `content_copy`.
  - **(Closes m-1)** Each button's **computed style** `width === "28px"`, `height === "28px"`, `overflow === "hidden"` (assert via `getComputedStyle`, NOT `getBoundingClientRect()` — the `border:1px` with no explicit `box-sizing` makes the rendered box ~30px and would false-RED).

### E2E-3 — diff2html side-by-side render present inside container (→ BEH-1, UI-4)
- **Goal:** prove the render used the plugin's exact options (`outputFormat:'side-by-side'`, `drawFileList:false`).
- **Steps:** reuse container.
- **Assertions (hard):**
  - `container.locator(".diff-visualizer-rendered .d2h-wrapper")` visible (render succeeded).
  - `container.locator(".d2h-file-side-diff")` count ≥ 1 — **side-by-side only emits this** (proves option took effect, not generic render).
  - File-list hidden: `container.locator(".d2h-file-list")` count `0` (drawFileList:false) **and** `.d2h-tag` computed `display:none` (plugin CSS override).
- **(G-3) Tracked non-assertion:** `matching:'lines'` (plugin option, `diff-renderer.html:48`) is not DOM-observable in a deterministic, version-stable way; it is **explicitly NOT asserted** and logged as `[note] matching:'lines' not e2e-observable — tracked, not silently uncovered` (no-fake-green spirit).
- `[coverage] group-a: asserted=3 skipped=0`

---

# GROUP B — Lazy library load semantics (BEH-2)

*Preconditions: fresh `diffPage` per scenario (page reload resets module scope). The network listener is attached in `beforeEach`, BEFORE the first injection. Video: `group-b.webm`.*

### E2E-4 — diff2html CSS + UMD JS load exactly once from the pinned CDN URL (→ BEH-2)
- **Goal:** CSS link injected once (id-guarded); UMD bundle requested once; second injection short-circuits on the already-defined `window.Diff2Html`.
- **Steps:** **(M-7)** attach `page.on("requestfinished")` in `beforeEach` (before any nav/injection); filter `r.url().includes("diff2html") && r.url().endsWith(".js")`. `injectDiffBlock(DIFF_SAMPLE)`; **await** `.d2h-wrapper` visible. Then `injectDiffBlock(DIFF_SAMPLE_2)`; **await the second** `.diff-visualizer-container` (count `=== 2`) before counting requests (prevents the race that spuriously reports 1).
- **Assertions (hard):**
  - Exactly **one** matched JS request across both injections (`count === 1`), URL ending `…@3.4.51/bundles/js/diff2html.min.js` (no redirect/preflight double-count — filter excludes non-`.js`).
  - Exactly **one** `<link id="diff2html-css">` in `document.head`, `href` === pinned `…@3.4.51/bundles/css/diff2html.min.css`.
  - Both injected blocks rendered: `.diff-visualizer-container` count `=== 2`.
- **Rule binding:** asserts the memoised-Promise + id-guard + `window.Diff2Html`-defined short-circuit directly via observed network, not by inspecting JS internals.

### E2E-5 — `/+esm` build is NOT used (→ BEH-2 design constraint)
- **Goal:** verify the deliberate avoidance of the broken ESM transform.
- **Steps:** same `requestfinished` listener; `injectDiffBlock`.
- **Assertions (hard):** **zero** requests whose URL contains `/+esm`. Console has **no** `n.Template is not a constructor` error (assert the captured `console` error log is clean of any diff2html message).
- `[coverage] group-b: asserted=2 skipped=0`

---

# GROUP C — Maximize overlay open (BEH-4, UI-3)

*Preconditions: `installedDiffViz`, `diffPage`, inline container present. Video: `group-c.webm`.*

### E2E-6 — Clicking Maximize opens a single fullscreen overlay that re-renders the diff (→ BEH-4, UI-3)
- **Steps:** `container.locator(".diff-maximize").click()`.
- **Assertions (hard):**
  - `page.locator(".diff-visualizer-overlay")` visible, count `=== 1`.
  - **(Closes m-3)** Computed *style* assertions (not box measurement): `position === "fixed"`, and `top/left/right/bottom === "0px"` (i.e. `inset:0`), `zIndex === "10000"`; `opacity` polled until `"1"` after rAF (proving `.active` added). Do NOT measure the bounding box against `window.innerWidth/Height` (scrollbar/sub-pixel drift).
  - Overlay bar: `.diff-visualizer-overlay-bar` visible with `.diff-visualizer-label` ("Diff"), `.diff-copy-source`, `.diff-overlay-close` (title `Close (Esc)`, icon `close`).
  - Overlay body: `.diff-visualizer-overlay-body .diff-visualizer-rendered .d2h-wrapper` visible (re-render succeeded), computed `font-size === "13px"` (vs inline 12px).
  - Clicking Maximize a **second** time keeps overlay count `=== 1` (single-overlay invariant; old removed before new).
- `[coverage] group-c: asserted=1 skipped=0`

---

# GROUP D — Overlay close paths (BEH-5a/b/c)

*Preconditions: overlay open (re-provisioned per scenario via maximize click). Inline container must survive each close. Video: `group-d.webm`.*

### E2E-7 — Close via close button (→ BEH-5a)
- **Steps:** open overlay; `overlay.locator(".diff-overlay-close").click()`.
- **Assertions (hard):** `overlay` count → `0` (timeout 20s); `.diff-visualizer-container` still visible (post-condition).

### E2E-8 — Close via backdrop click (→ BEH-5b)
- **Steps:** open overlay; click the overlay element itself at a point **outside** the bar/body (`position:{x:2,y:2}` of the overlay, where `e.target===overlay`).
- **Assertions (hard):** overlay count → `0`; inline container intact. *(If a stray child intercepts, this RED-fails — falsifiable, not swallowed.)*

### E2E-9 — Close via Escape, and the keydown listener is actually detached (→ BEH-5c, cleanup)
- **Goal:** Escape closes the overlay AND `close()` ran `window.removeEventListener('keydown', esc)`.
- **(Closes M-4) Instrumentation:** in `addInitScript`, wrap `window.addEventListener`/`removeEventListener` for the `keydown` type to maintain `window.__diffvizKeydownListeners` (increment on add, decrement on remove). This makes detachment **falsifiable** (a leaked listener leaves the counter elevated — the old weak check could not distinguish "removed" from "harmless-stale").
- **Steps:** capture `base = window.__diffvizKeydownListeners`. Open overlay (assert counter `=== base+1`). `page.keyboard.press("Escape")`.
- **Assertions (hard):**
  - Overlay count → `0`; inline container intact.
  - `window.__diffvizKeydownListeners === base` after close (the keydown listener was removed — direct detachment assertion).
  - Sanity re-open: open again, close via the **button**, assert counter returns to `base` again (cleanup path runs regardless of close route).
- `[coverage] group-d: asserted=3 skipped=0`

---

# GROUP E — Copy raw diff (BEH-6, EC-5)

*Preconditions: `installedDiffViz`, container present. Grant clipboard perms in the Playwright context (`permissions:["clipboard-read","clipboard-write"]`). Video: `group-e.webm`.*

### E2E-10 — Copy button writes the RAW diff source and swaps icon `content_copy → check` for ~2000 ms (→ BEH-6)
- **Steps:** `container.locator(".diff-copy-source").click()`.
- **Assertions (hard):**
  - Icon swap: immediately after click, `.diff-copy-source .material-symbols-outlined` text `=== "check"`.
  - Clipboard content equals the **raw** source (not rendered HTML): `await page.evaluate(() => navigator.clipboard.readText())` `=== DIFF_SAMPLE` (no `<` / `d2h` markup present).
  - After 2000 ms: poll until icon text reverts to `content_copy` (assert within 2000–2600 ms window).
- **Rule binding:** clipboard **write+read-back** works in Chromium with granted perms ⇒ hard-assert (not the un-enableable case).

### E2E-11 — `execCommand` fallback path when `navigator.clipboard.writeText` rejects (→ BEH-6, EC-5)
- **Goal:** the textarea+`execCommand('copy')` fallback runs and the icon still swaps.
- **Steps:** before clicking, `addInitScript` to override `navigator.clipboard.writeText` to throw; spy on `document.execCommand` via a page flag set when called with `'copy'`. **(Closes G-4)** Capture `base = document.querySelectorAll('textarea').length` BEFORE the click (the chat input is itself a `<textarea>`, so the baseline is nonzero). Reload `diffPage`, inject block, click copy.
- **Assertions (hard):**
  - Page flag confirms `document.execCommand('copy')` was invoked (fallback taken).
  - No transient `<textarea>` leaks: `document.querySelectorAll('textarea').length === base` after click (created+removed synchronously — compare to captured baseline, NOT to `0`).
  - Icon still swaps to `check`.
- **@skip (tracked):** verifying the *OS clipboard buffer actually received text via execCommand* — `execCommand('copy')` does not reliably populate the headless clipboard buffer for read-back. `@skip(reason="OS clipboard buffer not readable for execCommand path in headless Chromium — Rule 6 un-enableable env", issue="<plugin-repo>#TBD")`. The fallback **invocation** is hard-asserted above; only the OS-buffer read-back is skipped.
- `[coverage] group-e: asserted=2 skipped=1`

---

# GROUP F — Graceful degradation / negative renders (BEH-3a/b/c, EC-1/2/3)

*Preconditions: `installedDiffViz`. Each scenario gets a fresh `diffPage`. Video: `group-f.webm`.*

### E2E-12 — CDN unreachable → raw `pre>code` stays readable, marker cleared, no crash (→ BEH-3a, EC-1)
- **Steps:** `page.route("**/cdn.jsdelivr.net/**", r => r.abort())` **before** injection (simulates air-gapped/CSP). `injectDiffBlock(DIFF_SAMPLE)`; wait ~1.5s.
- **Assertions (hard):**
  - `.diff-visualizer-container` count `=== 0` (no swap).
  - Original `pre > code.language-diff` **still present and visible** with `textContent` containing `+new line` (readable).
  - The idempotency marker was removed (retry-able): `code.language-diff[data-diff-processed]` count `=== 0`.
  - No uncaught page error (assert `pageerror` listener captured none).

### E2E-13 — No `d2h-wrapper` in render output → original block untouched (→ BEH-3b, EC-2)
- **Goal:** exercise the plugin's `!rendered.includes('d2h-wrapper')` gate **deterministically**, decoupled from diff2html internals.
- **(Closes M-2) Steps:** CDN allowed for the real load, but stub the render: `addInitScript` to override `window.Diff2Html.html` to return a fixed string **without** `d2h-wrapper` (e.g. `"<div>nope</div>"`). Reload `diffPage`, then `injectDiffBlock(DIFF_SAMPLE)` (a *valid* diff — so only the stubbed render, not the input, drives the branch).
- **Assertions (hard):**
  - `.diff-visualizer-container` count `=== 0` (gate took the no-swap branch).
  - Original `pre > code.language-diff` visible.
  - Marker removed: `code.language-diff[data-diff-processed]` count `=== 0`.
- **Rationale:** pins the plugin's documented gate directly; removes the prior library-version coupling and the non-deterministic `Diff2Html.html(...)`-decides-the-assertion flip. (An optional, non-flipping prose-input smoke check may be kept but is NOT the falsifiable anchor.)

### E2E-14 — Empty diff block → skipped entirely, zero CDN load (→ BEH-3c, EC-3)
- **(Closes M-3) Steps:** guaranteed-**fresh** `diffPage` with **no prior injection**; attach the CDN network listener BEFORE injecting; `injectDiffBlock("   \n  \n")` (whitespace only; `code.textContent.replace(/\s+$/,'')` → `""`, early return before `diff2htmlReady()` at `diff-renderer.html:111-113`).
- **Assertions (hard):**
  - `.diff-visualizer-container` count `=== 0`.
  - The block is left as-is: original `pre>code` present. Marker may remain (`[data-diff-processed]` set then early-return before removal) — assert presence of the block; the contract asserted is "no processing / no container".
  - **Exactly 0** requests matching `…diff2html…` (drop the prior "no *new* request beyond any prior" hedge — fresh page makes the baseline a hard 0).
- `[coverage] group-f: asserted=3 skipped=0`

---

# GROUP G — Streaming / debounce / wrapper variation (EC-4, EC-6, EC-7)

*Preconditions: `installedDiffViz`, `diffPage`. Video: `group-g.webm`.*

### E2E-15 — Rapid multi-block insertion is coalesced by the 150 ms debounce; all processed exactly once (→ EC-4, BEH-1 idempotency)
- **Steps:** in a single `page.evaluate`, append **5** distinct `markdown-block-wrap` diff blocks within the same tick.
- **Assertions (hard):**
  - After settle: exactly **5** `.diff-visualizer-container` (all processed).
  - **Zero** double-processing: total `.d2h-wrapper` count `=== 5` (no block rendered twice).
  - Re-running `processDiffBlocks` (trigger via injecting a 6th block) does not reprocess the prior 5 (their `code` carries `data-diff-processed` so `:not([data-diff-processed])` excludes them) — container count goes 5→6, never duplicates.

### E2E-16 — Multiple files in one fence render as multiple files in one container (→ EC-6)
- **Steps:** `injectDiffBlock(MULTI_FILE_SAMPLE)` (the 2-file `auth.py`+`util.py` diff from SKILL.md).
- **(Closes m-4) Assertions (hard):** single `.diff-visualizer-container`; `.d2h-file-wrapper` count `=== 2` (one per file). Do NOT count `.d2h-file-side-diff` for "files" — side-by-side emits two per file (would be 4). Both filenames appear in `.d2h-file-name`.

### E2E-17 — Wrapper-class fallback chain tolerates A0 markup variation (→ EC-7)
- **Goal:** the `.markdown-block-wrap → .code-block-wrapper → pre` fallback.
- **Steps (3 sub-cases, each asserted):**
  - (a) inject with outer `.markdown-block-wrap` → assert the `.markdown-block-wrap` is the element replaced (no orphan wrapper left).
  - (b) inject with **only** `.code-block-wrapper > pre > code.language-diff` (no markdown-block-wrap) → container present; `.code-block-wrapper` replaced.
  - (c) inject a bare `pre > code.language-diff` (no wrappers) → container present; the `pre` itself replaced.
- **Assertions (hard):** in all three, `.diff-visualizer-container` visible AND the original wrapper/`pre` count `=== 0` (correct outermost element chosen).
- `[coverage] group-g: asserted=3 skipped=0`

---

# GROUP H — Disabled-plugin & language-selector edge cases (EC-8, EC-9, EC-10)

*Video: `group-h.webm`.*

### E2E-18 — Plugin disabled → no script injected; diff block renders as plain code (→ EC-8)
- **Preconditions:** plugin installed but **disabled** via the real Plugins UI toggle (provision: open Plugins panel, toggle DiffVisualizer off — `page.on("dialog", d=>d.accept())` registered to absorb the advanced-override confirm if present, M-6; confirm disabled state via `plugins_list` `enabled===false`). Reload.
- **Steps:** `injectDiffBlock(DIFF_SAMPLE)`; wait 1.5s.
- **Assertions (hard):**
  - `.diff-visualizer-container` count `=== 0` (no observer running).
  - Original `pre > code.language-diff` visible (plain code).
  - No `#diff2html-css` link, no CDN request.
- **Teardown:** re-enable the plugin (restore default fixture state for later groups if shared; else isolated context).

### E2E-22 — Fence labelled `patch` or unlabeled is NOT rendered as a visual diff (→ EC-9, negative)
- **Preconditions:** `installedDiffViz`, `diffPage`.
- **Steps:** inject one `pre>code.language-patch` block and one `pre>code` (no language class), both containing valid diff text.
- **Assertions (hard):** `.diff-visualizer-container` count `=== 0`; both original blocks still present (selector keys strictly on `code.language-diff`).

### E2E-23 — No view-format toggle exists (→ EC-10, SR-11; negative)
- **Preconditions:** container present (from a valid diff).
- **Steps:** inspect the inline toolbar and the overlay bar.
- **Assertions (hard):** the toolbar's `.diff-visualizer-actions` contains exactly **two** buttons (`.diff-maximize`, `.diff-copy-source`) — assert `count===2` and that **no** element matching `[title*="side" i], [title*="unified" i], [class*="toggle" i], [role="switch"]` exists within `.diff-visualizer-container` or `.diff-visualizer-overlay`. (Render is side-by-side only. Note: the nudge text in `_15_diff_nudge.py:27` mentions a "side-by-side toggle" — a known doc/behaviour drift; this negative assertion legitimately catches it.)
- `[coverage] group-h: asserted=3 skipped=0`

---

# GROUP I — Theme adaptivity & seam behaviours (BEH-7, BEH-8, BEH-9)

*Video: `group-i.webm`.*

### E2E-19 — Theme-adaptive rendering: plugin chrome consumes A0 CSS vars under ≥2 themes (→ BEH-7)
- **Goal:** the container/toolbar/diff colours resolve from A0's `--color-*` custom props, so they differ between two A0 themes (proving variable consumption, not hardcoded).
- **Steps:** with container present, capture computed `background-color` of `.diff-visualizer-container` and `color` of `.diff-visualizer-label`. Then switch the A0 theme through the **real Settings UI** (or toggle `data-theme`/the theme class the app uses) to a contrasting theme; re-inject a block; re-capture.
- **(Closes M-5) Assertions (hard):**
  - **Primary (robust) check:** the captured computed `background-color` of `.diff-visualizer-container` (and `color` of `.diff-visualizer-label`) **differ** between theme 1 and theme 2 — proves var-driven, not hardcoded. This is the falsifiable anchor.
  - **Drop** the brittle `container bg === resolved --color-panel` string equality (computed `backgroundColor` always serializes to `rgb()`/`rgba()`; `getPropertyValue('--color-panel')` returns the raw token, and alpha compositing further breaks equality). If a tighter check is desired, normalize both sides by painting each into a throwaway element and reading back `getComputedStyle`, then compare — but the difference check above is the binding assertion.
  - **Fixed-tint anchor (version-stable, theme-independent):** `.d2h-ins` background `=== "rgba(46, 160, 67, 0.15)"` and `.d2h-del` `=== "rgba(248, 81, 73, 0.15)"` under **both** themes (verified `diff-renderer.html` CSS lines 285-286 — translucent tints are theme-independent by design, readable on light+dark).
  - If a theme leaves a consumed var unset, assert the documented **fallback** value for that property (branch asserted, not skipped).
- **Note:** purely-visual aesthetic correctness is not asserted; the *mechanism* (var consumption via cross-theme difference + fixed tints) is.

### E2E-20 — System-prompt nudge is appended at runtime (→ BEH-8) — via the gated probe
- **Goal:** prove `DiffNudge.execute` actually appends `DIFF_BEHAVIORAL_NUDGE` to the assembled `system_prompt` list (the runtime append, not just file presence).
- **Preconditions:** `A0_DIFFVIZ_TEST_PROBE=1` forwarded into the pod via `.devkit.yml e2e_pod_env` (Rule 4); `installedDiffViz` (the `_15_diff_nudge.py` extension AND the in-plugin `api/diffviz_probe.py` handler present). **(C-1)** Probe route is served from inside the installed plugin.
- **Steps:** `page.request.get(baseURL + "/diffviz_probe/system_prompt")` with the session creds.
- **Assertions (hard):**
  - HTTP `200` (probe enabled). **A `404`/probe-disabled ⇒ scenario RED** (Rule 6 — never swallowed).
  - Response `nudge_present === true`.
  - The assembled list contains an entry starting with `## Showing file changes as diffs` and containing the substrings ` ```diff ` (fence instruction), `--- a/path`, `+++ b/path`, `@@`, and `Load the \`diff\` skill`.
  - **(Closes G-2) Ordering — HARD, not best-effort:** the probe returns the full ordered list plus `nudge_index`. Assert `nudge_index >= 0` AND `nudge_index` is greater than the index of at least the first list element (the `_15_` nudge appears after lower-numbered-prefix contributions). Since the probe returns the complete ordered assembly, ordering is fully deterministic and asserted as a hard check (no "best-effort" degradation).
- **No LLM** used — the probe is a pure helper (Rule 4).

### E2E-21 — `diff` skill is discoverable and teaches valid unified-diff syntax (→ BEH-9)
- **Goal:** the skill ships and is loadable by A0's skill loader, and its content teaches the diff contract.
- **(Closes C-2) Split into two falsifiable checks against the mechanisms that actually serve each datum:**
  - **(a) Discovery — via the real skills-list API.** `POST /skills` `action:"list"` (verified `/a0/api/skills.py:60-63`) returns per-skill `{name, description, path}` only. Assert a skill named `diff` is present in that response (genuinely served + falsifiable). Do NOT assert `triggers`/`content` here — the API projection omits them (`helpers/skills.py` has the fields but the endpoint drops them).
  - **(b) Triggers + content — via the gated probe file read.** `page.request.get(baseURL + "/diffviz_probe/skill_file")` → `{exists, content}` (reads in-pod `usr/plugins/diff_visualizer/skills/diff/SKILL.md`; `404`/`exists:false` ⇒ RED). Assert `exists === true` and the raw `content` contains: triggers `diff`, `patch`, `show changes`, `before and after`, `show diff`, `proposed changes`; the rule that the fence **must** be `diff`; the `--- a/` / `+++ b/` / `@@` anatomy; multi-file fences; `git diff` / `git diff --staged` capture; and the CDN/air-gapped fallback pitfall.
- **@skip — not used here.** Both halves are hard-asserted against real, serving mechanisms (API for discovery, probe-file for content).
- `[coverage] group-i: asserted=3 skipped=0`

---

# GROUP J — Lifecycle, project-independence, no-config-surface & render fidelity (Rule 3, §C, §0 manifest facts, G-1)

*Video: `group-j.webm`.*

### E2E-24 — Plugin renders identically inside a UI-provisioned A0 project, and exposes NO config surface (→ §C, manifest `per_project_config:false`)
- **Goal:** satisfy Rule 3's "create app state through the real UI" while asserting the plugin is project-independent and config-less (positive, API-anchored assertions, not omissions).
- **Preconditions:** `installedDiffViz` (enabled).
- **Steps (real UI provisioning):**
  1. Open the Projects view; click `.projects-create-btn-top`.
  2. Type a title into `input.projects-form-input`.
  3. Click the `.button.confirm` whose text is "Create and continue".
  4. Enter the project-scoped chat; reload so `sidebar-end` injects.
  5. `injectDiffBlock(DIFF_SAMPLE)`.
- **Assertions (hard):**
  - `.diff-visualizer-container` with `.d2h-file-side-diff` renders **identically** inside the project chat (same selectors as Group A) — render does not depend on project scope.
  - **(Closes M-1) No config surface — API-anchored + DOM:** query `plugins_list` (via `page.request`/`callJsonApi`) and assert the `diff_visualizer` entry has `has_config_screen === false` (deterministic; `helpers/plugins.py:263` derives it from `exists(webui/config.html)`, and the plugin ships only `webui/.gitkeep`+`thumbnail.png`). THEN assert the rendered card shows the Info/kebab affordance but **no** Config button (`x-if="plugin.has_config_screen"` gate in `plugin-list.html`; no `getByRole("button",{name:/Config|Settings|Configure/i})` within the card). Anchoring on the API field makes "no config surface" non-timing-dependent (a transiently-collapsed kebab can't produce a false green).
- **Teardown:** delete the project through the real UI — the project row's trash button, `$confirmClick` semantics (click trash twice to confirm).

### E2E-25 — Render survives A0's real `messages.js` output including the appended `.step-action-buttons` copy button (→ BEH-1 fidelity)
- **(Closes G-1) Goal:** close the fidelity gap between hand-built fixtures and true `messages.js` output. A0 appends its own `.step-action-buttons` (its native copy button) as a trailing child of the same `markdown-block-wrap` (`messages.js:1768-1776`); the plugin does `blockWrapper.replaceWith(container)` on the whole wrapper, which discards A0's button. This is intended but was untested.
- **Preconditions:** `installedDiffViz`, `diffPage`.
- **Steps:** inject a fixture mirroring A0 **exactly**, including a trailing `.step-action-buttons` child inside the `.markdown-block-wrap` (alongside `.code-block-wrapper > pre > code.language-diff`).
- **Assertions (hard):**
  - `.diff-visualizer-container` present with `.d2h-file-side-diff` (render succeeded on the faithful node).
  - A0's native button is gone post-transform: within the swapped region, `.step-action-buttons` count `=== 0` (the whole `markdown-block-wrap` was replaced — documents the real, intended behaviour as a falsifiable assertion).
- `[coverage] group-j: asserted=2 skipped=0`

---

## Suite-level honesty footer (emitted after all groups; Rules 1 & 2) — reconciled per m-5

```
[coverage] TOTAL: asserted=26 skipped=1
  group-a=3  group-b=2  group-c=1  group-d=3  group-e=2(+1 skip)
  group-f=3  group-g=3  group-h=3  group-i=3  group-j=2
  sum asserted = 3+2+1+3+2+3+3+3+3+2 = 26 ; skipped = 1
[skipped]  E2E-11 OS-clipboard read-back for execCommand fallback — un-enableable headless env (Rule 6); fallback INVOCATION hard-asserted; issue <plugin-repo>#TBD
The harness FAILS the run if any group log contains "probe disabled" or a bare ✓ for an
un-asserted case. Each group's [coverage] tally is reconciled against its declared scenario
count; a mismatch is RED. (m-5: per-group tallies, the coverage-map rows, and this footer
all reconcile to asserted=26 skipped=1 across E2E-1..E2E-25 — E2E-25 added per G-1.)
```

---

## Notes on fidelity to the codebase (load-bearing facts the step-defs rely on)

- The injection technique is **exactly** how A0's renderer builds the DOM (`messages.js:1769-1775` wraps `pre`→`.code-block-wrapper`→`.markdown-block-wrap`, plus a trailing `.step-action-buttons` at 1768-1776 — now covered by E2E-25), so injected fixtures are faithful and need no LLM turn.
- The plugin's processed-selector is `pre > code.language-diff:not([data-diff-processed])` — E2E-22's `language-patch`/unlabeled cases and E2E-15's idempotency assertions key off this exact predicate.
- BEH-8's runtime append is the **only** behaviour not observable from the browser DOM; it is exercised by the **in-plugin gated** `api/diffviz_probe.py` handler (C-1), consistent with `/a0/agent.py get_system_prompt → call_extensions_async("system_prompt", …)` and `_15_diff_nudge.py:DiffNudge.execute`. The probe also serves the in-pod `SKILL.md` for E2E-21(b) since the skills-list API omits `content`/`triggers` (C-2).
- The skills-list API (`POST /skills`, `action:"list"`) returns only `{name, description, path}` (`/a0/api/skills.py:60-63`) — discovery is asserted there; content/triggers are asserted via the probe file read.
- The harness is **Playwright `test()` grouped specs** registered in `BEHAVIOUR_SPECS`, using the devkit's real `PluginsPage` + `createA0Fixtures()` — not Gherkin (C-3).
- There is genuinely **no `@extensible` fork seam** in this plugin (D-table SR-10); `a0_compat: upstream` in `.devkit.yml`. The probe's `api/` handler is the lone, **test-only env-gated** addition (annotated against §D so it doesn't contradict "no API handlers"); the whole suite is expected to pass on stock `agent0ai/agent-zero:latest` — that green run is the upstream-compat proof (DEC-056).

Key source paths inspected: `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/extensions/webui/sidebar-end/diff-renderer.html`, `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/extensions/python/system_prompt/_15_diff_nudge.py`, `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/skills/diff/SKILL.md`, `/tmp/fan-diff-visualizer/tests/e2e/behaviour.mjs`; live A0 `/a0/webui/js/messages.js`, `/a0/agent.py`, `/a0/helpers/extension.py`, `/a0/helpers/plugins.py`, `/a0/helpers/skills.py`, `/a0/api/skills.py`, `/a0/webui/components/header-icons.html`, `/a0/webui/components/sidebar/left-sidebar.html`, `/a0/webui/components/projects/project-create.html` + `project-list.html`, `/a0/webui/components/plugins/plugin-list.html`, `/a0/plugins/_plugin_installer/api/plugin_install.py`; devkit `PluginsPage`, `e2e/harness/run-lifecycle.sh`, `playwright-base.config.ts`, `a0-up.sh`, and `SPEC.md` DEC-056/057 (`e2e_pod_env`/no-silent-swallow).