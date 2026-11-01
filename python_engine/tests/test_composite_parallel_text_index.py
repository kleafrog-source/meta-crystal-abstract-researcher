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
