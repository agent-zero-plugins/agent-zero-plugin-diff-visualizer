# Behaviour & UI Specification — agent-zero-plugin-diff-visualizer

**Plugin:** `diff_visualizer` · **Version:** 0.1.2 · **Author:** Omar Nahhas · **License:** Apache-2.0
**Type:** Frontend-injection + agent-behaviour plugin (no tools, no API handlers, no persisted config)
**Source of truth for this spec:** the plugin's actual code at `usr/plugins/diff_visualizer/*`, cross-checked against live A0 source at `/a0`.
**Spec status:** reverse-engineered after-the-fact, then self-reviewed against IEEE-29148 (complete / unambiguous / consistent / verifiable / traceable). Review-correction notes are inlined as `[SR-n]`.

---

## 0. Conformance & scope notes

- **Manifest facts** (`plugin.yaml`): `per_project_config: false`, `per_agent_config: false`, `always_enabled: false`. The plugin is **store-gated** (must be explicitly enabled) and has **no project/agent scoping**.
- **Config surface:** none. `default_config.yaml` contains only the comment `# No configurable options for this plugin.`; `meta.yaml` declares `env: []`. There is **no `webui/config.html`** (only `webui/.gitkeep` + `webui/thumbnail.png`). `[SR-1: the task brief asked for a "config screen + every control"; the verifiable truth is that none exists — see §C.]`
- **No backend/runtime config, no secrets, no env vars.** `[SR-2]`
- **README.md is the unmodified template README** (it documents `agent-zero-new-plugin-template`, not this plugin). It is therefore **not** an authoritative behaviour source and is excluded from the traceable requirements below. `[SR-3: flagged as a documentation defect, not a behaviour.]`

---

## A. User-facing behaviours (BEH-n)

Each behaviour lists its **trigger**, **observable effect**, and **verification** (the test that pins it, where one exists).

### BEH-1 — Auto-render unified-diff code blocks as visual side-by-side diffs
- **Trigger:** A chat message renders a fenced code block with language `diff`. A0's markdown renderer (`/a0/webui/js/messages.js`, confirmed) emits this as `pre > code.language-diff` wrapped in `.code-block-wrapper` → `.markdown-block-wrap`.
- **Effect:** A `MutationObserver` on `document.body` (subtree) detects the inserted block and, after a **150 ms debounce**, replaces the **outermost** wrapper (`.markdown-block-wrap`, falling back to `.code-block-wrapper`, then `pre`) with a `.diff-visualizer-container` (UI-1) holding a diff2html **side-by-side** render (`outputFormat: 'side-by-side'`, `drawFileList: false`, `matching: 'lines'`).
- **Idempotency:** each `code` element is marked `data-diff-processed="true"` *before* processing to prevent observer re-entry; the processed-selector excludes already-marked blocks (`:not([data-diff-processed])`).
- **Verification:** `tests/e2e/behaviour.mjs` steps 1–4 (container appears, toolbar+label present, `.d2h-wrapper` present, `.d2h-file-side-diff` present proving side-by-side options took effect).

