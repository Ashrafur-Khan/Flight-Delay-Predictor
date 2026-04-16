from __future__ import annotations

import os
import sys
from pathlib import Path


DESKTOP_APP_ORIGIN = "app://-"


def _resolve_runtime_paths() -> tuple[Path, Path]:
    if getattr(sys, "frozen", False):
        bundle_root = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
        bundled_backend_dir = bundle_root / "backend"
        if bundled_backend_dir.exists():
            return bundle_root, bundled_backend_dir
        return bundle_root, bundle_root

    backend_dir = Path(__file__).resolve().parent
    return backend_dir.parent, backend_dir


REPO_ROOT, BACKEND_DIR = _resolve_runtime_paths()
DATA_ANALYSIS_DIR = REPO_ROOT / "data-analysis"
MODEL_ARTIFACT_PATH = BACKEND_DIR / "model.pkl"
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    DESKTOP_APP_ORIGIN,
]
RUNTIME_ENV = os.getenv("FLIGHT_DELAY_ENV", "development").strip().lower() or "development"
ALLOW_HEURISTIC_FALLBACK = os.getenv("FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
} or RUNTIME_ENV != "production"
SERVICE_NAME = "Flight Delay Predictor API"
TARGET_NAME = "delay_event"
EXPLANATION_LLM_PROVIDER = os.getenv("FLIGHT_DELAY_EXPLANATION_LLM_PROVIDER", "").strip().lower() or "disabled"
EXPLANATION_LLM_API_URL = os.getenv("FLIGHT_DELAY_EXPLANATION_LLM_API_URL", "").strip()
EXPLANATION_LLM_API_KEY = os.getenv("FLIGHT_DELAY_EXPLANATION_LLM_API_KEY", "").strip()
EXPLANATION_LLM_MODEL = os.getenv("FLIGHT_DELAY_EXPLANATION_LLM_MODEL", "").strip()
EXPLANATION_LLM_TIMEOUT_SECONDS = float(
    os.getenv("FLIGHT_DELAY_EXPLANATION_LLM_TIMEOUT_SECONDS", "15").strip() or "15"
)
