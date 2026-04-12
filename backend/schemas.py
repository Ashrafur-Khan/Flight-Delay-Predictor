from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["low", "moderate", "high"]
PredictionPath = Literal["hybrid_blend", "model_artifact", "heuristic_fallback"]
PredictionSource = Literal["backend", "mock_fallback"]
PrecipitationType = Literal["none", "rain", "snow", "thunderstorms", "sleet"]
WindCondition = Literal["calm", "moderate", "strong"]
ChatMessageRole = Literal["user", "assistant"]


class PredictionRequest(BaseModel):
    departureDate: str = Field(..., examples=["2026-03-15"])
    departureTime: str = Field(..., examples=["08:30"])
    originAirport: str = Field(..., min_length=3, examples=["JFK"])
    destinationAirport: str = Field(..., min_length=3, examples=["LAX"])
    # Temporary compatibility shim for older clients; ignored by the backend and scheduled for removal.
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


class PredictionExplanationResult(BaseModel):
    probability: int = Field(..., ge=0, le=100)
    riskLevel: RiskLevel
    explanation: str


class PredictionExplanationLeg(BaseModel):
    originAirport: str = Field(..., min_length=3)
    destinationAirport: str = Field(..., min_length=3)
    probability: int = Field(..., ge=0, le=100)
    riskLevel: RiskLevel
    explanation: str


class PredictionExplanationItinerarySummary(BaseModel):
    legs: list[PredictionExplanationLeg]
    aggregateProbability: int = Field(..., ge=0, le=100)
    aggregateRiskLevel: RiskLevel
    aggregateExplanation: str


class PredictionExplanationContext(BaseModel):
    source: PredictionSource
    submittedRequest: PredictionRequest
    displayedResult: PredictionExplanationResult
    directRouteResult: PredictionExplanationResult | None = None
    itinerarySummary: PredictionExplanationItinerarySummary | None = None
    debug: PredictionDebugInfo | None = None


class ResultChatMessage(BaseModel):
    role: ChatMessageRole
    content: str = Field(..., min_length=1, max_length=1500)


class ResultChatRequest(BaseModel):
    predictionContext: PredictionExplanationContext
    question: str = Field(..., min_length=1, max_length=500)
    conversationHistory: list[ResultChatMessage] = Field(default_factory=list, max_length=6)


class ResultChatResponse(BaseModel):
    answer: str
    citations: list[str]
    disclaimer: str | None = None
    suggestedFollowups: list[str] | None = None
