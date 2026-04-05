from __future__ import annotations

import unittest

from backend.explainability import build_explanation
from backend.feature_adapter import adapt_request_to_model_features
from backend.normalization import normalize_request
from backend.schemas import PredictionRequest


class ExplainabilityTests(unittest.TestCase):
    def test_build_explanation_mentions_hybrid_scoring(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="18:10",
            originAirport="JFK",
            destinationAirport="LAX",
            precipitation="rain",
            wind="moderate",
        )
        normalized, _notes = normalize_request(payload)
        features = adapt_request_to_model_features(normalized)

        explanation = build_explanation(
            payload=normalized,
            probability=54,
            features=features,
            model_version="test-model",
            path_used="hybrid_blend",
        )

        self.assertIn("heuristic-led hybrid adjustment", explanation)
        self.assertIn("trained BTS-based model", explanation)

    def test_build_explanation_mentions_fallback_when_no_model(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="11:00",
            originAirport="BOS",
            destinationAirport="MIA",
        )
        normalized, _notes = normalize_request(payload)
        features = adapt_request_to_model_features(normalized)

        explanation = build_explanation(
            payload=normalized,
            probability=26,
            features=features,
            model_version=None,
            path_used="heuristic_fallback",
        )

        self.assertIn("advanced heuristic estimator", explanation)


if __name__ == "__main__":
    unittest.main()
