# Flight Delay Predictor

This repository contains a small end-to-end flight delay prediction app built from four connected parts:

- a React + Vite frontend for collecting flight details from a user
- a FastAPI backend that accepts those inputs and returns a delay-risk prediction
- a BTS-based data cleaning and model training workflow used to produce the backend model artifact
- an Electron desktop wrapper that packages the built frontend plus a local FastAPI backend into one installable app

## Project Status

Current repo status:

- The web app and local full-stack workflow are functional.
- The client-side grounded result assistant is the default shipped explanation path.
- The Electron desktop packaging flow is implemented and verified locally.
- The repo can build a current-platform desktop installer with `npm run build:desktop`, and that command was re-verified locally for the current `0.2.0` macOS arm64 build.
- Release-mode UI now hides `Debug Details`, `Grounded Fields`, and explicit backend/fallback labels from packaged end users.

Current desktop release status:

- Local desktop packaging works from the repo.
- A macOS arm64 `.dmg` is currently available in `desktop/dist/installers/` as `flight-delay-predictor-0.2.0-mac-arm64.dmg`.
- Cross-platform packaging is configured for macOS, Windows, and Linux, but each installer still needs to be built on its target OS or in CI.
- There is no active release automation for macOS or Windows at the moment; desktop releases are still a manual process.
- There is no Windows release currently available.
- The app is not yet fully release-hardened for public download: custom icons, production signing, and macOS notarization are still pending.

## Project Overview

At a high level, the app works like this:

1. A user enters flight details in the frontend such as departure date and time, origin and destination airports, optional layovers, temperature, precipitation, and wind conditions.
2. The frontend sends the direct-route flight details to the backend `POST /predict` endpoint.
3. The backend converts those traveler-facing inputs into proxy features that resemble the BTS aggregate delay features used during training.
4. The backend scores the request and returns a response containing:
   - `probability`
   - `riskLevel`
   - `explanation`
   - optional `debug` details when explicitly requested
5. If the user added layovers, the frontend computes per-leg and itinerary-level connected-flight scores on top of the backend or fallback direct-route prediction.
6. The frontend can use the rendered result plus debug context for grounded follow-up Q&A about that result in a client-side assistant.
7. The frontend renders the final result directly in the UI.

### What the app is actually predicting

The trained model is based on BTS operational delay data, not on a dataset of real traveler-facing inputs. That means the backend does not directly predict from raw values like `JFK`, `8:30 AM`, or `rain`.

Instead, the backend includes an adaptation layer that derives approximate operational signals from the form input, such as:

- route congestion score
- peak departure traffic score
- estimated weather delay contribution
- estimated NAS delay contribution
- estimated late aircraft delay contribution

Those derived values are then used to score the request.

### Connected flights behavior

The connected flights feature is currently a frontend-only itinerary layer:

- The form lets the user add layovers in itinerary order.
- The frontend blocks clearly impossible routes such as `LAX -> LAX` before any scoring request is made.
- The backend request remains a single direct-route prediction from origin to final destination.
- When layovers are present, the frontend generates a score for each leg and an aggregate itinerary score.
- The displayed `probability`, `riskLevel`, and `explanation` are replaced with the itinerary-level result.
- The original backend or direct-route result is still preserved in the frontend response as:
  - `baseProbability`
  - `baseRiskLevel`
  - `baseExplanation`
- The UI also shows an `Itinerary Breakdown` panel with one card per leg.

This means connected-flight scoring does not change the backend model input today. It is an additional frontend heuristic layer built on top of the existing single-flight API.

### Current runtime behavior

There are three important fallbacks in the current stack:

- If `backend/model.pkl` does not exist, the backend can return predictions using a clearly labeled heuristic fallback path in local or development environments.
- If the frontend cannot reach the backend, the frontend falls back to a local mock prediction function so the UI still appears usable.
- If the user adds layovers, the itinerary score is always computed in the frontend, regardless of whether the direct-route prediction came from the backend or the frontend fallback.

There is also a development-only debugging path:

