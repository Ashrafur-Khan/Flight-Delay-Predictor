from __future__ import annotations
from datetime import datetime
import pandas as pd
from pathlib import Path

# You will generate this file from NOAA dataset
WEATHER_DATA_PATH = Path(__file__).resolve().parent / "weather_data.csv"

class WeatherService:
    def __init__(self) -> None:
        if WEATHER_DATA_PATH.exists():
            self.df = pd.read_csv(WEATHER_DATA_PATH)
        else:
            self.df = None

    def get_weather(self, airport: str, date: str, hour: int) -> dict:
        """
        Returns real weather if available, otherwise fallback.
        """
        if self.df is None:
            return self._fallback()

        try:
            dt = datetime.strptime(date, "%Y-%m-%d")
            month = dt.month

            subset = self.df[
                (self.df["airport"] == airport) &
                (self.df["month"] == month)
            ]

            if subset.empty:
                return self._fallback()

            row = subset.sample(1).iloc[0]

            return {
                "temperature_f": row["temperature"],
                "wind_speed": row["wind_speed"],
                "precipitation": row["precipitation"],
                "visibility": row.get("visibility", 10),
            }

        except Exception:
            return self._fallback()

    def _fallback(self) -> dict:
        return {
            "temperature_f": 60,
            "wind_speed": 5,
            "precipitation": 0,
            "visibility": 10,
        }