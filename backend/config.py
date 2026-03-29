from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
DATA_ANALYSIS_DIR = REPO_ROOT / "data-analysis"
MODEL_ARTIFACT_PATH = BACKEND_DIR / "model.pkl"
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
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