- In Vite development mode, the frontend asks the backend for extra scoring diagnostics.
- When the backend receives `includeDebug: true`, it returns normalized input values, derived BTS-style features, model and dataset metadata, scoring path metadata, fallback reasons when relevant, and notes about thresholds or defaulted values.
- Production builds use a trimmed release UI by default.
- In the release UI, the frontend hides `Debug Details`, grounded-field lists, and explicit backend/fallback labels from end users.
- If you set `VITE_RELEASE_UI=false`, the frontend shows a collapsible `Debug Details` panel so local development can still inspect the exact scoring path used for a result.
- When layovers are present, the debug panel also shows the displayed itinerary score alongside the raw backend or direct-route score.

There is also a grounded explanation path:

- The result panel includes an `Ask About This Result` assistant section after a prediction exists.
- The assistant does not rescore the flight. It only explains the current displayed result, the raw direct-route result when present, itinerary legs, and backend debug metadata when available.
- The frontend builds a structured `predictionContext` object instead of reasoning from raw user input alone.
- The default assistant path is fully client-side and deterministic.
- An optional client-side on-device LLM enhancement can be enabled in the frontend, but it is only used to rewrite or polish the grounded answer and must not change the facts.
- If the optional client-side LLM enhancement is not enabled, cannot initialize, or is blocked by browser capability or policy, the assistant falls back to the deterministic grounded explainer so the feature still works locally.

So the repository supports a few different states:

- Full stack with trained model: frontend -> backend -> trained model artifact
- Full stack without trained model in local/dev mode: frontend -> backend -> heuristic backend fallback
- Frontend only or broken API connection: frontend -> mock prediction fallback
- Result explanation assistant: frontend -> client-side grounded explanation service -> optional on-device LLM polish or deterministic fallback
- Connected itinerary mode: frontend itinerary scoring layered on top of any of the three paths above

In the repository's current default state, `backend/model.pkl` is not checked in, so local predictions use the backend heuristic fallback unless you train and save a model artifact.

For a fresh clone, you should assume these generated artifacts are missing unless you create them yourself:

- `backend/model.pkl`
- `data-analysis/cleaned_bts_flight_delay_data.csv`
- `data-analysis/cleaned_bts_flight_delay_data.metadata.json`

Those files are intentionally gitignored because they are generated from local training data.

## Repository structure

```text
Flight-Delay-Predictor/
├── desktop/
│   ├── electron-builder.yml
│   ├── main.js
│   ├── preload.js
│   ├── pyinstaller/
│   └── scripts/
├── backend/
│   ├── config.py
│   ├── desktop_entry.py
│   ├── feature_adapter.py
│   ├── main.py
│   ├── model_service.py
│   ├── normalization.py
│   ├── result_explanation_service.py
│   ├── schemas.py
│   ├── service.py
│   ├── training.py
│   ├── train_model.py
│   └── model.pkl
├── data-analysis/
│   ├── data-analysis.md
│   ├── flight_delay_bts_analysis.py
│   ├── cleaned_bts_flight_delay_data.csv
│   └── cleaned_bts_flight_delay_data.metadata.json
├── tests/
│   ├── test_adapter.py
│   ├── test_api.py
│   ├── test_desktop_entry.py
│   └── test_data_pipeline.py
├── flight-delay-prediction-form/
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── portable/
│   └── windows/
├── scripts/
│   └── build-portable-release.mjs
├── package.json
├── package-lock.json
├── requirements.txt
└── README.md
```

### What each folder is responsible for

- `flight-delay-prediction-form/`
  The frontend app. It renders the form, normalizes airport input before submit, supports connected-flight layovers, calls the API, displays itinerary and direct-route results, exposes a dev-only debug panel when backend debug data is available, and provides a grounded client-side follow-up assistant for the current result.

- `backend/`
  The API and scoring layer. It exposes `GET /`, `POST /predict`, and `POST /explain`, validates requests, normalizes user inputs, adapts them into BTS-style model features, loads a versioned model artifact when present, can return structured debug metadata when requested, and can answer grounded follow-up questions about an already-computed result.

