# Flight Delay Predictor Portable Windows

This package runs the app locally with your own Python 3.11 install. It does not include `model.pkl`; `setup-local` downloads the exact release model listed in `release-manifest.json` and verifies its SHA-256 checksum before the app starts.

## Quick Start

1. Install Python 3.11 for Windows.
2. Extract this ZIP to a normal writable folder.
3. Run `setup-local.cmd`.
4. Run `run-local.cmd`.

The app opens at `http://127.0.0.1:8000/app/` by default.

## Files

- `setup-local.cmd` / `setup-local.ps1`
  - creates `.venv`
  - installs `requirements.txt`
  - downloads `backend/model.pkl`
  - verifies the model checksum
  - validates that the model loads successfully
- `run-local.cmd` / `run-local.ps1`
  - starts the local FastAPI backend
  - waits for `GET /` to report `modelLoaded=true`
  - opens the bundled frontend in your browser

## Notes

- If `setup-local` reports a checksum mismatch, delete the extracted folder and download the release again.
- If `run-local` reports that port `8000` is busy, run `run-local.ps1 -Port 8010` instead.
- The local portable runtime does not silently fall back to the heuristic scoring path. A missing or incompatible model blocks startup.
