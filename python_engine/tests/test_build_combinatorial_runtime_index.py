import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "build-combinatorial-runtime-index.py"
SPEC = importlib.util.spec_from_file_location("build_combinatorial_runtime_index", SCRIPT_PATH)
assert SPEC and SPEC.loader
runtime_index = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime_index)


class RuntimeIndexTests(unittest.TestCase):
    def test_candidate_version_dir_overrides_shared_dataset_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-pinned"
            active_version = root / "datasets" / version_id
            candidate_version = root / "maintenance" / "candidate" / "frozen" / version_id
            active_version.mkdir(parents=True)
            candidate_version.mkdir(parents=True)
            snapshot = root / "effective-snapshot.json"
            snapshot.write_text(json.dumps([{"technical_name": "live_source"}]), encoding="utf-8")
            for directory, atom_name in ((active_version, "active atom"), (candidate_version, "candidate atom")):
                runtime_index.write_json(directory / "manifest.json", {"content_sha256": atom_name})
                runtime_index.write_json(directory / "parameters.json", [{"technical_name": "live_source"}])
                runtime_index.write_json(directory / "atoms.json", [{"atom": atom_name, "source_parameters": ["live_source"]}])

            output_dir = root / "maintenance" / "candidate" / "artifacts" / "runtime-atoms"
            runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1, lambda *_args: [[1.0, 0.0]],
                output_dir=output_dir, version_id_override=version_id,
                version_dir_override=candidate_version, effective_snapshot=snapshot,
                source_revision="revision", snapshot_excluded_sha256="exclusions",
            )

            rows = json.loads((output_dir / "atoms.json").read_text(encoding="utf-8"))
            self.assertEqual(["candidate atom"], [row["atom"] for row in rows])

    def test_effective_snapshot_manifest_uses_pinned_source_hashes_without_live_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-snapshot"
            version_dir = root / "maintenance" / "candidate" / "frozen" / version_id
            version_dir.mkdir(parents=True)
            output_dir = root / "candidate" / "runtime-atoms"
            snapshot = root / "effective-snapshot.json"
            snapshot_payload = [{"technical_name": "spectral_flux_ratio"}]
            snapshot.write_text(json.dumps(snapshot_payload), encoding="utf-8")
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "frozen-sha"})
            runtime_index.write_json(version_dir / "parameters.json", snapshot_payload)
            runtime_index.write_json(version_dir / "atoms.json", [{
                "atom": "spectral", "role": "concept", "source_parameters": ["spectral_flux_ratio"],
            }])

            index_dir, manifest, created = runtime_index.build_runtime_index(
                root, "qwen3-embedding:0.6b", "http://test", 8,
                lambda _endpoint, _model, texts: [[3.0, 4.0] for _ in texts],
                output_dir=output_dir, version_id_override=version_id, version_dir_override=version_dir,
                effective_snapshot=snapshot, source_revision="pinned-revision",
                snapshot_excluded_sha256="pinned-exclusions",
                vectorize_only=True,
            )

            self.assertTrue(created)
            self.assertEqual(output_dir, index_dir)
            self.assertEqual("vectorization_complete", manifest["status"])
            self.assertFalse((output_dir / "manifest.json").exists())
            _, final_manifest, _ = runtime_index.build_runtime_index(
                root, "qwen3-embedding:0.6b", "http://test", 8,
                lambda *_args: self.fail("finalize must not call the embedding provider"),
                output_dir=output_dir, version_id_override=version_id, version_dir_override=version_dir,
                effective_snapshot=snapshot, source_revision="pinned-revision",
                snapshot_excluded_sha256="pinned-exclusions", finalize_only=True,
            )
            self.assertEqual("pinned-revision", final_manifest["effective_catalogue_revision"])
            self.assertEqual("pinned-exclusions", final_manifest["excluded_sha256"])
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), final_manifest["effective_snapshot_sha256"])
            self.assertIsNone(final_manifest["source_library_sha256"])
            self.assertIsNone(final_manifest["tombstones_sha256"])
            self.assertEqual(1, final_manifest["atom_count"])

    def test_candidate_vector_batches_resume_after_interruption_without_reembedding_saved_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-resume"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "frozen"})
            runtime_index.write_json(version_dir / "parameters.json", [
                {"technical_name": "source_a"}, {"technical_name": "source_b"}, {"technical_name": "source_c"},
            ])
            runtime_index.write_json(root / "library" / "parameters.json", [
                {"technical_name": "source_a"}, {"technical_name": "source_b"}, {"technical_name": "source_c"},
            ])
            runtime_index.write_json(version_dir / "atoms.json", [
                {"atom": "depth", "source_parameters": ["source_a"]},
                {"atom": "width", "source_parameters": ["source_b"]},
                {"atom": "rate", "source_parameters": ["source_c"]},
            ])
            output_dir = root / "maintenance" / "candidate" / "runtime-atoms"
            calls = 0

            def interrupted(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise RuntimeError("simulated model interruption")
                return [[3.0, 4.0] for _ in texts]

            with self.assertRaisesRegex(RuntimeError, "simulated model interruption"):
                runtime_index.build_runtime_index(root, "test-model", "http://test", 1, interrupted, output_dir=output_dir, vectorize_only=True)
            progress = json.loads((output_dir / "vectorization-progress.json").read_text(encoding="utf-8"))
            self.assertEqual(1, progress["completed_count"])
            first_vector = (output_dir / "atom_embeddings.f32").read_bytes()[8:16]
            resumed_calls: list[list[str]] = []
            runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1,
                lambda _endpoint, _model, texts: resumed_calls.append(texts) or [[0.0, 1.0] for _ in texts],
                output_dir=output_dir, vectorize_only=True,
            )
            self.assertEqual(2, sum(len(batch) for batch in resumed_calls))
            self.assertEqual(first_vector, (output_dir / "atom_embeddings.f32").read_bytes()[8:16])
            with self.assertRaisesRegex(FileNotFoundError, "manifest"):
                (output_dir / "manifest.json").read_text(encoding="utf-8")
            _, final, _ = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1,
                lambda *_args: self.fail("finalize must not re-embed"), output_dir=output_dir, finalize_only=True,
            )
            self.assertEqual(3, final["atom_count"])

    def test_adopts_a_legacy_complete_candidate_vector_file_only_after_exact_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-adopt-existing"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "frozen"})
            runtime_index.write_json(version_dir / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(version_dir / "atoms.json", [{"atom": "depth", "source_parameters": ["source_a"]}])
            output_dir = root / "maintenance" / "candidate" / "runtime-atoms"
            runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1, lambda *_args: [[3.0, 4.0]],
                output_dir=output_dir, vectorize_only=True,
            )
            (output_dir / "vectorization-progress.json").unlink()

            _, receipt, _ = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1,
                lambda *_args: self.fail("validated saved vectors must not be recomputed"),
                output_dir=output_dir, vectorize_only=True, adopt_existing_complete_vectors=True,
            )

            self.assertEqual("vectorization_complete", receipt["status"])
            self.assertTrue(receipt["recovered_existing_vectors"])
            self.assertEqual(1, receipt["reused_count"])

    def test_adopts_saved_vectors_when_candidate_rows_are_semantically_equal_but_formatted_differently(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-adopt-formatting"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "frozen"})
            runtime_index.write_json(version_dir / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(version_dir / "atoms.json", [{"atom": "depth", "source_parameters": ["source_a"]}])
            output_dir = root / "maintenance" / "candidate" / "runtime-atoms"
            runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1, lambda *_args: [[3.0, 4.0]],
                output_dir=output_dir, vectorize_only=True,
            )
            (output_dir / "vectorization-progress.json").unlink()
            saved_rows = json.loads((output_dir / "atoms.json").read_text(encoding="utf-8"))
            (output_dir / "atoms.json").write_text(json.dumps(saved_rows, separators=(",", ":")), encoding="utf-8")

            _, receipt, _ = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 1,
                lambda *_args: self.fail("format-only row differences must not trigger re-embedding"),
                output_dir=output_dir, vectorize_only=True, adopt_existing_complete_vectors=True,
            )

            self.assertTrue(receipt["recovered_existing_vectors"])
            self.assertEqual(1, receipt["reused_count"])
            self.assertEqual(saved_rows, json.loads((output_dir / "atoms.json").read_text(encoding="utf-8")))

    def test_builds_and_reuses_versioned_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-test"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
            runtime_index.write_json(version_dir / "parameters.json", [{"technical_name": "spectral_flux_ratio"}])
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "spectral_flux_ratio"}])
            runtime_index.write_json(version_dir / "atoms.json", [{
                "atom": "spectral",
                "role": "concept_or_descriptor",
                "parameter_frequency": 2,
                "occurrence_weight": 3,
                "categories": {"Spectral": 2},
                "source_parameters": ["spectral_flux_ratio"],
            }])

            def fake_embedder(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                self.assertIn("spectral", texts[0])
                return [[3.0, 4.0] for _ in texts]

            first_dir, first_manifest, first_created = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 8, fake_embedder
            )
            second_dir, second_manifest, second_created = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 8, fake_embedder
            )

            self.assertTrue(first_created)
            self.assertFalse(second_created)
            self.assertEqual(first_dir, second_dir)
            self.assertEqual(2, first_manifest["dimensions"])
            self.assertEqual(64, len(first_manifest["rows_sha256"]))
            self.assertEqual(64, len(first_manifest["vectors_sha256"]))
            self.assertEqual("identical array index", first_manifest["vector_alignment"]["order"])
            self.assertEqual("atom", first_manifest["vector_alignment"]["identity_key"])
            self.assertEqual(64, len(first_manifest["effective_catalogue_revision"]))
            self.assertEqual(first_manifest["effective_catalogue_revision"], second_manifest["effective_catalogue_revision"])
            self.assertEqual(first_manifest["cache_sha256"], second_manifest["cache_sha256"])
            self.assertEqual(1, len(json.loads((first_dir / "atoms.json").read_text(encoding="utf-8"))))

    def test_excluded_parameters_are_removed_from_atom_sources(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-exclusion"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
            runtime_index.write_json(root / "registry" / "excluded.json", {
                "version": 1,
                "entries": [{"technical_name": "excluded_parameter"}],
            })
            runtime_index.write_json(version_dir / "parameters.json", [
                {"technical_name": "excluded_parameter"}, {"technical_name": "active_parameter"},
            ])
            runtime_index.write_json(root / "library" / "parameters.json", [
                {"technical_name": "excluded_parameter"}, {"technical_name": "active_parameter"},
            ])
            runtime_index.write_json(version_dir / "atoms.json", [
                {"atom": "only_excluded", "role": "concept", "source_parameters": ["excluded_parameter"]},
                {"atom": "shared", "role": "concept", "source_parameters": ["excluded_parameter", "active_parameter"]},
            ])

            index_dir, manifest, created = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 8,
                lambda _endpoint, _model, texts: [[1.0, 0.0] for _ in texts],
            )

            rows = json.loads((index_dir / "atoms.json").read_text(encoding="utf-8"))
            self.assertTrue(created)
            self.assertEqual(1, manifest["atom_count"])
            self.assertEqual(["active_parameter"], rows[0]["source_parameters"])
            self.assertEqual(1, manifest["excluded_count"])

    def test_resolves_sources_before_the_24_reference_cap_and_keeps_rejection_reasons(self) -> None:
        unresolved = [f"missing_{index:02d}_depth" for index in range(25)]
        live = [f"z_live_{index:02d}_depth" for index in range(6)]
        accepted, diagnostics = runtime_index.resolve_source_parameters(
            unresolved + live, set(live), set(), set(), set()
        )

        self.assertEqual(live, accepted)
        self.assertEqual(25, len(diagnostics))
        self.assertTrue(all(item["reason"] == "unresolved" for item in diagnostics))

        rejected_archived, archived_diagnostics = runtime_index.resolve_source_parameters(
            ["frozen_only"], set(), {"frozen_only"}, set(), set()
        )
        self.assertEqual([], rejected_archived)
        self.assertEqual([{"technical_name": "frozen_only", "reason": "archived_source_disabled"}], archived_diagnostics)

    def test_tombstones_veto_live_and_frozen_names_and_unresolved_names_are_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-donor-policy"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
            runtime_index.write_json(version_dir / "parameters.json", [
                {"technical_name": "deleted_frozen"}, {"technical_name": "active_frozen"},
            ])
            runtime_index.write_json(root / "library" / "parameters.json", [
                {"technical_name": "deleted_frozen"}, {"technical_name": "active_live"},
            ])
            runtime_index.write_json(root / "library" / "catalogue-deleted.json", ["deleted_frozen"])
            runtime_index.write_json(version_dir / "atoms.json", [{
                "atom": "depth",
                "role": "property",
                "source_parameters": ["deleted_frozen", "unknown_depth", "active_live", "active_frozen"],
            }])
            embed_calls: list[list[str]] = []

            def embedder(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                embed_calls.append(texts)
                return [[1.0, 0.0] for _ in texts]

            index_dir, manifest, _ = runtime_index.build_runtime_index(
                root, "test-model", "http://test", 8, embedder
            )
            rows = json.loads((index_dir / "atoms.json").read_text(encoding="utf-8"))

            self.assertEqual(["active_live"], rows[0]["source_parameters"])
            self.assertEqual([
                {"technical_name": "deleted_frozen", "reason": "tombstoned"},
                {"technical_name": "unknown_depth", "reason": "unresolved"},
                {"technical_name": "active_frozen", "reason": "archived_source_disabled"},
            ], rows[0]["source_reference_diagnostics"])
            self.assertEqual({"archived_source_disabled": 1, "tombstoned": 1, "unresolved": 1}, manifest["source_reference_diagnostic_counts"])

    def test_rebuilds_rows_while_reusing_vectors_when_only_source_ids_change(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-reuse-vectors"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
            runtime_index.write_json(version_dir / "parameters.json", [{"technical_name": "source_a"}, {"technical_name": "source_b"}])
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "source_a"}])
            atom_path = version_dir / "atoms.json"
            runtime_index.write_json(atom_path, [{"atom": "depth", "role": "property", "source_parameters": ["source_a"]}])
            calls: list[str] = []

            def embedder(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                calls.extend(texts)
                return [[1.0, 0.0] for _ in texts]

            index_dir, _, _ = runtime_index.build_runtime_index(root, "test-model", "http://test", 8, embedder)
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "source_b"}])
            runtime_index.write_json(atom_path, [{"atom": "depth", "role": "property", "source_parameters": ["source_b"]}])
            _, manifest, created = runtime_index.build_runtime_index(root, "test-model", "http://test", 8, embedder, rows_only=True)

            rows = json.loads((index_dir / "atoms.json").read_text(encoding="utf-8"))
            self.assertTrue(created)
            self.assertEqual(["depth"], calls)
            self.assertEqual(["source_b"], rows[0]["source_parameters"])
            self.assertEqual(1, manifest["reused_count"])
            self.assertEqual(0, manifest["embedded_count"])
            self.assertEqual("identical array index", manifest["vector_alignment"]["order"])

    def test_rows_only_refuses_to_write_when_any_embedding_cannot_be_reused(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-rows-only-refuse"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
            runtime_index.write_json(version_dir / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(root / "library" / "parameters.json", [{"technical_name": "source_a"}])
            runtime_index.write_json(version_dir / "atoms.json", [{"atom": "new_atom", "role": "property", "source_parameters": ["source_a"]}])

            with self.assertRaisesRegex(RuntimeError, "Rows-only rebuild requires"):
                runtime_index.build_runtime_index(
                    root, "test-model", "http://test", 8,
                    lambda *_args: self.fail("rows-only must not call an embedder"), rows_only=True,
                )
            self.assertFalse((root / "indexes" / version_id).exists())


if __name__ == "__main__":
    unittest.main()
