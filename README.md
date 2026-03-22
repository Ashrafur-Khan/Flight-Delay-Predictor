# Flight Delay Predictor

This repository contains a small end-to-end flight delay prediction app built from three connected parts:

- a React + Vite frontend for collecting flight details from a user
- a FastAPI backend that accepts those inputs and returns a delay-risk prediction
- a BTS-based data cleaning and model training workflow used to produce the backend model artifact

## Project Overview

At a high level, the app works like this:

1. A user enters flight details in the frontend such as departure date and time, origin and destination airports, optional layovers, flight duration, temperature, precipitation, and wind conditions.
2. The frontend sends the direct-route flight details to the backend `POST /predict` endpoint.
3. The backend converts those traveler-facing inputs into proxy features that resemble the BTS aggregate delay features used during training.
4. The backend scores the request and returns a response containing:
   - `probability`
   - `riskLevel`
   - `explanation`
   - optional `debug` details when explicitly requested
5. If the user added layovers, the frontend computes per-leg and itinerary-level connected-flight scores on top of the backend or fallback direct-route prediction.
6. The frontend renders the final result directly in the UI.

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

- If `backend/model.pkl` does not exist, the backend still returns predictions using a heuristic scoring path.
- If the frontend cannot reach the backend, the frontend falls back to a local mock prediction function so the UI still appears usable.
- If the user adds layovers, the itinerary score is always computed in the frontend, regardless of whether the direct-route prediction came from the backend or the frontend fallback.

There is also a development-only debugging path:

- In Vite development mode, the frontend asks the backend for extra scoring diagnostics.
- When the backend receives `includeDebug: true`, it returns normalized input values, derived BTS-style features, heuristic contribution breakdowns, scoring path metadata, and notes about thresholds or defaulted values.
- The frontend shows those details in a collapsible `Debug Details` panel so it is easier to tell whether the result came from the backend or the frontend fallback.
- When layovers are present, the debug panel also shows the displayed itinerary score alongside the raw backend or direct-route score.

So the repository supports a few different states:

- Full stack with trained model: frontend -> backend -> trained model + heuristic blend
- Full stack without trained model: frontend -> backend -> heuristic backend scoring
- Frontend only or broken API connection: frontend -> mock prediction fallback
- Connected itinerary mode: frontend itinerary scoring layered on top of any of the three paths above

In the repository's current default state, `backend/model.pkl` is not checked in, so local predictions run through the backend heuristic path unless you train and save a model artifact.

## Repository structure

```text
Flight-Delay-Predictor/
├── backend/
│   ├── main.py
│   ├── train_model.py
│   └── model.pkl
├── data-analysis/
│   ├── data-analysis.md
│   ├── flight_delay_bts_analysis.py
│   └── cleaned_bts_flight_delay_data.csv
├── flight-delay-prediction-form/
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── requirements.txt
└── README.md
```

### What each folder is responsible for

- `flight-delay-prediction-form/`
  The frontend app. It renders the form, normalizes airport input before submit, supports connected-flight layovers, calls the API, displays itinerary and direct-route results, and exposes a dev-only debug panel when backend debug data is available.

- `backend/`
  The API and scoring layer. It exposes `GET /` and `POST /predict`, loads `model.pkl` if present, maps normalized traveler inputs into model-style features, and can return detailed debug scoring metadata when requested.

- `data-analysis/`
  The BTS dataset cleaning and feature engineering workflow. It prepares the cleaned CSV that `backend/train_model.py` uses for model training.

## Dev Notes

### Prerequisites

#### Frontend

- Node.js 20 LTS
- npm 10.2+

#### Backend and analysis

- Python 3.10+
- `venv`
- `pip`

## Setup

### 1. Backend environment

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Frontend environment

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
6. Optionally fill in advanced factors such as duration, temperature, precipitation, and wind.
7. Click `Predict Delay Probability`.
8. Confirm the result panel shows a probability, risk level, and explanation.
9. If layovers were added, confirm the UI also shows an `Itinerary Breakdown` section with one entry per leg.

In Vite dev mode, you can also expand `Debug Details` in the result panel to inspect:

- whether the result came from the backend or the frontend mock fallback
- whether the backend model was loaded
- the normalized request values used for scoring
- the derived feature values and heuristic breakdown
- the raw direct-route score versus the displayed itinerary score when layovers are present
- backend notes explaining defaulted values or thresholds that were not crossed

### How to tell which prediction path is being used

- If the backend terminal logs a `POST /predict` request, the frontend reached the API.
- If `http://localhost:8000/` reports `"modelLoaded": true`, the backend found `backend/model.pkl`.
- If the backend is stopped and the frontend still shows a prediction, that result is coming from the frontend mock fallback.
- If layovers are present, the top-level displayed score is the frontend itinerary score rather than the raw backend direct-route score.
- In frontend dev mode, the `Debug Details` panel labels the response source as either `Backend API` or `Frontend mock fallback`.

## Data and model workflow

The model training flow is:

