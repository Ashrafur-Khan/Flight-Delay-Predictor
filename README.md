# Flight Delay Predictor

This repository currently has two pieces of work for exploring airline delay risk:

- `flight-delay-prediction-form/`: a React + Vite web UI that lets users explore a delay prediction experience. This has our completed front-end and some skeleton functionality included. 
- `data-analysis/`: notes and notebooks for experimenting with delay-related datasets (currently a placeholder).

## Prerequisites

- Node.js 20 LTS (v20.11.x). Run `nvm use` in the repo root to pick up the recommended version from `.nvmrc`.
- npm 10.2 or newer (ships with Node 20). No other package managers are required.

## Getting Started

```bash
# clone the repo, then:
cd flight-delay-prediction-form
npm install
npm run dev
```

The dev server boots on <http://localhost:3000> and will hot-reload as you edit the UI.

## Production Build & Preview

```bash
cd flight-delay-prediction-form
npm run build    # emits an optimized bundle to build/
npm run preview  # serves the production build locally
```

`npm run preview` is a handy way to confirm the static assets in `build/` behave the same way they will once deployed.

## Troubleshooting

- **Dependency errors**: Make sure `node -v` prints `v20.11.x`; reinstall via `nvm install` if needed.
- **Port already in use**: start dev with `npm run dev -- --port 4000` to override the default `3000`.
- **Fresh clone setup**: if contributors do not want to use `nvm`, they can install Node 20 manually, run `npm install` inside the app folder, and the checked-in `package-lock.json` will guarantee matching dependency versions.


