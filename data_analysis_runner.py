from __future__ import annotations

from pathlib import Path
import json
import pandas as pd
import numpy as np


DATASET_VERSION = "flight_dataset_v1_clean"

MODEL_FEATURE_NAMES = [
    "month",
    "day_of_week",
    "day_of_month",
    "quarter",
    "week_of_year",
    "origin_freq",
    "carrier_freq",
    "is_weekend",
]


def build_versioned_dataset(input_path: Path, output_path: Path) -> tuple[Path, Path]:

    df = pd.read_csv(input_path)

    # -----------------------------
    # REQUIRED COLUMNS
    # -----------------------------
    required = {"fl_date", "origin", "op_unique_carrier"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # -----------------------------
    # CLEANING
    # -----------------------------
    df = df.drop_duplicates()

    df["fl_date"] = pd.to_datetime(df["fl_date"], errors="coerce")
    df = df.dropna(subset=["fl_date", "origin", "op_unique_carrier"])

    # -----------------------------
    # DATE FEATURES
    # -----------------------------
    df["month"] = df["fl_date"].dt.month
    df["day_of_month"] = df["fl_date"].dt.day
    df["day_of_week"] = df["fl_date"].dt.weekday + 1  # 1–7
    df["quarter"] = df["fl_date"].dt.quarter
    df["week_of_year"] = df["fl_date"].dt.isocalendar().week.astype(int)

    # -----------------------------
    # ENGINEERED FEATURES
    # -----------------------------
    origin_counts = df["origin"].value_counts()
    df["origin_freq"] = df["origin"].map(origin_counts)

    carrier_counts = df["op_unique_carrier"].value_counts()
    df["carrier_freq"] = df["op_unique_carrier"].map(carrier_counts)

    df["is_weekend"] = df["day_of_week"].isin([6, 7]).astype(int)

    # -----------------------------
    # TARGET CREATION
    # -----------------------------
    if "dep_delay" in df.columns:
        df["target"] = (df["dep_delay"] > 15).astype(int)
    else:
        # fallback (not ideal, but prevents crashes)
        df["target"] = (
            (df["month"].isin([6, 7, 8])) |
            (df["day_of_week"] >= 6)
        ).astype(int)

    # -----------------------------
    # HANDLE MISSING VALUES
    # -----------------------------
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].fillna(df[col].median())

    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].fillna("Unknown")

    # -----------------------------
    # SAVE DATASET
    # -----------------------------
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    metadata = {
        "dataset_version": DATASET_VERSION,
        "features": MODEL_FEATURE_NAMES,
        "target": "target",
    }

    metadata_path = output_path.with_suffix(".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2))

    return output_path, metadata_path