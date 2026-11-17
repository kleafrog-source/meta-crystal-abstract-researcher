import importlib.util
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "freeze-combinatorial-dataset.py"
SPEC = importlib.util.spec_from_file_location("freeze_combinatorial_dataset", SCRIPT_PATH)
assert SPEC and SPEC.loader
freeze = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(freeze)


class FreezeDatasetTests(unittest.TestCase):
    def test_candidate_only_cli_summary_does_not_require_semantic_groups(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "prepared"
            datasets = root / "candidate" / "frozen"
            source.mkdir(parents=True)
            freeze.write_json(source / "source_manifest.json", {
                "catalogue_revision": "pinned-revision", "source_record_count": 1,
            })
            freeze.write_json(source / "source_parameters.json", [{"technical_name": "fixture_parameter"}])
            freeze.write_json(source / "atom_corpus.json", [{"atom": "fixture atom"}])

            output = io.StringIO()
            with patch.object(sys, "argv", [str(SCRIPT_PATH), "--source-dir", str(source), "--datasets-dir", str(datasets), "--candidate-inputs-only"]), contextlib.redirect_stdout(output):
                self.assertEqual(0, freeze.main())

            self.assertIn("1 parameters, 1 atoms", output.getvalue())
            self.assertNotIn("semantic groups", output.getvalue())

    def test_candidate_runtime_atom_inputs_are_frozen_without_semantic_model_artifacts_or_latest_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "prepared"
            datasets = root / "candidate" / "frozen"
            source.mkdir(parents=True)
            freeze.write_json(source / "source_manifest.json", {
                "catalogue_revision": "pinned-revision", "source_record_count": 1,
            })
            freeze.write_json(source / "source_parameters.json", [{"technical_name": "fixture_parameter"}])
            freeze.write_json(source / "atom_corpus.json", [{"atom": "fixture atom", "source_parameters": ["fixture_parameter"]}])

            version_dir, manifest, created = freeze.freeze_candidate_inputs(source, datasets)

            self.assertTrue(created)
            self.assertTrue(manifest["candidate_only"])
            self.assertEqual("pinned-revision", manifest["source_revision"])
            self.assertTrue((version_dir / "parameters.json").is_file())
            self.assertTrue((version_dir / "atoms.json").is_file())
            self.assertFalse((root / "datasets" / "latest.json").exists())
            _, reused_manifest, reused = freeze.freeze_candidate_inputs(source, datasets)
            self.assertFalse(reused)
            self.assertEqual(manifest["content_sha256"], reused_manifest["content_sha256"])

    def test_candidate_freeze_keeps_latest_unchanged_and_preserves_full_source_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            datasets = root / "datasets"
            source.mkdir()
            freeze.write_json(datasets / "latest.json", {"version_id": "old"})
            fixtures = {
                "unified_parameters_semantic_draft.json": [{"technical_name": "representative"}],
                "source_parameters.json": [
                    {"technical_name": "member_a", "domain_layer": None},
                    {"technical_name": "member_b", "quantity_kind": "duration"},
                ],
                "source_manifest.json": {"source_sha256": "source-hash", "eligible_record_count": 1, "excluded_record_count": 1},
                "semantic_representatives.json": [{"technical_name": "member_a"}],
                "atom_corpus.json": [{"atom": "member"}],
                "semantic_groups.json": [{"members": ["member_a", "member_b"]}],
                "quality_report.json": {"eligible_records": 1},
                "semantic_auto_triage_report.json": {"policy_version": "test"},
                "semantic_embeddings_meta.json": {"model": "test"},
            }
            for name, payload in fixtures.items():
                freeze.write_json(source / name, payload)

            version_dir, manifest, created = freeze.freeze_dataset(source, datasets, activate_latest=False)

            self.assertTrue(created)
            self.assertEqual("old", json.loads((datasets / "latest.json").read_text(encoding="utf-8"))["version_id"])
            frozen = json.loads((version_dir / "parameters.json").read_text(encoding="utf-8"))
            self.assertEqual(["member_a", "member_b"], [row["technical_name"] for row in frozen])
            self.assertIsNone(frozen[0]["domain_layer"])
            self.assertEqual("duration", frozen[1]["quantity_kind"])
            self.assertEqual(["member_a"], [row["technical_name"] for row in json.loads((version_dir / "semantic_representatives.json").read_text(encoding="utf-8"))])
            self.assertEqual("source-hash", manifest["source_revision"])

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
