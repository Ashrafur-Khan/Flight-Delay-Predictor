from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split


BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
DATASET_PATH = REPO_ROOT / "data-analysis" / "cleaned_bts_flight_delay_data.csv"
MODEL_PATH = BACKEND_DIR / "model.pkl"


if not DATASET_PATH.exists():
    raise FileNotFoundError(
        "Expected cleaned dataset at "
        f"{DATASET_PATH}. Run data-analysis/flight_delay_bts_analysis.py first."
    )


df = pd.read_csv(DATASET_PATH)

features = [
    "month",
    "arr_flights",
    "weather_delay_norm",
    "nas_delay_norm",
    "security_delay_norm",
    "late_aircraft_delay_norm",
    "total_delay_norm",
]

X = df[features]
y = df["high_delay"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
)

log_model = LogisticRegression(max_iter=1000)
log_model.fit(X_train, y_train)
log_pred = log_model.predict(X_test)
print("Logistic Accuracy:", accuracy_score(y_test, log_pred))

rf_model = RandomForestClassifier(
    n_estimators=100,
    random_state=42,
)
rf_model.fit(X_train, y_train)
rf_pred = rf_model.predict(X_test)
print("Random Forest Accuracy:", accuracy_score(y_test, rf_pred))

joblib.dump(rf_model, MODEL_PATH)
print(f"Model saved as {MODEL_PATH}")
