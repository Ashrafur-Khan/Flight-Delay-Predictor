# Flight Delay Predictor

Flight Delay Predictor is a small end-to-end app that estimates delay risk for a flight itinerary and explains the result in plain language.

The repository includes four connected parts:

- `flight-delay-prediction-form/`: React 18 + Vite frontend
- `backend/`: FastAPI prediction API, feature adaptation, and explanation services
- `data-analysis/` plus `data_analysis_runner.py`: BTS dataset cleaning pipeline
- `desktop/` plus the repo-root `package.json`: Electron desktop packaging flow

## For End Users

Mac and Windows users can now use the app without setting up Python, Node.js, or any other development dependencies.

1. Go to the repository's GitHub Releases page.
2. Download the installer for your platform:
   - macOS: `.dmg`
   - Windows: `.exe`
3. Install the app normally.
4. Launch it from your machine like any other desktop app.

At its current state, the packaged desktop app bundles the built frontend, a frozen local FastAPI backend, and the trained model artifact used by the packaged release. End users do not need to generate datasets, train the model, run a backend server, or install Python separately.

## What The App Does

At a high level:

1. The user enters a departure date and time, origin and destination airports, optional layovers, and optional weather inputs.
2. The frontend sends a direct-route request to `POST /predict`.
3. The backend normalizes those traveler-facing inputs and maps them to BTS-style operational proxy features.
4. The backend returns a delay probability, a risk label, and a grounded explanation.
5. If the user added layovers, the frontend computes an itinerary-level heuristic summary on top of the direct-route result and displays that itinerary score as the top-level result.
6. The result assistant explains the already-computed result without changing the score.


## Current Runtime Behavior

There are several scoring and explanation paths in the current codebase:

- Trained backend path:
  Used when `backend/model.pkl` exists and is compatible with the current runtime.
- Backend heuristic fallback:
  Used in local or development environments when no compatible model artifact is available.
- Frontend mock fallback:
  Used by the browser app when the API base URL is missing or the backend request fails.
- Frontend itinerary layer:
  Used whenever layovers are present. The displayed top-level result becomes the itinerary summary rather than the raw direct-route score.
- Client-side grounded assistant:
  This is the default shipped explanation experience.
- Optional local browser-model polish:
  Enabled with `VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL=true`. If it cannot initialize, the app falls back to the deterministic client-side assistant.

Desktop runtime has one important difference from browser runtime:

- The packaged desktop app must not silently fall back to `mock_fallback`. If the bundled backend cannot launch or cannot load a compatible trained model, the app should surface a runtime failure instead of pretending everything is healthy.

Release-mode UI behavior:

- Production builds enable the trimmed release UI by default.
- The release UI hides `Debug Details`, visible `Grounded Fields`, and explicit backend/fallback terminology from end users.
- Local development can force diagnostics back on with `VITE_RELEASE_UI=false`.

## Repository Layout

```text
Flight-Delay-Predictor/
├── backend/
│   ├── main.py
│   ├── service.py
│   ├── feature_adapter.py
│   ├── result_explanation_service.py
│   ├── training.py
│   ├── train_model.py
│   └── desktop_entry.py
├── data-analysis/
│   └── flight_delay_bts_analysis.py
├── desktop/
│   ├── main.js
│   ├── preload.js
│   ├── electron-builder.yml
│   ├── pyinstaller/
│   └── scripts/
├── flight-delay-prediction-form/
│   ├── src/components/
│   ├── src/services/
│   ├── src/lib/
│   └── src/types/
├── tests/
├── data_analysis_runner.py
├── package.json
├── requirements.txt
└── README.md
```

Key files:

- `flight-delay-prediction-form/src/components/FlightDelayPredictor.tsx`
  Main prediction form UI.
- `flight-delay-prediction-form/src/services/prediction.ts`
  Frontend submission flow, validation, fallback handling, and itinerary aggregation.
- `flight-delay-prediction-form/src/services/resultAssistant.ts`
  Frontend result-context builder for grounded follow-up Q&A.
