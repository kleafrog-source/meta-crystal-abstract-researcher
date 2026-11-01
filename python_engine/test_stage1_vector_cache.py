from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from python_engine.vector_cache import content_key, read_vector, write_vector


class VectorCacheTests(unittest.TestCase):
    def test_content_key_changes_with_model_or_input(self):
        common = {"model": "model-a", "input_sha256": "abc", "preprocess": "v1"}
        self.assertEqual(content_key(**common), content_key(**common))
        self.assertNotEqual(content_key(**common), content_key(**{**common, "model": "model-b"}))
        self.assertNotEqual(content_key(**common), content_key(**{**common, "input_sha256": "def"}))

    def test_cache_round_trip_and_corruption_are_safe_misses(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_dir = Path(directory)
            key = content_key(model="fixture", text="hello")
            vector = np.asarray([0.25, 0.5, 0.75], dtype=np.float32)
            self.assertIsNone(read_vector(cache_dir, key))
            write_vector(cache_dir, key, vector)
            np.testing.assert_array_equal(read_vector(cache_dir, key, 3), vector)
            self.assertIsNone(read_vector(cache_dir, key, 2))
            (cache_dir / (key + ".f32")).write_bytes(b"bad")
            self.assertIsNone(read_vector(cache_dir, key))

    def test_normalized_dot_preserves_cosine_order_on_fixed_fixture(self):
        rng = np.random.default_rng(20261031)
        rows = rng.normal(size=(6552, 512)).astype(np.float32)
        rows /= np.linalg.norm(rows, axis=1, keepdims=True)
        query = rng.normal(size=512).astype(np.float32)
        query /= np.linalg.norm(query)

        # Previous per-row cosine path, expressed as one dot call per row.
        reference = np.asarray([float(np.dot(query, row)) for row in rows], dtype=np.float32)
        batched = rows @ query
        self.assertLessEqual(float(np.max(np.abs(reference - batched))), 1e-6)
        np.testing.assert_array_equal(np.argsort(-reference), np.argsort(-batched))


if __name__ == "__main__":
    unittest.main()
