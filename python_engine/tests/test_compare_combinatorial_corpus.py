import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "compare-combinatorial-corpus.py"
SPEC = importlib.util.spec_from_file_location("compare_combinatorial_corpus", MODULE_PATH)
assert SPEC and SPEC.loader
compare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compare)


class QueryGateTests(unittest.TestCase):
    def test_equal_or_better_fixed_queries_pass(self):
        old = [{"id": "a", "relevant_top_k": 1}, {"id": "b", "relevant_top_k": 0}]
        new = [{"id": "a", "relevant_top_k": 1}, {"id": "b", "relevant_top_k": 2}]

        result = compare.evaluate_query_gate(old, new, minimum_relevant_queries=1)

        self.assertTrue(result["criterion_passed"])
        self.assertEqual(result["regressed_query_ids"], [])

    def test_any_fixed_query_regression_fails_even_if_seven_of_eight_are_useful(self):
        old = [{"id": str(index), "relevant_top_k": 2} for index in range(8)]
        new = [{"id": str(index), "relevant_top_k": 2} for index in range(7)] + [
            {"id": "reverb-decay", "relevant_top_k": 1}
        ]

        result = compare.evaluate_query_gate(old, new, minimum_relevant_queries=7)

        self.assertEqual(result["passed_queries"], 8)
        self.assertEqual(result["regressed_query_ids"], ["reverb-decay"])
        self.assertFalse(result["criterion_passed"])


class SelectControlGateTests(unittest.TestCase):
    def test_accepts_unique_options_with_matching_default(self):
        self.assertEqual(compare.invalid_select_controls([
            {"technical_name": "mode", "ui_element": "Select", "options": ["soft", "hard"], "default": "soft"},
        ]), [])

    def test_rejects_missing_default_empty_duplicate_and_malformed_options(self):
        invalid = compare.invalid_select_controls([
            {"technical_name": "missing_default", "ui_element": "Select", "options": ["a"]},
            {"technical_name": "empty_options", "ui_element": "Select", "options": [], "default": "a"},
            {"technical_name": "duplicate_options", "ui_element": "Select", "options": ["a", "a"], "default": "a"},
            {"technical_name": "wrong_default_type", "ui_element": "Select", "options": [1], "default": True},
            {"technical_name": "object_option", "ui_element": "Select", "options": [{"id": "a"}], "default": {"id": "a"}},
        ])
        self.assertEqual(invalid, ["duplicate_options", "empty_options", "missing_default", "object_option", "wrong_default_type"])

    def test_invalid_select_gate_prevents_candidate_acceptance(self):
        invalid = compare.invalid_select_controls([
            {"technical_name": "broken_mode", "ui_element": "Select", "options": ["a", "b"], "default": "c"},
        ])
        criteria = {"source_snapshot": True, "select_values_valid": not invalid}
        self.assertEqual(compare.acceptance_status(criteria), "not_passed")


class QwenBundleValidationTests(unittest.TestCase):
    def test_validates_candidate_source_and_every_file_checksum(self):
        required = [
            "composite-index/manifest.json", "composite-index/rows.json", "composite-index/embeddings.f32",
            "anchors/anchors_build.json", "value-anchors/manifest.json", "value-anchors/select-options.json",
            "relations/manifest.json", "relations/embeddings.f32", "runtime-atoms/manifest.json",
            "runtime-atoms/atoms.json", "runtime-atoms/atom_embeddings.f32",
        ]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            files = []
            for relative in required:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                payload = relative.encode("utf8")
                target.write_bytes(payload)
                files.append({"path": relative, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
            (root / "bundle-manifest.json").write_text(json.dumps({
                "status": "complete", "encoder": "qwen3", "source_revision": "rev",
                "source_snapshot_sha256": "snapshot", "excluded_sha256": "excluded",
                "source_parameter_count": 10, "dataset_version": "candidate", "files": files,
            }), encoding="utf8")

            valid, reason, _bundle = compare.validate_qwen_bundle(root, "rev", "snapshot", "excluded", 10, "candidate")
            self.assertTrue(valid)
            self.assertIsNone(reason)

            (root / "composite-index" / "rows.json").write_text("tampered", encoding="utf8")
            valid, reason, _bundle = compare.validate_qwen_bundle(root, "rev", "snapshot", "excluded", 10, "candidate")
            self.assertFalse(valid)
            self.assertIn("checksum failed", reason or "")


if __name__ == "__main__":
    unittest.main()