- `data-analysis/`
  The BTS dataset cleaning and feature engineering workflow. It prepares the cleaned CSV and metadata that `backend/train_model.py` uses for model training.

- `tests/`
  Backend coverage for the adapter, the dataset pipeline, and the FastAPI surface.

- `desktop/`
  Electron desktop wrapper, backend freezing config, smoke-test scripts, and installer packaging configuration.

- `portable/`
  Windows portable ZIP templates, including PowerShell launch scripts, wrapper commands, and the portable release manifest template.

- `scripts/`
  Manual release packaging utilities, including the Windows portable ZIP assembler.

- repo-root `package.json`
  Release orchestration entrypoint for Electron packaging commands plus the manual Windows portable ZIP builder.

## Dev Notes

### Prerequisites

#### Frontend

- Node.js 20 LTS
- npm 10.2+

#### Backend and analysis

- Python 3.10+
- `venv`
- `pip`
- pinned backend runtime dependencies from `requirements.txt` are required for desktop packaging compatibility

## Setup

### 1. Backend environment

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

### 2. Generate the dataset and model artifact

Before you expect the backend to use a trained model, you need to create the cleaned dataset and train the model artifact.

Important:

- `backend/model.pkl` is not committed to the repo.
- `data-analysis/cleaned_bts_flight_delay_data.csv` is not committed to the repo.
- `data-analysis/cleaned_bts_flight_delay_data.metadata.json` is not committed to the repo.
- If you skip this step, the backend still runs locally, but it uses the heuristic fallback path instead of the trained model.

If you already have a raw BTS export, generate the cleaned dataset from the repo root:

```bash
source .venv/bin/activate
python3 data-analysis/flight_delay_bts_analysis.py --input /path/to/Airline_Delay_Cause.csv
```

If you are using the local BTS file currently present in this repo, the command is:

```bash
source .venv/bin/activate
python3 data-analysis/flight_delay_bts_analysis.py --input backend/data/Airline_Delay_Cause.csv
```

This creates:

- `data-analysis/cleaned_bts_flight_delay_data.csv`
- `data-analysis/cleaned_bts_flight_delay_data.metadata.json`

Then train the backend model artifact:

```bash
source .venv/bin/activate
python3 backend/train_model.py
```

This creates:

- `backend/model.pkl`

After training, you can verify the artifact exists by starting the backend and checking that `GET /` reports `"modelLoaded": true`.

### 3. Frontend environment

In a separate terminal:

```bash
cd flight-delay-prediction-form
npm install
cp .env.example .env
```

The default frontend API base URL is:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

If `VITE_API_BASE_URL` is missing, the frontend skips the backend call and uses its local mock prediction path.

### 4. Optional client-side result assistant model

The result assistant works without extra setup. Its default path is a deterministic grounded client-side explainer.

The frontend also supports an optional on-device LLM enhancement for the result assistant. This is disabled by default and only affects the assistant phrasing layer. It does not change scoring, probabilities, risk labels, or citations.

## Desktop Packaging

The repository now includes an Electron desktop packaging scaffold that bundles the built frontend and a local FastAPI backend executable into one installable app.

Desktop packaging expectations:

- desktop releases require a compatible trained `backend/model.pkl`
- the packaged app starts and stops the backend automatically on `127.0.0.1`
- desktop runtime does not use the frontend mock fallback when the packaged backend is unavailable
- desktop runtime uses the trimmed release UI by default, so raw grounded citation output such as `Grounded Fields` is hidden from end users

Additional desktop prerequisites:

- install root Electron packaging dependencies with `npm install` from the repo root
- ensure your Python environment includes the pinned backend dependencies from `requirements.txt`
- if desktop validation reports a model/version mismatch, reinstall `requirements.txt` or retrain `backend/model.pkl` before packaging

Launch the Electron app directly from the repo root:

```bash
npm run start:desktop
```

This starts the Electron shell against the current repo checkout. In development, it launches the backend from the repo's Python environment and loads the built frontend bundle from `flight-delay-prediction-form/build`.

Build a current-platform installer from the repo root:

