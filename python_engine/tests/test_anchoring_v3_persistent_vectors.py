import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ANCHORING_DIR = PROJECT_ROOT / "python_engine" / "anchoring_v3"
sys.path.insert(0, str(ANCHORING_DIR))

from anchoring import Config, _param_eid  # noqa: E402
from bridge import load_composite_index  # noqa: E402


class PersistentVectorTests(unittest.TestCase):
    def test_bridge_memory_maps_binary_vectors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [
                {"technical_name": "first"},
                {"technical_name": "second"},
            ]
            (root / "rows.json").write_text(json.dumps(rows), encoding="utf-8")
            (root / "manifest.json").write_text(
                json.dumps({
                    "parameter_count": 2,
                    "dimensions": 3,
                    "files": {"rows": "rows.json", "embeddings": "embeddings.f32"},
                }),
                encoding="utf-8",
            )
            with (root / "embeddings.f32").open("wb") as handle:
                handle.write(struct.pack("<II", 2, 3))
                handle.write(np.asarray([[1, 2, 3], [4, 5, 6]], dtype="<f4").tobytes())

            vectors, rows_by_name = load_composite_index(root)

            self.assertIsInstance(vectors, np.memmap)
            self.assertEqual(rows_by_name, {"first": 0, "second": 1})
            np.testing.assert_array_equal(vectors[1], np.asarray([4, 5, 6], dtype=np.float32))
            vectors._mmap.close()

    def test_param_eid_never_calls_embedding_client(self) -> None:
        class FailingClient:
            def embed(self, _text: str):
                raise AssertionError("parameter lookup must not call the embedding model")

        vectors = np.asarray([[0.25, 0.75]], dtype=np.float32)
        cfg = Config(
            _anchors={"stub": False},
            _param_vectors=vectors,
            _param_row_by_name={"target": 0},
            _a_home={"target": {"brightness": 0.61}},
            _ollama_client=FailingClient(),
        )

        vector, home = _param_eid("target", cfg)

        np.testing.assert_array_equal(vector, vectors[0])
        self.assertEqual(home, {"brightness": 0.61})


if __name__ == "__main__":
    unittest.main()
