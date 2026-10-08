import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "freeze-combinatorial-dataset.py"
SPEC = importlib.util.spec_from_file_location("freeze_combinatorial_dataset", SCRIPT_PATH)
assert SPEC and SPEC.loader
freeze = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(freeze)


class FreezeDatasetTests(unittest.TestCase):
    def test_freeze_is_content_addressed_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            datasets = root / "datasets"
            source.mkdir()
            fixtures = {
                "unified_parameters_semantic_draft.json": [{"technical_name": "alpha_ratio"}],
                "atom_corpus.json": [{"atom": "alpha"}],
                "semantic_groups.json": [],
                "quality_report.json": {"eligible_records": 1},
                "semantic_auto_triage_report.json": {"policy_version": "test"},
                "semantic_embeddings_meta.json": {"model": "test"},
            }
            for name, payload in fixtures.items():
                freeze.write_json(source / name, payload)

            first_dir, first_manifest, first_created = freeze.freeze_dataset(source, datasets)
            second_dir, second_manifest, second_created = freeze.freeze_dataset(source, datasets)

            self.assertTrue(first_created)
            self.assertFalse(second_created)
            self.assertEqual(first_dir, second_dir)
            self.assertEqual(first_manifest["content_sha256"], second_manifest["content_sha256"])
            self.assertEqual(1, first_manifest["parameter_count"])
            self.assertTrue(first_manifest["immutable"])
            latest = json.loads((datasets / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(first_manifest["version_id"], latest["version_id"])

    def test_generated_timestamp_does_not_change_version_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            datasets = root / "datasets"
            source.mkdir()
            fixtures = {
                "unified_parameters_semantic_draft.json": [],
                "atom_corpus.json": [],
                "semantic_groups.json": [],
                "quality_report.json": {"generated_at": "first", "eligible_records": 0},
                "semantic_auto_triage_report.json": {"generated_at": "first", "policy_version": "test"},
                "semantic_embeddings_meta.json": {"generated_at": "first", "endpoint": "machine-a", "model": "test"},
            }
            for name, payload in fixtures.items():
                freeze.write_json(source / name, payload)
            _, first_manifest, _ = freeze.freeze_dataset(source, datasets)

            for name in ("quality_report.json", "semantic_auto_triage_report.json", "semantic_embeddings_meta.json"):
                payload = json.loads((source / name).read_text(encoding="utf-8"))
                payload["generated_at"] = "second"
                if name == "semantic_embeddings_meta.json":
                    payload["endpoint"] = "machine-b"
                freeze.write_json(source / name, payload)
            _, second_manifest, second_created = freeze.freeze_dataset(source, datasets)

            self.assertFalse(second_created)
            self.assertEqual(first_manifest["version_id"], second_manifest["version_id"])


if __name__ == "__main__":
    unittest.main()
