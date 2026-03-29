from __future__ import annotations

from pathlib import Path
import pandas as pd

from backend.config import TARGET_NAME


def load_bts(path: Path) -> pd.DataFrame:
    return pd.read_csv(path)


def load_weather(path: Path | None) -> pd.DataFrame | None:
    if path is None or not path.exists():
        return None
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])
    return df


def load_airports(path: Path | None) -> pd.DataFrame | None:
    if path is None or not path.exists():
        return None
    return pd.read_csv(path)


def load_airlines(path: Path | None) -> pd.DataFrame | None:
    if path is None or not path.exists():
        return None
    return pd.read_csv(path)


def merge_weather(bts: pd.DataFrame, weather: pd.DataFrame) -> pd.DataFrame:
    bts["date"] = pd.to_datetime(bts["fl_date"]).dt.date
    weather["date"] = pd.to_datetime(weather["date"]).dt.date

    return pd.merge(
        bts,
        weather,
        on="date",
        how="left",
    )


def merge_airports(df: pd.DataFrame, airports: pd.DataFrame) -> pd.DataFrame:
    return df.merge(
        airports,
        left_on="origin",
        right_on="iata_code",
        how="left",
    )


def merge_airlines(df: pd.DataFrame, airlines: pd.DataFrame) -> pd.DataFrame:
    return df.merge(
        airlines,
        left_on="carrier",
        right_on="carrier",
        how="left",
    )


def compute_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    # Weather severity (fallback-safe)
    if "precipitation" in df.columns:
        df["weather_severity"] = df["precipitation"].fillna(0) * 0.5
    else:
        df["weather_severity"] = 0.0

    # Airport congestion proxy
    if "arr_flights" in df.columns:
        df["airport_congestion"] = df["arr_flights"] / (df["arr_flights"].max() + 1e-6)
    else:
        df["airport_congestion"] = 0.0

    # Airline risk proxy
    if "airline_delay_rate" in df.columns:
        df["airline_delay_score"] = df["airline_delay_rate"].fillna(0.1)
    else:
        df["airline_delay_score"] = 0.1

    return df


def build_multi_source_dataset(
    bts_path: Path,
    weather_path: Path | None = None,
    airports_path: Path | None = None,
    airlines_path: Path | None = None,
) -> pd.DataFrame:
    df = load_bts(bts_path)

    if weather_path:
        weather = load_weather(weather_path)
        if weather is not None:
            df = merge_weather(df, weather)

    if airports_path:
        airports = load_airports(airports_path)
        if airports is not None:
            df = merge_airports(df, airports)

    if airlines_path:
        airlines = load_airlines(airlines_path)
        if airlines is not None:
            df = merge_airlines(df, airlines)

    df = compute_derived_features(df)

    return df