from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["low", "moderate", "high"]
PredictionPath = Literal["hybrid_blend", "model_artifact", "heuristic_fallback"]
PrecipitationType = Literal["none", "rain", "snow", "thunderstorms", "sleet"]
WindCondition = Literal["calm", "moderate", "strong"]


class PredictionRequest(BaseModel):
    departureDate: str = Field(..., examples=["2026-03-15"])
    departureTime: str = Field(..., examples=["08:30"])
    originAirport: str = Field(..., min_length=3, examples=["JFK"])
    destinationAirport: str = Field(..., min_length=3, examples=["LAX"])
    duration: str = Field(default="")
    temperature: str = Field(default="")
    precipitation: PrecipitationType = "none"
    wind: WindCondition = "calm"
    includeDebug: bool = False


class PredictionDebugRawInput(BaseModel):
    departureDate: str
    departureTime: str
    originAirport: str
    destinationAirport: str
    durationMinutes: int
    temperatureF: int
    precipitation: PrecipitationType
    wind: WindCondition


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
    baseScore: int
    routeContribution: int
    hubBonus: int
    timeOfDayContribution: int
    totalDelayContribution: int
    precipitationBonus: int
    windBonus: int
    weatherInteractionBonus: int
    unclampedTotal: int
    clampedTotal: int


class PredictionDebugBlendInfo(BaseModel):
    heuristicProbability: int
    modelProbability: int | None = None
    rawModelDisagreement: int | None = None
    maxModelShift: int | None = None
    appliedAdjustment: int | None = None
    blendMethod: str
    reasoning: str


class PredictionDebugInfo(BaseModel):
    pathUsed: PredictionPath
    modelLoaded: bool
    modelVersion: str | None
    datasetVersion: str | None
    rawInput: PredictionDebugRawInput
    derivedFeatures: PredictionDebugDerivedFeatures
    heuristicBreakdown: PredictionDebugScoreBreakdown | None = None
    blendInfo: PredictionDebugBlendInfo | None = None
    finalProbability: int
    fallbackReason: str | None = None
    notes: list[str]


class PredictionResponse(BaseModel):
    probability: int = Field(..., ge=0, le=100)
    riskLevel: RiskLevel
    explanation: str
    debug: PredictionDebugInfo | None = None


class HealthResponse(BaseModel):
    service: str
    status: Literal["ok"]
    modelLoaded: bool
    modelVersion: str | None
    datasetVersion: str | None
    predictionMode: PredictionPath
