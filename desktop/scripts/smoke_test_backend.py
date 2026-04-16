from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]


def reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def resolve_backend_command(port: int) -> list[str]:
    executable_name = "flight-delay-backend.exe" if os.name == "nt" else "flight-delay-backend"
    frozen_executable = REPO_ROOT / "desktop" / "dist" / "backend" / "server" / executable_name

    if frozen_executable.exists():
        return [str(frozen_executable), "--port", str(port)]

    python_command = os.environ.get("PYTHON") or ("python" if os.name == "nt" else "python3")
    return [python_command, "-m", "backend.desktop_entry", "--port", str(port)]


def wait_for_health(base_url: str, timeout_seconds: float = 45.0) -> dict[str, object]:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None

    while time.time() < deadline:
        try:
            with urlopen(f"{base_url}/", timeout=1.0) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if payload.get("modelLoaded") is not True:
                    raise RuntimeError("Backend became healthy without a loaded trained model.")
                return payload
        except (OSError, URLError, RuntimeError, ValueError) as error:
            last_error = error
            time.sleep(0.25)

    raise RuntimeError(f"Timed out waiting for backend health. Last error: {last_error}")


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            process.kill()
        else:
            process.send_signal(signal.SIGKILL)
        process.wait(timeout=5)


def main() -> int:
    port = reserve_local_port()
    base_url = f"http://127.0.0.1:{port}"
    command = resolve_backend_command(port)

    process = subprocess.Popen(
        command,
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env={
            **os.environ,
            "FLIGHT_DELAY_ENV": "production",
            "FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK": "false",
            "PYTHONUNBUFFERED": "1",
        },
    )

    try:
        payload = wait_for_health(base_url)
        print(
            "Backend smoke test passed:",
            f"predictionMode={payload.get('predictionMode')}",
            f"modelLoaded={payload.get('modelLoaded')}",
        )
        return 0
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
