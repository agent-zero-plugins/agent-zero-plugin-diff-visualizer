# Contributing to DiffVisualizer

Thanks for helping improve visual diffs in Agent Zero chat.

## Ground rules

- **All changes via branches + PRs** targeting `main`. CI (unit + plugin-e2e) must be green.
- **Behaviour-first BDD**: any user-visible behaviour change starts in
  `docs/spec/behaviour-spec.md` (BEH-n) and lands with a traceable `.feature` scenario in
  `tests/e2e/features/` plus step definitions in `tests/e2e/steps/`.
- **Red-first**: write the failing test before the fix. The e2e harness runs a seam-off
  *red-proof* — scenarios that pass without the plugin installed fail the gate.
- **End-state assertions only** in e2e specs (rendered containers, overlay counts) —
  never transient markers like `data-diff-processed`.
- **Versioning**: bump `version` in BOTH `usr/plugins/diff_visualizer/plugin.yaml` and
  `meta.yaml` (CI checks they match) and in `pyproject.toml`.

## Dev setup

```bash
git clone https://github.com/agent-zero-plugins/agent-zero-plugin-diff-visualizer
cd agent-zero-plugin-diff-visualizer
git submodule update --init --recursive   # devkit (private) + nested .agent-zero
```

## Verify loop (fastest first)

| Step | Command | Gate |
|---|---|---|
| 1 | `make verify` | bdd-lint: feature-purity, honesty, traceability |
| 2 | `/opt/venv/bin/python -m pytest tests/ -v` | L1 component suite, 0 skipped |
| 3 | `make package` | builds `dist/diff_visualizer.zip` |
| 4 | `make e2e` | seam-off red-proof + full BDD run in the nested-A0 harness |

A pre-commit hook (installed by the devkit adopter) runs bdd-lint on every commit.

## Renderer changes

The entire UI lives in one file:
`usr/plugins/diff_visualizer/extensions/webui/sidebar-end/diff-renderer.html`.
Keep the graceful-fallback invariants: never swap a readable block unless diff2html
produced at least one parsed file (`d2h-file-wrapper`), and always clear the
`data-diff-processed` marker on failure so the block stays retry-able.

## Reporting bugs

Use the issue templates. Include the raw diff text that misrendered — it is the
single most useful reproduction artifact.
