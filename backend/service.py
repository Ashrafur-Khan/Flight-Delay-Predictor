from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from .config import ALLOW_HEURISTIC_FALLBACK, SERVICE_NAME
from .explainability import build_explanation, heuristic_probability, resolve_risk_level
from .feature_adapter import AdaptedFeatures, adapt_request_to_model_features
from .model_service import ModelArtifact, load_model_artifact, predict_probability
from .normalization import NormalizedPredictionInput, normalize_request
from .schemas import (
    HealthResponse,
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
        return "model_artifact" if self.model_loaded else "heuristic_fallback"

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

        if self.artifact is not None:
            probability = predict_probability(self.artifact, features)
            return PredictionResultBundle(
                probability=max(5, min(probability, 95)),
                path_used="model_artifact",
                fallback_reason=None,
                notes=notes,
                features=features,
                normalized_payload=normalized_payload,
                model_artifact=self.artifact,
            )

        if not ALLOW_HEURISTIC_FALLBACK:
            raise HTTPException(
                status_code=503,
                detail="No compatible model artifact is loaded and heuristic fallback is disabled.",
            )

        fallback = heuristic_probability(normalized_payload, features)
        notes = list(notes)
        notes.append(fallback.reason)
        return PredictionResultBundle(
            probability=fallback.probability,
            path_used="heuristic_fallback",
            fallback_reason=fallback.reason,
            notes=notes,
            features=features,
            normalized_payload=normalized_payload,
            model_artifact=None,
        )

    def build_response(self, payload: PredictionRequest) -> PredictionResponse:
        bundle = self.score(payload)
        explanation = build_explanation(
            payload=bundle.normalized_payload,
            probability=bundle.probability,
            features=bundle.features,
            model_version=bundle.model_artifact.model_version if bundle.model_artifact else None,
            used_fallback=bundle.path_used == "heuristic_fallback",
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
