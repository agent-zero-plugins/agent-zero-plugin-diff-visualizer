"""Publish this plugin's capability nudge as an enumerable PromptFragment.

The nudge describes the CHAT UI's rendering capability, not an A0-native tool,
so it is UNBOUND (no binds_to_tools/binds_to_mcp) — any harness sharing the UI
may relay it. Native agents keep receiving it via this plugin's own
system_prompt extension; this hook makes it ENUMERABLE so non-native harnesses
(the Claude bridge) and scoping UIs can see and relay it. No-op on an A0
without the helpers.prompt_fragments seam.

The nudge text is read from the sibling system_prompt module by AST-extracting
the module-level string constant — NOT by importing/exec'ing that module, which
would pull in `from agent import ...` (heavy, and re-run every dispatch). AST
keeps this import-free, fast, and unit-testable without an A0 runtime.
"""
from __future__ import annotations

import ast
import pathlib

from helpers.extension import Extension

_NUDGE_SRC = (
    pathlib.Path(__file__).resolve().parents[5] / "system_prompt" / "_15_diff_nudge.py"
)
_CONST = "DIFF_BEHAVIORAL_NUDGE"


def _read_constant(path: pathlib.Path, name: str) -> str:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == name and isinstance(node.value, ast.Constant):
                    return node.value.value if isinstance(node.value.value, str) else ""
    return ""


class PublishNudge(Extension):
    def execute(self, data: dict = {}, **kwargs):
        try:
            from helpers.prompt_fragments import PromptFragment  # seam present?
        except Exception:
            return
        body = _read_constant(_NUDGE_SRC, _CONST)
        if not body:
            return
        frag = PromptFragment(key="plugin:diff_visualizer/nudge", body=body, origin="diff_visualizer")
        data["result"] = [*list(data.get("result") or []), frag]
