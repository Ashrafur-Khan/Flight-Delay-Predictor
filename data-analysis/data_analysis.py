from __future__ import annotations

import argparse
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "cleaned_flight_delay_data.csv"
REPO_ROOT = SCRIPT_DIR.parent

# Ensure repo root is in path
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from data_analysis_runner import build_versioned_dataset


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean the flight dataset and generate a model-ready CSV."
    )

    parser.add_argument(
        "--input",
        required=True,
        help="Path to the raw flight dataset CSV.",
    )

    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Destination for cleaned dataset (default: {DEFAULT_OUTPUT_PATH})",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"Input dataset not found: {input_path}")

    dataset_path, metadata_path = build_versioned_dataset(input_path, output_path)

    print(f"Cleaned dataset saved to: {dataset_path}")
    print(f"Metadata saved to: {metadata_path}")


if __name__ == "__main__":
    main()