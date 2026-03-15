from fastapi import FastAPI
import joblib
import numpy as np

app = FastAPI()

# load model

model = joblib.load("model.pkl")

# home

@app.get("/")
def home():
    return {"message": "Flight Delay Predictor API"}

# prediction endpoint

@app.post("/predict")
def predict(
    month: int,
    arr_flights: int,
    weather_delay_norm: float,
    nas_delay_norm: float,
    security_delay_norm: float,
    late_aircraft_delay_norm: float,
    total_delay_norm: float
):
    
    features = np.array([[
        month,
        arr_flights,
        weather_delay_norm,
        nas_delay_norm,
        security_delay_norm,
        late_aircraft_delay_norm,
        total_delay_norm
    ]])

    prob = model.predict_proba(features)[0][1]

    percent = int(prob * 100)

    analysis = ""

    if percent < 30:
        analysis = "Low delay risk based on historical system performance"
    elif percent < 60:
        analysis = "Moderate delay risk due to traffic and weather patterns"
    else:
        analysis = "High delay risk based on congestion and delay history"

    return {
        "delay_probability": percent,
        "delay_risk": (
            "Low"
            if percent < 30
            else "Moderate"
            if percent < 60
            else "High"
        ),
        "analysis": analysis
    }