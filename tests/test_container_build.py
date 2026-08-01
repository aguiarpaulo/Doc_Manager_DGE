"""Checks on the artifacts that ship inside the API container image.

These guard the `docker compose up --build` path, which no other test exercises:
a shell script with CRLF endings is not executable by a Linux kernel, and a
dependency missing from the image only fails at import time in the container.
"""

import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _shell_scripts() -> list[Path]:
    return sorted(REPO_ROOT.glob("docker/*.sh"))


def test_shell_scripts_shipped_in_the_image_have_unix_line_endings():
    """A CRLF shebang makes the kernel look for an interpreter named `bash\\r`."""
    scripts = _shell_scripts()
    assert scripts, "expected at least one shell script under docker/"

    offenders = [p.name for p in scripts if b"\r\n" in p.read_bytes()]

    assert offenders == [], f"shell scripts with CRLF line endings: {offenders}"


def test_repository_pins_shell_scripts_to_lf_endings():
    """Without this, a Windows checkout silently reintroduces CRLF on every clone."""
    gitattributes = REPO_ROOT / ".gitattributes"
    assert gitattributes.exists(), ".gitattributes is missing"

    rules = gitattributes.read_text(encoding="utf-8").splitlines()

    assert any(
        line.split("#")[0].strip().startswith("*.sh") and "eol=lf" in line for line in rules
    ), ".gitattributes does not force LF endings for *.sh"


def test_container_startup_bootstraps_the_first_admin_before_serving():
    """Otherwise a fresh `docker compose up` yields an API nobody can log in to."""
    entrypoint = (REPO_ROOT / "docker" / "entrypoint.sh").read_text(encoding="utf-8")

    bootstrap_at = entrypoint.find("app.bootstrap_admin")
    uvicorn_at = entrypoint.find("uvicorn")

    assert bootstrap_at != -1, "entrypoint never runs the first-admin bootstrap"
    assert bootstrap_at < uvicorn_at, "bootstrap must run before the server starts"


def _runtime_dependency_names() -> set[str]:
    pyproject = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    names = set()
    for spec in pyproject["project"]["dependencies"]:
        names.add(re.split(r"[\[<>=!~;]", spec, maxsplit=1)[0].strip())
    return names


def test_container_image_installs_every_runtime_dependency():
    """The Dockerfile installs its own pinned list, which can drift from pyproject."""
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")

    missing = sorted(name for name in _runtime_dependency_names() if name not in dockerfile)

    assert missing == [], f"declared in pyproject.toml but not installed in the image: {missing}"
