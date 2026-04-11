from __future__ import annotations

import unittest

from backend.result_explanation_service import (
    DeterministicExplanationLLMClient,
    build_context_snapshot,
    build_system_prompt,
    derive_context_disclaimer,
)
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
)


def build_context(source: str = "backend", itinerary: bool = False, path_used: str = "hybrid_blend") -> PredictionExplanationContext:
    debug = None
    if source != "mock_fallback":
        debug = PredictionDebugInfo(
            pathUsed=path_used,  # type: ignore[arg-type]
            modelLoaded=path_used == "hybrid_blend",
            modelVersion="test-model" if path_used == "hybrid_blend" else None,
            datasetVersion="test-dataset" if path_used == "hybrid_blend" else None,
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
                arr_flights=1700,
                weather_delay_norm=0.35,
                nas_delay_norm=0.28,
                security_delay_norm=0.01,
                late_aircraft_delay_norm=0.22,
                total_delay_norm=0.56,
                route_congestion_score=0.72,
                peak_departure_score=0.48,
            ),
            heuristicBreakdown=PredictionDebugScoreBreakdown(
                baseScore=11,
                routeContribution=6,
                hubBonus=4,
                timeOfDayContribution=5,
                totalDelayContribution=14,
                precipitationBonus=5,
                windBonus=3,
                weatherInteractionBonus=0,
                unclampedTotal=48,
                clampedTotal=48,
            ),
            blendInfo=PredictionDebugBlendInfo(
                heuristicProbability=48,
                modelProbability=51 if path_used == "hybrid_blend" else None,
                rawModelDisagreement=3 if path_used == "hybrid_blend" else None,
                maxModelShift=3 if path_used == "hybrid_blend" else None,
                appliedAdjustment=3 if path_used == "hybrid_blend" else None,
                blendMethod="heuristic_led_bounded_adjustment" if path_used == "hybrid_blend" else "heuristic_only_fallback",
                reasoning="Grounded test reasoning.",
            ),
            finalProbability=51 if path_used == "hybrid_blend" else 48,
            fallbackReason=None if path_used == "hybrid_blend" else "Heuristic-only test fallback.",
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
            probability=57 if itinerary else 51,
            riskLevel="moderate",
            explanation="Displayed explanation.",
        ),
        directRouteResult=(
            PredictionExplanationResult(
                probability=51,
                riskLevel="moderate",
                explanation="Direct-route explanation.",
            )
            if itinerary
            else None
        ),
        itinerarySummary=(
            PredictionExplanationItinerarySummary(
                legs=[
                    PredictionExplanationLeg(
                        originAirport="JFK",
                        destinationAirport="ORD",
                        probability=52,
                        riskLevel="moderate",
                        explanation="Leg one explanation.",
                    ),
                    PredictionExplanationLeg(
                        originAirport="ORD",
                        destinationAirport="LAX",
                        probability=57,
                        riskLevel="moderate",
                        explanation="Leg two explanation.",
                    ),
                ],
                aggregateProbability=57,
                aggregateRiskLevel="moderate",
                aggregateExplanation="Aggregate itinerary explanation.",
            )
            if itinerary
            else None
        ),
        debug=debug,
    )


class ResultExplanationServiceTests(unittest.TestCase):
    def test_context_snapshot_includes_direct_route_and_itinerary_fields(self) -> None:
        snapshot = build_context_snapshot(build_context(itinerary=True))

        self.assertIn("displayedResult", snapshot)
        self.assertIn("directRouteResult", snapshot)
        self.assertIn("itinerarySummary", snapshot)
        itinerary_summary = snapshot["itinerarySummary"]
        assert isinstance(itinerary_summary, dict)
        self.assertEqual(len(itinerary_summary["legs"]), 2)

    def test_mock_fallback_disclaimer_is_source_aware(self) -> None:
        disclaimer = derive_context_disclaimer(build_context(source="mock_fallback"))

        self.assertIsNotNone(disclaimer)
        assert disclaimer is not None
        self.assertIn("mock fallback", disclaimer.lower())

    def test_heuristic_fallback_prompt_mentions_heuristic_limit(self) -> None:
        prompt = build_system_prompt(build_context(path_used="heuristic_fallback"))

        self.assertIn("Use only the structured prediction context", prompt)
        self.assertIn("heuristic fallback", prompt)
        self.assertIn("Do not invent", prompt)

    def test_deterministic_client_answers_with_itinerary_context(self) -> None:
        client = DeterministicExplanationLLMClient()
        response = client.generate_result_answer(
            context=build_context(itinerary=True),
            question="Explain the itinerary impact.",
            history=[],
        )

        self.assertIn("itinerary-level score", response.answer)
        self.assertIn("itinerarySummary.legs", response.citations)
        self.assertTrue(response.suggested_followups)


if __name__ == "__main__":
    unittest.main()
