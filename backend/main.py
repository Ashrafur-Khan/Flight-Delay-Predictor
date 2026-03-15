from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

RiskLevel = Literal["low", "moderate", "high"]
PrecipitationType = Literal["none", "rain", "snow", "thunderstorms", "sleet"]
WindCondition = Literal["calm", "moderate", "strong"]


class PredictionRequest(BaseModel):
    departureDate: str = Field(..., examples=["2026-03-15"])
    departureTime: str = Field(..., examples=["08:30"])
    originAirport: str = Field(..., min_length=3, examples=["JFK"])
    destinationAirport: str = Field(..., min_length=3, examples=["LAX"])
    duration: str = Field(default="")
    temperature: str = Field(default="")
    precipitation: PrecipitationType = "none"
    wind: WindCondition = "calm"


class PredictionResponse(BaseModel):
    probability: int = Field(..., ge=0, le=100)
    riskLevel: RiskLevel
    explanation: str


@dataclass
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


app = FastAPI(title="Flight Delay Predictor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_model():
    if not MODEL_PATH.exists():
        return None

    return joblib.load(MODEL_PATH)


model = load_model()


def parse_departure_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_departure_hour(value: str) -> int:
    try:
        hour_text = value.split(":", maxsplit=1)[0]
        hour = int(hour_text)
    except (TypeError, ValueError):
        return 12

    return max(0, min(hour, 23))


def parse_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def compute_route_congestion(origin: str, destination: str) -> float:
    high_traffic_airports = {"ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "MCO", "LAS"}
    medium_traffic_airports = {"BOS", "CLT", "EWR", "IAH", "MIA", "PHX", "MSP", "DTW", "PHL", "BWI"}

    score = 0.25
    for airport in (origin.upper(), destination.upper()):
        if airport in high_traffic_airports:
            score += 0.25
        elif airport in medium_traffic_airports:
            score += 0.15
        else:
            score += 0.05

    return min(score, 0.9)


def compute_peak_departure_score(hour: int) -> float:
    if 6 <= hour <= 9:
        return 0.35
    if 16 <= hour <= 20:
        return 0.4
    if 21 <= hour <= 23:
        return 0.18
    return 0.08


def adapt_request_to_model_features(payload: PredictionRequest) -> AdaptedFeatures:
    departure = parse_departure_date(payload.departureDate)
    departure_hour = parse_departure_hour(payload.departureTime)
    duration_minutes = max(parse_int(payload.duration), 0)
    temperature_f = parse_int(payload.temperature, default=65)

    route_congestion_score = compute_route_congestion(payload.originAirport, payload.destinationAirport)
    peak_departure_score = compute_peak_departure_score(departure_hour)

    weather_delay_norm = 0.02
    if payload.precipitation == "rain":
        weather_delay_norm += 0.08
    elif payload.precipitation == "snow":
        weather_delay_norm += 0.2
    elif payload.precipitation == "thunderstorms":
        weather_delay_norm += 0.18
    elif payload.precipitation == "sleet":
        weather_delay_norm += 0.14

    if temperature_f <= 20:
        weather_delay_norm += 0.06
    elif temperature_f >= 95:
        weather_delay_norm += 0.04

    nas_delay_norm = 0.05 + route_congestion_score * 0.22 + peak_departure_score * 0.12
    security_delay_norm = 0.005 + route_congestion_score * 0.015
    late_aircraft_delay_norm = 0.04 + peak_departure_score * 0.15

    if payload.wind == "moderate":
        weather_delay_norm += 0.04
        nas_delay_norm += 0.02
    elif payload.wind == "strong":
        weather_delay_norm += 0.09
        nas_delay_norm += 0.05
        late_aircraft_delay_norm += 0.04

    if duration_minutes >= 300:
        late_aircraft_delay_norm += 0.04
    elif duration_minutes >= 180:
        late_aircraft_delay_norm += 0.02

    arr_flights = int(round(70 + route_congestion_score * 70 + peak_departure_score * 45))
    total_delay_norm = (
        weather_delay_norm
        + nas_delay_norm
        + security_delay_norm
        + late_aircraft_delay_norm
    )

    return AdaptedFeatures(
        month=departure.month,
        arr_flights=arr_flights,
        weather_delay_norm=round(weather_delay_norm, 4),
        nas_delay_norm=round(nas_delay_norm, 4),
        security_delay_norm=round(security_delay_norm, 4),
        late_aircraft_delay_norm=round(late_aircraft_delay_norm, 4),
        total_delay_norm=round(total_delay_norm, 4),
        route_congestion_score=round(route_congestion_score, 4),
        peak_departure_score=round(peak_departure_score, 4),
    )


def heuristic_probability(payload: PredictionRequest, features: AdaptedFeatures) -> int:
    probability = 14
    probability += int(features.route_congestion_score * 30)
    probability += int(features.peak_departure_score * 25)
    probability += int(features.total_delay_norm * 90)

    if payload.precipitation in {"snow", "thunderstorms"}:
        probability += 12
    elif payload.precipitation in {"rain", "sleet"}:
        probability += 6

    if payload.wind == "strong":
        probability += 10
    elif payload.wind == "moderate":
        probability += 5

    return max(5, min(probability, 95))


def model_probability(features: AdaptedFeatures) -> int | None:
    if model is None or not hasattr(model, "predict_proba"):
        return None

    feature_vector = np.array(
        [[
            features.month,
            features.arr_flights,
            features.weather_delay_norm,
            features.nas_delay_norm,
            features.security_delay_norm,
            features.late_aircraft_delay_norm,
            features.total_delay_norm,
        ]]
    )
    probability = float(model.predict_proba(feature_vector)[0][1])
    return int(round(probability * 100))


def resolve_risk_level(probability: int) -> RiskLevel:
    if probability < 30:
        return "low"
    if probability < 70:
        return "moderate"
    return "high"


def build_explanation(
    payload: PredictionRequest,
    probability: int,
    model_score: int | None,
    features: AdaptedFeatures,
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
    model_text = (
        f" A model-assisted score contributed {model_score}% of estimated delay risk."
        if model_score is not None
        else " The current prediction uses the backend adaptation layer because no trained model artifact is available."
    )

    return (
        f"This flight is estimated at {probability}% delay risk due to {factor_text}. "
        f"The backend maps traveler-facing inputs into BTS-style delay signals before scoring.{model_text}"
    )


@app.get("/")
def home():
    return {
        "message": "Flight Delay Predictor API",
        "modelLoaded": model is not None,
        "modelPath": str(MODEL_PATH),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: PredictionRequest) -> PredictionResponse:
    features = adapt_request_to_model_features(payload)
    heuristic_score = heuristic_probability(payload, features)
    learned_score = model_probability(features)

    if learned_score is None:
        probability = heuristic_score
    else:
        probability = int(round((learned_score * 0.65) + (heuristic_score * 0.35)))

    probability = max(5, min(probability, 95))
    risk_level = resolve_risk_level(probability)
    explanation = build_explanation(payload, probability, learned_score, features)

    return PredictionResponse(
        probability=probability,
        riskLevel=risk_level,
        explanation=explanation,
    )
