import importlib.util
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
    def test_builds_and_reuses_versioned_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            version_id = "cg-v1-test"
            version_dir = root / "datasets" / version_id
            version_dir.mkdir(parents=True)
            runtime_index.write_json(root / "datasets" / "latest.json", {"version_id": version_id})
            runtime_index.write_json(version_dir / "manifest.json", {"content_sha256": "abc"})
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
            self.assertEqual(first_manifest["cache_sha256"], second_manifest["cache_sha256"])
            self.assertEqual(1, len(json.loads((first_dir / "atoms.json").read_text(encoding="utf-8"))))


if __name__ == "__main__":
    unittest.main()