```bash
npm run build:desktop
```

What this build command does:

1. Validates that `backend/model.pkl` exists and loads successfully.
2. Builds the Vite frontend.
3. Freezes the backend into a local executable with PyInstaller.
4. Smoke-tests the frozen backend on a localhost port.
5. Packages the Electron app for the current platform.

Generated installers are written to:

```text
desktop/dist/installers/
```

Desktop verification commands:

```bash
npm run validate:desktop-backend
npm run test:desktop:backend-smoke
```

Before sharing a packaged installer, verify it on a clean machine:

- install the app without Python present
- confirm the app starts without requiring dataset generation or model training
- confirm predictions work through the bundled backend
- confirm packaged desktop runtime does not silently fall back to `mock_fallback`

Current local packaging status:

- verified on macOS arm64
- local `.dmg` output is present in `desktop/dist/installers/` as `flight-delay-predictor-0.2.0-mac-arm64.dmg`
- no Windows installer has been produced yet
- packaging currently uses ad-hoc signing and does not perform notarization

Cross-platform note:

- Run `npm run build:desktop` on each target OS, locally or in CI.
- The scaffold is configured for:
  - macOS `.dmg`
  - Windows NSIS `.exe`
  - Linux `AppImage`
- The Windows Electron installer path is still deferred until a Windows builder is available.

## Windows Portable ZIP

The current supported Windows distribution path is a portable ZIP rather than a packaged Electron installer.

Portable Windows expectations:

- the ZIP bundles the prebuilt frontend and serves it from FastAPI at `http://127.0.0.1:8000/app/`
- the ZIP does not include `backend/model.pkl`
- `setup-local` downloads `model.pkl` from a pinned GitHub release asset URL and verifies its SHA-256 checksum
- `run-local` refuses to start if the model is missing, incompatible, or checksum-mismatched
- the portable runtime keeps `GET /`, `POST /predict`, and `POST /explain` unchanged

Build the Windows portable ZIP from the repo root:

```bash
npm run build:portable:windows -- --release-tag=v0.2.0 --model-url=https://github.com/Ashrafur-Khan/Flight-Delay-Predictor/releases/download/v0.2.0/model.pkl --model-sha256=<sha256>
```

This command:

1. Builds the frontend in release mode.
2. Stages the backend source, requirements, Windows launch scripts, and bundled frontend.
3. Generates `release-manifest.json` with the pinned release tag, model URL, checksum, and Python version requirement.
4. Writes a ZIP to `portable/dist/`.

Manual release flow:

1. Create the GitHub release tag.
2. Upload `model.pkl` and `model.pkl.sha256` to that release.
3. Run `npm run build:portable:windows` with the final model asset URL and checksum.
4. Upload the resulting ZIP from `portable/dist/` to the same release.

End-user Windows flow:

1. Install Python 3.11.
2. Extract the ZIP to a writable folder.
3. Run `setup-local.cmd`.
4. Run `run-local.cmd`.

The frontend also supports a release-UI toggle:

```bash
VITE_RELEASE_UI=true
```

Production builds enable the trimmed release UI by default. Set `VITE_RELEASE_UI=false` in local development if you want to keep the developer-facing diagnostics visible.

To enable the optional client-side LLM layer in the frontend:

```bash
VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL=true
```

When enabled, the frontend attempts to load a small local Transformers.js model in the browser. If the model cannot activate because WebGPU is unavailable, device capability is insufficient, CSP blocks the runtime, or model loading fails, the assistant automatically falls back to the deterministic grounded client-side explainer.

### 5. Optional backend grounded explanation provider configuration

The backend still supports an optional grounded explanation provider for `POST /explain`, but the default app experience no longer depends on it because the result assistant now works client-side.

Supported environment variables for the backend:

```bash
FLIGHT_DELAY_EXPLANATION_LLM_PROVIDER=openai_compatible
FLIGHT_DELAY_EXPLANATION_LLM_API_URL=https://api.openai.com/v1/chat/completions
FLIGHT_DELAY_EXPLANATION_LLM_API_KEY=your_api_key
FLIGHT_DELAY_EXPLANATION_LLM_MODEL=gpt-4.1-mini
FLIGHT_DELAY_EXPLANATION_LLM_TIMEOUT_SECONDS=15
```

