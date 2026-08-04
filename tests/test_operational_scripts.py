"""The project's own secret-hygiene check, run automatically.

`scripts/check_no_hardcoded_secrets.py` is the documented review gate over
docker-compose.yml and the host-side scripts, but there is no CI to invoke it. Running
it from the suite is what actually keeps a credential from being committed.
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CHECKER = REPO_ROOT / "scripts" / "check_no_hardcoded_secrets.py"


def test_no_credentials_are_hardcoded_in_deployment_config_or_scripts():
    result = subprocess.run(
        [sys.executable, str(CHECKER)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
