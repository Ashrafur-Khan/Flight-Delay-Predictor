from __future__ import annotations

import unittest

from backend.main import explain_result, home, predict
from backend.schemas import (
    PredictionDebugBlendInfo,
    PredictionDebugDerivedFeatures,
    PredictionDebugInfo,
    PredictionDebugRawInput,
    PredictionDebugScoreBreakdown,
    PredictionExplanationContext,
    PredictionExplanationItinerarySummary,
    PredictionExplanationLeg,
    PredictionExplanationResult,
    PredictionRequest,
    PredictionResponse,
    ResultChatRequest,
)


class ApiTests(unittest.TestCase):
    @staticmethod
    def build_prediction_context(source: str = "backend", include_itinerary: bool = False) -> PredictionExplanationContext:
        debug = PredictionDebugInfo(
            pathUsed="hybrid_blend" if source == "backend" else "heuristic_fallback",
            modelLoaded=source == "backend",
            modelVersion="demo-model" if source == "backend" else None,
            datasetVersion="demo-dataset" if source == "backend" else None,
            rawInput=PredictionDebugRawInput(
                departureDate="2026-03-15",
                departureTime="08:30",
                originAirport="JFK",
                destinationAirport="LAX",
                temperatureF=72,
                precipitation="rain",
                wind="moderate",
            ),
            derivedFeatures=PredictionDebugDerivedFeatures(
                month=3,
                arr_flights=1800,
                weather_delay_norm=0.32,
                nas_delay_norm=0.29,
                security_delay_norm=0.02,
                late_aircraft_delay_norm=0.24,
                total_delay_norm=0.54,
                route_congestion_score=0.68,
                peak_departure_score=0.55,
            ),
            heuristicBreakdown=PredictionDebugScoreBreakdown(
                baseScore=11,
                routeContribution=5,
                hubBonus=4,
                timeOfDayContribution=5,
                totalDelayContribution=13,
                precipitationBonus=5,
                windBonus=3,
                weatherInteractionBonus=0,
                unclampedTotal=46,
                clampedTotal=46,
            ),
            blendInfo=PredictionDebugBlendInfo(
                heuristicProbability=46,
                modelProbability=49 if source == "backend" else None,
                rawModelDisagreement=3 if source == "backend" else None,
                maxModelShift=3 if source == "backend" else None,
                appliedAdjustment=3 if source == "backend" else None,
                blendMethod="heuristic_led_bounded_adjustment" if source == "backend" else "heuristic_only_fallback",
                reasoning="Grounded test reasoning.",
            ),
            finalProbability=49 if source == "backend" else 46,
            fallbackReason=None if source == "backend" else "Heuristic fallback active.",
            notes=["Grounded note."],
        )

        return PredictionExplanationContext(
            source=source,  # type: ignore[arg-type]
            submittedRequest=PredictionRequest(
                departureDate="2026-03-15",
                departureTime="08:30",
                originAirport="JFK",
                destinationAirport="LAX",
                temperature="72",
                precipitation="rain",
                wind="moderate",
            ),
            displayedResult=PredictionExplanationResult(
                probability=58 if include_itinerary else 49,
                riskLevel="moderate",
                explanation="Displayed grounded explanation.",
            ),
            directRouteResult=(
                PredictionExplanationResult(
                    probability=49,
                    riskLevel="moderate",
                    explanation="Direct-route explanation.",
                )
                if include_itinerary
                else None
            ),
            itinerarySummary=(
                PredictionExplanationItinerarySummary(
                    legs=[
                        PredictionExplanationLeg(
                            originAirport="JFK",
                            destinationAirport="ORD",
                            probability=53,
                            riskLevel="moderate",
                            explanation="First leg explanation.",
                        ),
                        PredictionExplanationLeg(
                            originAirport="ORD",
                            destinationAirport="LAX",
                            probability=58,
                            riskLevel="moderate",
                            explanation="Second leg explanation.",
                        ),
                    ],
                    aggregateProbability=58,
                    aggregateRiskLevel="moderate",
                    aggregateExplanation="Itinerary explanation.",
                )
                if include_itinerary
                else None
            ),
            debug=None if source == "mock_fallback" else debug,
        )

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
        self.assertNotIn("durationMinutes", debug_response.debug.rawInput.model_dump())

    def test_predict_accepts_legacy_duration_without_exposing_it(self) -> None:
        payload = PredictionRequest(
            departureDate="2026-03-15",
            departureTime="08:30",
            originAirport="JFK",
            destinationAirport="LAX",
            duration="330",
            includeDebug=True,
        )

        response = predict(payload)

        self.assertIsInstance(response, PredictionResponse)
        assert response.debug is not None
        self.assertNotIn("durationMinutes", response.debug.rawInput.model_dump())

    def test_invalid_request_returns_validation_error(self) -> None:
        with self.assertRaises(Exception):
            PredictionRequest(departureDate="2026-03-15")

    def test_explain_result_returns_structured_response(self) -> None:
        response = explain_result(
            ResultChatRequest(
                predictionContext=self.build_prediction_context(include_itinerary=True),
                question="Explain the itinerary impact.",
            )
        )

        self.assertTrue(response.answer)
        self.assertIn("displayedResult.probability", response.citations)
        self.assertTrue(response.suggestedFollowups)

    def test_explain_result_rejects_missing_context(self) -> None:
        with self.assertRaises(Exception):
            ResultChatRequest(question="Why?", predictionContext=None)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
