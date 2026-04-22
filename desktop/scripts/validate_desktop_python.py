from __future__ import annotations

import platform
import sys
import sysconfig


EXPECTED_PYTHON_MAJOR_MINOR = (3, 12)
MINIMUM_MACOS_TARGET = (12, 0)
LOWEST_SUPPORTED_ARM64_TARGET = (11, 0)


def parse_version(value: str | None) -> tuple[int, ...] | None:
    if not value:
        return None
    pieces = []
    for part in value.split("."):
        if not part.isdigit():
            break
        pieces.append(int(part))
    return tuple(pieces) if pieces else None


def validate_python_runtime() -> list[str]:
    errors: list[str] = []
    python_version = sys.version_info[:2]
    deployment_target = parse_version(sysconfig.get_config_var("MACOSX_DEPLOYMENT_TARGET"))
    machine = platform.machine()
    sys_platform = sysconfig.get_platform() or ""

    if python_version != EXPECTED_PYTHON_MAJOR_MINOR:
        errors.append(
            "Desktop macOS releases must be built with Python "
            f"{EXPECTED_PYTHON_MAJOR_MINOR[0]}.{EXPECTED_PYTHON_MAJOR_MINOR[1]}.x, "
            f"but found {python_version[0]}.{python_version[1]}.",
        )

    if machine != "arm64" and "universal2" not in sys_platform:
        errors.append(
            "Desktop macOS releases must be built with an arm64 or universal2 Python runtime, "
            f"but found machine={machine!r} platform={sys_platform!r}.",
        )

    if deployment_target is None:
        errors.append("Desktop macOS releases must report MACOSX_DEPLOYMENT_TARGET.")
    elif deployment_target > MINIMUM_MACOS_TARGET:
        actual_target = ".".join(str(piece) for piece in deployment_target) if deployment_target else "unset"
        errors.append(
            "Desktop macOS releases must not be built with a deployment target newer than 12.0, "
            f"but found {actual_target}.",
        )
    elif deployment_target < LOWEST_SUPPORTED_ARM64_TARGET:
        actual_target = ".".join(str(piece) for piece in deployment_target)
        errors.append(
            "Desktop macOS Apple Silicon builds must use a deployment target of at least 11.0, "
            f"but found {actual_target}.",
        )

    return errors


def main() -> int:
    if sys.platform != "darwin":
        print("Skipping macOS desktop Python validation on non-macOS host.")
        return 0

    errors = validate_python_runtime()
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(
        "Validated macOS desktop Python runtime:",
        f"python={sys.version.split()[0]}",
        f"machine={platform.machine()}",
        f"platform={sysconfig.get_platform()}",
        f"deployment_target={sysconfig.get_config_var('MACOSX_DEPLOYMENT_TARGET')}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
