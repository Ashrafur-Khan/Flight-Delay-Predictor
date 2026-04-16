from __future__ import annotations

import argparse
import os

import uvicorn

try:
    from .main import app
except ImportError:
    from backend.main import app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Flight Delay Predictor backend for the packaged desktop app.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--log-level", default="info")
    parser.add_argument("--access-log", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    os.environ.setdefault("FLIGHT_DELAY_ENV", "production")
    os.environ.setdefault("FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK", "false")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        access_log=args.access_log,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
