from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backend.config import DEFAULT_ALLOWED_ORIGINS, DESKTOP_APP_ORIGIN
from backend.desktop_entry import main


class DesktopEntryTests(unittest.TestCase):
    def test_desktop_origin_is_allowlisted(self) -> None:
        self.assertIn(DESKTOP_APP_ORIGIN, DEFAULT_ALLOWED_ORIGINS)

    @patch("backend.desktop_entry.uvicorn.run")
    def test_desktop_entry_uses_packaged_runtime_defaults(self, run_server) -> None:
        original_env = dict(os.environ)
        self.addCleanup(lambda: os.environ.clear() or os.environ.update(original_env))

        with patch("sys.argv", ["desktop_entry.py", "--port", "9010"]):
            exit_code = main()

        self.assertEqual(exit_code, 0)
        self.assertEqual(os.environ["FLIGHT_DELAY_ENV"], "production")
        self.assertEqual(os.environ["FLIGHT_DELAY_ALLOW_HEURISTIC_FALLBACK"], "false")
        run_server.assert_called_once()
        _, kwargs = run_server.call_args
        self.assertEqual(kwargs["host"], "127.0.0.1")
        self.assertEqual(kwargs["port"], 9010)
        self.assertFalse(kwargs["access_log"])


if __name__ == "__main__":
    unittest.main()
