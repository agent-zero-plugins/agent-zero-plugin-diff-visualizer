"""Publish this plugin's capability nudge as an enumerable PromptFragment.

The nudge describes the CHAT UI's rendering capability, not an A0-native tool,
so it is UNBOUND (no binds_to_tools/binds_to_mcp) — any harness sharing the UI
may relay it. Native agents keep receiving it via this plugin's own
system_prompt extension; this hook makes it ENUMERABLE so non-native harnesses
(the Claude bridge) and scoping UIs can see and relay it. No-op on an A0
without the helpers.prompt_fragments seam.
"""
from __future__ import annotations

import importlib.util
import pathlib

from helpers.extension import Extension


class PublishNudge(Extension):
    def execute(self, data: dict = {}, **kwargs):
        try:
            from helpers.prompt_fragments import PromptFragment  # seam present?
        except Exception:
            return
        try:
            src = pathlib.Path(__file__).resolve().parents[5] / "system_prompt" / "_15_diff_nudge.py"
            spec = importlib.util.spec_from_file_location("_frag_src_diff_visualizer", src)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            frag = PromptFragment(
                key="plugin:diff_visualizer/nudge",
                body=getattr(mod, "DIFF_BEHAVIORAL_NUDGE", ""),
                origin="diff_visualizer",
            )
            if frag.body:
                data["result"] = [*list(data.get("result") or []), frag]
        except Exception:
            return
