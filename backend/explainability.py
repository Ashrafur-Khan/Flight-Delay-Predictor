from __future__ import annotations

import math
from dataclasses import dataclass

from .feature_adapter import AdaptedFeatures
from .normalization import NormalizedPredictionInput
from .schemas import RiskLevel


# -----------------------------
# Data Classes
# -----------------------------

@dataclass(frozen=True)
class HeuristicScoreBreakdown:
    base_score: int
    route_contribution: int
    peak_contribution: int
    total_delay_contribution: int
    precipitation_bonus: int
    wind_bonus: int
    unclamped_total: int
    clamped_total: int

    def as_dict(self) -> dict[str, int]:
        return {
            "baseScore": self.base_score,
            "routeContribution": self.route_contribution,
            "peakContribution": self.peak_contribution,
            "totalDelayContribution": self.total_delay_contribution,
            "precipitationBonus": self.precipitation_bonus,
            "windBonus": self.wind_bonus,
            "unclampedTotal": self.unclamped_total,
            "clampedTotal": self.clamped_total,
        }


@dataclass(frozen=True)
class HeuristicEstimate:
    probability: int
    reason: str
    breakdown: HeuristicScoreBreakdown


@dataclass(frozen=True)
class HybridBlendResult:
    probability: int
    model_probability: int
    heuristic_probability: int
    model_delta: int
    scaled_adjustment: int
    adjustment_cap: int
    applied_adjustment: int
    reasoning: str


# -----------------------------
# Constants
# -----------------------------

MIN_PROBABILITY = 5
MAX_PROBABILITY = 95

HUB_AIRPORTS = {"ATL", "ORD", "DFW", "DEN", "LAX", "JFK"}


# -----------------------------
# Utility Functions
# -----------------------------

def clamp_probability(value: int) -> int:
    return max(MIN_PROBABILITY, min(value, MAX_PROBABILITY))


def resolve_risk_level(probability: int) -> RiskLevel:
    if probability < 30:
        return "low"
    if probability < 70:
        return "moderate"
    return "high"


def nonlinear_scale(x: float, max_val: int = 85) -> int:
    return int(max_val * (1 / (1 + math.exp(-5 * (x - 0.5)))))


def time_risk(hour: int) -> float:
    if 6 <= hour <= 9:
        return 0.8
    elif 16 <= hour <= 20:
        return 1.0
    elif hour >= 22 or hour <= 5:
        return 0.3
    return 0.5


# -----------------------------
# Heuristic Estimator (UPGRADED)
# -----------------------------

def heuristic_probability(
    payload: NormalizedPredictionInput,
    features: AdaptedFeatures,
) -> HeuristicEstimate:

    base_score = 12

    # Route congestion
    route_contribution = int(features.route_congestion_score * 28)

    hub_bonus = 0
    if payload.origin_airport in HUB_AIRPORTS:
        hub_bonus += 5
    if payload.destination_airport in HUB_AIRPORTS:
        hub_bonus += 5

    # Time of day
    hour = int(payload.departure_time.split(":")[0])
    peak_contribution = int(time_risk(hour) * 25)

    # Nonlinear delay
    total_delay_contribution = nonlinear_scale(features.total_delay_norm)

    # Weather effects
    weather_score = 0

    if payload.precipitation in {"snow", "thunderstorms"}:
        weather_score += 10
    elif payload.precipitation in {"rain", "sleet"}:
        weather_score += 5

    if payload.wind == "strong":
        weather_score += 8
    elif payload.wind == "moderate":
        weather_score += 4

    # Interaction effect
    if payload.precipitation in {"snow", "thunderstorms"} and payload.wind == "strong":
        weather_score += 10

    unclamped_total = (
        base_score
        + route_contribution
        + hub_bonus
        + peak_contribution
        + total_delay_contribution
        + weather_score
    )

    probability = clamp_probability(unclamped_total)

    return HeuristicEstimate(
        probability=probability,
        reason="Enhanced heuristic estimator using nonlinear delay scaling, weather interactions, and time-of-day modeling.",
        breakdown=HeuristicScoreBreakdown(
            base_score=base_score,
            route_contribution=route_contribution + hub_bonus,
            peak_contribution=peak_contribution,
            total_delay_contribution=total_delay_contribution,
            precipitation_bonus=weather_score,
            wind_bonus=0,
            unclamped_total=unclamped_total,
            clamped_total=probability,
        ),
    )


# -----------------------------
# Hybrid Blending (UPGRADED)
# -----------------------------

def blend_model_with_heuristic(
    heuristic_probability: int,
    model_probability: int,
) -> HybridBlendResult:

    # Confidence estimation
    model_conf = abs(model_probability - 50) / 50
    heuristic_conf = abs(heuristic_probability - 50) / 50

    # Weighted blending
    model_weight = 0.6 * model_conf + 0.2
    heuristic_weight = 0.6 * heuristic_conf + 0.2

    total = model_weight + heuristic_weight
    model_weight /= total
    heuristic_weight /= total

    blended = int(round(
        model_weight * model_probability +
        heuristic_weight * heuristic_probability
    ))

    probability = clamp_probability(blended)

    model_delta = model_probability - heuristic_probability

    reasoning = (
        "Final score blends heuristic domain knowledge with the trained model using confidence-weighted averaging."
    )

    return HybridBlendResult(
        probability=probability,
        model_probability=model_probability,
        heuristic_probability=heuristic_probability,
        model_delta=model_delta,
        scaled_adjustment=blended - heuristic_probability,
        adjustment_cap=0,  # no hard cap anymore
        applied_adjustment=blended - heuristic_probability,
        reasoning=reasoning,
    )


# -----------------------------
# Explanation Builder
# -----------------------------

def build_explanation(
    payload: NormalizedPredictionInput,
    probability: int,
    features: AdaptedFeatures,
    model_version: str | None,
    path_used: str,
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

    factor_text = (
        ", ".join(factors[:-1]) + f" and {factors[-1]}"
        if len(factors) > 1
        else factors[0]
    )

    if path_used == "heuristic_fallback":
        path_text = "This result was generated using an advanced heuristic estimator."
    elif path_used == "hybrid_blend":
        path_text = (
            "This result combines heuristic modeling with a trained BTS-based model using confidence-weighted blending."
        )
    else:
        path_text = f"This result came from the trained BTS-backed model ({model_version})."

    return (
        f"This flight is estimated at {probability}% delay risk due to {factor_text}. "
        f"The system maps traveler inputs into operational aviation signals before scoring. "
        f"{path_text}"
    )
