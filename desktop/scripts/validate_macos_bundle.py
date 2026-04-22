from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


MACH_O_MARKER = "Mach-O"
DEFAULT_MIN_MACOS = (12, 0)
ALLOWED_ARCHITECTURES = {"arm64", "arm64e", "x86_64"}


def parse_version(value: str) -> tuple[int, ...]:
    return tuple(int(piece) for piece in value.split("."))


def is_macho_output(file_output: str) -> bool:
    return MACH_O_MARKER in file_output


def parse_architectures(file_output: str) -> set[str]:
    return set(re.findall(r"\b(arm64e|arm64|x86_64)\b", file_output))


def parse_minos(otool_output: str) -> tuple[int, ...] | None:
    match = re.search(r"minos\s+(\d+(?:\.\d+)*)", otool_output)
    if not match:
        return None
    return parse_version(match.group(1))


def run_command(*args: str) -> str:
    result = subprocess.run(
        args,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def iter_macho_files(root: Path) -> list[Path]:
    mach_o_files: list[Path] = []
    for candidate in sorted(path for path in root.rglob("*") if path.is_file()):
        try:
            file_output = run_command("file", str(candidate))
        except subprocess.CalledProcessError:
            continue
        if is_macho_output(file_output):
            mach_o_files.append(candidate)
    return mach_o_files


def validate_macho_file(
    file_output: str,
    otool_output: str,
    *,
    min_macos: tuple[int, ...] = DEFAULT_MIN_MACOS,
) -> list[str]:
    errors: list[str] = []
    architectures = parse_architectures(file_output)
    if not ({"arm64", "arm64e"} & architectures):
        errors.append(f"Missing required arm64 architecture in Mach-O metadata: {sorted(architectures)}")

    unsupported_architectures = architectures - ALLOWED_ARCHITECTURES
    if unsupported_architectures:
        errors.append(f"Found unsupported architectures: {sorted(unsupported_architectures)}")

    minos = parse_minos(otool_output)
    if minos is None:
        errors.append("Unable to determine LC_BUILD_VERSION minos value.")
    elif minos > min_macos:
        errors.append(
            f"Minimum macOS deployment target is {'.'.join(map(str, minos))}, "
            f"which exceeds the supported floor of {'.'.join(map(str, min_macos))}.",
        )

    return errors


def verify_code_signature(path: Path) -> list[str]:
    result = subprocess.run(
        ["codesign", "--verify", "--strict", "--verbose=2", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return []
    message = result.stderr.strip() or result.stdout.strip() or "codesign verification failed"
    return [message]


def validate_bundle(path: Path, *, require_signature: bool) -> list[str]:
    errors: list[str] = []
    for mach_o_path in iter_macho_files(path):
        file_output = run_command("file", str(mach_o_path))
        otool_output = run_command("otool", "-l", str(mach_o_path))

        for error in validate_macho_file(file_output, otool_output):
            errors.append(f"{mach_o_path}: {error}")

        if require_signature:
            for error in verify_code_signature(mach_o_path):
                errors.append(f"{mach_o_path}: {error}")

    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate packaged macOS Mach-O files for deployment target, architecture, and signatures.",
    )
    parser.add_argument("--path", required=True, type=Path)
    parser.add_argument("--require-signature", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if sys.platform != "darwin":
        print("Skipping macOS bundle validation on non-macOS host.")
        return 0

    if not args.path.exists():
        print(f"Path does not exist: {args.path}", file=sys.stderr)
        return 1

    errors = validate_bundle(args.path, require_signature=args.require_signature)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated macOS bundle compatibility for {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
