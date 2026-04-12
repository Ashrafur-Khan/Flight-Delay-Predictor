from __future__ import annotations

import os
import requests
from typing import Optional, Dict, Tuple

# You MUST set this in your environment
API_KEY = os.getenv("WEATHER_API_KEY")


# Minimal airport → lat/lon mapping (expand later if needed)
AIRPORT_COORDS: Dict[str, Tuple[float, float]] = {
    "JFK": (40.6413, -73.7781),
    "LAX": (33.9416, -118.4085),
    "ORD": (41.9742, -87.9073),
    "ATL": (33.6407, -84.4277),
    "DFW": (32.8998, -97.0403),
    "DEN": (39.8561, -104.6737),
    "SFO": (37.6213, -122.3790),
    "SEA": (47.4502, -122.3088),
}


def map_weather_condition(main: str) -> str:
    main = main.lower()

    if "rain" in main:
        return "rain"
    if "snow" in main:
        return "snow"
    if "thunderstorm" in main:
        return "thunderstorms"
    if "sleet" in main:
        return "sleet"

    return "none"


def map_wind_speed(speed: float) -> str:
    if speed < 8:
        return "calm"
    elif speed < 20:
        return "moderate"
    return "strong"


def get_weather_for_airport(airport_code: str) -> Optional[dict]:
    """
    Fetch live weather for an airport.
    Returns None if anything fails (safe fallback).
    """

    if not API_KEY:
        return None

    coords = AIRPORT_COORDS.get(airport_code.upper())
    if not coords:
        return None

    lat, lon = coords

    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lon}&appid={API_KEY}&units=imperial"
        )

        response = requests.get(url, timeout=3)
        data = response.json()

        return {
            "temperature_f": data["main"]["temp"],
            "wind": map_wind_speed(data["wind"]["speed"]),
            "precipitation": map_weather_condition(data["weather"][0]["main"]),
            "raw": data,
        }

    except Exception:
        return None