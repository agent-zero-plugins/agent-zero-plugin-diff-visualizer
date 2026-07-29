# DiffVisualizer — visual diffs in Agent Zero chat

Renders unified-diff fenced code blocks as **side-by-side visual diffs** directly in the
Agent Zero chat UI — with a fullscreen maximize view, a copy-raw-source button, and
theme-aware styling. It also ships an agent **skill** that teaches the agent to emit
valid unified diffs, and a **system-prompt nudge** so the agent reaches for a diff
whenever it proposes edits, shows uncommitted changes, or compares before/after.

Reviewing a proposed change in prose is slow; reviewing it as a rendered diff is
instant. That's the whole plugin.

## What it looks like

Inline render in chat (side-by-side, per-file):

![Inline visual diff](docs/diff-inline.png)

Maximized fullscreen review (Esc / backdrop / ✕ to close):

![Maximized diff overlay](docs/diff-maximized.png)

## Features

| Feature | Detail |
|---|---|
| Auto-render | Any ` ```diff ` fence in chat becomes a visual diff (MutationObserver, debounced) |
| Side-by-side view | diff2html `side-by-side` output, line-matched |
| Multi-file fences | One fence containing several `diff --git` sections renders per-file |
| Maximize | Fullscreen overlay re-render at larger type; single-overlay invariant |
| Copy raw source | Copies the original diff text (never the rendered HTML) |
| Graceful fallback | CDN unreachable / malformed diff / empty block → the raw code block stays readable, nothing is swallowed |
| Theme-aware | Consumes A0's `--color-*` custom properties with sane fallbacks |
| Agent skill | `skills/diff/SKILL.md` — unified-diff anatomy, capture recipes, pitfalls |
| Behaviour nudge | System-prompt extension steering the agent toward diff output |

## Architecture

```mermaid
flowchart TD
    subgraph Agent side
        N[system_prompt extension\n_15_diff_nudge.py] -->|nudges| A[Agent emits ```diff fence]
        P[prompt_fragments publisher\n_50_publish_diff_nudge.py] -->|enumerable nudge| H[non-native harnesses]
        S[skills/diff/SKILL.md] -->|syntax reference| A
    end
    subgraph Chat UI - sidebar-end extension
        A -->|markdown renders| C[pre > code.language-diff]
        O[MutationObserver + 150ms debounce] --> C
        C --> G{parsed ≥1 file?\nd2h-file-wrapper}
        G -->|yes| R[.diff-visualizer-container\nside-by-side diff2html render]
        G -->|no / CDN down| F[raw block left readable]
        R --> M[maximize overlay]
        R --> Y[copy raw source]
    end
    D[(diff2html 3.4.51\njsDelivr CDN, lazy + memoised)] --> R
```

## Install

**Plugin Hub (recommended):** open *Settings → Plugins* in Agent Zero, find
**DiffVisualizer**, click *Install*.

**Manual zip:**

```bash
git clone https://github.com/agent-zero-plugins/agent-zero-plugin-diff-visualizer
cd agent-zero-plugin-diff-visualizer
make package                       # → dist/diff_visualizer.zip
# Then: A0 Settings → Plugins → Install from file → pick the zip
```

Enable the plugin after installing (it is store-gated, not always-enabled).

## Configuration

None. The plugin has no configurable options, no secrets, and no environment
variables (`default_config.yaml` is intentionally empty; `meta.yaml` declares
`env: []`).

> **Air-gapped note:** the renderer lazy-loads `diff2html@3.4.51` from jsDelivr. If the
> CDN is unreachable (offline / strict CSP), diff blocks simply stay as readable plain
> code — no crash, no data loss.

## Development

Repo layout follows the org-canonical devkit standard: plugin source under
`usr/plugins/diff_visualizer/`, devkit vendored at `tests/_testkit/` (private submodule).

```bash
git submodule update --init --recursive   # devkit + nested .agent-zero
make verify                               # Tier-1 static BDD gates (bdd-lint)
make package                              # build dist/diff_visualizer.zip
/opt/venv/bin/python -m pytest tests/ -v  # L1 component suite (7 tests)
make e2e                                  # full BDD e2e in the nested-A0 harness
```

The e2e harness boots a **nested Agent Zero** via rootless podman, installs the built
zip, runs a seam-off *red-proof* (the suite must fail without the plugin), then runs the
BDD features in `tests/e2e/features/` (`playwright-bdd`). Specs assert **end state**
(rendered containers, overlay presence/absence), never transient markers.

Behaviour truth lives in `docs/spec/behaviour-spec.md` (BEH-1…9) — feature scenarios
trace to those IDs.

## Tests

| Layer | Where | What |
|---|---|---|
| L1 component | `tests/test_diff_visualizer.py`, `tests/test_smoke.py`, `tests/test_publish_nudge.py` | surface validity, stray folders, dead hooks, manifest sanity, nudge publisher |
| L3 BDD e2e | `tests/e2e/features/*.feature` + `tests/e2e/steps/` | render, toolbar, maximize, 3 close paths, copy, multi-file, malformed fallback, non-diff negative |

## License

Apache-2.0 — see [LICENSE](LICENSE).
