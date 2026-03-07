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

## Production Build

```bash
npm run build    # outputs to build/
npm run preview  # optional: serve the production build locally
```

`npm run preview` runs the optimized bundle so you can sanity-check before deploying.

## Notes

- Dependencies are locked via `package-lock.json`—make sure to commit updates whenever packages change.
- The exported UI does not call a real prediction API yet; see `src/components/FlightDelayPredictor.tsx` for the mock logic.
- Original design reference: https://www.figma.com/design/ffPYjF3nKSsDTPe9bGyTQ0/Flight-Delay-Prediction-Form--Copy-
