from __future__ import annotations

import re
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
HIGH_TRAFFIC_AIRPORTS = {"ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "MCO", "LAS"}
MEDIUM_TRAFFIC_AIRPORTS = {"BOS", "CLT", "EWR", "IAH", "MIA", "PHX", "MSP", "DTW", "PHL", "BWI"}

RiskLevel = Literal["low", "moderate", "high"]
PredictionPath = Literal["heuristic_only", "model_plus_heuristic"]
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
    includeDebug: bool = False


class PredictionDebugRawInput(BaseModel):
    departureDate: str
    departureTime: str
    originAirport: str
    destinationAirport: str
    durationMinutes: int
    temperatureF: int
    precipitation: PrecipitationType
    wind: WindCondition


class PredictionDebugDerivedFeatures(BaseModel):
    month: int
    arr_flights: int
    weather_delay_norm: float
    nas_delay_norm: float
    security_delay_norm: float
    late_aircraft_delay_norm: float
    total_delay_norm: float
    route_congestion_score: float
    peak_departure_score: float


class PredictionDebugScoreBreakdown(BaseModel):
    baseScore: int
    routeContribution: int
    peakContribution: int
    totalDelayContribution: int
    precipitationBonus: int
    windBonus: int
    unclampedTotal: int
    clampedTotal: int


class PredictionDebugInfo(BaseModel):
    pathUsed: PredictionPath
    modelLoaded: bool
    rawInput: PredictionDebugRawInput
    derivedFeatures: PredictionDebugDerivedFeatures
    scoreBreakdown: PredictionDebugScoreBreakdown
    modelScore: int | None
    heuristicScore: int
    finalProbability: int
    notes: list[str]


class PredictionResponse(BaseModel):
    probability: int = Field(..., ge=0, le=100)
    riskLevel: RiskLevel
    explanation: str
    debug: PredictionDebugInfo | None = None


@dataclass
class NormalizedPredictionInput:
    departure_date: str
    departure_time: str
    origin_airport: str
    destination_airport: str
    duration_minutes: int
    temperature_f: int
    precipitation: PrecipitationType
    wind: WindCondition


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


@dataclass
class HeuristicScoreBreakdown:
    base_score: int
    route_contribution: int
    peak_contribution: int
    total_delay_contribution: int
    precipitation_bonus: int
    wind_bonus: int
    unclamped_total: int
    clamped_total: int


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


def normalize_airport_code(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""

    code_prefix_match = re.match(r"^([A-Za-z]{3})(?:\b|\s*-|$)", trimmed)
    if code_prefix_match is not None:
        return code_prefix_match.group(1).upper()

    return trimmed.upper()


def airport_traffic_bucket(airport: str) -> Literal["high", "medium", "other"]:
    if airport in HIGH_TRAFFIC_AIRPORTS:
        return "high"
    if airport in MEDIUM_TRAFFIC_AIRPORTS:
        return "medium"
    return "other"


def normalize_request(payload: PredictionRequest) -> tuple[NormalizedPredictionInput, list[str]]:
    notes: list[str] = []

    origin_airport = normalize_airport_code(payload.originAirport)
    destination_airport = normalize_airport_code(payload.destinationAirport)
    duration_minutes = max(parse_int(payload.duration), 0)
    temperature_f = parse_int(payload.temperature, default=65)

    if payload.originAirport.strip() and origin_airport != payload.originAirport.strip():
        notes.append(f"Origin airport normalized from '{payload.originAirport}' to '{origin_airport}'.")
    if payload.destinationAirport.strip() and destination_airport != payload.destinationAirport.strip():
        notes.append(f"Destination airport normalized from '{payload.destinationAirport}' to '{destination_airport}'.")

    if airport_traffic_bucket(origin_airport) == "other":
        notes.append(f"Origin airport '{origin_airport}' did not match a known traffic bucket; default route weighting applied.")
    if airport_traffic_bucket(destination_airport) == "other":
        notes.append(f"Destination airport '{destination_airport}' did not match a known traffic bucket; default route weighting applied.")

    if payload.temperature.strip():
        if 20 < temperature_f < 95:
            notes.append("Temperature did not cross a scoring threshold.")
    else:
        notes.append("Temperature not provided; defaulted to 65F.")

    if payload.duration.strip():
        if duration_minutes < 180:
            notes.append("Duration did not cross a long-haul scoring threshold.")
    else:
        notes.append("Duration not provided; defaulted to 0 minutes.")

    if payload.precipitation == "none":
        notes.append("No precipitation penalty applied.")
    if payload.wind == "calm":
        notes.append("No wind penalty applied.")

    return (
        NormalizedPredictionInput(
            departure_date=payload.departureDate,
            departure_time=payload.departureTime,
            origin_airport=origin_airport,
            destination_airport=destination_airport,
            duration_minutes=duration_minutes,
            temperature_f=temperature_f,
            precipitation=payload.precipitation,
            wind=payload.wind,
        ),
        notes,
    )


def compute_route_congestion(origin: str, destination: str) -> float:
    score = 0.25
    for airport in (origin, destination):
        bucket = airport_traffic_bucket(airport)
        if bucket == "high":
            score += 0.25
        elif bucket == "medium":
            score += 0.15
        elif airport:
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


def adapt_request_to_model_features(payload: NormalizedPredictionInput) -> AdaptedFeatures:
    departure = parse_departure_date(payload.departure_date)
    departure_hour = parse_departure_hour(payload.departure_time)

    route_congestion_score = compute_route_congestion(payload.origin_airport, payload.destination_airport)
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

    if payload.temperature_f <= 20:
        weather_delay_norm += 0.06
    elif payload.temperature_f >= 95:
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

    if payload.duration_minutes >= 300:
        late_aircraft_delay_norm += 0.04
    elif payload.duration_minutes >= 180:
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


def heuristic_probability(
    payload: NormalizedPredictionInput,
    features: AdaptedFeatures,
) -> HeuristicScoreBreakdown:
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
    clamped_total = max(5, min(unclamped_total, 95))

    return HeuristicScoreBreakdown(
        base_score=base_score,
        route_contribution=route_contribution,
        peak_contribution=peak_contribution,
        total_delay_contribution=total_delay_contribution,
        precipitation_bonus=precipitation_bonus,
        wind_bonus=wind_bonus,
        unclamped_total=unclamped_total,
        clamped_total=clamped_total,
    )


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
    payload: NormalizedPredictionInput,
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


def build_debug_info(
    payload: NormalizedPredictionInput,
    features: AdaptedFeatures,
    heuristic_score: HeuristicScoreBreakdown,
    learned_score: int | None,
    final_probability: int,
    notes: list[str],
) -> PredictionDebugInfo:
    path_used: PredictionPath = "heuristic_only" if learned_score is None else "model_plus_heuristic"
    debug_notes = list(notes)

    if learned_score is None:
        debug_notes.append("No trained model artifact loaded; using heuristic scoring only.")
    if heuristic_score.unclamped_total != heuristic_score.clamped_total:
        debug_notes.append("Heuristic score was clamped to stay within the 5-95 range.")

    return PredictionDebugInfo(
        pathUsed=path_used,
        modelLoaded=model is not None,
        rawInput=PredictionDebugRawInput(
            departureDate=payload.departure_date,
            departureTime=payload.departure_time,
            originAirport=payload.origin_airport,
            destinationAirport=payload.destination_airport,
            durationMinutes=payload.duration_minutes,
            temperatureF=payload.temperature_f,
            precipitation=payload.precipitation,
            wind=payload.wind,
        ),
        derivedFeatures=PredictionDebugDerivedFeatures(
            month=features.month,
            arr_flights=features.arr_flights,
            weather_delay_norm=features.weather_delay_norm,
            nas_delay_norm=features.nas_delay_norm,
            security_delay_norm=features.security_delay_norm,
            late_aircraft_delay_norm=features.late_aircraft_delay_norm,
            total_delay_norm=features.total_delay_norm,
            route_congestion_score=features.route_congestion_score,
            peak_departure_score=features.peak_departure_score,
        ),
        scoreBreakdown=PredictionDebugScoreBreakdown(
            baseScore=heuristic_score.base_score,
            routeContribution=heuristic_score.route_contribution,
            peakContribution=heuristic_score.peak_contribution,
            totalDelayContribution=heuristic_score.total_delay_contribution,
            precipitationBonus=heuristic_score.precipitation_bonus,
            windBonus=heuristic_score.wind_bonus,
            unclampedTotal=heuristic_score.unclamped_total,
            clampedTotal=heuristic_score.clamped_total,
        ),
        modelScore=learned_score,
        heuristicScore=heuristic_score.clamped_total,
        finalProbability=final_probability,
        notes=debug_notes,
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
    normalized_payload, notes = normalize_request(payload)
    features = adapt_request_to_model_features(normalized_payload)
    heuristic_score = heuristic_probability(normalized_payload, features)
    learned_score = model_probability(features)

    if learned_score is None:
        probability = heuristic_score.clamped_total
    else:
        probability = int(round((learned_score * 0.65) + (heuristic_score.clamped_total * 0.35)))

    probability = max(5, min(probability, 95))
    risk_level = resolve_risk_level(probability)
    explanation = build_explanation(normalized_payload, probability, learned_score, features)
    debug = None

    if payload.includeDebug:
        debug = build_debug_info(
            normalized_payload,
            features,
            heuristic_score,
            learned_score,
            probability,
            notes,
        )

    return PredictionResponse(
        probability=probability,
        riskLevel=risk_level,
        explanation=explanation,
        debug=debug,
    )
