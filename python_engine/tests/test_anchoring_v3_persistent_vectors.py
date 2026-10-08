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

from anchoring import Config, _best_query_embedding, _param_eid, _value_anchor_apply  # noqa: E402
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

    def test_range_value_anchor_interpolates_toward_matching_level(self) -> None:
        vectors = np.asarray([
            [1.0, 0.0], [0.9, 0.1], [0.7, 0.7], [0.1, 0.9], [0.0, 1.0],
        ], dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
        cfg = Config(
            threshold_range=0.2,
            _value_anchor_vectors=vectors,
            _value_anchor_parameters={"amount": [
                {"row_index": index, "level": level}
                for index, level in enumerate((0.0, 0.25, 0.5, 0.75, 1.0))
            ]},
        )
        result = _value_anchor_apply(
            [0.0, 1.0],
            {"technical_name": "amount", "ui_element": "Range", "min_value": 0, "max_value": 100, "step": 1},
            cfg,
        )
        self.assertIsNotNone(result)
        self.assertGreater(result[0], 75)

    def test_select_value_anchor_chooses_best_option(self) -> None:
        cfg = Config(
            threshold_select=0.2,
            _select_option_vectors=np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32),
            _select_option_parameters={"mode": [
                {"row_index": 0, "option": "soft"},
                {"row_index": 1, "option": "hard"},
            ]},
        )
        result = _value_anchor_apply(
            [0.05, 0.99], {"technical_name": "mode", "ui_element": "Select"}, cfg,
        )
        self.assertIsNotNone(result)
        self.assertEqual(result[0], "hard")

    def test_parameter_uses_the_closest_query_concept(self) -> None:
        cfg = Config(
            _anchors={},
            _param_vectors=np.asarray([[0.0, 1.0]], dtype=np.float32),
            _param_row_by_name={"resonance": 0},
        )

        vector, concept_index = _best_query_embedding(
            [[1.0, 0.0], [0.05, 0.99]], "resonance", cfg,
        )

        self.assertEqual(concept_index, 1)
        self.assertEqual(vector, [0.05, 0.99])

    def test_relation_hint_biases_range_anchor_direction(self) -> None:
        vectors = np.asarray([
            [1.0, 0.0], [0.9, 0.1], [0.7, 0.7], [0.1, 0.9], [0.0, 1.0],
        ], dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
        cfg = Config(
            threshold_range=0.2,
            _value_anchor_vectors=vectors,
            _value_anchor_parameters={"amount": [
                {"row_index": index, "level": level}
                for index, level in enumerate((0.0, 0.25, 0.5, 0.75, 1.0))
            ]},
        )
        neutral = _value_anchor_apply(
            [0.7, 0.7],
            {"technical_name": "amount", "ui_element": "Range", "min_value": 0, "max_value": 100, "step": 1},
            cfg,
        )
        biased = _value_anchor_apply(
            [0.7, 0.7],
            {"technical_name": "amount", "ui_element": "Range", "min_value": 0, "max_value": 100, "step": 1},
            cfg,
            direction_hint=1.0,
        )

        self.assertIsNotNone(neutral)
        self.assertIsNotNone(biased)
        self.assertGreater(biased[0], neutral[0])


if __name__ == "__main__":
    unittest.main()