If these are omitted, backend `POST /explain` still works locally using the deterministic grounded fallback in `backend/result_explanation_service.py`.

## Running the app locally

Start the backend from the repo root:

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

Start the frontend in another terminal:

```bash
cd flight-delay-prediction-form
npm run dev
```

The local app endpoints are:

- frontend: <http://localhost:3000>
- backend: <http://localhost:8000>
- backend health endpoint: <http://localhost:8000/>

For a desktop smoke test from the repo root:

```bash
npm run start:desktop
```

That path should launch one desktop window, start the backend automatically, and avoid the frontend `mock_fallback` path unless you are explicitly running the browser app instead of the packaged desktop runtime.

### What to expect after setup

- If you completed the dataset-generation and training steps, the backend should score requests with the trained model artifact.
- If you did not complete those steps, the backend can still run in local development, but it will use the heuristic fallback estimator instead of the trained model.
- If the frontend cannot reach the backend at all, it can still display predictions using its own frontend mock fallback.
- The result assistant works client-side by default.
- If the optional client-side LLM layer is enabled and activates successfully, it can rewrite the grounded answer locally in the browser.
- If that optional client-side LLM layer does not activate, the assistant falls back to the deterministic grounded client-side explainer.

## End-to-end test flow

For a normal local smoke test:

1. Start the backend.
2. Start the frontend.
3. Open <http://localhost:3000>.
4. Fill in the required fields:
   - departure date
   - departure time
   - origin airport
   - destination airport
5. Optionally add one or more layovers in itinerary order.
6. Optionally fill in advanced factors such as temperature, precipitation, and wind.
7. Click `Predict Delay Probability`.
8. Confirm the result panel shows a probability, risk level, and explanation.
9. If layovers were added, confirm the UI also shows an `Itinerary Breakdown` section with one entry per leg.
10. Ask a follow-up question in `Ask About This Result` and confirm the answer stays consistent with the displayed score and explanation.
11. If `VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL=true` is enabled, confirm the assistant still returns grounded answers and falls back cleanly to the deterministic client-side explainer when the local model cannot activate.
12. In release UI mode, confirm the app does not render `Debug Details`, `Grounded Fields`, or explicit backend/fallback labels.

If `VITE_RELEASE_UI=false` in local development, you can also expand `Debug Details` in the result panel to inspect:

- whether the result came from the backend or the frontend mock fallback
- whether the backend model was loaded
- the model version and dataset version used for scoring when available
- the normalized request values used for scoring
- the derived feature values
- the raw direct-route score versus the displayed itinerary score when layovers are present
- fallback reasons or backend notes explaining defaulted values or thresholds that were not crossed

The grounded assistant should follow the same source-of-truth rules:

- it must not change the displayed probability or risk label
- it should explain the displayed itinerary result separately from the raw direct-route result when layovers are present
- it should stay grounded to the current result context even when the release UI hides technical citations and disclaimers

### How to tell which prediction path is being used

- If the backend terminal logs a `POST /predict` request, the frontend reached the API.
- If `http://localhost:8000/` reports `"modelLoaded": true`, the backend found `backend/model.pkl`.
- If the backend is stopped and the frontend still shows a prediction, that result is coming from the frontend mock fallback.
- If layovers are present, the top-level displayed score is the frontend itinerary score rather than the raw backend direct-route score.
- If `VITE_RELEASE_UI=false`, the frontend `Debug Details` panel exposes the response source and debug metadata directly.

## Data and model workflow

The model training flow is:

1. Start with a raw BTS CSV export.
2. Run `data-analysis/flight_delay_bts_analysis.py`.
3. Generate `data-analysis/cleaned_bts_flight_delay_data.csv` and `data-analysis/cleaned_bts_flight_delay_data.metadata.json`.
4. Run `backend/train_model.py`.
5. Save the trained model artifact as `backend/model.pkl`.

