from __future__ import annotations

import unittest

from backend.explainability import blend_model_with_heuristic, heuristic_probability
from backend.feature_adapter import MODEL_FEATURE_NAMES, adapt_request_to_model_features
from backend.model_service import ModelArtifact
from backend.normalization import normalize_request
from backend.schemas import PredictionRequest
from backend.service import PredictionService


class StaticProbabilityModel:
    def __init__(self, probability: float) -> None:
        self.probability = probability

    def predict_proba(self, _frame):
        return [[1 - self.probability, self.probability]]


class PredictionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
            duration="330",
            temperature="28",
            precipitation="snow",
            wind="strong",
            includeDebug=True,
        )

    def test_score_uses_heuristic_fallback_without_model(self) -> None:
        service = PredictionService.__new__(PredictionService)
        service.artifact = None

        result = service.score(self.payload)

        self.assertEqual(result.path_used, "heuristic_fallback")
        self.assertIsNone(result.hybrid_blend)
        self.assertEqual(result.probability, result.heuristic_estimate.probability)

    def test_score_uses_hybrid_blend_with_model(self) -> None:
        artifact = ModelArtifact(
            model=StaticProbabilityModel(0.80),
            feature_names=list(MODEL_FEATURE_NAMES),
            model_version="test-model",
            dataset_version="test-dataset",
            target_name="high_delay",
            selected_model="StaticProbabilityModel",
            metrics={},
        )
        service = PredictionService(artifact=artifact)

        result = service.score(self.payload)

        self.assertEqual(result.path_used, "hybrid_blend")
        self.assertIsNotNone(result.hybrid_blend)
        expected = blend_model_with_heuristic(result.heuristic_estimate.probability, 80)
        self.assertEqual(result.probability, expected.probability)
        self.assertEqual(result.hybrid_blend.applied_adjustment, expected.applied_adjustment)

    def test_build_response_returns_hybrid_debug_breakdown(self) -> None:
        artifact = ModelArtifact(
            model=StaticProbabilityModel(0.95),
            feature_names=list(MODEL_FEATURE_NAMES),
            model_version="test-model",
            dataset_version="test-dataset",
            target_name="high_delay",
            selected_model="StaticProbabilityModel",
            metrics={},
        )
        service = PredictionService(artifact=artifact)

        response = service.build_response(self.payload)

        self.assertIsNotNone(response.debug)
        assert response.debug is not None
        self.assertEqual(response.debug.pathUsed, "hybrid_blend")
        self.assertIsNotNone(response.debug.heuristicBreakdown)
        self.assertIsNotNone(response.debug.blendInfo)
        self.assertEqual(response.debug.blendInfo.modelProbability, 95)

    def test_bounded_adjustment_caps_extreme_model_disagreement(self) -> None:
        blended = blend_model_with_heuristic(heuristic_probability=20, model_probability=95)

        self.assertEqual(blended.scaled_adjustment, 25)
        self.assertEqual(blended.applied_adjustment, 12)
        self.assertEqual(blended.probability, 32)

    def test_hybrid_probability_stays_clamped(self) -> None:
        blended = blend_model_with_heuristic(heuristic_probability=92, model_probability=100)

        self.assertEqual(blended.applied_adjustment, 3)
        self.assertEqual(blended.probability, 95)

    def test_heuristic_breakdown_matches_feature_flow(self) -> None:
        normalized, _notes = normalize_request(self.payload)
        features = adapt_request_to_model_features(normalized)

        estimate = heuristic_probability(normalized, features)

        self.assertEqual(estimate.breakdown.clamped_total, estimate.probability)
        self.assertGreaterEqual(estimate.breakdown.unclamped_total, estimate.breakdown.base_score)


if __name__ == "__main__":
    unittest.main()
