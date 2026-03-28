from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from backend.config import TARGET_NAME
from backend.feature_adapter import MODEL_FEATURE_NAMES


DATASET_VERSION = "bts_delay_dataset_v1"
REQUIRED_SOURCE_COLUMNS = {
    "month",
    "arr_flights",
    "arr_del15",
    "weather_delay",
    "nas_delay",
    "security_delay",
    "late_aircraft_delay",
}


def build_versioned_dataset(input_path: Path, output_path: Path) -> tuple[Path, Path]:
    df = pd.read_csv(input_path)
    missing = sorted(REQUIRED_SOURCE_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(f"Input dataset is missing required BTS columns: {missing}")

    df = df.drop(
        columns=[
            "carrier",
            "carrier_name",
            "carrier_delay",
            "carrier_ct",
        ],
        errors="ignore",
    )

    df = df[df["arr_flights"] > 0].copy()
    delay_cols = [
        "weather_delay",
        "nas_delay",
        "security_delay",
        "late_aircraft_delay",
    ]
    df[delay_cols] = df[delay_cols].fillna(0)

    df["weather_delay_norm"] = df["weather_delay"] / df["arr_flights"]
    df["nas_delay_norm"] = df["nas_delay"] / df["arr_flights"]
    df["security_delay_norm"] = df["security_delay"] / df["arr_flights"]
    df["late_aircraft_delay_norm"] = df["late_aircraft_delay"] / df["arr_flights"]
    df["total_delay_norm"] = (
        df["weather_delay_norm"]
        + df["nas_delay_norm"]
        + df["security_delay_norm"]
        + df["late_aircraft_delay_norm"]
    )
    df["delay_rate"] = df["arr_del15"] / df["arr_flights"]
    df[TARGET_NAME] = (df["delay_rate"] >= 0.15).astype(int)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    metadata = {
        "dataset_version": DATASET_VERSION,
        "source_file": str(input_path),
        "target_name": TARGET_NAME,
        "target_definition": "delay_event = arr_del15 / arr_flights >= 0.15",
        "feature_names": MODEL_FEATURE_NAMES,
        "cleaning_rules": [
            "drop BTS carrier identity columns not used in training",
            "filter rows with arr_flights <= 0",
            "fill missing delay cause columns with 0",
            "derive normalized delay features and total_delay_norm",
        ],
        "split_strategy": {
            "train": 0.6,
            "validation": 0.2,
            "test": 0.2,
            "random_state": 42,
            "stratified": True,
        },
    }
    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2))
    return output_path, metadata_path
