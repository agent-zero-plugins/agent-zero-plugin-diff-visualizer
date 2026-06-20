"""Structural tests for the diff_visualizer plugin using a0_plugin_testkit."""

import pytest

from a0_plugin_testkit.assertions import (
    assert_extension_at_surface,
    assert_no_dead_plugin_hooks,
    assert_no_stray_extension_folders,
)

pytestmark = pytest.mark.unit


def test_webui_renderer_at_sidebar_end(plugin_dir, a0_root):
    """The diff renderer must live at the sidebar-end webui surface."""
    if a0_root is None:
        pytest.skip("no A0 source root (set A0_ROOT) for surface validation")
    assert_extension_at_surface(
        plugin_dir,
        "sidebar-end",
        pattern="diff-renderer.html",
        a0_root=a0_root,
    )


def test_no_stray_extension_folders(plugin_dir, a0_root):
    """Every extensions/webui/<surface> folder must be a real A0 surface."""
    if a0_root is None:
        pytest.skip("no A0 source root (set A0_ROOT) for surface validation")
    assert_no_stray_extension_folders(plugin_dir, a0_root=a0_root)


def test_no_dead_plugin_hooks(plugin_dir):
    """If a hooks.py is ever added, it may only define hooks A0 dispatches."""
    assert_no_dead_plugin_hooks(plugin_dir)


def test_system_prompt_nudge_present(plugin_dir):
    """The behavioral nudge ships at the python/system_prompt extension point."""
    nudge = plugin_dir / "extensions" / "python" / "system_prompt" / "_15_diff_nudge.py"
    assert nudge.is_file(), f"missing system-prompt nudge: {nudge}"


def test_skill_present(plugin_dir):
    """The diff skill ships with the plugin."""
    skill = plugin_dir / "skills" / "diff" / "SKILL.md"
    assert skill.is_file(), f"missing skill: {skill}"
