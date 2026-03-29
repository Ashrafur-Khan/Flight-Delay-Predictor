
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import pandas as pd

from .config import MODEL_ARTIFACT_PATH
from .feature_adapter import MODEL_FEATURE_NAMES, AdaptedFeatures


@dataclass(frozen=True)
class ModelArtifact:
    model: Any
    feature_names: list[str]
    model_version: str
    dataset_version: str
    target_name: str
    selected_model: str
    metrics: dict[str, float]
    calibration_method: str | None = None


def _coerce_artifact(payload: Any) -> ModelArtifact | None:
    if payload is None:
        return None

    if isinstance(payload, dict) and "model" in payload:
        feature_names = list(payload.get("feature_names", []))
        if feature_names != MODEL_FEATURE_NAMES:
            return None
        model = payload["model"]
        if not hasattr(model, "predict_proba"):
            return None
        return ModelArtifact(
            model=model,
            feature_names=feature_names,
            model_version=str(payload.get("model_version", "unknown")),
            dataset_version=str(payload.get("dataset_version", "unknown")),
            target_name=str(payload.get("target_name", "unknown")),
            selected_model=str(payload.get("selected_model", "unknown")),
            metrics=dict(payload.get("metrics", {})),
            calibration_method=payload.get("calibration_method"),
        )

    if hasattr(payload, "predict_proba"):
        return ModelArtifact(
            model=payload,
            feature_names=list(MODEL_FEATURE_NAMES),
            model_version="legacy-model",
            dataset_version="legacy-dataset",
            target_name="high_delay",
            selected_model=payload.__class__.__name__,
            metrics={},
            calibration_method=None,
        )

    return None


def load_model_artifact(path=MODEL_ARTIFACT_PATH) -> ModelArtifact | None:
    if not path.exists():
        return None

    return _coerce_artifact(joblib.load(path))


def predict_probability(artifact: ModelArtifact, features: AdaptedFeatures) -> int:
    feature_frame = pd.DataFrame(
        [features.as_model_vector(artifact.feature_names)],
        columns=artifact.feature_names,
    )
    probability = float(artifact.model.predict_proba(feature_frame)[0][1])
    return max(0, min(int(round(probability * 100)), 100))