### BEH-2 — Lazy, one-time load of the diff2html library from CDN
- **Trigger:** First diff block requiring a render (BEH-1) or a maximize action (BEH-4).
- **Effect:** Injects diff2html **CSS once** (`<link id="diff2html-css">`, guarded by id check) and lazily loads the **UMD JS bundle once** (memoised `Promise` in `_diff2htmlReady`); resolves only when `window.Diff2Html.html` is a function.
  - Pinned: `diff2html@3.4.51` UMD bundle + CSS via `cdn.jsdelivr.net`.
  - Design constraint captured in code: the jsDelivr `/+esm` build is **deliberately not used** (its ESM transform breaks diff2html's hogan.js dependency: *"n.Template is not a constructor"*).
- **Verification:** indirect — BEH-1 step 3 (`.d2h-wrapper`) only appears if the bundle loaded.

### BEH-3 — Graceful degradation when the CDN is unreachable or the render is invalid
- **Trigger (3a):** `diff2htmlReady()` rejects (air-gapped / strict CSP / network failure).
- **Effect (3a):** The `data-diff-processed` marker is **removed** and the function returns, leaving the **original raw `pre>code` block readable**. No crash.
- **Trigger (3b):** `renderHtml(source)` throws, returns empty, or returns markup **not containing `d2h-wrapper`**.
- **Effect (3b):** Marker removed, original block left untouched. The container swap happens **only** when a valid `d2h-wrapper` was produced.
- **Trigger (3c):** Empty source (`code.textContent` is blank after trailing-whitespace strip) → early return, no processing.
- **Verification:** no automated test; asserted by code inspection (`renderDiffBlock` try/catch paths). `[SR-4: gap noted — see §G coverage table.]`

### BEH-4 — Maximize a diff into a fullscreen overlay
- **Trigger:** User clicks the inline **Maximize** button (`.diff-maximize`, UI-2).
- **Effect:** Builds/opens a fullscreen overlay (UI-3, `.diff-visualizer-overlay`) that **re-renders the same raw diff source** at larger font (13px vs inline 12px). Only **one** overlay can exist: an existing `.diff-visualizer-overlay` is removed before a new one is created. Fades in via `requestAnimationFrame` → `.active`.
- **Verification:** `behaviour.mjs` step 6 (overlay visible, contains `.d2h-wrapper`, has close button).

### BEH-5 — Close the maximize overlay (three independent paths)
- **Triggers / Effects:**
  - (5a) Click `.diff-overlay-close` → overlay removed.
  - (5b) Click the overlay **backdrop** (`e.target === overlay`, i.e. outside the content) → overlay removed.
  - (5c) Press **Escape** → overlay removed.
- **Cleanup:** `close()` removes the overlay **and** detaches the `keydown` Escape listener (no leak).
- **Post-condition:** the inline `.diff-visualizer-container` remains intact.
- **Verification:** `behaviour.mjs` step 7 (close-button path: overlay count → 0, inline container still visible). 5b/5c untested. `[SR-5]`

### BEH-6 — Copy raw diff source to clipboard
- **Trigger:** User clicks a **Copy raw diff** button (`.diff-copy-source`, present in both inline toolbar UI-2 and overlay bar UI-3).
- **Effect:** Writes the **original raw diff text** (not the rendered HTML) to the clipboard via `navigator.clipboard.writeText`; on failure falls back to a hidden `<textarea>` + `document.execCommand('copy')`. The button's icon swaps `content_copy → check` for **2000 ms** as confirmation, then reverts.
- **Verification:** no automated test (button presence is asserted in `behaviour.mjs` step 5; the copy action itself is not exercised). `[SR-6]`

### BEH-7 — Theme-adaptive rendering
- **Trigger:** Any render (inline or overlay), under any active A0 theme.
- **Effect:** All plugin chrome and diff2html overrides consume A0's resolved CSS custom properties (`--color-panel`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-message-bg`, `--color-chat-background`) with hard-coded fallbacks (Catppuccin-ish values) so it renders correctly standalone or in any theme. Add/remove tints use translucent green/red (`rgba(46,160,67,*)` / `rgba(248,81,73,*)`) that read on light **and** dark backgrounds.
- **Verification:** none (visual). `[SR-7]`

### BEH-8 — Inject a behavioural nudge into the agent's system prompt
- **Trigger:** Every agent loop's system-prompt assembly. A0 calls `call_extensions("system_prompt", …)` from `Agent.get_system_prompt` (`/a0/agent.py:634-639`, confirmed), which dispatches the python extension `extensions/python/system_prompt/_15_diff_nudge.py`.
- **Effect:** `DiffNudge.execute` appends `DIFF_BEHAVIORAL_NUDGE` to the `system_prompt` list (guarded by `if not self.agent: return`). The nudge instructs the agent to render proposed edits / uncommitted changes / before-after comparisons as `` ```diff `` fenced unified diffs, to emit standard unified-diff syntax, to avoid diffs for brand-new files and trivial one-token changes, and to "load the `diff` skill" for syntax reference.
- **Ordering:** filename prefix `_15_` sets dispatch order among system_prompt extensions (lower runs earlier).
- **Verification:** `tests/test_diff_visualizer.py::test_system_prompt_nudge_present` (file presence). The runtime append is **not** asserted. `[SR-8]`

### BEH-9 — Provide a loadable `diff` skill teaching valid unified-diff syntax
- **Trigger:** Agent encounters skill triggers (`diff`, `patch`, `show changes`, `before and after`, `show diff`, `proposed changes`) or is told to load the `diff` skill (by BEH-8).
- **Effect:** Skill `skills/diff/SKILL.md` documents output format (fence must be `diff`), a when-to-use table, unified-diff anatomy, multi-file fences, `git diff` capture recipes, and pitfalls (incl. the CDN/air-gapped fallback note).
- **Verification:** `tests/test_diff_visualizer.py::test_skill_present`.

---

## B. Injected UI components (UI-n)

### UI-1 — Inline diff container — `.diff-visualizer-container`
- **Where:** replaces the original markdown code-block wrapper inline in the chat transcript (BEH-1).
- **Structure:** `.diff-visualizer-toolbar` (UI-2) + `.diff-visualizer-rendered` (the diff2html `.d2h-wrapper`).
- **Selector note:** `.diff-visualizer-container` is plugin-unique chrome (no A0 core conflict). No `data-testid`s exist on A0 core UI; the plugin's own classes are the stable hooks. `[SR-9]`

### UI-2 — Inline toolbar — `.diff-visualizer-toolbar`
- **Contents:** label `.diff-visualizer-label` (text "Diff", uppercase) + `.diff-visualizer-actions` containing:
  - **`.diff-maximize`** — icon `open_in_full`, title "Maximize" → BEH-4.
  - **`.diff-copy-source`** — icon `content_copy`, title "Copy raw diff" → BEH-6.
- Icons are Material Symbols (`.material-symbols-outlined`); buttons are 28×28, `overflow:hidden` to clip a missing-font glyph.

### UI-3 — Maximize overlay — `.diff-visualizer-overlay`
- **Where:** appended to `document.body`, `position:fixed; inset:0; z-index:10000`.
- **Structure:** `.diff-visualizer-overlay-bar` (label "Diff" + `.diff-copy-source` + `.diff-overlay-close` icon `close`, title "Close (Esc)") + `.diff-visualizer-overlay-body` (re-rendered `.diff-visualizer-rendered`, 13px).
- **Behaviours:** BEH-4 (open), BEH-5 (3 close paths), BEH-6 (copy).

### UI-4 — diff2html-rendered diff surface — `.diff-visualizer-rendered .d2h-wrapper`
- diff2html output in **side-by-side** mode (`.d2h-file-side-diff` present). Plugin CSS overrides: file-list hidden, `.d2h-tag` labels hidden, transparent backgrounds, theme-var colours, translucent add/remove tints (BEH-7).

> **No persistent/always-visible chrome:** the `sidebar-end` HTML body is an empty hidden `<div>`; the plugin is a **headless script** that only manifests UI when a diff block exists (confirmed by `behaviour.mjs` header comment + the HTML body).

---

## C. Configuration screen

**None.** There is no `webui/config.html`, no controls, no settings, no env vars (`default_config.yaml` empty-by-comment; `meta.yaml env: []`; `plugin.yaml` `per_project_config: false`, `per_agent_config: false`). The only user-facing lifecycle control is the standard **enable/disable** toggle in A0's plugin manager (store-gated; `always_enabled: false`). `[SR-1, SR-2]`

---

## D. Backend / API surface & A0 extension points

**No custom API handlers, no `hooks.py`, no tools.** (`test_no_dead_plugin_hooks` enforces that if a `hooks.py` is ever added it may only define dispatched hooks.) The plugin attaches to **A0 extension points only**:

| Seam | Type | A0 location (verified) | Upstream vs fork | Notes |
|---|---|---|---|---|
| `sidebar-end` webui extension | UI injection | `<x-extension id="sidebar-end">` in `/a0/webui/components/sidebar/left-sidebar.html`; served by `/api/load_webui_extensions` → `helpers/extension.get_webui_extensions` (globs `extensions/webui/<point>/*`) | **Upstream-stable** | A standard published webui extension point; **not** an `@extensible` fork seam. The plugin file `extensions/webui/sidebar-end/diff-renderer.html` is discovered by folder/glob convention. |
| `system_prompt` python extension | Behaviour | `Agent.get_system_prompt` → `call_extensions("system_prompt", …)` at `/a0/agent.py:634-639`; classes loaded via `helpers/extension._get_extension_classes` (globs `extensions/python/<point>/*.py`) | **Upstream-stable** | Ordinary ordered extension (`_15_` prefix). It is a plain `Extension` subclass, **not** a `_functions`/`@extensible` fork-seam hook. |
| `skills/` discovery | Behaviour | A0 skill loader | **Upstream-stable** | Standard skill packaging. |

**Relation to `@extensible` fork seams:** the live A0 fork exposes `@extensible` seams in `helpers/skills.py`, `helpers/subagents.py`, `helpers/secrets.py`, `helpers/ui_server.py` (verified). **This plugin depends on none of them** and ships **no `_functions` hooks**. It relies entirely on upstream-vanilla extension-point conventions, so it is **fork-version-agnostic** for its extension wiring. `[SR-10: explicitly resolves the brief's "@extensible / upstream-vs-fork" question — the answer is "no fork seams used".]`

**External runtime dependency:** diff2html `3.4.51` (UMD JS + CSS) fetched from `cdn.jsdelivr.net` at first use (BEH-2). This is the plugin's **only** network dependency and is **client-side only**.

---

## E. State & persistence

- **No server-side persistence. No localStorage. No cookies. No config storage.** `[SR-2]`
- **In-memory (per page session, JS module scope) state only:**
  - `_diff2htmlReady` — memoised library-load Promise (BEH-2).
  - `renderCounter` — incremented per successful render (diagnostic; not displayed).
  - `debounceTimer` — single pending debounce handle (BEH-1).
  - `data-diff-processed` DOM attribute — per-block idempotency marker (BEH-1); the only state that survives in the DOM, and it is removed on failed renders (BEH-3).
  - At most **one** `.diff-visualizer-overlay` in the DOM at a time (BEH-4).
- All in-memory state is lost on page reload; diffs simply re-render from the freshly loaded transcript.

---

## F. Edge cases & config-dependent behaviour

| ID | Condition | Behaviour |
|---|---|---|
| EC-1 | CDN unreachable / strict CSP / air-gapped | BEH-3a — raw `diff` block stays readable; no crash; marker cleared so a later successful load can retry. |
| EC-2 | Malformed diff yielding no `d2h-wrapper` | BEH-3b — original block left untouched. |
| EC-3 | Empty diff block | BEH-3c — skipped entirely. |
| EC-4 | Rapid streaming of many diff blocks | 150 ms debounce coalesces processing (BEH-1); `:not([data-diff-processed])` prevents reprocessing. |
| EC-5 | `clipboard.writeText` unavailable/denied | BEH-6 textarea+`execCommand` fallback. |
| EC-6 | Multiple files in one fence | Rendered as multiple files in one container (diff2html handles; skill documents the pattern). |
| EC-7 | Wrapper class differs from expected | Fallback chain `.markdown-block-wrap → .code-block-wrapper → pre` (BEH-1) tolerates A0 markup variation. |
| EC-8 | Plugin disabled | No script injected → diff blocks render as plain code; nudge absent; skill unavailable. (Default state — `always_enabled: false`.) |
| EC-9 | Fence labelled `patch` / unlabelled | **Not** rendered as a visual diff (selector keys strictly on `code.language-diff`); skill's "Pitfalls" documents this. |
| EC-10 | View-format toggle | **None exists** — render is side-by-side only (`// Side-by-side only (per design): no view toggle`). `[SR-11: documentation inconsistency — see §G.]` |

---

## G. Self-review findings (IEEE-29148 conformance)

**Consistency defects found in the artifacts (not in this spec):**
- **SR-DOC-1 (medium):** The **system-prompt nudge** (`_15_diff_nudge.py`) tells the agent the UI has *"a side-by-side toggle"*, and `SKILL.md` says *"renders it as a side-by-side visual diff, with a maximize view"* — but the renderer is **side-by-side only with no toggle** (code comment line 44 + EC-10). The nudge text is **inaccurate**; the skill text is accurate. Recommend correcting the nudge wording.
- **SR-DOC-2 (low):** `README.md` is the untouched template README and does not describe this plugin. Recommend replacing it.

**Completeness / verifiability gaps (traceability matrix):**

| Req | Verified by | Status |
|---|---|---|
| BEH-1 | `behaviour.mjs` 1–4; `test_diff_visualizer.py` surface tests | ✅ covered |
| BEH-2 | indirect (BEH-1 step 3) | ⚠ indirect only |
| BEH-3a/b/c | — | ❌ no automated test |
| BEH-4 | `behaviour.mjs` 6 | ✅ |
| BEH-5a | `behaviour.mjs` 7 | ✅ (5b backdrop, 5c Escape untested ⚠) |
| BEH-6 | button presence only (`behaviour.mjs` 5) | ⚠ action untested |
| BEH-7 | — | ❌ visual only |
| BEH-8 | `test_system_prompt_nudge_present` (presence) | ⚠ runtime append untested |
| BEH-9 | `test_skill_present` | ✅ presence |

**Recommendations to close gaps (for a future iteration, not asserted as current behaviour):** add e2e coverage for the Escape/backdrop close paths (BEH-5b/c) and the copy-confirmation icon swap (BEH-6); add a unit/DOM test for the CDN-failure fallback (BEH-3a); fix the nudge "side-by-side toggle" wording (SR-DOC-1); replace the template README (SR-DOC-2).

**Unambiguity / traceability:** every behaviour and UI component is numbered, tied to a concrete trigger and a file:line in the plugin or in verified live A0 source (`/a0/webui/components/sidebar/left-sidebar.html`, `/a0/webui/js/messages.js`, `/a0/agent.py`, `/a0/helpers/extension.py`, `/a0/api/load_webui_extensions.py`). No requirement rests on the non-authoritative README.

---

### Key file references (absolute paths)
- Injected UI + all logic: `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/extensions/webui/sidebar-end/diff-renderer.html`
- System-prompt nudge: `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/extensions/python/system_prompt/_15_diff_nudge.py`
- Skill: `/tmp/fan-diff-visualizer/usr/plugins/diff_visualizer/skills/diff/SKILL.md`
- Manifest/meta/config: `…/plugin.yaml`, `…/meta.yaml`, `…/default_config.yaml`
- E2E behaviour test: `/tmp/fan-diff-visualizer/tests/e2e/behaviour.mjs`
- Structural tests: `/tmp/fan-diff-visualizer/tests/test_diff_visualizer.py`
- Live A0 seams verified: `/a0/webui/components/sidebar/left-sidebar.html` (sidebar-end), `/a0/agent.py:634-639` (system_prompt dispatch), `/a0/helpers/extension.py:253-279` (webui discovery), `/a0/webui/js/messages.js:1759-1775` (code-block DOM)