1. Start with a raw BTS CSV export.
2. Run `data-analysis/flight_delay_bts_analysis.py`.
3. Generate `data-analysis/cleaned_bts_flight_delay_data.csv`.
4. Run `backend/train_model.py`.
5. Save the trained model as `backend/model.pkl`.

### Generate the cleaned dataset

```bash
python3 data-analysis/flight_delay_bts_analysis.py --input /path/to/Airline_Delay_Cause.csv
```

This script:

- reads the raw BTS CSV
- drops a few unneeded columns
- filters out rows with zero arriving flights
- fills missing delay values
- creates normalized delay features
- labels rows with `high_delay`
- writes the cleaned dataset to `data-analysis/cleaned_bts_flight_delay_data.csv`

### Train the model

```bash
python3 backend/train_model.py
```

This script:

- loads `data-analysis/cleaned_bts_flight_delay_data.csv`
- trains both logistic regression and random forest models
- prints their test accuracy
- saves the random forest model to `backend/model.pkl`

## Key files

### Frontend

- `flight-delay-prediction-form/src/components/FlightDelayPredictor.tsx`
  Main form container. Holds form state, supports adding and removing layovers, submits predictions, and manages loading and error state.

- `flight-delay-prediction-form/src/services/prediction.ts`
  Frontend prediction service. Normalizes airport values, requests backend debug data in dev mode, tracks whether the response came from the backend or the frontend fallback, computes connected-itinerary leg scores, and rewrites the displayed result to the aggregate itinerary score when layovers exist.

- `flight-delay-prediction-form/src/lib/api.ts`
  Small API client wrapper around `fetch`. Builds requests from `VITE_API_BASE_URL`.

- `flight-delay-prediction-form/src/lib/airports.ts`
  Shared airport list plus helpers for display labels and airport-code normalization.

- `flight-delay-prediction-form/src/types/flight.ts`
  Shared frontend request and response types used by the form, API service, itinerary scoring, and debug UI.

- `flight-delay-prediction-form/src/components/AirportInput.tsx`
  Airport selector UI. Stores airport codes in form state while still showing user-friendly labels.

- `flight-delay-prediction-form/src/components/PredictionResult.tsx`
  Prediction result UI. Shows the main result, the connected-itinerary breakdown, and a dev-only debug panel when debug payloads are present.

- `flight-delay-prediction-form/vite.config.ts`
  Vite config, including the dev server port (`3000`).

### Backend

- `backend/main.py`
  FastAPI app entry point. Defines request and response models, CORS config, request normalization, feature adaptation logic, heuristic scoring, model loading, optional debug payload generation, and the `/predict` endpoint.

- `backend/train_model.py`
  Training script for the BTS-derived model. Reads the cleaned dataset and writes `backend/model.pkl`.

### Data analysis

- `data-analysis/flight_delay_bts_analysis.py`
  Data cleaning and feature engineering script for the raw BTS dataset.

- `data-analysis/data-analysis.md`
  Placeholder notes file for documenting dataset findings and analysis decisions.

## Current limitations

- The backend model is trained on BTS aggregate operational features rather than direct traveler-facing inputs.
- Airport and weather handling are heuristic, not driven by live aviation or weather APIs.
- The backend still uses threshold-based heuristics when no trained model artifact is present, so some input changes will not affect the result unless they cross a scoring threshold.
- Connected-flight scoring is frontend-only and heuristic. Layovers are not sent to the backend model, and the itinerary score is not a learned multi-leg prediction.
- The frontend fallback can make the UI appear functional even when the backend is unavailable, so testing should include checking backend logs, the backend health endpoint, or the dev-only debug panel.

## Current request/response contract

### Backend request contract

The frontend sends the backend a direct-route request shaped like this:

```json
{
  "departureDate": "2026-03-15",
  "departureTime": "08:30",
  "originAirport": "JFK",
  "destinationAirport": "LAX",
  "duration": "360",
  "temperature": "42",
  "precipitation": "rain",
  "wind": "moderate",
  "includeDebug": true
}
```

`includeDebug` is optional and is intended for development-time inspection.

Layovers are not part of the backend contract today.

### Backend response contract

The backend returns:

```json
{
  "probability": 47,
  "riskLevel": "moderate",
  "explanation": "...",
  "debug": {
    "pathUsed": "heuristic_only",
    "modelLoaded": false,
    "rawInput": {
      "departureDate": "2026-03-15",
      "departureTime": "08:30",
      "originAirport": "JFK",
      "destinationAirport": "LAX",
      "durationMinutes": 360,
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
    "scoreBreakdown": {
      "baseScore": 14,
      "routeContribution": 22,
      "peakContribution": 8,
      "totalDelayContribution": 45,
      "precipitationBonus": 6,
      "windBonus": 5,
      "unclampedTotal": 100,
      "clampedTotal": 95
    },
    "modelScore": null,
    "heuristicScore": 95,
    "finalProbability": 95,
    "notes": [
      "No trained model artifact loaded; using heuristic scoring only."
    ]
  }
}
```

When `includeDebug` is omitted or `false`, the backend returns the same top-level `probability`, `riskLevel`, and `explanation` fields without the `debug` object.

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
