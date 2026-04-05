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
