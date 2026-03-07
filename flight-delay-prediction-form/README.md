# Flight Delay Prediction Form

React + Vite implementation exported from the original Figma concept. This folder contains everything needed to run and iterate on the UI locally.

## Requirements

- Node.js 20 LTS (`v20.11.x` recommended; see project `.nvmrc`).
- npm 10.2+ (bundled with Node 20).

## Setup & Development

```bash
npm install
npm run dev
```

Visit <http://localhost:3000> to see the app. Edit files in `src/` and Vite will hot-reload automatically.

### Environment variables

Copy `.env.example` to `.env` and adjust the API base URL when the Python backend is available:

```bash
cp .env.example .env
```

- `VITE_API_BASE_URL` defaults to `http://localhost:8000` and should point to the backend endpoint that exposes `POST /predict`.

## Production Build

```bash
npm run build    # outputs to build/
npm run preview  # optional: serve the production build locally
```

`npm run preview` runs the optimized bundle so you can sanity-check before deploying.

## Quality & Type Safety

- `npm run typecheck` runs `tsc --noEmit` against the strict configuration (`tsconfig.json` + `tsconfig.node.json`).
- Path aliases mirror the Vite config so editors will no longer warn about missing Radix/shadcn declarations.

## Notes

- Dependencies are locked via `package-lock.json`—make sure to commit updates whenever packages change.
- The exported UI now calls `submitPrediction` in `src/services/prediction.ts`, which will hit the backend when configured and otherwise falls back to a local mock.
- Original design reference: https://www.figma.com/design/ffPYjF3nKSsDTPe9bGyTQ0/Flight-Delay-Prediction-Form--Copy-
