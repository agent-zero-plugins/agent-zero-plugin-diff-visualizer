"""Unit test: the capability-nudge publisher (get_prompt_fragments /end hook).

Faked helpers so it runs without A0. Covers: publishes an UNBOUND fragment
carrying the nudge body when the seam is present; no-ops when the seam is
absent (older core) so it never breaks boot or dispatch.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import types


_HOOK = (
    pathlib.Path(__file__).resolve().parents[1]
    / "usr" / "plugins" / "diff_visualizer" / "extensions" / "python" / "_functions" / "helpers"
    / "prompt_fragments" / "get_prompt_fragments" / "end" / "_50_publish_diff_nudge.py"
)


class _Ext:
    def __init__(self, *a, **k): pass


class _Frag:
    def __init__(self, key="", body="", source="", origin="", binds_to_tools=(), binds_to_mcp=""):
        self.key, self.body, self.origin = key, body, origin
        self.binds_to_tools, self.binds_to_mcp = tuple(binds_to_tools), binds_to_mcp


def _load(seam: bool):
    # helpers.extension is needed at import time; prompt_fragments per-run
    hx = types.ModuleType("helpers.extension"); hx.Extension = _Ext
    helpers = types.ModuleType("helpers"); helpers.extension = hx
    sys.modules["helpers"] = helpers
    sys.modules["helpers.extension"] = hx
    if seam:
        pf = types.ModuleType("helpers.prompt_fragments"); pf.PromptFragment = _Frag
        helpers.prompt_fragments = pf
        sys.modules["helpers.prompt_fragments"] = pf
    else:
        sys.modules.pop("helpers.prompt_fragments", None)
    spec = importlib.util.spec_from_file_location("_pubhook", _HOOK)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod.PublishNudge()


def test_publishes_unbound_fragment_with_nudge_body():
    hook = _load(seam=True)
    data: dict = {}
    hook.execute(data=data)
    frags = data.get("result") or []
    assert len(frags) == 1
    f = frags[0]
    assert f.key == "plugin:diff_visualizer/nudge"
    assert f.body.strip()                      # the real nudge text
    assert f.binds_to_tools == () and f.binds_to_mcp == ""   # UNBOUND -> relayable


def test_appends_without_clobbering_existing():
    hook = _load(seam=True)
    prior = _Frag(key="other")
    data = {"result": [prior]}
    hook.execute(data=data)
    assert len(data["result"]) == 2 and data["result"][0] is prior


def test_no_op_without_seam():
    hook = _load(seam=False)
    data: dict = {}
    hook.execute(data=data)
    assert not data.get("result")              # nothing published, no crash
