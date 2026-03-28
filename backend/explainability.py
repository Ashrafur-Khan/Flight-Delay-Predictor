from __future__ import annotations

from dataclasses import dataclass

from .feature_adapter import AdaptedFeatures
from .normalization import NormalizedPredictionInput
from .schemas import RiskLevel


@dataclass(frozen=True)
class HeuristicEstimate:
    probability: int
    reason: str


def resolve_risk_level(probability: int) -> RiskLevel:
    if probability < 30:
        return "low"
    if probability < 70:
        return "moderate"
    return "high"


def heuristic_probability(
    payload: NormalizedPredictionInput,
    features: AdaptedFeatures,
) -> HeuristicEstimate:
    base_score = 14
    route_contribution = int(features.route_congestion_score * 30)
    peak_contribution = int(features.peak_departure_score * 25)
    total_delay_contribution = int(features.total_delay_norm * 90)

    precipitation_bonus = 0
    if payload.precipitation in {"snow", "thunderstorms"}:
        precipitation_bonus = 12
    elif payload.precipitation in {"rain", "sleet"}:
        precipitation_bonus = 6

    wind_bonus = 0
    if payload.wind == "strong":
        wind_bonus = 10
    elif payload.wind == "moderate":
        wind_bonus = 5

    unclamped_total = (
        base_score
        + route_contribution
        + peak_contribution
        + total_delay_contribution
        + precipitation_bonus
        + wind_bonus
    )
    probability = max(5, min(unclamped_total, 95))
    return HeuristicEstimate(
        probability=probability,
        reason="No compatible trained model artifact is available; using the development fallback estimator.",
    )


def build_explanation(
    payload: NormalizedPredictionInput,
    probability: int,
    features: AdaptedFeatures,
    model_version: str | None,
    used_fallback: bool,
) -> str:
    factors: list[str] = []

    if payload.precipitation != "none":
        factors.append(payload.precipitation.replace("_", " "))
    if payload.wind != "calm":
        factors.append(f"{payload.wind} winds")
    if features.peak_departure_score >= 0.35:
        factors.append("peak departure traffic")
    if features.route_congestion_score >= 0.55:
        factors.append("a busy route")

    if not factors:
        factors.append("stable operating conditions")

    factor_text = ", ".join(factors[:-1]) + f" and {factors[-1]}" if len(factors) > 1 else factors[0]
    path_text = (
        "This result came from the development fallback estimator."
        if used_fallback
        else f"This result came from the trained BTS-backed model artifact ({model_version})."
    )

    return (
        f"This flight is estimated at {probability}% delay risk due to {factor_text}. "
        f"The backend maps traveler-facing inputs into BTS-style operational signals before scoring. "
        f"{path_text}"
    )
