from typing import Any

from agent import Agent, LoopData
from helpers.extension import Extension


class DiffNudge(Extension):
    """Inject behavioral nudge for visual diff usage."""

    async def execute(
        self,
        system_prompt: list[str] = [],
        loop_data: LoopData = LoopData(),
        **kwargs: Any,
    ):
        if not self.agent:
            return
        system_prompt.append(DIFF_BEHAVIORAL_NUDGE)


DIFF_BEHAVIORAL_NUDGE = """\
## Showing file changes as diffs
When you propose edits to a file (e.g. in plan mode before applying them), when you \
show already-made but uncommitted working-tree changes, or when a before/after \
comparison makes a change clearer — render it as a unified diff in a ```diff fenced \
code block. The chat UI renders these as visual diffs (line-by-line, with a \
side-by-side toggle).
Emit standard unified-diff syntax: `--- a/path`, `+++ b/path`, `@@` hunk headers, and \
`+`/`-`/space line prefixes. `git diff` / `git diff --staged` output can be pasted \
verbatim. Multiple files can go in one fence.
Do not use a diff for brand-new files with no prior version, or for trivial one-token \
changes better described in text. Load the `diff` skill if you need a syntax reference.
"""
