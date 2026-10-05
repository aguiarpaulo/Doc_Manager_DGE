"""Checks on the GitHub Actions deploy pipeline and its production compose override.

The pipeline (test -> build-and-push -> deploy) is host-agnostic: it pushes images to
GHCR and then SSHes into whatever box the DEPLOY_HOST secret points at (a DigitalOcean
Droplet, an Oracle Cloud Always Free VM, or anything else reachable over SSH). These
tests guard the pipeline's shape and safety properties, not any one host's specifics.
"""

import pathlib
import re

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "deploy.yml"
PROD_COMPOSE_PATH = REPO_ROOT / "docker-compose.prod.yml"


class _Reset:
    """Compose's `!reset` tag: the attribute is dropped instead of merged."""


class _ComposeLoader(yaml.SafeLoader):
    pass


_ComposeLoader.add_constructor("!reset", lambda loader, node: _Reset())


def _load_compose(path: pathlib.Path) -> dict:
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_ComposeLoader)


def _deploy_compose_paths() -> list[pathlib.Path]:
    """Every file the deploy script may pass with -f, optional overlays included as if
    present, in the order the script first names them."""
    script = _ssh_step()["with"]["script"]
    names = dict.fromkeys(re.findall(r"-f\s+(\S+\.ya?ml)", script))
    return [REPO_ROOT / name for name in names]


def _host_exposure_in_production() -> dict[str, list]:
    """What each service opens on the host once the deploy's compose files are merged.

    Compose appends `ports` lists across files, so an override can only add ports;
    `!reset` is the one way a later file removes what an earlier one published.
    Host networking needs no `ports:` at all to bind on the host, so it counts too.
    """
    exposure: dict[str, list] = {}
    for path in _deploy_compose_paths():
        for name, service in _load_compose(path)["services"].items():
            declared = service.get("ports", [])
            merged = exposure.get(name, [])
            exposure[name] = [] if isinstance(declared, _Reset) else merged + declared
            if service.get("network_mode") == "host":
                exposure[name] = [*exposure[name], "network_mode: host"]
    return exposure


def _load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def _ssh_step() -> dict:
    deploy_steps = _load_workflow()["jobs"]["deploy"]["steps"]
    return next(s for s in deploy_steps if s.get("uses", "").startswith("appleboy/ssh-action"))


def test_test_job_actually_runs_pytest_and_frontend_build():
    """A job named "test" that runs nothing would still satisfy a check on job names
    alone — assert it actually invokes the same checks CLAUDE.md asks a developer to
    run by hand, so a broken commit can't ship just because a job happened to exist.
    """
    steps = _load_workflow()["jobs"]["test"]["steps"]
    run_commands = "\n".join(step.get("run", "") for step in steps)

    assert "pytest" in run_commands, "test job never actually runs pytest"
    assert "ruff check" in run_commands, "test job never actually lints with ruff"
    assert "npm --prefix frontend run build" in run_commands, (
        "test job never builds the frontend (a type error would otherwise ship)"
    )


def test_deploy_only_runs_after_build_which_only_runs_after_test():
    """Untested or unbuilt code must never reach the server.

    A workflow that drops or reorders `needs:` would let a broken commit deploy
    straight to production without the test job ever having run.
    """
    jobs = _load_workflow()["jobs"]

    def needs(job_name: str) -> set[str]:
        raw = jobs[job_name].get("needs", [])
        return {raw} if isinstance(raw, str) else set(raw)

    assert "test" in needs("build-and-push"), "build-and-push does not wait on the test job"
    assert "build-and-push" in needs("deploy"), "deploy does not wait on build-and-push"


def test_publish_and_deploy_are_gated_to_pushes_on_main():
    """`needs:` alone is not enough: this workflow also runs on pull requests, and
    only an `if:` condition stops a PR from publishing images or deploying to
    production. Losing that condition would ship every PR straight to the server.
    """
    jobs = _load_workflow()["jobs"]

    for job_name in ("build-and-push", "deploy"):
        condition = jobs[job_name].get("if", "")
        assert "github.event_name == 'push'" in condition, (
            f"{job_name} is not restricted to push events"
        )
        assert "refs/heads/main" in condition, f"{job_name} is not restricted to main"


def test_deploy_workflow_never_hardcodes_deploy_credentials():
    """SSH host/user/key must come from repo secrets, never be committed as literals."""
    deploy_step = _ssh_step()["with"]

    for field in ("host", "username", "key"):
        assert deploy_step[field].startswith("${{ secrets."), (
            f"deploy step's {field!r} is not sourced from a repo secret"
        )

    raw = WORKFLOW_PATH.read_text(encoding="utf-8")
    forbidden_literals = ["root@", "-----BEGIN"]
    for literal in forbidden_literals:
        assert literal not in raw, (
            f"deploy workflow appears to hardcode a credential ({literal!r} found)"
        )


def test_production_compose_publishes_pullable_images():
    """CI must produce a pullable artifact for both services, not just a local build.

    Also guards against a future edit reintroducing `build:` here, which would make
    the server build locally again (see test_deploy_command_never_rebuilds_on_the_server
    for why that matters).
    """
    compose = _load_compose(PROD_COMPOSE_PATH)

    services = compose["services"]

    for service_name in ("api", "web"):
        service = services[service_name]
        assert "build" not in service, (
            f"{service_name} still defines build: in docker-compose.prod.yml"
        )
        assert "image" in service, f"{service_name} has no image: to pull"
        assert service["image"].startswith("ghcr.io/"), (
            f"{service_name} image is not published to ghcr.io"
        )


def test_compose_images_match_what_the_workflow_publishes():
    """The image name is written once in the workflow's `env:` and again as a literal
    in docker-compose.prod.yml. Nothing ties them together structurally, so renaming
    one without the other would deploy the wrong (or a nonexistent) image — silently,
    since `docker compose pull` on an unrelated-but-valid image tag would not error
    the way a typo'd ghcr.io path might.
    """
    env = _load_workflow()["env"]
    compose = _load_compose(PROD_COMPOSE_PATH)
    services = compose["services"]

    assert services["api"]["image"] == f"{env['API_IMAGE']}:latest"
    assert services["web"]["image"] == f"{env['WEB_IMAGE']}:latest"


def test_deploy_command_never_rebuilds_on_the_server():
    """docker-compose.yml still defines `build:` for api/web (needed for local dev), so
    merging it with docker-compose.prod.yml keeps that key too — Compose only skips the
    build step when the command run doesn't ask for one. If the remote deploy script
    ever grows a `--build` flag, the server would start building images itself again,
    which is exactly the resource contention (competing with live Postgres+MinIO for
    CPU/RAM on a small free-tier box) the CI-built-image approach exists to avoid.

    Checks the deploy step's own script, not the whole workflow file, so an unrelated
    comment mentioning the flag (like this docstring, if it were ever copied into the
    YAML) can't produce a false failure.
    """
    assert "--build" not in _ssh_step()["with"]["script"], (
        "deploy script must never pass --build to compose"
    )


def test_production_publishes_host_ports_only_through_caddy():
    """Caddy (`web`) is the only door: it terminates TLS and proxies /api internally.

    A published api:8000 would accept logins in plain HTTP around Caddy, and a
    published minio:9001 exposes the storage console with root credentials. The OS
    firewall does not stop either, because Docker-published ports are routed in the
    nat table before the host's INPUT rules ever see them.
    """
    exposed = {name: opened for name, opened in _host_exposure_in_production().items() if opened}

    assert set(exposed) == {"web"}, f"services publishing host ports in production: {exposed}"
