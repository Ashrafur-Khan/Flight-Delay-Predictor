from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from .config import ALLOW_HEURISTIC_FALLBACK, SERVICE_NAME
from .explainability import (
    HybridBlendResult,
    HeuristicEstimate,
    build_explanation,
    blend_model_with_heuristic,
    clamp_probability,
    heuristic_probability,
    resolve_risk_level,
)
from .feature_adapter import AdaptedFeatures, adapt_request_to_model_features
from .model_service import ModelArtifact, load_model_artifact, predict_probability
from .normalization import NormalizedPredictionInput, normalize_request
from .schemas import (
    PredictionDebugBlendInfo,
    HealthResponse,
    PredictionDebugScoreBreakdown,
    PredictionDebugDerivedFeatures,
    PredictionDebugInfo,
    PredictionDebugRawInput,
    PredictionPath,
    PredictionRequest,
    PredictionResponse,
)


@dataclass
class PredictionResultBundle:
    probability: int
    path_used: PredictionPath
    fallback_reason: str | None
    notes: list[str]
    features: AdaptedFeatures
    normalized_payload: NormalizedPredictionInput
    model_artifact: ModelArtifact | None
    heuristic_estimate: HeuristicEstimate
    hybrid_blend: HybridBlendResult | None = None


class PredictionService:
    def __init__(self, artifact: ModelArtifact | None = None) -> None:
        self.artifact = artifact if artifact is not None else load_model_artifact()

    @property
    def model_loaded(self) -> bool:
        return self.artifact is not None

    @property
    def model_version(self) -> str | None:
        return self.artifact.model_version if self.artifact else None

    @property
    def dataset_version(self) -> str | None:
        return self.artifact.dataset_version if self.artifact else None

    def current_prediction_mode(self) -> PredictionPath:
        return "hybrid_blend" if self.model_loaded else "heuristic_fallback"

    def metadata(self) -> HealthResponse:
        return HealthResponse(
            service=SERVICE_NAME,
            status="ok",
            modelLoaded=self.model_loaded,
            modelVersion=self.model_version,
            datasetVersion=self.dataset_version,
            predictionMode=self.current_prediction_mode(),
        )

    def score(self, payload: PredictionRequest) -> PredictionResultBundle:
        normalized_payload, notes = normalize_request(payload)
        features = adapt_request_to_model_features(normalized_payload)
        heuristic_estimate = heuristic_probability(normalized_payload, features)

        if self.artifact is not None:
            model_probability = predict_probability(self.artifact, features)
            hybrid_blend = blend_model_with_heuristic(
                heuristic_probability=heuristic_estimate.probability,
                model_probability=model_probability,
            )
            notes = list(notes)
            notes.append(hybrid_blend.reasoning)
            return PredictionResultBundle(
                probability=clamp_probability(hybrid_blend.probability),
                path_used="hybrid_blend",
                fallback_reason=None,
                notes=notes,
                features=features,
                normalized_payload=normalized_payload,
                model_artifact=self.artifact,
                heuristic_estimate=heuristic_estimate,
                hybrid_blend=hybrid_blend,
            )

        if not ALLOW_HEURISTIC_FALLBACK:
            raise HTTPException(
                status_code=503,
                detail="No compatible model artifact is loaded and heuristic fallback is disabled.",
            )

        notes = list(notes)
        notes.append(heuristic_estimate.reason)
        return PredictionResultBundle(
            probability=heuristic_estimate.probability,
            path_used="heuristic_fallback",
            fallback_reason=heuristic_estimate.reason,
            notes=notes,
            features=features,
            normalized_payload=normalized_payload,
            model_artifact=None,
            heuristic_estimate=heuristic_estimate,
            hybrid_blend=None,
        )

    def build_response(self, payload: PredictionRequest) -> PredictionResponse:
        bundle = self.score(payload)
        explanation = build_explanation(
            payload=bundle.normalized_payload,
            probability=bundle.probability,
            features=bundle.features,
            model_version=bundle.model_artifact.model_version if bundle.model_artifact else None,
            path_used=bundle.path_used,
        )
        debug = None
        if payload.includeDebug:
            debug = PredictionDebugInfo(
                pathUsed=bundle.path_used,
                modelLoaded=bundle.model_artifact is not None,
                modelVersion=bundle.model_artifact.model_version if bundle.model_artifact else None,
                datasetVersion=bundle.model_artifact.dataset_version if bundle.model_artifact else None,
                rawInput=PredictionDebugRawInput(
                    departureDate=bundle.normalized_payload.departure_date,
                    departureTime=bundle.normalized_payload.departure_time,
                    originAirport=bundle.normalized_payload.origin_airport,
                    destinationAirport=bundle.normalized_payload.destination_airport,
                    durationMinutes=bundle.normalized_payload.duration_minutes,
                    temperatureF=bundle.normalized_payload.temperature_f,
                    precipitation=bundle.normalized_payload.precipitation,
                    wind=bundle.normalized_payload.wind,
                ),
                derivedFeatures=PredictionDebugDerivedFeatures(**bundle.features.as_dict()),
                heuristicBreakdown=PredictionDebugScoreBreakdown(**bundle.heuristic_estimate.breakdown.as_dict()),
                blendInfo=(
                    PredictionDebugBlendInfo(
                        heuristicProbability=bundle.hybrid_blend.heuristic_probability,
                        modelProbability=bundle.hybrid_blend.model_probability,
                        modelDelta=bundle.hybrid_blend.model_delta,
                        scaledAdjustment=bundle.hybrid_blend.scaled_adjustment,
                        adjustmentCap=bundle.hybrid_blend.adjustment_cap,
                        appliedAdjustment=bundle.hybrid_blend.applied_adjustment,
                        reasoning=bundle.hybrid_blend.reasoning,
                    )
                    if bundle.hybrid_blend is not None
                    else PredictionDebugBlendInfo(
                        heuristicProbability=bundle.heuristic_estimate.probability,
                        modelProbability=None,
                        modelDelta=None,
                        scaledAdjustment=None,
                        adjustmentCap=None,
                        appliedAdjustment=None,
                        reasoning="Final score matches the heuristic fallback because no trained model artifact is available.",
                    )
                ),
                finalProbability=bundle.probability,
                fallbackReason=bundle.fallback_reason,
                notes=bundle.notes,
            )

        return PredictionResponse(
            probability=bundle.probability,
            riskLevel=resolve_risk_level(bundle.probability),
            explanation=explanation,
            debug=debug,
        )
