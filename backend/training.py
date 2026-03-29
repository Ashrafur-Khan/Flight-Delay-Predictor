from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, accuracy_score
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler


# =========================
# CONFIG
# =========================
MODEL_VERSION = "flight_delay_prob_v2"

DATASET_PATH = Path("cleaned_flight_delay_data.csv")
ARTIFACT_PATH = Path("model_artifact.joblib")

MODEL_FEATURES = [
    "month",
    "day_of_week",
    "day_of_month",
    "quarter",
    "week_of_year",
    "origin_freq",
    "carrier_freq",
    "is_weekend",
]


# =========================
# TRAIN FUNCTION
# =========================
def train_and_save_model(
    dataset_path: Path = DATASET_PATH,
    artifact_path: Path = ARTIFACT_PATH,
):

    print("\nLoading dataset...")
    df = pd.read_csv(dataset_path)

    # -----------------------------
    # SPEED FIX: SAMPLE DATA
    # -----------------------------
    if len(df) > 200000:
        print(f"Sampling dataset (original size: {len(df)})")
        df = df.sample(n=200000, random_state=42)

    # -----------------------------
    # VALIDATION
    # -----------------------------
    required = set(MODEL_FEATURES + ["target"])
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing columns: {missing}")

    X = df[MODEL_FEATURES]
    y = df["target"]

    print("\nTarget distribution:")
    print(y.value_counts())

    # -----------------------------
    # SAFE SPLIT (NO STRATIFY CRASH)
    # -----------------------------
    stratify = y if y.value_counts().min() > 1 else None

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=stratify,
    )

    # -----------------------------
    # FEATURE SCALING (important for logistic)
    # -----------------------------
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # -----------------------------
    # MODELS (FAST)
    # -----------------------------
    models = {
        "logistic": LogisticRegression(
            max_iter=1000,
            solver="lbfgs"
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            n_jobs=-1,
            random_state=42
        ),
    }

    best_model = None
    best_name = ""
    best_auc = -1

    print("\nTraining models...")

    for name, model in models.items():
        model.fit(X_train_scaled, y_train)

        probs = model.predict_proba(X_test_scaled)[:, 1]
        auc = roc_auc_score(y_test, probs)

        print(f"{name} AUC: {auc:.4f}")

        if auc > best_auc:
            best_auc = auc
            best_model = model
            best_name = name

    # -----------------------------
    # FINAL EVALUATION
    # -----------------------------
    y_pred = best_model.predict(X_test_scaled)
    y_prob = best_model.predict_proba(X_test_scaled)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    metrics = {
        "accuracy": float(accuracy),
        "auc": float(auc),
    }

    print("\nBest Model:", best_name)
    print("Metrics:", metrics)

    # -----------------------------
    # SAVE ARTIFACT
    # -----------------------------
    artifact = {
        "model": best_model,
        "scaler": scaler,
        "model_name": best_name,
        "model_version": MODEL_VERSION,
        "features": MODEL_FEATURES,
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, artifact_path)

    print(f"\nModel saved to {artifact_path}")

    return artifact


# =========================
# PREDICTION FUNCTION
# =========================
def predict(artifact, input_data: dict):

    model = artifact["model"]
    scaler = artifact["scaler"]

    df = pd.DataFrame([input_data])

    # Ensure all features exist
    for col in MODEL_FEATURES:
        if col not in df:
            df[col] = 0

    X = df[MODEL_FEATURES]
    X_scaled = scaler.transform(X)

    prob = model.predict_proba(X_scaled)[0][1]

    return {
        "delay_probability": round(prob * 100, 2),
        "risk_level": (
            "Low" if prob < 0.3 else
            "Moderate" if prob < 0.6 else
            "High"
        )
    }


# =========================
# MAIN
# =========================
if __name__ == "__main__":
    artifact = train_and_save_model()

    print("\nSample Prediction:")

    sample = {
        "month": 3,
        "day_of_week": 2,
        "day_of_month": 12,
        "quarter": 1,
        "week_of_year": 11,
        "origin_freq": 500,
        "carrier_freq": 2000,
        "is_weekend": 0,
    }

    result = predict(artifact, sample)
    print(result)