### Generate the cleaned dataset

```bash
python3 data-analysis/flight_delay_bts_analysis.py --input /path/to/Airline_Delay_Cause.csv
```

This script:

- reads the raw BTS CSV
- validates that required BTS columns are present
- drops a few unneeded columns
- filters out rows with zero arriving flights
- fills missing delay values
- creates normalized delay features
- labels rows with `delay_event`
- writes the cleaned dataset plus metadata describing dataset version, target definition, feature names, and split strategy

### Train the model

```bash
python3 backend/train_model.py
```

This script:

- loads the cleaned dataset and dataset metadata
- trains logistic regression and random forest candidate models
- calibrates the selected model probabilities
- saves a versioned model artifact to `backend/model.pkl` with feature order and training metadata

## Key files

### Desktop packaging

- `package.json`
  Repo-root Electron packaging manifest and desktop build entrypoint.

- `desktop/main.js`
  Electron main process. Starts and monitors the bundled backend, waits for backend health, injects runtime API config into the renderer, and stops the backend when the app exits.

- `desktop/preload.js`
  Exposes the read-only desktop runtime contract to the renderer.

- `desktop/electron-builder.yml`
  Installer packaging configuration for macOS, Windows, and Linux targets.

- `desktop/pyinstaller/backend.spec`
  PyInstaller spec used to freeze the FastAPI backend for the desktop app.

- `desktop/scripts/build-desktop.mjs`
  Repo-native release pipeline for frontend build, backend freeze, smoke test, and Electron packaging.

### Frontend

- `flight-delay-prediction-form/src/components/FlightDelayPredictor.tsx`
  Main form container. Holds form state, supports adding and removing layovers, submits predictions, and manages loading and error state.

- `flight-delay-prediction-form/src/services/prediction.ts`
  Frontend prediction service. Normalizes airport values, requests backend debug data in dev mode, tracks whether the response came from the backend or the frontend fallback, computes connected-itinerary leg scores, and rewrites the displayed result to the aggregate itinerary score when layovers exist.

- `flight-delay-prediction-form/src/services/resultAssistant.ts`
  Frontend explanation service. Builds a grounded explanation context from the current rendered result, derives suggested prompts, and routes follow-up questions into the client-side assistant flow.

- `flight-delay-prediction-form/src/services/localResultAssistant.ts`
  Client-side grounded result assistant. Generates deterministic answers from structured prediction context and can optionally use a small local browser model to polish the answer when explicitly enabled.

- `flight-delay-prediction-form/src/lib/api.ts`
  Small API client wrapper around `fetch`. Builds requests from either `VITE_API_BASE_URL`, the runtime API base URL injected by Electron, or the current same-origin host when the portable bundle is served from `/app/`.

- `flight-delay-prediction-form/src/lib/runtime.ts`
  Runtime-detection helpers for distinguishing desktop vs web execution and reading Electron-provided API configuration.

- `flight-delay-prediction-form/src/lib/airports.ts`
  Shared airport list plus helpers for display labels and airport-code normalization. The shipped list is derived from the local BTS airport catalog in `backend/data/Airline_Delay_Cause.csv`, so the UI supports the full set of airports represented in the dataset.

- `flight-delay-prediction-form/src/types/flight.ts`
  Shared frontend request and response types used by the form, API service, itinerary scoring, and debug UI.

- `flight-delay-prediction-form/src/components/AirportInput.tsx`
  Airport selector UI. Stores airport codes in form state while still showing user-friendly labels.

- `flight-delay-prediction-form/src/components/PredictionResult.tsx`
  Prediction result UI. Shows the main result, the grounded follow-up assistant, the connected-itinerary breakdown, and a dev-only debug panel when debug payloads are present.

- `flight-delay-prediction-form/src/components/ResultAssistant.tsx`
  Grounded result-chat UI. Lets the user ask follow-up questions about the current result without changing the underlying score. In release mode it hides raw grounded citation output such as `Grounded Fields`.

- `flight-delay-prediction-form/vite.config.ts`
  Vite config, including the dev server port (`3000`).