- `flight-delay-prediction-form/src/services/localResultAssistant.ts`
  Default client-side grounded explainer and optional local-model polish path.
- `flight-delay-prediction-form/src/lib/runtime.ts`
  Desktop vs web runtime detection and injected API base URL handling.
- `backend/main.py`
  FastAPI entrypoint exposing `GET /`, `POST /predict`, and `POST /explain`.
- `backend/service.py`
  Normalization, feature adaptation, model inference, heuristic fallback, and debug payload assembly.
- `backend/result_explanation_service.py`
  Grounded explanation service for the optional backend `/explain` compatibility path.
- `backend/train_model.py`
  Training entrypoint that produces `backend/model.pkl`.
- `data-analysis/flight_delay_bts_analysis.py`
  BTS CSV cleaning script that produces the model-ready dataset and metadata.
- `desktop/main.js`
  Electron main process that starts the local backend and injects runtime config into the renderer.
- `desktop/scripts/build-desktop.mjs`
  End-to-end desktop build pipeline.

## Developer Setup

### Prerequisites

- Node.js 20.11+ and npm 10.2+
- Python 3.10+
- `venv`

The backend, training flow, and desktop packaging all depend on the pinned Python packages in `requirements.txt`.

### 1. Install dependencies

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

Then install frontend dependencies:

```bash
cd flight-delay-prediction-form
npm install
cp .env.example .env
cd ..
```

The browser app uses this default backend URL:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Run the app locally

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

Local URLs:

- frontend: <http://localhost:3000>
- backend: <http://localhost:8000>
- backend health: <http://localhost:8000/>

What to expect:

- If the backend is reachable, the frontend will call `POST /predict`.
- If the backend is unreachable in browser mode, the frontend can fall back to `mock_fallback`.
- If layovers are present, the displayed result becomes the itinerary-level score.
- The default shipped assistant experience is the client-side grounded explainer.

### 3. Clean the BTS dataset

Use the data cleaning script to turn a raw BTS CSV export into the model-ready dataset used by training.

If you have your own raw BTS export:

```bash
source .venv/bin/activate
python3 data-analysis/flight_delay_bts_analysis.py --input /path/to/Airline_Delay_Cause.csv
```

If you want to use the BTS CSV currently present in this repo:

```bash
source .venv/bin/activate
python3 data-analysis/flight_delay_bts_analysis.py --input backend/data/Airline_Delay_Cause.csv
```

This generates:

- `data-analysis/cleaned_bts_flight_delay_data.csv`
- `data-analysis/cleaned_bts_flight_delay_data.metadata.json`

The cleaned dataset script:

- validates required BTS columns
- filters out rows with `arr_flights <= 0`
- fills missing delay-cause columns with `0`
- derives normalized delay features
- writes dataset metadata used by training

### 4. Train the model

After the cleaned dataset exists:

```bash
source .venv/bin/activate
python3 backend/train_model.py
```

This writes:

- `backend/model.pkl`

Training behavior:

- loads the cleaned dataset and metadata
- validates the required feature schema
- trains logistic regression and random forest candidates
- calibrates the selected model
- saves the model, feature order, dataset version, and training metadata

### 5. Verify which scoring path is active

The active runtime path matters because the UI can still appear usable while a fallback is active.

Use these checks:

- `GET /` returning `"modelLoaded": true` means the backend found a compatible `backend/model.pkl`.
- If the backend is stopped and the browser UI still predicts, you are on the frontend `mock_fallback` path.
- If layovers are present, the top-level displayed score is the frontend itinerary summary rather than the raw backend direct-route score.
- In local development with `VITE_RELEASE_UI=false`, the `Debug Details` panel shows the response source and backend debug metadata.

## Testing And Verification

Backend tests:

```bash
source .venv/bin/activate
python3 -m unittest discover -s tests
```

Frontend checks:

```bash
cd flight-delay-prediction-form
npm run typecheck
npm test
npm run build
```

Desktop verification:

```bash
npm run validate:desktop-backend
npm run test:desktop:backend-smoke
```

If you change prediction logic, verify both:

- direct-route prediction still works
- itinerary aggregation still rewrites the displayed top-level result correctly

If you change the explanation flow, verify both:

- the displayed prediction stays unchanged
- release mode still hides `Grounded Fields`, debug sections, and explicit backend/fallback terminology

## Desktop Packaging

The desktop app is built from the repo root and packages:

- the production frontend build
- a frozen backend executable created with PyInstaller
- the trained model artifact expected by the packaged backend

Launch the Electron shell against the local checkout:

```bash
npm run start:desktop
```

Build a current-platform installer:

```bash
npm run build:desktop
```

That build pipeline does the following:

1. Cleans previous desktop build output.
2. Optionally stages a release model from `FLIGHT_DELAY_RELEASE_MODEL_PATH`.
3. Validates that a compatible trained model artifact is available.
4. Builds the frontend.
5. Freezes the backend.
6. Smoke-tests the frozen backend on localhost.
7. Packages the Electron app for the current platform.

Installer outputs are written to:

```text
desktop/dist/installers/
```

Platform targets:

- macOS: `.dmg`
- Windows: NSIS `.exe`
- Linux: `AppImage`

Cross-platform note:

- Build each installer on its target operating system, locally or in CI.

Optional checksum preparation for release assets:

```bash
node desktop/scripts/prepare-release-assets.mjs --extension=.dmg
node desktop/scripts/prepare-release-assets.mjs --extension=.exe
```

## Environment Variables

Frontend:

- `VITE_API_BASE_URL`
  Browser-mode API base URL.
- `VITE_RELEASE_UI`
  `true` forces the trimmed release UI, `false` keeps developer diagnostics visible.
- `VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL`
  Enables the optional client-side browser model used only to polish grounded assistant phrasing.

Optional backend `/explain` provider configuration:

- `FLIGHT_DELAY_EXPLANATION_LLM_PROVIDER`
- `FLIGHT_DELAY_EXPLANATION_LLM_API_URL`
- `FLIGHT_DELAY_EXPLANATION_LLM_API_KEY`
- `FLIGHT_DELAY_EXPLANATION_LLM_MODEL`
- `FLIGHT_DELAY_EXPLANATION_LLM_TIMEOUT_SECONDS`

If those backend explanation variables are omitted, `POST /explain` still works through the deterministic local grounded fallback.

## Generated Artifacts

These files are generated locally and are gitignored:

- `backend/model.pkl`
- `data-analysis/cleaned_bts_flight_delay_data.csv`
- `data-analysis/cleaned_bts_flight_delay_data.metadata.json`

Do not assume they will always be present on a fresh machine, new branch, or clean clone. Regenerate them when needed.

For public desktop releases, the packaged installer should include a validated trained model artifact so end users do not need to perform any of those steps themselves.

## Known Constraints

- The model is trained on BTS aggregate operational features, not raw traveler-entered flight records.
- The backend adapts traveler inputs into BTS-like proxy features heuristically.
- Connected itineraries are not sent to the backend as a learned multi-leg model input.
- Airport and weather handling are static and heuristic; there are no live external aviation or weather APIs in this repo.
- The grounded explanation layer explains the current result only. It is not a general travel copilot.
- Browser-mode fallback paths can make the UI appear healthy even when the backend is unavailable, so debugging should always confirm which path is active.

## Practical Workflow

For most development work:

1. Install Python and Node dependencies.
2. Start the backend and frontend locally.
3. Confirm whether you are on the trained-model path, backend heuristic fallback path, or frontend mock fallback path.
4. Make the smallest coherent change across the frontend and backend contract when needed.
5. Run targeted tests for the area you changed.

For model or release work:

1. Clean the BTS dataset.
2. Train `backend/model.pkl`.
3. Validate the model artifact.
4. Build the desktop installer on the target platform.
5. Verify the packaged app works on a machine without Python installed.
