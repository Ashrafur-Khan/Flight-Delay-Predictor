from __future__ import annotations

from dataclasses import dataclass

from .feature_adapter import AdaptedFeatures
from .normalization import NormalizedPredictionInput
from .schemas import RiskLevel


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


MIN_PROBABILITY = 5
MAX_PROBABILITY = 95
MODEL_ADJUSTMENT_SCALE = 1 / 3
MODEL_ADJUSTMENT_CAP = 12


def clamp_probability(value: int) -> int:
    return max(MIN_PROBABILITY, min(value, MAX_PROBABILITY))


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
    probability = clamp_probability(unclamped_total)
    return HeuristicEstimate(
        probability=probability,
        reason="No compatible trained model artifact is available; using the development fallback estimator.",
        breakdown=HeuristicScoreBreakdown(
            base_score=base_score,
            route_contribution=route_contribution,
            peak_contribution=peak_contribution,
            total_delay_contribution=total_delay_contribution,
            precipitation_bonus=precipitation_bonus,
            wind_bonus=wind_bonus,
            unclamped_total=unclamped_total,
            clamped_total=probability,
        ),
    )


def blend_model_with_heuristic(
    heuristic_probability: int,
    model_probability: int,
) -> HybridBlendResult:
    model_delta = model_probability - heuristic_probability
    scaled_adjustment = int(round(model_delta * MODEL_ADJUSTMENT_SCALE))
    applied_adjustment = max(-MODEL_ADJUSTMENT_CAP, min(scaled_adjustment, MODEL_ADJUSTMENT_CAP))
    probability = clamp_probability(heuristic_probability + applied_adjustment)

    reasoning = (
        "Final score is heuristic-led with a bounded adjustment from the trained model."
    )
    if applied_adjustment != scaled_adjustment:
        reasoning = (
            "Final score is heuristic-led; the trained model adjustment was capped to keep the MVP result stable."
        )
    elif applied_adjustment == 0:
        reasoning = (
            "Final score is heuristic-led; the trained model did not move the estimate materially."
        )

    return HybridBlendResult(
        probability=probability,
        model_probability=model_probability,
        heuristic_probability=heuristic_probability,
        model_delta=model_delta,
        scaled_adjustment=scaled_adjustment,
        adjustment_cap=MODEL_ADJUSTMENT_CAP,
        applied_adjustment=applied_adjustment,
        reasoning=reasoning,
    )


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

    factor_text = ", ".join(factors[:-1]) + f" and {factors[-1]}" if len(factors) > 1 else factors[0]
    if path_used == "heuristic_fallback":
        path_text = "This result came from the development fallback estimator."
    elif path_used == "hybrid_blend":
        path_text = (
            "This result uses a heuristic-led hybrid score with a bounded adjustment from "
            f"the trained BTS-backed model artifact ({model_version})."
        )
    else:
        path_text = f"This result came from the trained BTS-backed model artifact ({model_version})."

    return (
        f"This flight is estimated at {probability}% delay risk due to {factor_text}. "
        f"The backend maps traveler-facing inputs into BTS-style operational signals before scoring. "
        f"{path_text}"
    )
