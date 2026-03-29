from __future__ import annotations

from typing import Any, Dict
from datetime import datetime


def extract_month(payload: Any) -> int:
    """
    Safely extract month from payload.
    Falls back to 1 if not available.
    """

    # Case 1: already provided
    if hasattr(payload, "month") and payload.month is not None:
        return payload.month

    # Case 2: derive from date field
    if hasattr(payload, "date") and payload.date:
        try:
            return datetime.fromisoformat(payload.date).month
        except Exception:
            pass

    # Default fallback
    return 1


def extract_year(payload: Any) -> int:
    if hasattr(payload, "year") and payload.year is not None:
        return payload.year

    if hasattr(payload, "date") and payload.date:
        try:
            return datetime.fromisoformat(payload.date).year
        except Exception:
            pass

    return 2000


def adapt_request_to_model_features(payload: Any) -> Dict[str, Any]:
    """
    Converts API input into model-ready feature dictionary.
    """

    return {
        # Core fields
        "distance": getattr(payload, "distance", 0),
        "airline": getattr(payload, "airline", "UNKNOWN"),
        "origin": getattr(payload, "origin", "UNKNOWN"),
        "destination": getattr(payload, "destination", "UNKNOWN"),

        # Derived features
        "month": extract_month(payload),
        "year": extract_year(payload),

        # Optional numeric fields
        "temperature": getattr(payload, "temperature", 0.0),
        "wind_speed": getattr(payload, "wind_speed", 0.0),

        # Example engineered features
        "is_holiday": int(getattr(payload, "is_holiday", False)),
    }