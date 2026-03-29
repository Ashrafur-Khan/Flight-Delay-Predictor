from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional

import joblib
from pathlib import Path

from .feature_adapter import adapt_request_to_model_features
from .explainability import build_explanation

# -----------------------------
# Load Model
# -----------------------------
MODEL_PATH = Path(__file__).resolve().parent / "model.joblib"

if MODEL_PATH.exists():
    model = joblib.load(MODEL_PATH)
else:
    model = None


# -----------------------------
# Router
# -----------------------------
router = APIRouter()


# -----------------------------
# Request Schema (aligned with frontend)
# -----------------------------
class PredictionRequest(BaseModel):
    departureDate: str
    departureTime: str

    originAirport: str
    destinationAirport: str

    duration: Optional[float] = None
    temperature: Optional[float] = None

    precipitation: Optional[str] = "none"
    wind: Optional[str] = "calm"


# -----------------------------
# Safe Converters
# -----------------------------
def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


# -----------------------------
# Endpoint
# -----------------------------
@router.post("/predict")
def predict(request: PredictionRequest) -> Dict[str, Any]:
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    try:
        # -----------------------------
        # Normalize / sanitize input
        # -----------------------------
        sanitized_payload = {
            "departureDate": request.departureDate,
            "departureTime": request.departureTime,
            "originAirport": request.originAirport,
            "destinationAirport": request.destinationAirport,
            "duration": safe_float(request.duration),
            "temperature": safe_float(request.temperature),
            "precipitation": request.precipitation,
            "wind": request.wind,
        }

        # -----------------------------
        # Feature engineering
        # -----------------------------
        features = adapt_request_to_model_features(sanitized_payload)

        # -----------------------------
        # Convert to model input
        # (IMPORTANT: maintain consistent order)
        # -----------------------------
        feature_vector = [list(features.values())]

        # -----------------------------
        # Prediction
        # -----------------------------
        probability = float(model.predict_proba(feature_vector)[0][1])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # -----------------------------
    # Explanation
    # -----------------------------
    explanation = build_explanation(features, probability)

    return {
        "prediction": probability,
        "explanation": explanation,
    }