from __future__ import annotations

import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "build-genesis-v3-composite-index.py"
SPEC = importlib.util.spec_from_file_location("build_composite_parallel_text_index", SCRIPT_PATH)
assert SPEC and SPEC.loader
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class ParallelTextIndexTests(unittest.TestCase):
    def test_prepare_only_persists_pinned_rows_and_plan_without_embedding(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "candidate" / "composite"
            snapshot = root / "snapshot.json"
            snapshot.write_text(json.dumps([{"technical_name": "fixture_filter"}]), encoding="utf-8")
            with patch.object(builder, "DATA_ROOT", root / "data"):
                plan, _ = builder.build(
                    "qwen3-embedding:0.6b", "http://local", 2, output,
                    parameter_snapshot=snapshot, source_revision="pinned-rev",
                    source_snapshot_sha256="pinned-content", pinned_excluded_sha256="pinned-exclusions",
                    prepare_only=True, embedder=lambda *_args: self.fail("Prepare must not call embeddings"),
                )
            stored_plan = json.loads((output / "prepare-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual("prepared", plan["status"])
            self.assertEqual("pinned-rev", stored_plan["source_revision"])
            self.assertEqual("pinned-content", stored_plan["source_snapshot_sha256"])
            self.assertEqual(1, len(json.loads((output / "rows.json").read_text(encoding="utf-8"))))
            self.assertFalse((output / "embeddings.f32").exists())

    def test_candidate_composite_vectors_resume_from_durable_batch_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "data"
            output = root / "candidate" / "composite"
            snapshot = root / "snapshot.json"
            snapshot.write_text(json.dumps([
                {"technical_name": "fixture_filter_a"},
                {"technical_name": "fixture_filter_b"},
                {"technical_name": "fixture_filter_c"},
            ]), encoding="utf-8")
            first_calls: list[list[str]] = []

            def interrupt_after_one(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                first_calls.append(texts)
                if len(first_calls) == 2:
                    raise RuntimeError("simulated embedding interruption")
                return [[1.0, 0.0] for _ in texts]

            with patch.object(builder, "DATA_ROOT", data_root):
                with self.assertRaisesRegex(RuntimeError, "simulated embedding interruption"):
                    builder.build(
                        "qwen3-embedding:0.6b", "http://local", 1, output,
                        parameter_snapshot=snapshot, source_revision="pinned-rev",
                        source_snapshot_sha256="pinned-content", pinned_excluded_sha256="pinned-exclusions",
                        embedder=interrupt_after_one,
                    )
                receipt = json.loads((output / "vectorization-progress.json").read_text(encoding="utf-8"))
                saved_prefix = (output / "embeddings.f32").read_bytes()[8:16]
                self.assertEqual(1, receipt["completed_count"])
                resumed_calls: list[list[str]] = []
                manifest, created = builder.build(
                    "qwen3-embedding:0.6b", "http://local", 1, output,
                    parameter_snapshot=snapshot, source_revision="pinned-rev",
                    source_snapshot_sha256="pinned-content", pinned_excluded_sha256="pinned-exclusions",
                    embedder=lambda _endpoint, _model, texts: resumed_calls.append(texts) or [[0.0, 1.0] for _ in texts],
                )
            raw = (output / "embeddings.f32").read_bytes()
            count, dimensions = struct.unpack_from("<II", raw, 0)
            self.assertTrue(created)
            self.assertEqual(2, sum(map(len, resumed_calls)))
            self.assertEqual(saved_prefix, raw[8:16])
            self.assertEqual((3, 2), (count, dimensions))
            self.assertEqual(3, manifest["parameter_count"])
            self.assertFalse((output / "vectorization-progress.json").exists())

    def test_candidate_composite_reuses_compatible_saved_candidate_vectors(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "data"
            snapshot = root / "snapshot.json"
            snapshot.write_text(json.dumps([{"technical_name": "reusable_filter", "description_en": "Reusable filter"}]), encoding="utf-8")
            saved = root / "saved-candidate" / "composite"
            output = root / "new-candidate" / "composite"
            with patch.object(builder, "DATA_ROOT", data_root):
                builder.build(
                    "qwen3-embedding:0.6b", "http://local", 4, saved,
                    parameter_snapshot=snapshot, source_revision="same-rev",
                    source_snapshot_sha256="same-content", pinned_excluded_sha256="same-exclusions",
                    embedder=lambda *_args: [[0.6, 0.8]],
                )
                manifest, _ = builder.build(
                    "qwen3-embedding:0.6b", "http://local", 4, output,
                    parameter_snapshot=snapshot, source_revision="same-rev",
                    source_snapshot_sha256="same-content", pinned_excluded_sha256="same-exclusions",
                    reuse_index_dirs=[saved], embedder=lambda *_args: self.fail("Compatible saved candidate vector must be reused"),
                )
            self.assertEqual(manifest["vector_origins"], {"ollama": 1})
            self.assertEqual((saved / "embeddings.f32").read_bytes(), (output / "embeddings.f32").read_bytes())

    def test_pinned_snapshot_supplies_new_ids_and_changed_description_without_latest_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "data"
            snapshot_path = root / "effective-snapshot.json"
            snapshot_path.write_text(json.dumps([{
                "technical_name": "new_live_only_filter",
                "description_en": "A freshly revised description for the live filter control",
                "category": "Audio", "sub_category": "Filter", "ui_element": "Range",
            }]), encoding="utf-8")
            seen_texts: list[str] = []

            def fake_embed(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                seen_texts.extend(texts)
                return [[1.0, 0.0] for _ in texts]

            output = root / "candidate" / "composite"
            with patch.object(builder, "DATA_ROOT", data_root), patch.object(builder, "embed_batch", side_effect=fake_embed):
                manifest, _ = builder.build(
                    "qwen3-embedding:0.6b", "http://local", 8, output,
                    parameter_snapshot=snapshot_path, source_revision="captured-rev",
                    source_snapshot_sha256="captured-content", pinned_excluded_sha256="captured-exclusions",
                )

            rows = json.loads((output / "rows.json").read_text(encoding="utf-8"))
            self.assertEqual([row["technical_name"] for row in rows], ["new_live_only_filter"])
            self.assertIn("freshly revised description", seen_texts[0])
            self.assertEqual(manifest["source_revision"], "captured-rev")
            self.assertEqual(manifest["source_snapshot_sha256"], "captured-content")
            self.assertFalse((data_root / "datasets" / "latest.json").exists())

    def test_gemma_index_build_keeps_qwen_store_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "data"
            qwen_dir = data_root / "v3" / "composite-index"
            gemma_dir = data_root / "indexes" / "embeddinggemma2-text-index"
            library_dir = data_root / "library"
            datasets_dir = data_root / "datasets"
            library_dir.mkdir(parents=True)
            datasets_dir.mkdir(parents=True)
            (library_dir / "parameters.json").write_text(json.dumps([
                {
                    "technical_name": "spectral_filter_cutoff",
                    "description_en": "Filter cutoff frequency",
                    "category": "Spectral",
                    "sub_category": "Filter",
                    "domain_layer": "SPECTRAL_DSP_LAYER",
                    "semantic_keywords": ["cutoff", "frequency"],
                    "lyria_prompt_tags": ["bright"],
                    "source_file": "must-not-be-indexed.json",
                },
            ]), encoding="utf-8")
            (datasets_dir / "latest.json").write_text(json.dumps({"version_id": "cg-v-test"}), encoding="utf-8")

            def fake_embed(_endpoint: str, model: str, texts: list[str]) -> list[list[float]]:
                dimensions = 2 if model == "qwen3-embedding:0.6b" else 3
                return [[1.0] + [0.0] * (dimensions - 1) for _ in texts]

            with patch.object(builder, "DATA_ROOT", data_root), patch.object(builder, "embed_batch", side_effect=fake_embed):
                qwen_manifest, _ = builder.build("qwen3-embedding:0.6b", "http://local", 8)
                qwen_manifest_bytes = (qwen_dir / "manifest.json").read_bytes()
                shared_dataset_bytes = (data_root / "v3" / "dataset.json").read_bytes()
                gemma_manifest, _ = builder.build(
                    "embeddinggemma-2:740m", "http://local", 8, gemma_dir, retrieval_text_only=True
                )

            self.assertEqual(qwen_manifest["dimensions"], 2)
            self.assertEqual(gemma_manifest["model"], "embeddinggemma-2:740m")
            self.assertEqual(gemma_manifest["dimensions"], 3)
            self.assertEqual(gemma_manifest["text_policy"], "retrieval")
            self.assertEqual((qwen_dir / "manifest.json").read_bytes(), qwen_manifest_bytes)
            self.assertEqual((data_root / "v3" / "dataset.json").read_bytes(), shared_dataset_bytes)
            self.assertTrue((gemma_dir / "rows.json").exists())
            rows = json.loads((gemma_dir / "rows.json").read_text(encoding="utf-8"))
            self.assertNotIn("source_file", rows[0])
            self.assertEqual(rows[0]["embedding_text"], builder.retrieval_text(json.loads((library_dir / "parameters.json").read_text(encoding="utf-8"))[0] | {"retrieval_scope": "sound"}))
            with (gemma_dir / "embeddings.f32").open("rb") as handle:
                count, dimensions = struct.unpack("<II", handle.read(8))
            self.assertEqual((count, dimensions), (1, 3))

    def test_non_qwen_cannot_write_to_qwen_default_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "data"
            with patch.object(builder, "DATA_ROOT", data_root):
                with self.assertRaisesRegex(ValueError, "cannot write to the Qwen"):
                    builder.build("embeddinggemma-2:740m", "http://local", 4)


if __name__ == "__main__":
    unittest.main()
