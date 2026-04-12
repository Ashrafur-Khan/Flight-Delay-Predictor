from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from .schemas import PredictionRequest, PrecipitationType, WindCondition


HIGH_TRAFFIC_AIRPORTS = {"ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "MCO", "LAS"}
MEDIUM_TRAFFIC_AIRPORTS = {"BOS", "CLT", "EWR", "IAH", "MIA", "PHX", "MSP", "DTW", "PHL", "BWI"}


@dataclass(frozen=True)
class NormalizedPredictionInput:
    departure_date: str
    departure_time: str
    origin_airport: str
    destination_airport: str
    temperature_f: int
    precipitation: PrecipitationType
    wind: WindCondition


def parse_departure_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_departure_hour(value: str) -> int:
    try:
        return max(0, min(int(value.split(":")[0]), 23))
    except Exception:
        return 12


def parse_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def normalize_airport_code(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""

    match = re.match(r"^([A-Za-z]{3})", trimmed)
    return match.group(1).upper() if match else trimmed.upper()


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
    temperature_f = parse_int(payload.temperature, default=65)

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
            temperature_f=temperature_f,
            precipitation=payload.precipitation,
            wind=payload.wind,
        ),
        notes,
    )