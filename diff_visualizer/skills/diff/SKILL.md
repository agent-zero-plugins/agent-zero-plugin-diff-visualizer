---
name: diff
version: 1.0.0
description: "Guide to emitting unified diffs that render as visual diffs in chat"
author: "Omar Nahhas"
tags: [diff, patch, changes, code-review, before-after]
triggers:
  - diff
  - patch
  - show changes
  - before and after
  - show diff
  - proposed changes
---

# Diff Visualizer Skill

Show file changes by emitting a **unified diff** in a fenced code block. The chat UI
renders it as a side-by-side visual diff, with a maximize view for large diffs and a
copy-raw button.

## Output Format

Always use a fenced code block with the `diff` language identifier:

````
```diff
--- a/src/auth.py
+++ b/src/auth.py
@@ -10,3 +10,4 @@
   def login(user):
-    return check(user)
+    log(user)
+    return check(user)
```
````

## When to use it

| Situation | Use a diff? |
|---|---|
| Proposing edits in plan mode (not yet applied) | **Yes** — hand-author the unified diff |
| Showing uncommitted working-tree changes | **Yes** — paste `git diff` output verbatim |
| Showing staged changes | **Yes** — paste `git diff --staged` |
| Before/after comparison of a snippet | **Yes** |
| A brand-new file with no prior version | No — show a normal code block |
| A trivial one-token change | No — describe it in prose |

## Unified-diff anatomy

```
--- a/<old path>          ← original file (a/ prefix by convention)
+++ b/<new path>          ← new file (b/ prefix)
@@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@   ← hunk header
 <context line>           ← leading space = unchanged context
-<removed line>           ← leading minus = removed
+<added line>             ← leading plus = added
```

- The renderer keys on well-formed `---` / `+++` / `@@` headers. If the `@@` line
  counts are approximate, the diff still renders — but always include the headers.
- Keep ~3 lines of context around each change (git's default) so the hunk reads clearly.

## Multiple files in one fence

```diff
--- a/src/auth.py
+++ b/src/auth.py
@@ -10,2 +10,3 @@
   def login(user):
+    log(user)
     return check(user)
--- a/src/util.py
+++ b/src/util.py
@@ -1,2 +1,2 @@
-def log(msg): pass
+def log(msg): print(msg)
```

## Capturing real changes

- Working tree vs HEAD: `git diff`
- Staged vs HEAD: `git diff --staged`
- Between commits: `git diff <a>..<b>`
- A single file: `git diff -- path/to/file`

Paste the output directly inside a ```diff fence — no edits needed.

## Pitfalls

- **Fence language must be `diff`** (not `patch`, not unlabeled) or it renders as plain text.
- **Keep the `---`/`+++` header lines** — without them the renderer can't identify the file.
- **Don't strip the leading space** on context lines; a line with no prefix breaks alignment.
- **CDN dependency:** the renderer loads diff2html from a CDN. In an air-gapped / strict-CSP
  deployment the block falls back to readable raw text (no crash).
