from __future__ import annotations

import unittest

from backend.feature_adapter import adapt_request_to_model_features
from backend.normalization import normalize_airport_code
from backend.schemas import PredictionRequest
from backend.normalization import normalize_request


class AdapterTests(unittest.TestCase):
    def test_airport_normalization_extracts_code_prefix(self) -> None:
        self.assertEqual(normalize_airport_code("jfk - new york"), "JFK")

    def test_normalize_request_applies_defaults(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
        )
        normalized, notes = normalize_request(payload)
        self.assertEqual(normalized.temperature_f, 65)
        self.assertTrue(any("defaulted to 65F" in note for note in notes))

    def test_adapted_features_stay_in_expected_ranges(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-01-10",
            departureTime="18:45",
            originAirport="JFK",
            destinationAirport="LAX",
            temperature="18",
            precipitation="snow",
            wind="strong",
        )
        normalized, _ = normalize_request(payload)
        features = adapt_request_to_model_features(normalized)
        self.assertGreaterEqual(features.weather_delay_norm, 0.0)
        self.assertLessEqual(features.weather_delay_norm, 1.0)
        self.assertGreaterEqual(features.peak_departure_score, 0.0)
        self.assertLessEqual(features.peak_departure_score, 1.0)
        self.assertGreater(features.arr_flights, 0)

    def test_legacy_duration_is_accepted_but_ignored(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
            duration="360",
        )
        normalized, _notes = normalize_request(payload)

        self.assertEqual(normalized.origin_airport, "JFK")
        self.assertEqual(normalized.destination_airport, "LAX")


if __name__ == "__main__":
    unittest.main()
