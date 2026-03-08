import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

# load cleaned dataset

df = pd.read_csv("../cleaned_bts_flight_delay_data.csv")

# select features

features = [
    "month",
    "arr_flights",
    "weather_delay_norm",
    "nas_delay_norm",
    "security_delay_norm",
    "late_aircraft_delay_norm",
    "total_delay_norm"
]

X = df[features]
y = df["high_delay"]

# train/test split

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size = 0.2,
    random_state = 42
)

# logistic regression

log_model = LogisticRegression(max_iter = 1000)
log_model.fit(X_train, y_train)

log_pred = log_model.predict(X_test)

print("Logistic Accuracy:", accuracy_score(y_test, log_pred))

# random forest

rf_model = RandomForestClassifier(
    n_estimators = 100,
    random_state = 42
)

rf_model.fit(X_train, y_train)

rf_pred = rf_model.predict(X_test)

print("Random Forest Accuracy:", accuracy_score(y_test, rf_pred))

# save best model

joblib.dump(rf_model, "model.pkl")

print("Model saved as model.pkl")