### Backend

- `backend/main.py`
  FastAPI app entry point. Wires up CORS, the health endpoint, the `/predict` endpoint, the `/explain` endpoint, and the portable `/app/` frontend-serving path.

- `backend/desktop_entry.py`
  Desktop-only backend launcher used by Electron and PyInstaller. Starts the packaged FastAPI service on a caller-provided localhost port.

- `backend/portable_entry.py`
  Portable Windows backend launcher. Starts the local FastAPI service on `127.0.0.1` with heuristic fallback disabled.

- `backend/service.py`
  Orchestrates request normalization, feature adaptation, trained-model inference, local heuristic fallback, and debug response assembly.

- `backend/result_explanation_service.py`
  Builds grounded explanation context, applies source-aware guardrails, and routes result Q&A to either an external OpenAI-compatible provider or the deterministic local fallback explainer.

- `backend/feature_adapter.py`
  Converts traveler-facing single-leg inputs into the fixed BTS-style feature vector expected by the trained model.

- `backend/train_model.py`
  Training entry point for the BTS-derived model artifact.

### Data analysis

- `data-analysis/flight_delay_bts_analysis.py`
  Data cleaning and feature engineering script for the raw BTS dataset.

- `data-analysis/data-analysis.md`
  Placeholder notes file for documenting dataset findings and analysis decisions.

## Current limitations

- The backend model is trained on BTS aggregate operational features rather than direct traveler-facing inputs.
- Airport and weather handling are heuristic, not driven by live aviation or weather APIs.
- The backend still uses a local/dev heuristic fallback when no trained model artifact is present.
- The grounded explanation layer is scoped to explaining the current result. It is not a general travel-planning copilot and it does not fetch live travel or weather data.
- Connected-flight scoring is frontend-only and heuristic. Layovers are not sent to the backend model, and the itinerary score is not a learned multi-leg prediction.
- The frontend fallback can make the UI appear functional even when the backend is unavailable, so testing should include checking backend logs, the backend health endpoint, or the dev-only debug panel.
- The desktop app is verified locally on macOS but is not yet polished for public distribution. Releases are still manual, the Windows Electron installer is still deferred, and it still needs custom icons, production signing, and macOS notarization.
- The current Windows release path is the portable ZIP, which requires a local Python 3.11 install.

## Current request/response contract

### Backend request contract

The frontend sends the backend a direct-route request shaped like this:

```json
{
  "departureDate": "2026-03-15",
  "departureTime": "08:30",
  "originAirport": "JFK",
  "destinationAirport": "LAX",
  "temperature": "42",
  "precipitation": "rain",
  "wind": "moderate",
  "includeDebug": true
}
```

`includeDebug` is optional and is intended for development-time inspection.

During the current compatibility window, older clients may still send `duration`, but the backend ignores it and does not include it in normalized state or debug output.

Layovers are not part of the backend contract today.

### Backend grounded explanation request contract

The frontend sends the backend a grounded result-chat request shaped like this:

```json
{
  "predictionContext": {
    "source": "backend",
    "submittedRequest": {
      "departureDate": "2026-03-15",
      "departureTime": "08:30",
      "originAirport": "JFK",
      "destinationAirport": "LAX",
      "temperature": "42",
      "precipitation": "rain",
      "wind": "moderate",
      "includeDebug": true
    },
    "displayedResult": {
      "probability": 60,
      "riskLevel": "moderate",
      "explanation": "..."
    },
    "directRouteResult": {
      "probability": 47,
      "riskLevel": "moderate",
      "explanation": "..."
    },
    "itinerarySummary": {
      "aggregateProbability": 60,
      "aggregateRiskLevel": "moderate",
      "aggregateExplanation": "...",
      "legs": [
        {
          "originAirport": "JFK",
          "destinationAirport": "ORD",
          "probability": 58,
          "riskLevel": "moderate",
          "explanation": "..."
        }
      ]
    },
    "debug": {
      "pathUsed": "hybrid_blend",
      "modelLoaded": true,
      "modelVersion": "demo-model",
      "datasetVersion": "demo-dataset",
      "rawInput": {
        "departureDate": "2026-03-15",
        "departureTime": "08:30",
        "originAirport": "JFK",
        "destinationAirport": "LAX",
        "temperatureF": 42,
        "precipitation": "rain",
        "wind": "moderate"
      },
      "derivedFeatures": {
        "month": 3,
        "arr_flights": 136,
        "weather_delay_norm": 0.14,
        "nas_delay_norm": 0.257,
        "security_delay_norm": 0.0163,
        "late_aircraft_delay_norm": 0.0925,
        "total_delay_norm": 0.5058,
        "route_congestion_score": 0.75,
        "peak_departure_score": 0.35
      },
      "finalProbability": 47,
      "notes": [
        "..."
      ]
    }
  },
  "question": "Explain the itinerary impact.",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Why is this risk moderate?"
    }
  ]
}
```

