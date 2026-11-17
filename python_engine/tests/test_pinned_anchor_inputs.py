from __future__ import annotations

import importlib.util
from unittest.mock import patch
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "anchoring_v3" / "build_value_anchors.py"
SPEC = importlib.util.spec_from_file_location("pinned_value_anchor_builder", SCRIPT)
assert SPEC and SPEC.loader
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def load_module(name: str, script: Path):
    spec = importlib.util.spec_from_file_location(name, script)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


relation_builder = load_module("pinned_relation_builder", Path(__file__).resolve().parents[1] / "anchoring_v3" / "build_relation_anchors.py")
morpho_builder = load_module("pinned_morpho_builder", Path(__file__).resolve().parents[1] / "morpho_siglip.py")


class PinnedValueAnchorInputTests(unittest.TestCase):
    def test_pinned_metadata_never_rereads_mutable_exclusion_registry(self) -> None:
        pinned = {"excluded_sha256": "captured-exclusion-hash", "excluded_count": 3}
        for module in (builder, relation_builder):
            with self.subTest(module=module.__name__):
                with patch.object(module, "registry_sha256", side_effect=AssertionError("mutable registry read")), \
                     patch.object(module, "read_registry", side_effect=AssertionError("mutable registry read")):
                    self.assertEqual(module.exclusion_metadata(Path("unused"), pinned), ("captured-exclusion-hash", 3))

    def test_range_input_tracks_live_limits_step_default_unit_and_quantity_kind(self) -> None:
        first = {
            "technical_name": "filter_cutoff", "ui_element": "Range", "min_value": 20,
            "max_value": 200, "step": 5, "default": 100, "unit": "Hz",
            "quantity_kind": "frequency", "description_en": "low cutoff and high cutoff",
        }
        changed = {**first, "max_value": 400, "step": 10, "default": 120, "unit": "kHz", "quantity_kind": "frequency_ratio"}

        first_rows, _ = builder.build_rows([first])
        changed_rows, _ = builder.build_rows([changed])

        self.assertNotEqual(first_rows[0]["text"], changed_rows[0]["text"])
        self.assertIn("max_value=200", first_rows[0]["text"])
        self.assertIn("default=100", first_rows[0]["text"])
        self.assertIn("unit=Hz", first_rows[0]["text"])
        self.assertIn("quantity_kind=frequency", first_rows[0]["text"])

    def test_select_input_tracks_options_and_default(self) -> None:
        first = {"technical_name": "filter_mode", "ui_element": "Select", "options": ["low", "high"], "default": "low"}
        changed = {**first, "options": ["low", "high", "notch"], "default": "high"}

        _, first_rows = builder.build_rows([first])
        _, changed_rows = builder.build_rows([changed])

        self.assertNotEqual([row["text"] for row in first_rows], [row["text"] for row in changed_rows])
        self.assertIn("default option: low", first_rows[0]["text"])
        self.assertIn("notch", " ".join(row["text"] for row in changed_rows))

    def test_relation_and_morpho_bindings_use_only_the_selected_snapshot(self) -> None:
        snapshot = {"parameters": [
            {"technical_name": "new_live_cutoff", "description_en": "new current live cutoff", "retrieval_scope": "sound", "domain_layer": "SPECTRAL_DSP_LAYER"},
        ]}
        relation_names = relation_builder.matching_parameters(snapshot["parameters"], ["cutoff"])
        morpho_rows = morpho_builder.build_parameter_rows(snapshot)

        self.assertIn("new_live_cutoff", relation_names)
        self.assertNotIn("removed_historical_cutoff", relation_names)
        morpho_names = {row["technical_name"] for row in morpho_rows}
        self.assertEqual(morpho_names, {"new_live_cutoff"})
        self.assertNotIn("removed_historical_cutoff", morpho_names)
        self.assertIn("new current live cutoff", next(row["text"] for row in morpho_rows if row["technical_name"] == "new_live_cutoff"))


if __name__ == "__main__":
    unittest.main()
