from __future__ import annotations

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from data_analysis_runner import build_versioned_dataset
from training import train_and_save_model


def main():

    raw_data = Path("data-analysis/flight_data_2024.csv")
    cleaned_data = Path("data-analysis/cleaned_flight_delay_data.csv")

    print("🧹 Cleaning dataset...")
    build_versioned_dataset(raw_data, cleaned_data)

    print("🚀 Training model...")
    artifact = train_and_save_model(cleaned_data)

    print("\n✅ DONE")
    print("Best Model:", artifact["model_name"])
    print("AUC:", artifact["metrics"]["auc"])


if __name__ == "__main__":
    main()