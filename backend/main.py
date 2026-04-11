from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import DEFAULT_ALLOWED_ORIGINS, SERVICE_NAME
from .result_explanation_service import ResultExplanationService
from .schemas import (
    HealthResponse,
    PredictionRequest,
    PredictionResponse,
    ResultChatRequest,
    ResultChatResponse,
)
from .service import PredictionService


app = FastAPI(title=SERVICE_NAME)
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

prediction_service = PredictionService()
result_explanation_service = ResultExplanationService()


@app.get("/", response_model=HealthResponse)
def home() -> HealthResponse:
    return prediction_service.metadata()


@app.post("/predict", response_model=PredictionResponse, response_model_exclude_none=True)
def predict(payload: PredictionRequest) -> PredictionResponse:
    return prediction_service.build_response(payload)


@app.post("/explain", response_model=ResultChatResponse, response_model_exclude_none=True)
def explain_result(payload: ResultChatRequest) -> ResultChatResponse:
    return result_explanation_service.explain(payload)
