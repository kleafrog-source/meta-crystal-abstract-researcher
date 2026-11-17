from __future__ import annotations

import importlib.util
import io
import unittest
from contextlib import redirect_stderr
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "run-combinatorial-pipeline.py"
SPEC = importlib.util.spec_from_file_location("legacy_pipeline_disabled", SCRIPT)
assert SPEC and SPEC.loader
legacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(legacy)


class LegacyPipelineDisabledTests(unittest.TestCase):
    def test_entrypoint_refuses_without_touching_pipeline_files(self) -> None:
        output = io.StringIO()
        with redirect_stderr(output):
            result = legacy.main()
        self.assertEqual(result, 2)
        self.assertIn("disabled", output.getvalue())
        self.assertIn("pinned current-catalogue candidate", output.getvalue())


if __name__ == "__main__":
    unittest.main()
