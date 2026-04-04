from __future__ import annotations

import unittest

from backend.main import home, predict
from backend.schemas import PredictionRequest, PredictionResponse


class ApiTests(unittest.TestCase):
    def test_health_endpoint_reports_metadata(self) -> None:
        response = home()
        self.assertEqual(response.status, "ok")
        self.assertIn(response.predictionMode, {"hybrid_blend", "model_artifact", "heuristic_fallback"})

    def test_predict_returns_debug_only_when_requested(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
        )
        response = predict(payload)
        self.assertIsInstance(response, PredictionResponse)
        self.assertIsNone(response.debug)

        debug_response = predict(PredictionRequest(**{**payload.model_dump(), "includeDebug": True}))
        self.assertIsNotNone(debug_response.debug)
        self.assertIn(debug_response.debug.pathUsed, {"hybrid_blend", "model_artifact", "heuristic_fallback"})

    def test_invalid_request_returns_validation_error(self) -> None:
        with self.assertRaises(Exception):
            PredictionRequest(departureDate="2026-03-15")


if __name__ == "__main__":
    unittest.main()
