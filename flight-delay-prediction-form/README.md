# Flight Delay Prediction Frontend

This directory contains the React 18 + Vite frontend for the Flight Delay Predictor app.

Use the repo-root `README.md` for:

- desktop installer and GitHub Releases guidance
- backend setup
- dataset cleaning and model training
- end-to-end development workflow

Use this file only for frontend-specific notes.

## Requirements

- Node.js 20.11+
- npm 10.2+

## Frontend Setup

```bash
npm install
cp .env.example .env
```

Default browser-mode API target:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Local Development

```bash
npm run dev
```

Vite serves the app at <http://localhost:3000>.

## Production Build

```bash
npm run build
npm run preview
```

The production bundle is written to `build/`.

## Frontend Runtime Notes

- The frontend submits a direct-route request to the backend.
- Layovers are scored in the frontend as an itinerary heuristic layer.
- In browser mode, if the API is unavailable, the app can fall back to a local `mock_fallback` prediction path.
- In packaged desktop runtime, backend failures should surface as runtime errors instead of silently falling back to `mock_fallback`.
- The default result assistant experience is client-side and grounded to the current displayed result.
- `VITE_RELEASE_UI=false` keeps developer-facing diagnostics visible in local development.
- `VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL=true` enables the optional browser-side model used only to polish grounded assistant phrasing.

## Frontend Quality Checks

```bash
npm run typecheck
npm test
```
