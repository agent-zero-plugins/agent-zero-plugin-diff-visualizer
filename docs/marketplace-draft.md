# Marketplace draft — a0-plugins index submission (DO NOT SUBMIT YET)

The marketplace PR is a parent-context-coordinated final step, gated on the repo
going public. This file stages everything the PR needs.

## Index folder

`plugins/diff_visualizer/` — matches `plugin.yaml` `name: diff_visualizer`
(`^[a-z0-9_]+$`, no hyphens).

## `index.yaml` (draft)

```yaml
title: DiffVisualizer
description: >-
  Renders unified-diff code blocks as side-by-side visual diffs right in the
  chat, with a fullscreen maximize view and a copy-raw-source button. Multi-file
  fences render per file; malformed diffs and offline (CDN-blocked) sessions
  gracefully fall back to readable plain code. Ships a diff skill teaching the
  agent valid unified-diff syntax and a system-prompt nudge so proposed edits
  and before/after comparisons arrive as reviewable diffs.
github: https://github.com/agent-zero-plugins/agent-zero-plugin-diff-visualizer
tags:
  - development
  - code-review
  - workflow
  - tools
screenshots:
  - https://raw.githubusercontent.com/agent-zero-plugins/agent-zero-plugin-diff-visualizer/main/docs/diff-inline.png
  - https://raw.githubusercontent.com/agent-zero-plugins/agent-zero-plugin-diff-visualizer/main/docs/diff-maximized.png
```

- Description length: ~470 chars (< 500 limit). Title: 14 chars (< 50 limit). Tags: 4 (≤ 5).

## Thumbnail

Copy `usr/plugins/diff_visualizer/webui/thumbnail.png` (256×256 square, ~1.5 KB — well
under the 20 KB limit) into the index folder as `thumbnail.png`.

## Pre-submission checklist (flip-time)

- [ ] Repo made public (parent decision)
- [ ] Screenshot raw URLs return 200 on `main`
- [ ] `plugin.yaml` at plugin dir root has `name: diff_visualizer` + `license: Apache-2.0`
- [ ] Root `LICENSE` = full canonical Apache-2.0 (REQ-LIC-001)
- [ ] `github:` URL not already present in the live index
      (https://github.com/agent0ai/a0-plugins/releases/download/generated-index/index.json)
- [ ] One plugin per PR; only `index.yaml` + `thumbnail.png` in the folder
