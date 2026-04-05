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
    @staticmethod
    def _estimate_for(**overrides):
        payload_data = {
            "departureDate": "2026-03-15",
            "departureTime": "12:00",
            "originAirport": "OKC",
            "destinationAirport": "SAT",
            "temperature": "65",
            "precipitation": "none",
            "wind": "calm",
            "includeDebug": True,
            **overrides,
        }
        payload = PredictionRequest(
            **payload_data,
        )
        normalized, _notes = normalize_request(payload)
        features = adapt_request_to_model_features(normalized)
        return heuristic_probability(normalized, features), features

    def setUp(self) -> None:
        self.payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
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
        self.assertLessEqual(response.debug.blendInfo.maxModelShift, 5)
        self.assertEqual(response.debug.blendInfo.blendMethod, "heuristic_led_bounded_adjustment")

    def test_extreme_model_disagreement_does_not_move_score(self) -> None:
        blended = blend_model_with_heuristic(heuristic_probability=20, model_probability=95)

        self.assertEqual(blended.raw_model_disagreement, 75)
        self.assertEqual(blended.max_model_shift, 0)
        self.assertEqual(blended.applied_adjustment, 0)
        self.assertEqual(blended.probability, 20)

    def test_hybrid_probability_stays_clamped(self) -> None:
        blended = blend_model_with_heuristic(heuristic_probability=92, model_probability=100)

        self.assertEqual(blended.max_model_shift, 5)
        self.assertEqual(blended.applied_adjustment, 5)
        self.assertEqual(blended.probability, 95)

    def test_small_disagreement_allows_limited_model_adjustment(self) -> None:
        blended = blend_model_with_heuristic(heuristic_probability=62, model_probability=67)

        self.assertEqual(blended.raw_model_disagreement, 5)
        self.assertEqual(blended.max_model_shift, 5)
        self.assertEqual(blended.applied_adjustment, 5)
        self.assertEqual(blended.probability, 67)

    def test_invalid_departure_time_uses_safe_parser(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="not-a-time",
            originAirport="JFK",
            destinationAirport="LAX",
            temperature="28",
            precipitation="snow",
            wind="strong",
        )
        normalized, _notes = normalize_request(payload)
        features = adapt_request_to_model_features(normalized)

        estimate = heuristic_probability(normalized, features)

        self.assertEqual(estimate.breakdown.time_of_day_contribution, 0)
        self.assertEqual(estimate.breakdown.clamped_total, estimate.probability)

    def test_heuristic_breakdown_matches_feature_flow(self) -> None:
        normalized, _notes = normalize_request(self.payload)
        features = adapt_request_to_model_features(normalized)

        estimate = heuristic_probability(normalized, features)

        breakdown = estimate.breakdown
        self.assertEqual(estimate.breakdown.clamped_total, estimate.probability)
        self.assertEqual(
            breakdown.unclamped_total,
            breakdown.base_score
            + breakdown.route_contribution
            + breakdown.hub_bonus
            + breakdown.time_of_day_contribution
            + breakdown.total_delay_contribution
            + breakdown.precipitation_bonus
            + breakdown.wind_bonus
            + breakdown.weather_interaction_bonus,
        )

    def test_calm_midday_nonhub_route_stays_in_low_range(self) -> None:
        estimate, _features = self._estimate_for()

        self.assertGreaterEqual(estimate.probability, 15)
        self.assertLessEqual(estimate.probability, 30)

    def test_calm_busy_midday_route_no_longer_overestimates(self) -> None:
        estimate, _features = self._estimate_for(originAirport="JFK", destinationAirport="LAX")

        self.assertLessEqual(estimate.probability, 30)

    def test_calm_peak_route_respects_soft_ceiling(self) -> None:
        estimate, _features = self._estimate_for(
            originAirport="JFK",
            destinationAirport="LAX",
            departureTime="18:00",
        )

        self.assertEqual(estimate.probability, 30)

    def test_severe_peak_busy_route_can_reach_high_risk_band(self) -> None:
        estimate, _features = self._estimate_for(
            originAirport="JFK",
            destinationAirport="LAX",
            departureTime="18:00",
            temperature="20",
            precipitation="snow",
            wind="strong",
        )

        self.assertGreaterEqual(estimate.probability, 79)
        self.assertLessEqual(estimate.probability, 90)

    def test_peak_thunderstorm_route_reaches_very_high_risk_band(self) -> None:
        estimate, _features = self._estimate_for(
            originAirport="LAX",
            destinationAirport="JFK",
            departureTime="18:00",
            temperature="65",
            precipitation="thunderstorms",
            wind="strong",
        )

        self.assertGreaterEqual(estimate.probability, 79)
        self.assertLessEqual(estimate.probability, 90)

    def test_midday_contribution_is_near_neutral(self) -> None:
        estimate, _features = self._estimate_for()

        self.assertLessEqual(estimate.breakdown.time_of_day_contribution, 1)

    def test_route_influence_is_secondary_to_severe_weather(self) -> None:
        calm_estimate, _features = self._estimate_for(originAirport="JFK", destinationAirport="LAX")
        severe_estimate, _features = self._estimate_for(
            originAirport="JFK",
            destinationAirport="LAX",
            departureTime="18:00",
            temperature="20",
            precipitation="snow",
            wind="strong",
        )

        self.assertLess(calm_estimate.probability, severe_estimate.probability)

    def test_legacy_duration_does_not_change_response(self) -> None:
        service = PredictionService.__new__(PredictionService)
        service.artifact = None

        baseline = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
            temperature="28",
            precipitation="snow",
            wind="strong",
            includeDebug=True,
        )
        legacy = PredictionRequest(**{**baseline.model_dump(), "duration": "330"})

        baseline_response = service.build_response(baseline)
        legacy_response = service.build_response(legacy)

        self.assertEqual(baseline_response.model_dump(), legacy_response.model_dump())


if __name__ == "__main__":
    unittest.main()
