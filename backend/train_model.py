from __future__ import annotations

import json
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.training import train_and_save_model


def main() -> None:
    artifact = train_and_save_model()
    print(json.dumps(
        {
            "model_version": artifact["model_version"],
            "dataset_version": artifact["dataset_version"],
            "selected_model": artifact["selected_model"],
            "metrics": artifact["metrics"],
            "calibration_method": artifact["calibration_method"],
        },
        indent=2,
    ))


if __name__ == "__main__":
    main()
