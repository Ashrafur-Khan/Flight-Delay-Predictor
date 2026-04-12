from __future__ import annotations

from dataclasses import dataclass, fields

from .normalization import (
    NormalizedPredictionInput,
    airport_traffic_bucket,
    parse_departure_date,
    parse_departure_hour,
)


@dataclass(frozen=True)
class AdaptedFeatures:
    month: int
    arr_flights: int
    weather_delay_norm: float
    nas_delay_norm: float
    security_delay_norm: float
    late_aircraft_delay_norm: float
    total_delay_norm: float
    route_congestion_score: float
    peak_departure_score: float

    def as_model_vector(self, feature_names: list[str]) -> list[float]:
        values = self.as_dict()
        return [float(values[name]) for name in feature_names]

    def as_dict(self) -> dict[str, float | int]:
        return {field.name: getattr(self, field.name) for field in fields(self)}


MODEL_FEATURE_NAMES = [
    "month",
    "arr_flights",
    "weather_delay_norm",
    "nas_delay_norm",
    "security_delay_norm",
    "late_aircraft_delay_norm",
    "total_delay_norm",
]


def compute_route_congestion(origin: str, destination: str) -> float:
    score = 0.15
    for airport in (origin, destination):
        bucket = airport_traffic_bucket(airport)
        if bucket == "high":
            score += 0.18
        elif bucket == "medium":
            score += 0.10
        elif airport:
            score += 0.03

    return min(score, 0.7)


def compute_peak_departure_score(hour: int) -> float:
    if 6 <= hour <= 9:
        return 0.22
    if 16 <= hour <= 20:
        return 0.28
    if 21 <= hour <= 23:
        return 0.10
    return 0.02


def adapt_request_to_model_features(payload: NormalizedPredictionInput) -> AdaptedFeatures:
    departure = parse_departure_date(payload.departure_date)
    departure_hour = parse_departure_hour(payload.departure_time)

    route_congestion_score = compute_route_congestion(payload.origin_airport, payload.destination_airport)
    peak_departure_score = compute_peak_departure_score(departure_hour)

    # -----------------------------
    # WEATHER BASE
    # -----------------------------
    weather_delay_norm = 0.02

    if payload.precipitation == "rain":
        weather_delay_norm += 0.10
    elif payload.precipitation == "snow":
        weather_delay_norm += 0.25
    elif payload.precipitation == "thunderstorms":
        weather_delay_norm += 0.30
    elif payload.precipitation == "sleet":
        weather_delay_norm += 0.18

    # Temperature impact
    if payload.temperature_f <= 20:
        weather_delay_norm += 0.08
    elif payload.temperature_f >= 95:
        weather_delay_norm += 0.05

    # -----------------------------
    # WIND (CATEGORICAL)
    # -----------------------------
    if payload.wind == "moderate":
        weather_delay_norm += 0.05
    elif payload.wind == "strong":
        weather_delay_norm += 0.12

    # -----------------------------
    # WIND (NUMERIC IF AVAILABLE)
    # -----------------------------
    if hasattr(payload, "wind_mph") and payload.wind_mph is not None:
        if payload.wind_mph > 25:
            weather_delay_norm += 0.15
        elif payload.wind_mph > 15:
            weather_delay_norm += 0.08
        elif payload.wind_mph > 10:
            weather_delay_norm += 0.04

    # -----------------------------
    # PRECIP (NUMERIC IF AVAILABLE)
    # -----------------------------
    if hasattr(payload, "precip_mm") and payload.precip_mm is not None:
        if payload.precip_mm > 5:
            weather_delay_norm += 0.18
        elif payload.precip_mm > 2:
            weather_delay_norm += 0.10
        elif payload.precip_mm > 0:
            weather_delay_norm += 0.05

    # -----------------------------
    # OTHER DELAYS
    # -----------------------------
    nas_delay_norm = 0.04 + route_congestion_score * 0.15 + peak_departure_score * 0.10
    security_delay_norm = 0.003 + route_congestion_score * 0.01
    late_aircraft_delay_norm = 0.03 + peak_departure_score * 0.12

    arr_flights = int(round(70 + route_congestion_score * 80 + peak_departure_score * 50))

    total_delay_norm = (
        weather_delay_norm
        + nas_delay_norm
        + security_delay_norm
        + late_aircraft_delay_norm
    )

    return AdaptedFeatures(
        month=departure.month,
        arr_flights=max(1, arr_flights),
        weather_delay_norm=round(min(max(weather_delay_norm, 0.0), 1.0), 4),
        nas_delay_norm=round(min(max(nas_delay_norm, 0.0), 1.0), 4),
        security_delay_norm=round(min(max(security_delay_norm, 0.0), 1.0), 4),
        late_aircraft_delay_norm=round(min(max(late_aircraft_delay_norm, 0.0), 1.0), 4),
        total_delay_norm=round(min(max(total_delay_norm, 0.0), 2.5), 4),
        route_congestion_score=round(min(max(route_congestion_score, 0.0), 1.0), 4),
        peak_departure_score=round(min(max(peak_departure_score, 0.0), 1.0), 4),
    )