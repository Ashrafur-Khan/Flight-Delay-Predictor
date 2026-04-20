from __future__ import annotations

import sys
import warnings
from pathlib import Path

from sklearn.exceptions import InconsistentVersionWarning


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.config import MODEL_ARTIFACT_PATH
from backend.model_service import load_model_artifact


def main() -> int:
    if not MODEL_ARTIFACT_PATH.exists():
        print(f"Missing required trained model artifact: {MODEL_ARTIFACT_PATH}", file=sys.stderr)
        return 1

    with warnings.catch_warnings(record=True) as captured_warnings:
        warnings.simplefilter("always")
        artifact = load_model_artifact()

    if artifact is None:
        print(
            f"Model artifact is present but incompatible with runtime expectations: {MODEL_ARTIFACT_PATH}",
            file=sys.stderr,
        )
        return 1

    version_warnings = [
        warning
        for warning in captured_warnings
        if issubclass(warning.category, InconsistentVersionWarning)
    ]
    if version_warnings:
        print(
            "Model artifact version mismatch detected. Reinstall the pinned requirements or retrain the model artifact "
            "before building a desktop release.",
            file=sys.stderr,
        )
        for message in sorted({str(warning.message) for warning in version_warnings}):
            print(message, file=sys.stderr)
        return 1

    print(
        "Validated backend release artifact:",
        f"model={artifact.selected_model}",
        f"modelVersion={artifact.model_version}",
        f"datasetVersion={artifact.dataset_version}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
