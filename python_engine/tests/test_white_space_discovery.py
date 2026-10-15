from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))

from v3_snapshot import load_v3_snapshot  # noqa: E402
from white_space_discovery import build, stable_id, taxonomy_gaps  # noqa: E402


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class V3SnapshotTests(unittest.TestCase):
    def test_library_wins_and_registry_excludes(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write(root / "datasets/latest.json", {"version_id": "v1"})
            write(root / "datasets/v1/parameters.json", [
                {"technical_name": "same", "default": 1},
                {"technical_name": "removed", "default": 2},
            ])
            write(root / "library/parameters.json", [
                {"technical_name": "same", "default": 9},
                {"technical_name": "library_only", "default": 3},
            ])
            write(root / "registry/excluded.json", {"entries": [{"technical_name": "removed"}]})
            first = load_v3_snapshot(root)
            second = load_v3_snapshot(root)
            self.assertEqual(first["content_sha256"], second["content_sha256"])
            self.assertEqual([item["technical_name"] for item in first["parameters"]], ["library_only", "same"])
            same = next(item for item in first["parameters"] if item["technical_name"] == "same")
            self.assertEqual(same["default"], 9)
            self.assertEqual(same["source"], "library")


class WhiteSpaceSignalTests(unittest.TestCase):
    def test_taxonomy_gap_requires_supported_marginals(self) -> None:
        parameters = []
        for index in range(4):
            parameters.append({"category": "sound", "sub_category": "tone", "quantity_kind": "ratio", "ui_element": "Range", "retrieval_scope": "sound", "technical_name": f"a{index}"})
        for index in range(4):
            parameters.append({"category": "sound", "sub_category": "tone", "quantity_kind": "choice", "ui_element": "Select", "retrieval_scope": "sound", "technical_name": f"b{index}"})
        gaps, matrix = taxonomy_gaps(parameters, minimum_group=8)
        pairs = {(item["evidence"]["quantity_kind"], item["evidence"]["ui_element"]) for item in gaps}
        self.assertEqual(pairs, {("ratio", "Select"), ("choice", "Range")})
        self.assertEqual(matrix["group_count"], 1)

    def test_gap_id_is_order_independent(self) -> None:
        self.assertEqual(stable_id("taxonomy", {"a": 1, "b": 2}), stable_id("taxonomy", {"b": 2, "a": 1}))

    def test_build_rejects_stale_composite_before_analysis(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write(root / "datasets/latest.json", {"version_id": "v1"})
            write(root / "datasets/v1/parameters.json", [{"technical_name": "a"}])
            write(root / "library/parameters.json", [{"technical_name": "b"}])
            write(root / "registry/excluded.json", {"entries": []})
            snapshot = load_v3_snapshot(root)
            write(root / "v3/composite-index/manifest.json", {"dataset_version": "v1", "excluded_sha256": snapshot["excluded_sha256"], "parameter_count": 1})
            with self.assertRaisesRegex(RuntimeError, "composite index is stale"):
                build(root, root / "white-space/report.json", 8, 1, 12, 60)


if __name__ == "__main__":
    unittest.main()
