#!/usr/bin/env python3
"""Cross-platform task runner. `make <task>` and `.\\tasks.ps1 <task>` both call this file.

Tasks: install, local, test, build, deploy, outputs, destroy
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
WEB = ROOT / "web"
LAMBDA_BUILD = ROOT / ".build" / "lambda"
VENV = ROOT / ".venv"
VENV_PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
LAMBDA_PYTHON = "3.11"  # must match Runtime in template.yaml
SECRET_PARAMS = (
    "DemoToken=", "HarnessHmacKey=", "RingHmacKey=", "RingAccessToken=",
    "RingRefreshToken=", "RingClientId=", "RingClientSecret=",
)
# CloudFormation parameter -> .env variable (optional Ring values may be empty).
RING_PARAMS = {
    "RingHmacKey": "RING_HMAC_KEY",
    "RingAccessToken": "RING_ACCESS_TOKEN",
    "RingRefreshToken": "RING_REFRESH_TOKEN",
    "RingClientId": "RING_CLIENT_ID",
    "RingClientSecret": "RING_CLIENT_SECRET",
}


# ---------------------------------------------------------------- helpers -----------------------


def load_env() -> dict[str, str]:
    """Values from .env, overridden by the real environment."""
    env: dict[str, str] = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip('"').strip("'")
    env.update(os.environ)
    return env


def tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"error: '{name}' was not found on PATH")
    return path


def show(cmd: list[str]) -> str:
    return " ".join(
        next((p + "***" for p in SECRET_PARAMS if str(a).startswith(p)), str(a)) for a in cmd
    )


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    print(f"+ {show(cmd)}", flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def capture(cmd: list[str], **kwargs) -> str:
    return subprocess.run([str(c) for c in cmd], check=True, capture_output=True, text=True, **kwargs).stdout


def python() -> str:
    if not VENV_PY.exists():
        sys.exit("error: .venv not found; run the 'install' task first")
    return str(VENV_PY)


def require(env: dict[str, str], key: str) -> str:
    value = env.get(key, "")
    if not value:
        sys.exit(f"error: {key} is not set (add it to .env)")
    return value


def stack(env: dict[str, str]) -> tuple[str, str]:
    return env.get("STACK_NAME", "threshold"), env.get("AWS_REGION", "us-east-1")


# ---------------------------------------------------------------- tasks -------------------------


def task_install(_: argparse.Namespace) -> None:
    if not VENV_PY.exists():
        run([sys.executable, "-m", "venv", VENV])
    run([VENV_PY, "-m", "pip", "install", "--upgrade", "pip"])
    run([VENV_PY, "-m", "pip", "install", "-r", BACKEND / "requirements-dev.txt"])
    run([tool("npm"), "ci"], cwd=WEB)

    env_file = ROOT / ".env"
    if not env_file.exists():
        text = (ROOT / ".env.example").read_text(encoding="utf-8")
        text = text.replace("DEMO_TOKEN=replace-me", f"DEMO_TOKEN={secrets.token_urlsafe(24)}")
        text = text.replace("HARNESS_HMAC_KEY=replace-me", f"HARNESS_HMAC_KEY={secrets.token_urlsafe(32)}")
        env_file.write_text(text, encoding="utf-8")
        print("Created .env with a random DEMO_TOKEN and HARNESS_HMAC_KEY. Fill in the rest as needed.")


def task_test(_: argparse.Namespace) -> None:
    run([python(), "-m", "pytest", "-q"], cwd=BACKEND)


def task_local(_: argparse.Namespace) -> None:
    env = load_env()
    backend_env = {**os.environ, "APP_ENV": "local"}
    web_env = {**os.environ, "NEXT_PUBLIC_API_BASE": "http://localhost:8000/api"}
    procs = [
        subprocess.Popen(
            [python(), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
            cwd=BACKEND,
            env=backend_env,
        ),
        subprocess.Popen([tool("npm"), "run", "dev"], cwd=WEB, env=web_env),
    ]
    print("Backend: http://localhost:8000/api/health   Frontend: http://localhost:3000   (Ctrl+C to stop)")
    if not env.get("DEMO_TOKEN"):
        print("warning: DEMO_TOKEN is empty; authenticated routes will return 503")
    try:
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()


def build_lambda() -> None:
    """Bundle backend/app plus Linux (manylinux) wheels, so a Windows machine never ships Windows wheels.

    Uses uv, not pip: `pip --platform` still evaluates environment markers against the host, so on
    Windows it demands pywin32 (via mcp, a strands-agents dependency) for a Linux target and fails.
    uv evaluates markers for the target platform (friction log F16).
    """
    shutil.rmtree(LAMBDA_BUILD, ignore_errors=True)
    LAMBDA_BUILD.mkdir(parents=True)
    run([
        python(), "-m", "uv", "pip", "install",
        "--requirement", BACKEND / "requirements.txt",
        "--target", LAMBDA_BUILD,
        "--python-platform", "x86_64-manylinux2014",
        "--python-version", LAMBDA_PYTHON,
        "--only-binary", ":all:",
        "--quiet",
    ])
    shutil.copytree(BACKEND / "app", LAMBDA_BUILD / "app", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def build_web(api_base: str) -> None:
    run([tool("npm"), "run", "build"], cwd=WEB, env={**os.environ, "NEXT_PUBLIC_API_BASE": api_base})


def task_build(_: argparse.Namespace) -> None:
    build_lambda()
    build_web("/api")


def stack_outputs(env: dict[str, str]) -> dict[str, str]:
    name, region = stack(env)
    raw = capture([
        tool("aws"), "cloudformation", "describe-stacks",
        "--stack-name", name, "--region", region,
        "--query", "Stacks[0].Outputs", "--output", "json",
    ])
    return {o["OutputKey"]: o["OutputValue"] for o in json.loads(raw) or []}


def task_outputs(_: argparse.Namespace) -> None:
    for key, value in stack_outputs(load_env()).items():
        print(f"{key:16} {value}")


def task_deploy(_: argparse.Namespace) -> None:
    env = load_env()
    name, region = stack(env)
    params = [
        f"DemoToken={require(env, 'DEMO_TOKEN')}",
        f"HarnessHmacKey={require(env, 'HARNESS_HMAC_KEY')}",
        f"AlertEmail={env.get('ALERT_EMAIL') or 'none'}",
        f"EscalationEmail={env.get('ESCALATION_EMAIL') or 'none'}",
        f"MonthlyBudgetUsd={env.get('MONTHLY_BUDGET_USD', '25')}",
        # SAM rejects empty "Key=" overrides, and omitted ones reuse the previous value, so unset
        # Ring values are sent as "none" (treated as unset by app/config.py).
        *(f"{param}={env.get(var) or 'none'}" for param, var in RING_PARAMS.items()),
    ]
    task_build(_)
    run(
        [
            tool("sam"), "deploy",
            "--template-file", ROOT / "template.yaml",
            "--stack-name", name,
            "--region", region,
            "--resolve-s3",
            "--capabilities", "CAPABILITY_IAM",
            "--no-confirm-changeset",
            "--no-fail-on-empty-changeset",
            "--tags", "Project=threshold",
            "--parameter-overrides", *params,
        ],
        cwd=ROOT,
        env={**os.environ, "SAM_CLI_TELEMETRY": "0"},
    )

    out = stack_outputs(env)
    bucket, dist = f"s3://{out['SiteBucketName']}", out["DistributionId"]
    aws = tool("aws")
    out_dir = WEB / "out"
    run([aws, "s3", "sync", out_dir, bucket, "--delete", "--region", region,
         "--exclude", "_next/static/*", "--cache-control", "no-cache"])
    run([aws, "s3", "sync", out_dir / "_next" / "static", f"{bucket}/_next/static", "--region", region,
         "--cache-control", "public,max-age=31536000,immutable"])
    run([aws, "cloudfront", "create-invalidation", "--distribution-id", dist, "--paths", "/*",
         "--query", "Invalidation.Id", "--output", "text"])

    url = out["SiteUrl"]
    with urllib.request.urlopen(f"{url}/api/health", timeout=30) as resp:
        print(f"Smoke test: GET {url}/api/health -> {resp.status} {resp.read().decode()}")
    print(f"\nDeployed: {url}\nRing webhook URL: {out['RingWebhookUrl']}")


def task_destroy(args: argparse.Namespace) -> None:
    if not args.yes:
        sys.exit("Refusing to destroy without --yes. The judging period requires the stack to stay up until 2026-11-20.")
    env = load_env()
    name, region = stack(env)
    bucket = stack_outputs(env)["SiteBucketName"]
    run([tool("aws"), "s3", "rm", f"s3://{bucket}", "--recursive", "--region", region])
    run([tool("sam"), "delete", "--stack-name", name, "--region", region, "--no-prompts"])


TASKS = {
    "install": task_install,
    "local": task_local,
    "test": task_test,
    "build": task_build,
    "deploy": task_deploy,
    "outputs": task_outputs,
    "destroy": task_destroy,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("task", choices=TASKS)
    parser.add_argument("--yes", action="store_true", help="confirm destructive tasks (destroy)")
    args = parser.parse_args()
    try:
        TASKS[args.task](args)
    except subprocess.CalledProcessError as exc:
        sys.exit(f"error: command failed with exit code {exc.returncode}: {show(exc.cmd)}")


if __name__ == "__main__":
    main()
