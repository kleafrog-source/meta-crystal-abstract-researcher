import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python_engine"))

from knowledge_graph import build  # noqa: E402


class KnowledgeGraphTests(unittest.TestCase):
    def test_build_is_deterministic_and_has_no_dangling_edges(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); version = "fixture-v1"
            (root / "datasets" / version).mkdir(parents=True); (root / "library").mkdir(); (root / "registry").mkdir(); (root / "v3" / "composite-index").mkdir(parents=True)
            parameters = [
                {"technical_name": "alpha_control", "category": "sound", "sub_category": "tone", "quantity_kind": "ratio", "ui_element": "Range", "retrieval_scope": "sound"},
                {"technical_name": "beta_control", "category": "sound", "sub_category": "tone", "quantity_kind": "ratio", "ui_element": "Range", "retrieval_scope": "sound"},
                {"technical_name": "gamma_control", "category": "structure", "sub_category": "rhythm", "quantity_kind": "rate", "ui_element": "Toggle", "retrieval_scope": "structure"},
            ]
            (root / "datasets" / "latest.json").write_text(json.dumps({"version_id": version}), encoding="utf-8")
            (root / "datasets" / version / "parameters.json").write_text(json.dumps(parameters), encoding="utf-8")
            (root / "datasets" / version / "atoms.json").write_text(json.dumps([{"atom": "tone", "role": "root", "source_parameters": ["alpha_control", "beta_control"]}]), encoding="utf-8")
            (root / "library" / "parameters.json").write_text("[]", encoding="utf-8")
            (root / "registry" / "excluded.json").write_text('{"entries":[]}', encoding="utf-8")
            from v3_snapshot import load_v3_snapshot
            snapshot = load_v3_snapshot(root)
            manifest = {"dataset_version": version, "parameter_count": 3, "excluded_sha256": snapshot["excluded_sha256"], "cache_sha256": "fixture", "model": "fixture-model", "dimensions": 3}
            rows = [{"technical_name": item["technical_name"], "retrieval_scope": item["retrieval_scope"]} for item in parameters]
            index = root / "v3" / "composite-index"
            (index / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8"); (index / "rows.json").write_text(json.dumps(rows), encoding="utf-8")
            vectors = np.asarray([[1, 0, 0], [.99, .01, 0], [0, 1, 0]], dtype="<f4")
            with (index / "embeddings.f32").open("wb") as handle: handle.write(struct.pack("<II", 3, 3)); vectors.tofile(handle)
            first = build(root, root / "graph-one.json", 2, -1.0); second = build(root, root / "graph-two.json", 2, -1.0)
            self.assertEqual(first["nodes"], second["nodes"]); self.assertEqual(first["edges"], second["edges"])
            node_ids = {node["id"] for node in first["nodes"]}; edge_ids = [edge["id"] for edge in first["edges"]]
            self.assertEqual(len(edge_ids), len(set(edge_ids)))
            self.assertTrue(all(edge["source"] in node_ids and edge["target"] in node_ids for edge in first["edges"]))
            self.assertGreater(first["summary"]["semantic_edge_count"], 0)


if __name__ == "__main__":
    unittest.main()
