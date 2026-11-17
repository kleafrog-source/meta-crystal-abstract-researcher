from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "anchoring_v3" / "build_value_anchors.py"
SPEC = importlib.util.spec_from_file_location("gemma_value_builder", SCRIPT)
assert SPEC and SPEC.loader
value_builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(value_builder)


class GemmaValueCheckpointTests(unittest.TestCase):
    def test_range_or_select_checkpoint_resumes_and_rejects_a_different_operation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest = root / "select-options.json"
            vectors = root / "select-options.f32"
            rows = [
                {"row_index": index, "anchor_key": f"p:{index}", "text_sha256": f"sha-{index}", "text": f"option {index}", "option": f"option {index}", "technical_name": f"p{index}"}
                for index in range(3)
            ]
            calls: list[list[str]] = []

            def fail_second(endpoint: str, model: str, texts: list[str], timeout: int) -> list[list[float]]:
                calls.append(texts)
                if len(calls) == 2:
                    raise RuntimeError("fixture interruption")
                return [[1.0, 0.0] for _ in texts]

            with patch.object(value_builder, "embed_batch", side_effect=fail_second):
                with self.assertRaisesRegex(RuntimeError, "fixture interruption"):
                    value_builder.build_artifact(label="select_fixture", rows=rows, manifest_path=manifest,
                        vectors_path=vectors, endpoint="http://localhost:11434", model="embeddinggemma-2:740m",
                        dimensions=2, batch_size=1, timeout=1, operation_identity_sha256="operation-a")
            self.assertEqual(1, value_builder.read_json(manifest.with_suffix(".json.building"))["completed"])

            resumed: list[list[str]] = []
            with patch.object(value_builder, "embed_batch", side_effect=lambda _e, _m, texts, _t: resumed.append(texts) or [[0.0, 1.0] for _ in texts]):
                value_builder.build_artifact(label="select_fixture", rows=rows, manifest_path=manifest,
                    vectors_path=vectors, endpoint="http://localhost:11434", model="embeddinggemma-2:740m",
                    dimensions=2, batch_size=1, timeout=1, operation_identity_sha256="operation-a")
            self.assertEqual(2, sum(map(len, resumed)))
            self.assertTrue(manifest.is_file())
            self.assertTrue(vectors.is_file())

            with self.assertRaisesRegex(RuntimeError, "another candidate operation"):
                value_builder.build_artifact(label="select_fixture", rows=rows, manifest_path=manifest,
                    vectors_path=vectors, endpoint="http://localhost:11434", model="embeddinggemma-2:740m",
                    dimensions=2, batch_size=1, timeout=1, operation_identity_sha256="operation-b")


if __name__ == "__main__":
    unittest.main()
