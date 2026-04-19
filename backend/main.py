from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from .config import DEFAULT_ALLOWED_ORIGINS, SERVICE_NAME, resolve_portable_frontend_build_dir
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


def _portable_frontend_index_path() -> Path:
    frontend_dir = resolve_portable_frontend_build_dir()
    index_path = frontend_dir / "index.html"
    if not frontend_dir.exists() or not index_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Portable frontend bundle is not available on this runtime.",
        )
    return index_path


def _resolve_portable_frontend_asset(asset_path: str) -> Path:
    frontend_dir = resolve_portable_frontend_build_dir()
    index_path = _portable_frontend_index_path()

    normalized_asset_path = asset_path.lstrip("/")
    if not normalized_asset_path:
        return index_path

    candidate_path = (frontend_dir / normalized_asset_path).resolve()
    try:
        candidate_path.relative_to(frontend_dir.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Portable frontend asset not found.") from exc

    if candidate_path.is_file():
        return candidate_path

    return index_path


@app.get("/", response_model=HealthResponse)
def home() -> HealthResponse:
    return prediction_service.metadata()


@app.get("/app", include_in_schema=False)
def portable_app_root() -> RedirectResponse:
    _portable_frontend_index_path()
    return RedirectResponse(url="/app/")


@app.get("/app/", include_in_schema=False)
def portable_app_index() -> FileResponse:
    return FileResponse(_portable_frontend_index_path())


@app.get("/app/{asset_path:path}", include_in_schema=False)
def portable_app_asset(asset_path: str) -> FileResponse:
    return FileResponse(_resolve_portable_frontend_asset(asset_path))


@app.post("/predict", response_model=PredictionResponse, response_model_exclude_none=True)
def predict(payload: PredictionRequest) -> PredictionResponse:
    return prediction_service.build_response(payload)


@app.post("/explain", response_model=ResultChatResponse, response_model_exclude_none=True)
def explain_result(payload: ResultChatRequest) -> ResultChatResponse:
    return result_explanation_service.explain(payload)
