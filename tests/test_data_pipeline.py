from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from backend.feature_adapter import MODEL_FEATURE_NAMES
from data_analysis_runner import build_versioned_dataset


class DataPipelineTests(unittest.TestCase):
    def test_pipeline_raises_on_missing_required_columns(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_path = Path(tmp_dir) / "input.csv"
            pd.DataFrame({"month": [1]}).to_csv(input_path, index=False)
            with self.assertRaises(ValueError):
                build_versioned_dataset(input_path, Path(tmp_dir) / "output.csv")

    def test_pipeline_writes_dataset_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_path = Path(tmp_dir) / "input.csv"
            output_path = Path(tmp_dir) / "cleaned.csv"
            pd.DataFrame(
                {
                    "year": [2024, 2024],
                    "month": [1, 2],
                    "carrier": ["AA", "DL"],
                    "carrier_name": ["American", "Delta"],
                    "airport_name": ["JFK", "LAX"],
                    "arr_flights": [100, 120],
                    "arr_del15": [10, 36],
                    "carrier_delay": [1, 2],
                    "carrier_ct": [1, 2],
                    "weather_delay": [3, 4],
                    "nas_delay": [5, 6],
                    "security_delay": [0, 1],
                    "late_aircraft_delay": [7, 8],
                }
            ).to_csv(input_path, index=False)

            build_versioned_dataset(input_path, output_path)

            cleaned = pd.read_csv(output_path)
            metadata = json.loads(output_path.with_suffix(".metadata.json").read_text())
            self.assertTrue(set(MODEL_FEATURE_NAMES).issubset(cleaned.columns))
            self.assertIn("delay_event", cleaned.columns)
            self.assertEqual(metadata["feature_names"], MODEL_FEATURE_NAMES)


if __name__ == "__main__":
    unittest.main()
