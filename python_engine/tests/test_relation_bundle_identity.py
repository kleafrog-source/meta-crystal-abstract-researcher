import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python_engine" / "anchoring_v3"))
import build_relation_anchors as builder  # noqa: E402


class RelationBundleIdentityTests(unittest.TestCase):
    def test_only_managed_qwen_candidate_paths_supply_bundle_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            maintenance = root / "data" / "combinatorial-genesis" / "maintenance"
            with patch.object(builder, "ROOT", root):
                self.assertEqual(
                    builder.managed_candidate_bundle_id(maintenance / "candidate-123" / "artifacts" / "qwen3" / "relations"),
                    "candidate-123",
                )
                self.assertIsNone(builder.managed_candidate_bundle_id(root / "data" / "combinatorial-genesis" / "v3" / "relations"))

    def test_cache_hit_stamps_candidate_bundle_identity_without_revectorizing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dataset_path = root / "dataset.json"
            output = root / "relations"
            output.mkdir()
            dataset_path.write_text("[]", encoding="utf-8")
            endpoint = "http://localhost:11434"
            model = "qwen3-embedding:0.6b"
            rows = [
                {**relation, "row_index": index, "params_a": [], "params_b": []}
                for index, relation in enumerate(builder.RELATIONS)
            ]
            cache_sha = hashlib.sha256(json.dumps(
                {"model": model, "endpoint": endpoint, "operation_identity_sha256": None, "relations": rows},
                ensure_ascii=False, sort_keys=True, separators=(",", ":"),
            ).encode("utf-8")).hexdigest()
            vector_path = output / "embeddings.f32"
            vector_path.write_bytes(struct.pack("<II", 12, 3) + b"existing-vectors")
            vector_hash = hashlib.sha256(vector_path.read_bytes()).hexdigest()
            (output / "manifest.json").write_text(json.dumps({
                "cache_sha256": cache_sha, "endpoint": endpoint, "vectors_file": vector_path.name,
                "model": model, "count": 12,
            }), encoding="utf-8")

            with patch.object(builder, "ROOT", root), \
                    patch.object(builder, "load_v3_snapshot", return_value={"content_sha256": "snapshot"}), \
                    patch.object(builder, "registry_sha256", return_value="excluded"), \
                    patch.object(builder, "read_registry", return_value={"entries": []}), \
                    patch.object(builder, "build_checkpointed_vectors", side_effect=AssertionError("cache hit must not invoke embedding")), \
                    patch.object(sys, "argv", [
                        "build_relation_anchors.py", "--dataset", str(dataset_path), "--output", str(output),
                        "--endpoint", endpoint, "--model", model, "--value-selection-bundle-id", "candidate-123",
                    ]):
                result = builder.main()

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result, 0)
            self.assertEqual(manifest["value_selection_bundle_id"], "candidate-123")
            self.assertEqual(hashlib.sha256(vector_path.read_bytes()).hexdigest(), vector_hash)


if __name__ == "__main__":
    unittest.main()