`predictionContext` is the source of truth for the assistant. The backend explanation layer should not infer from raw form input alone.

### Backend response contract

The backend returns:

```json
{
  "probability": 47,
  "riskLevel": "moderate",
  "explanation": "...",
  "debug": {
    "pathUsed": "heuristic_fallback",
    "modelLoaded": false,
    "modelVersion": null,
    "datasetVersion": null,
    "rawInput": {
      "departureDate": "2026-03-15",
      "departureTime": "08:30",
      "originAirport": "JFK",
      "destinationAirport": "LAX",
      "temperatureF": 42,
      "precipitation": "rain",
      "wind": "moderate"
    },
    "derivedFeatures": {
      "month": 3,
      "arr_flights": 136,
      "weather_delay_norm": 0.14,
      "nas_delay_norm": 0.257,
      "security_delay_norm": 0.0163,
      "late_aircraft_delay_norm": 0.0925,
      "total_delay_norm": 0.5058,
      "route_congestion_score": 0.75,
      "peak_departure_score": 0.35
    },
    "finalProbability": 95,
    "fallbackReason": "No compatible trained model artifact is available; using the development fallback estimator.",
    "notes": [
      "No compatible trained model artifact is available; using the development fallback estimator."
    ]
  }
}
```

When `includeDebug` is omitted or `false`, the backend returns the same top-level `probability`, `riskLevel`, and `explanation` fields without the `debug` object.

### Backend grounded explanation response contract

The backend returns:

```json
{
  "answer": "...",
  "citations": [
    "displayedResult.probability",
    "displayedResult.explanation",
    "debug.pathUsed",
    "itinerarySummary.legs"
  ],
  "disclaimer": "This answer is grounded in the backend hybrid blend path, where the trained model can only make a bounded adjustment to the heuristic score.",
  "suggestedFollowups": [
    "Which factors mattered most here?",
    "Summarize this result in plain language.",
    "Explain the itinerary impact."
  ]
}
```

`disclaimer` is optional and appears when the result source or scoring path requires extra guardrails, such as frontend mock fallback or heuristic fallback.

The frontend keeps these fields in its internal assistant pipeline for grounding, but the trimmed release UI does not display the raw `disclaimer` or `citations` values to the user.

### Frontend-augmented response shape for connected itineraries

When layovers are present, the frontend augments the direct-route result before rendering it. The displayed object can also include:

```json
{
  "baseProbability": 47,
  "baseRiskLevel": "moderate",
  "baseExplanation": "...",
  "itinerarySummary": {
    "legs": [
      {
        "from": "JFK",
        "to": "ORD",
        "probability": 58,
        "riskLevel": "moderate",
        "explanation": "..."
      },
      {
        "from": "ORD",
        "to": "LAX",
        "probability": 51,
        "riskLevel": "moderate",
        "explanation": "..."
      }
    ],
    "aggregateProbability": 60,
    "aggregateRiskLevel": "moderate",
    "aggregateExplanation": "..."
  }
}
```

In that case, the rendered top-level `probability`, `riskLevel`, and `explanation` shown in the UI come from `itinerarySummary`, while the original direct-route result remains available in the `base*` fields.
