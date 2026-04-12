from __future__ import annotations

from dataclasses import dataclass

from .feature_adapter import AdaptedFeatures
from .normalization import NormalizedPredictionInput, parse_departure_hour
from .schemas import RiskLevel


# -----------------------------
# Data Classes
# -----------------------------

@dataclass(frozen=True)
class HeuristicScoreBreakdown:
    base_score: int
    route_contribution: int
    hub_bonus: int
    time_of_day_contribution: int
    total_delay_contribution: int
    precipitation_bonus: int
    wind_bonus: int
    weather_interaction_bonus: int
    unclamped_total: int
    clamped_total: int

    def as_dict(self) -> dict[str, int]:
        return {
            "baseScore": self.base_score,
            "routeContribution": self.route_contribution,
            "hubBonus": self.hub_bonus,
            "timeOfDayContribution": self.time_of_day_contribution,
            "totalDelayContribution": self.total_delay_contribution,
            "precipitationBonus": self.precipitation_bonus,
            "windBonus": self.wind_bonus,
            "weatherInteractionBonus": self.weather_interaction_bonus,
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
    raw_model_disagreement: int
    max_model_shift: int
    applied_adjustment: int
    blend_method: str
    reasoning: str


# -----------------------------
# Constants
# -----------------------------

MIN_PROBABILITY = 5
MAX_PROBABILITY = 95
MAX_MODEL_SHIFT = 5
CALM_CONDITIONS_SOFT_CEILING = 30

HUB_AIRPORTS = {"ATL", "ORD", "DFW", "DEN", "LAX", "JFK"}


# -----------------------------
# Utility
# -----------------------------

def clamp_probability(value: int) -> int:
    return max(MIN_PROBABILITY, min(value, MAX_PROBABILITY))


def resolve_risk_level(probability: int) -> RiskLevel:
    if probability < 30:
        return "low"
    if probability < 70:
        return "moderate"
    return "high"


def delay_contribution_points(total_delay_norm: float) -> int:
    if total_delay_norm <= 0.25:
        return round(total_delay_norm * 16)
    if total_delay_norm <= 0.5:
        return 4 + round((total_delay_norm - 0.25) * 28)
    if total_delay_norm <= 0.8:
        return 11 + round((total_delay_norm - 0.5) * 36)
    return min(28, 22 + round((total_delay_norm - 0.8) * 24))


def time_risk(hour: int) -> float:
    if 6 <= hour <= 9:
        return 0.6
    if 16 <= hour <= 20:
        return 1.0
    if 21 <= hour <= 23:
        return 0.25
    return 0.05


def is_peak_hour(hour: int) -> bool:
    return 6 <= hour <= 9 or 16 <= hour <= 20


# -----------------------------
# Heuristic (WEATHER-ENHANCED)
# -----------------------------

def heuristic_probability(
    payload: NormalizedPredictionInput,
    features: AdaptedFeatures,
) -> HeuristicEstimate:

    base_score = 10

    route_contribution = int(round(features.route_congestion_score * 10))

    hub_bonus = 0
    if payload.origin_airport in HUB_AIRPORTS:
        hub_bonus += 3
    if payload.destination_airport in HUB_AIRPORTS:
        hub_bonus += 3

    hour = parse_departure_hour(payload.departure_time)
    time_of_day_contribution = int(round(time_risk(hour) * 10))

    total_delay_contribution = delay_contribution_points(features.total_delay_norm)

    # -----------------------------
    # WEATHER (CATEGORICAL)
    # -----------------------------
    precipitation_bonus = 0
    if payload.precipitation == "thunderstorms":
        precipitation_bonus += 15
    elif payload.precipitation == "snow":
        precipitation_bonus += 12
    elif payload.precipitation in {"rain", "sleet"}:
        precipitation_bonus += 6

    wind_bonus = 0
    if payload.wind == "strong":
        wind_bonus += 10
    elif payload.wind == "moderate":
        wind_bonus += 4

    # -----------------------------
    # WEATHER (NUMERIC ENHANCEMENT)
    # -----------------------------
    # If your feature adapter includes these, this activates automatically
    if hasattr(features, "wind_mph"):
        if features.wind_mph > 25:
            wind_bonus += 6
        elif features.wind_mph > 15:
            wind_bonus += 3

    if hasattr(features, "precip_mm"):
        if features.precip_mm > 5:
            precipitation_bonus += 6
        elif features.precip_mm > 2:
            precipitation_bonus += 3

    # -----------------------------
    # WEATHER INTERACTION
    # -----------------------------
    weather_interaction_bonus = 0

    if (
        payload.precipitation in {"snow", "thunderstorms"}
        and payload.wind == "strong"
    ):
        weather_interaction_bonus += 10

    if hasattr(features, "wind_mph") and features.wind_mph > 20:
        weather_interaction_bonus += 4

    if is_peak_hour(hour) and payload.precipitation != "none":
        weather_interaction_bonus += 4

    # -----------------------------
    # TOTAL SCORE
    # -----------------------------
    unclamped_total = (
        base_score
        + route_contribution
        + hub_bonus
        + time_of_day_contribution
        + total_delay_contribution
        + precipitation_bonus
        + wind_bonus
        + weather_interaction_bonus
    )

    probability = clamp_probability(unclamped_total)

    # Soft ceiling for calm conditions
    if payload.precipitation == "none" and payload.wind == "calm":
        probability = min(probability, CALM_CONDITIONS_SOFT_CEILING)

    return HeuristicEstimate(
        probability=probability,
        reason="Weather-aware heuristic with numeric and categorical signals integrated.",
        breakdown=HeuristicScoreBreakdown(
            base_score=base_score,
            route_contribution=route_contribution,
            hub_bonus=hub_bonus,
            time_of_day_contribution=time_of_day_contribution,
            total_delay_contribution=total_delay_contribution,
            precipitation_bonus=precipitation_bonus,
            wind_bonus=wind_bonus,
            weather_interaction_bonus=weather_interaction_bonus,
            unclamped_total=unclamped_total,
            clamped_total=probability,
        ),
    )


# -----------------------------
# Blending (slightly more flexible)
# -----------------------------

def blend_model_with_heuristic(
    heuristic_probability: int,
    model_probability: int,
) -> HybridBlendResult:

    raw_model_disagreement = model_probability - heuristic_probability
    abs_diff = abs(raw_model_disagreement)

    if abs_diff <= 8:
        max_model_shift = MAX_MODEL_SHIFT
    elif abs_diff <= 15:
        max_model_shift = 5
    else:
        max_model_shift = 2

    applied_adjustment = max(
        -max_model_shift,
        min(raw_model_disagreement, max_model_shift),
    )

    probability = clamp_probability(heuristic_probability + applied_adjustment)

    return HybridBlendResult(
        probability=probability,
        model_probability=model_probability,
        heuristic_probability=heuristic_probability,
        raw_model_disagreement=raw_model_disagreement,
        max_model_shift=max_model_shift,
        applied_adjustment=applied_adjustment,
        blend_method="heuristic_led_bounded_adjustment",
        reasoning="Hybrid blend allowing controlled model influence while remaining heuristic-led.",
    )