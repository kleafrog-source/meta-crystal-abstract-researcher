from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "repair-flowmusic-inbox.py"
SPEC = importlib.util.spec_from_file_location("repair_flowmusic_inbox", SCRIPT)
assert SPEC and SPEC.loader
repair = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair)


class InboxRepairTests(unittest.TestCase):
    def test_infers_quantity_from_canonical_unit_without_changing_values(self) -> None:
        source = {"technical_name": "filter_frequency_hz", "ui_element": "Range", "unit": "Hz", "default": 440}
        fixed, changes = repair.repair_parameter(source, {})
        self.assertEqual("frequency", fixed["quantity_kind"])
        self.assertEqual(440, fixed["default"])
        self.assertTrue(any(item["method"] == "canonical_unit_mapping" for item in changes))

    def test_preserves_acronym_in_russian_keyword_slot(self) -> None:
        source = {
            "technical_name": "mpe_depth",
            "semantic_keywords": ["давление", "модуляция", "MPE", "pressure", "modulation", "expression", "depth"],
        }
        fixed, _ = repair.repair_parameter(source, {})
        self.assertEqual("термин MPE", fixed["semantic_keywords"][2])

    def test_does_not_invent_select_options(self) -> None:
        source = {"technical_name": "missing_mode", "ui_element": "Select", "unit": "mode_type", "default": "a"}
        fixed, _ = repair.repair_parameter(source, {})
        self.assertNotIn("options", fixed)


if __name__ == "__main__":
    unittest.main()
