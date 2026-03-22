
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from sklearn.model_selection import train_test_split


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "cleaned_bts_flight_delay_data.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean the BTS flight delay dataset and generate a model-ready CSV."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to the raw BTS CSV export.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Destination for the cleaned dataset. Defaults to {DEFAULT_OUTPUT_PATH}.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"Input dataset not found: {input_path}")

    df = pd.read_csv(input_path)
    print("Dataset shape:", df.shape)
    print(df.head())

    print("\nDataset Info:")
    print(df.info())

    print("\nMissing Values:")
    print(df.isnull().sum())

    print("\nSummary Statistics:")
    print(df.describe())

    df = df.drop(
        columns=[
            "carrier",
            "carrier_name",
            "carrier_delay",
            "carrier_ct",
        ],
        errors="ignore",
    )

    df = df[df["arr_flights"] > 0]

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
    df["high_delay"] = (df["delay_rate"] > 0.2).astype(int)

    monthly_delay = df.groupby("month")["delay_rate"].mean()
    plt.figure(figsize=(8, 5))
    monthly_delay.plot(marker="o")
    plt.title("Average Delay Rate by Month")
    plt.xlabel("Month")
    plt.ylabel("Delay Rate")
    plt.show()

    delay_causes = df[
        [
            "weather_delay_norm",
            "nas_delay_norm",
            "security_delay_norm",
            "late_aircraft_delay_norm",
        ]
    ].mean()
    plt.figure(figsize=(8, 5))
    delay_causes.plot(kind="bar")
    plt.title("Average Normalized Delay Causes")
    plt.ylabel("Delay Minutes Per Flight")
    plt.show()

    airport_delay = df.groupby("airport_name")["delay_rate"].mean()
    top_airports = airport_delay.sort_values(ascending=False).head(10)
    plt.figure(figsize=(10, 5))
    top_airports.plot(kind="barh")
    plt.title("Top 10 Airports With Highest Delay Rates")
    plt.xlabel("Delay Rate")
    plt.show()

    model_df = df[
        [
            "month",
            "arr_flights",
            "weather_delay_norm",
            "nas_delay_norm",
            "security_delay_norm",
            "late_aircraft_delay_norm",
            "total_delay_norm",
            "high_delay",
        ]
    ]

    X = model_df.drop(columns=["high_delay"])
    y = model_df["high_delay"]

    X_train, X_test, _, _ = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
    )

    print("\nTraining set size:", X_train.shape)
    print("Test set size:", X_test.shape)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"\nCleaned dataset saved as '{output_path}'")


if __name__ == "__main__":
    main()
