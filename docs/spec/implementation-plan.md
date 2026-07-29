# diff-visualizer — Implementation plan

Product internals (counterpart to `e2e-steps-spec.md`).

## Component
`extensions/webui/sidebar-end/diff-renderer.html` — a module that imports diff2html (UMD JS + CSS) from a
pinned CDN URL, installs a `MutationObserver` on the chat DOM, and replaces ```diff code blocks with a
rendered side-by-side visual diff.

## Internals
- **Detection:** `code.language-diff:not([data-diff-processed])`; observer re-scans on chat mutations
  (debounce-coalesced).
- **Render:** builds a `.diff-visualizer-container` whose body is diff2html's `.d2h-wrapper`; marks the
  source `data-diff-processed`. If diff2html doesn't yield a `d2h-wrapper` (CDN down / bad output), the
  marker is REMOVED and the raw `pre>code` is left readable (no crash).
- **Toolbar:** `.diff-visualizer-toolbar` with a label, a maximize button (opens `.diff-visualizer-overlay`
  re-rendering the diff), and a copy button (writes the RAW diff source; execCommand fallback).

## Dependencies
diff2html from `cdn.jsdelivr.net` at runtime (pinned URL; the plugin's design — the e2e needs the CDN).
No fork seam. The render trigger is a `code.language-diff` block in the DOM; the e2e injects one directly.
