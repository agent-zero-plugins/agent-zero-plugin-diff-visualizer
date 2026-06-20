"""pytest conftest for the diff_visualizer plugin source repo.

Provides the `plugin_dir` and `a0_root` fixtures the a0_plugin_testkit
assertions need.
"""

import os
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def plugin_dir() -> Path:
    """Path to this plugin's source directory."""
    return Path(__file__).resolve().parent.parent / "diff_visualizer"


@pytest.fixture(scope="session")
def a0_root() -> Path | None:
    """Resolve an Agent Zero source checkout for surface-name validation.

    The testkit validates webui surface names against A0's real surface list,
    which requires the A0 source. Resolution order: ``$A0_ROOT``, then the
    conventional ``/a0`` install path. Returns ``None`` if neither is present
    so surface-validation tests can skip cleanly in a bare CI without A0.
    """
    env = os.environ.get("A0_ROOT")
    if env and (Path(env) / "agent.py").is_file():
        return Path(env)
    default = Path("/a0")
    if (default / "agent.py").is_file():
        return default
    return None
