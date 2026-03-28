from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import json

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from .config import DATA_ANALYSIS_DIR, MODEL_ARTIFACT_PATH, TARGET_NAME
from .feature_adapter import MODEL_FEATURE_NAMES


DEFAULT_DATASET_PATH = DATA_ANALYSIS_DIR / "cleaned_bts_flight_delay_data.csv"
DEFAULT_DATASET_METADATA_PATH = DATA_ANALYSIS_DIR / "cleaned_bts_flight_delay_data.metadata.json"
MODEL_VERSION = "backend_v1"


@dataclass(frozen=True)
class TrainingArtifacts:
    dataset_path: Path
    metadata_path: Path
    artifact_path: Path


def _load_dataset_and_metadata(dataset_path: Path, metadata_path: Path) -> tuple[pd.DataFrame, dict]:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Expected cleaned dataset at {dataset_path}.")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Expected dataset metadata at {metadata_path}.")

    dataset = pd.read_csv(dataset_path)
    metadata = json.loads(metadata_path.read_text())
    return dataset, metadata


def _validate_training_schema(df: pd.DataFrame) -> None:
    required_columns = set(MODEL_FEATURE_NAMES + [TARGET_NAME])
    missing = sorted(required_columns - set(df.columns))
    if missing:
        raise ValueError(f"Training dataset is missing required columns: {missing}")


def train_and_save_model(
    dataset_path: Path = DEFAULT_DATASET_PATH,
    metadata_path: Path = DEFAULT_DATASET_METADATA_PATH,
    artifact_path: Path = MODEL_ARTIFACT_PATH,
) -> dict:
    df, dataset_metadata = _load_dataset_and_metadata(dataset_path, metadata_path)
    _validate_training_schema(df)

    X = df[MODEL_FEATURE_NAMES]
    y = df[TARGET_NAME]

    X_train_full, X_test, y_train_full, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_full,
        y_train_full,
        test_size=0.25,
        random_state=42,
        stratify=y_train_full,
    )

    candidates = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "random_forest": RandomForestClassifier(
            n_estimators=200,
            random_state=42,
            min_samples_leaf=4,
            class_weight="balanced",
        ),
    }

    candidate_metrics: dict[str, dict[str, float]] = {}
    best_name = ""
    best_model = None
    best_score = float("-inf")

    for name, estimator in candidates.items():
        estimator.fit(X_train, y_train)
        val_proba = estimator.predict_proba(X_val)[:, 1]
        auc = roc_auc_score(y_val, val_proba)
        brier = brier_score_loss(y_val, val_proba)
        candidate_metrics[name] = {
            "validation_auc": round(float(auc), 6),
            "validation_brier": round(float(brier), 6),
        }
        score = auc - brier
        if score > best_score:
            best_score = score
            best_name = name
            best_model = estimator

    assert best_model is not None

    calibrated_model = CalibratedClassifierCV(best_model, method="sigmoid", cv="prefit")
    calibrated_model.fit(X_val, y_val)
    test_proba = calibrated_model.predict_proba(X_test)[:, 1]
    candidate_metrics[best_name]["test_auc"] = round(float(roc_auc_score(y_test, test_proba)), 6)
    candidate_metrics[best_name]["test_brier"] = round(float(brier_score_loss(y_test, test_proba)), 6)

    artifact_payload = {
        "model": calibrated_model,
        "feature_names": list(MODEL_FEATURE_NAMES),
        "model_version": MODEL_VERSION,
        "dataset_version": dataset_metadata["dataset_version"],
        "target_name": TARGET_NAME,
        "selected_model": best_name,
        "metrics": candidate_metrics[best_name],
        "calibration_method": "sigmoid",
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact_payload, artifact_path)
    return artifact_payload
