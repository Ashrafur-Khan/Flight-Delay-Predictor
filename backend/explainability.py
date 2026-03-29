from __future__ import annotations

from typing import Dict, Any


def resolve_risk_level(probability: float) -> str:
    """
    Converts delay probability into a human-readable risk level.
    """
    if probability < 0.3:
        return "Low"
    elif probability < 0.6:
        return "Medium"
    else:
        return "High"


def heuristic_probability(features: Dict[str, Any]) -> float:
    """
    Simple heuristic fallback for probability if model is unavailable.
    This is NOT used for training — only for explanation fallback.
    """

    score = 0.0

    # Distance contributes to risk
    distance = features.get("distance", 0)
    if distance > 1000:
        score += 0.2
    elif distance > 500:
        score += 0.1

    # Time of year (month)
    month = features.get("month", 1)
    if month in [6, 7, 8, 12]:  # peak travel months
        score += 0.15

    # Weather-related
    if features.get("wind_speed", 0) > 20:
        score += 0.2

    if features.get("temperature", 0) < 20:
        score += 0.1

    # Holiday effect
    if features.get("is_holiday", 0):
        score += 0.2

    # Clamp between 0 and 1
    return min(max(score, 0.0), 1.0)


def build_explanation(features: Dict[str, Any], probability: float) -> Dict[str, Any]:
    """
    Builds a structured explanation for the prediction.
    """

    explanation_factors = []

    # Distance explanation
    if features.get("distance", 0) > 1000:
        explanation_factors.append("Long flight distance increases delay risk.")
    elif features.get("distance", 0) > 500:
        explanation_factors.append("Moderate flight distance slightly increases delay risk.")

    # Seasonal explanation
    if features.get("month", 1) in [6, 7, 8, 12]:
        explanation_factors.append("High travel season may increase congestion.")

    # Weather explanation
    if features.get("wind_speed", 0) > 20:
        explanation_factors.append("High wind speeds may cause delays.")

    if features.get("temperature", 0) < 20:
        explanation_factors.append("Low temperatures may impact operations.")

    # Holiday explanation
    if features.get("is_holiday", 0):
        explanation_factors.append("Holiday travel increases airport traffic.")

    # Default explanation if nothing triggered
    if not explanation_factors:
        explanation_factors.append("No strong risk factors detected.")

    return {
        "probability": round(probability, 4),
        "risk_level": resolve_risk_level(probability),
        "factors": explanation_factors,
    }