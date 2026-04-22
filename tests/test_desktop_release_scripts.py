from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]


def load_module(module_name: str, relative_path: str):
    module_path = REPO_ROOT / relative_path
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


desktop_python_validator = load_module(
    "validate_desktop_python",
    "desktop/scripts/validate_desktop_python.py",
)
macos_bundle_validator = load_module(
    "validate_macos_bundle",
    "desktop/scripts/validate_macos_bundle.py",
)


class DesktopPythonValidatorTests(unittest.TestCase):
    def test_parse_version_handles_missing_value(self) -> None:
        self.assertIsNone(desktop_python_validator.parse_version(None))

    @patch.object(desktop_python_validator.platform, "machine", return_value="arm64")
    @patch.object(desktop_python_validator.sysconfig, "get_platform", return_value="macosx-12.0-arm64")
    @patch.object(desktop_python_validator.sysconfig, "get_config_var", return_value="12.0")
    @patch.object(desktop_python_validator.sys, "version_info", (3, 12, 4, "final", 0))
    def test_validate_python_runtime_accepts_pinned_release_toolchain(self, *_mocks) -> None:
        self.assertEqual(desktop_python_validator.validate_python_runtime(), [])

    @patch.object(desktop_python_validator.platform, "machine", return_value="arm64")
    @patch.object(desktop_python_validator.sysconfig, "get_platform", return_value="macosx-11.1-arm64")
    @patch.object(desktop_python_validator.sysconfig, "get_config_var", return_value="11.1")
    @patch.object(desktop_python_validator.sys, "version_info", (3, 12, 4, "final", 0))
    def test_validate_python_runtime_accepts_older_compatible_deployment_target(self, *_mocks) -> None:
        self.assertEqual(desktop_python_validator.validate_python_runtime(), [])

    @patch.object(desktop_python_validator.platform, "machine", return_value="x86_64")
    @patch.object(desktop_python_validator.sysconfig, "get_platform", return_value="macosx-14.0-x86_64")
    @patch.object(desktop_python_validator.sysconfig, "get_config_var", return_value="14.0")
    @patch.object(desktop_python_validator.sys, "version_info", (3, 13, 0, "final", 0))
    def test_validate_python_runtime_rejects_wrong_version_arch_and_target(self, *_mocks) -> None:
        errors = desktop_python_validator.validate_python_runtime()
        self.assertEqual(len(errors), 3)
        self.assertTrue(any("Python 3.12.x" in error for error in errors))
        self.assertTrue(any("arm64 or universal2" in error for error in errors))
        self.assertTrue(any("newer than 12.0" in error for error in errors))


class MacOSBundleValidatorTests(unittest.TestCase):
    def test_parse_architectures_detects_arm64(self) -> None:
        output = "Mach-O 64-bit executable arm64"
        self.assertEqual(macos_bundle_validator.parse_architectures(output), {"arm64"})

    def test_parse_minos_extracts_build_target(self) -> None:
        otool_output = """
        Load command 10
              cmd LC_BUILD_VERSION
          cmdsize 32
         platform 1
            minos 12.0
              sdk 14.4
        """
        self.assertEqual(macos_bundle_validator.parse_minos(otool_output), (12, 0))

    def test_validate_macho_file_rejects_newer_macos_floor(self) -> None:
        errors = macos_bundle_validator.validate_macho_file(
            "Mach-O 64-bit executable arm64",
            """
            Load command 10
                  cmd LC_BUILD_VERSION
                minos 14.0
            """,
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("exceeds the supported floor", errors[0])

    def test_validate_macho_file_rejects_wrong_architecture(self) -> None:
        errors = macos_bundle_validator.validate_macho_file(
            "Mach-O 64-bit executable x86_64",
            """
            Load command 10
                  cmd LC_BUILD_VERSION
                minos 12.0
            """,
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("Missing required arm64 architecture", errors[0])


if __name__ == "__main__":
    unittest.main()
