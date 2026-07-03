"""Review check: sensitive config comes from environment, not hardcoded in compose.

Asserts docker-compose.yml references secrets via ${...} env interpolation and that
Settings uses an env prefix. Exits non-zero on a violation.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    problems = []

    # Every password/secret assignment in compose must use ${...} interpolation.
    for match in re.finditer(r"(?im)^\s*[A-Z_]*(PASSWORD|SECRET|ROOT_USER)\s*:\s*(.+)$", compose):
        value = match.group(2).strip()
        if "${" not in value:
            problems.append(f"hardcoded secret in compose: {match.group(0).strip()}")

    # Settings must read from environment with a prefix.
    config = (ROOT / "app" / "config.py").read_text(encoding="utf-8")
    if "env_prefix" not in config:
        problems.append("app/config.py does not use an env_prefix for settings")

    if problems:
        for p in problems:
            print(f"VIOLATION: {p}", file=sys.stderr)
        return 1
    print("OK: secrets are env-driven; nothing hardcoded in compose")
    return 0


if __name__ == "__main__":
    sys.exit(main())
