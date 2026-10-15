import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python_engine"))

from morpho_siglip import active_parameter, eligible, expressive_position, numeric_value, retrieval_text, text_hash, weighted_position  # noqa: E402

import numpy as np


class MorphoSiglipTests(unittest.TestCase):
    def test_retrieval_text_excludes_numeric_and_provenance_fields(self):
        item = {"technical_name": "dark_resonance", "description_en": "Dark resonant tone", "category": "sound", "semantic_keywords": ["shadow"], "min_value": 0, "max_value": 1, "package_id": "secret"}
        text = retrieval_text(item)
        self.assertIn("dark resonance", text); self.assertIn("shadow", text)
        self.assertNotIn("secret", text); self.assertNotIn("min_value", text)

    def test_active_parameter_starts_at_default(self):
        result = active_parameter({"technical_name": "mode", "default": ["a", "b"], "_collection": {"private": True}}, 0.42)
        self.assertEqual(result["current_value"], "a, b")
        self.assertEqual(result["source"], "default")
        self.assertNotIn("_collection", result)

    def test_active_parameter_uses_morpho_anchor(self):
        result = active_parameter(
            {"technical_name": "drive", "default": 0.2},
            0.42,
            {"value": 0.8, "source": "morpho_value_anchor", "detail": "range anchors", "anchor_target": 0.8, "value_confidence": 0.7},
        )
        self.assertEqual(result["current_value"], 0.8)
        self.assertEqual(result["source"], "morpho_value_anchor")

    def test_numeric_value_snaps_to_step(self):
        self.assertEqual(numeric_value({"min_value": 0, "max_value": 10, "step": 2}, 0.51), 6)
        self.assertEqual(numeric_value({"min_value": 0.0, "max_value": 1.0, "step": None}, 0.333333333), 0.33333333)

    def test_weighted_position_tracks_strongest_anchor(self):
        position, margin = weighted_position(np.asarray([0.1, 0.4, 0.2]), np.asarray([0.0, 0.5, 1.0]))
        self.assertAlmostEqual(position, 0.5, places=3)
        self.assertAlmostEqual(margin, 0.2)

    def test_expressive_position_can_reach_both_range_edges(self):
        levels = np.asarray([0.0, 0.25, 0.5, 0.75, 1.0])
        self.assertEqual(expressive_position(np.asarray([0.5, 0.2, 0.1, 0.0, -0.1]), levels)[0], 0.0)
        self.assertEqual(expressive_position(np.asarray([-0.1, 0.0, 0.1, 0.2, 0.5]), levels)[0], 1.0)

    def test_expressive_position_interpolates_locally_not_globally(self):
        position, _ = expressive_position(
            np.asarray([0.0, 0.1, 0.3, 0.29, 0.0]),
            np.asarray([0.0, 0.25, 0.5, 0.75, 1.0]),
        )
        self.assertGreaterEqual(position, 0.5)
        self.assertLessEqual(position, 0.625)

    def test_text_hash_is_deterministic(self):
        self.assertEqual(text_hash("same"), text_hash("same")); self.assertNotEqual(text_hash("same"), text_hash("other"))

    def test_administrative_prefix_is_rejected_even_if_scope_is_wrong(self):
        self.assertFalse(eligible({"technical_name": "validation_json_schema_lock", "retrieval_scope": "sound"}))
        self.assertTrue(eligible({"technical_name": "spectral_resonance", "retrieval_scope": "sound"}))


if __name__ == "__main__":
    unittest.main()
