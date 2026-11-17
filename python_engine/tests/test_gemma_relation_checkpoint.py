from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "anchoring_v3" / "build_relation_anchors.py"
SPEC = importlib.util.spec_from_file_location("gemma_relation_builder", SCRIPT)
assert SPEC and SPEC.loader
relations = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relations)


class GemmaRelationCheckpointTests(unittest.TestCase):
    def test_resumes_only_unsaved_relation_rows_and_rejects_identity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "relations"
            rows = [{"row_index": index, "text": f"relation {index}"} for index in range(3)]
            first_calls: list[list[str]] = []

            def fail_after_one(endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
                first_calls.append(texts)
                if len(first_calls) == 2:
                    raise RuntimeError("fixture interruption")
                return [[1.0, 0.0] for _ in texts]

            with self.assertRaisesRegex(RuntimeError, "fixture interruption"):
                relations.build_checkpointed_vectors(output, rows, endpoint="http://localhost:11434",
                    model="embeddinggemma-2:740m", identity_sha256="operation-a", batch_size=1, embedder=fail_after_one)
            progress = relations.read_json(output / "vectorization-progress.json")
            self.assertEqual(1, progress["completed_count"])
            self.assertEqual(["relation 0", "relation 1"], [call[0] for call in first_calls])

            resumed_calls: list[list[str]] = []
            vector_path, dimensions = relations.build_checkpointed_vectors(output, rows, endpoint="http://localhost:11434",
                model="embeddinggemma-2:740m", identity_sha256="operation-a", batch_size=1,
                embedder=lambda _endpoint, _model, texts: resumed_calls.append(texts) or [[0.0, 1.0] for _ in texts])
            self.assertEqual(2, sum(map(len, resumed_calls)))
            self.assertTrue(vector_path.is_file())
            self.assertEqual(2, dimensions)

            (output / "embeddings.f32").rename(output / "embeddings.f32.building")
            relations.write_json_atomic(output / "vectorization-progress.json", {
                **progress, "identity_sha256": "old", "operation_identity_sha256": "old",
            })
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                relations.build_checkpointed_vectors(output, rows, endpoint="http://localhost:11434",
                    model="embeddinggemma-2:740m", identity_sha256="operation-a", embedder=lambda *_: [])


if __name__ == "__main__":
    unittest.main()
