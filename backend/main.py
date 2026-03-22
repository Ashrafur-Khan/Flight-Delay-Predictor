from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal, Dict, Any
import joblib
from pathlib import Path
import datetime

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"

# ----------------------------
# Pydantic models
# ----------------------------
class PredictionRequest(BaseModel):
    departureDate: str
    departureTime: str
    originAirport: str
    destinationAirport: str
    duration: Optional[str] = ""
    temperature: Optional[str] = ""
    precipitation: Literal["none", "rain", "snow", "thunderstorms", "sleet"] = "none"
    wind: Literal["calm", "moderate", "strong"] = "calm"
    includeDebug: Optional[bool] = False

class PredictionDebugRawInput(BaseModel):
    departureDate: str
    departureTime: str
    originAirport: str
    destinationAirport: str
    durationMinutes: int
    temperatureF: int
    precipitation: str
    wind: str

class PredictionDebugDerivedFeatures(BaseModel):
    month: int
    arr_flights: int
    weather_delay_norm: float
    nas_delay_norm: float
    security_delay_norm: float
    late_aircraft_delay_norm: float
    total_delay_norm: float
    route_congestion_score: float
    peak_departure_score: float

class PredictionDebugScoreBreakdown(BaseModel):
    baseScore: float
    routeContribution: float
    peakContribution: float
    totalDelayContribution: float
    precipitationBonus: float
    windBonus: float
    unclampedTotal: float
    clampedTotal: float

class PredictionDebugInfo(BaseModel):
    pathUsed: Literal["heuristic_only", "model_plus_heuristic"]
    modelLoaded: bool
    rawInput: PredictionDebugRawInput
    derivedFeatures: PredictionDebugDerivedFeatures
    scoreBreakdown: PredictionDebugScoreBreakdown
    modelScore: Optional[float]
    heuristicScore: float
    finalProbability: float
    notes: list[str]

class PredictionResponse(BaseModel):
    probability: float
    riskLevel: Literal["low", "moderate", "high"]
    explanation: str
    debug: Optional[PredictionDebugInfo] = None
    source: Optional[Literal["backend", "mock_fallback"]] = "backend"
    submittedRequest: Optional[PredictionRequest] = None

# ----------------------------
# Load model
# ----------------------------
try:
    model = joblib.load(MODEL_PATH)
    model_loaded = True
except Exception as e:
    print("Failed to load model:", e)
    model = None
    model_loaded = False

# ----------------------------
# App setup
# ----------------------------
app = FastAPI(title="Flight Delay Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# Health check
# ----------------------------
@app.get("/")
def health_check():
    return {"message": "Flight Delay Predictor API", "modelLoaded": model_loaded}

# ----------------------------
# Predict endpoint
# ----------------------------
@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    # Convert raw input
    duration = int(request.duration) if request.duration else 0
    temperature = int(request.temperature) if request.temperature else 70

    raw_input = PredictionDebugRawInput(
        departureDate=request.departureDate,
        departureTime=request.departureTime,
        originAirport=request.originAirport,
        destinationAirport=request.destinationAirport,
        durationMinutes=duration,
        temperatureF=temperature,
        precipitation=request.precipitation,
        wind=request.wind,
    )

    # ----------------------------
    # Heuristic scoring
    # ----------------------------
    probability = 25
    factors = []

    hour = int(request.departureTime.split(":")[0])
    if 6 <= hour <= 9:
        probability += 12
        factors.append("morning rush hour")
    elif 17 <= hour <= 20:
        probability += 15
        factors.append("evening peak hours")

    if request.precipitation == "snow":
        probability += 35
        factors.append("winter weather conditions")
    elif request.precipitation == "thunderstorms":
        probability += 30
        factors.append("severe weather")
    elif request.precipitation == "rain":
        probability += 15
        factors.append("rain conditions")

    if request.wind == "strong":
        probability += 20
        factors.append("strong winds")
    elif request.wind == "moderate":
        probability += 10

    if duration > 300:
        probability += 8
        factors.append("long-haul flight")

    probability = min(95, max(5, probability))
    if probability < 30:
        risk_level = "low"
    elif probability < 70:
        risk_level = "moderate"
    else:
        risk_level = "high"

    explanation = (
        f"Based on flight details, there's a {risk_level} delay risk due to {', '.join(factors)}."
        if factors
        else "Based on flight details, conditions appear favorable."
    )

    debug_info = None
    if request.includeDebug:
        # Optional detailed debug info
        debug_info = PredictionDebugInfo(
            pathUsed="heuristic_only" if not model_loaded else "model_plus_heuristic",
            modelLoaded=model_loaded,
            rawInput=raw_input,
            derivedFeatures=PredictionDebugDerivedFeatures(
                month=datetime.datetime.strptime(request.departureDate, "%Y-%m-%d").month,
                arr_flights=0,
                weather_delay_norm=0.0,
                nas_delay_norm=0.0,
                security_delay_norm=0.0,
                late_aircraft_delay_norm=0.0,
                total_delay_norm=0.0,
                route_congestion_score=0.0,
                peak_departure_score=0.0,
            ),
            scoreBreakdown=PredictionDebugScoreBreakdown(
                baseScore=25,
                routeContribution=0,
                peakContribution=0,
                totalDelayContribution=0,
                precipitationBonus=0,
                windBonus=0,
                unclampedTotal=probability,
                clampedTotal=probability,
            ),
            modelScore=None,
            heuristicScore=probability,
            finalProbability=probability,
            notes=[],
        )

    return PredictionResponse(
        probability=probability,
        riskLevel=risk_level,
        explanation=explanation,
        debug=debug_info,
        source="backend",
        submittedRequest=request,
    )