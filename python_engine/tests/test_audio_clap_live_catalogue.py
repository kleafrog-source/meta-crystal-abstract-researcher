import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio_clap_rag


def parameter(name: str, description: str) -> dict:
    return {
        "technical_name": name,
        "name_ru": name,
        "description_en": description,
        "description_ru": description,
        "category": "sound",
        "sub_category": "fixture",
        "ui_element": "Range",
        "min_value": 0,
        "max_value": 1,
        "step": 0.1,
        "default": 0.5,
        "unit": "ratio",
        "quantity_kind": "ratio",
        "semantic_keywords": ["fixture"],
    }


class AudioClapLiveCatalogueTests(unittest.TestCase):
    def test_clap_uses_live_values_and_never_adds_archived_only_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "library").mkdir()
            (root / "datasets" / "old").mkdir(parents=True)
            (root / "registry").mkdir()
            (root / "datasets" / "latest.json").write_text(
                json.dumps({"version_id": "old"}), encoding="utf-8"
            )
            (root / "datasets" / "old" / "parameters.json").write_text(
                json.dumps([
                    parameter("shared_control", "archived description"),
                    parameter("archived_only", "must not enter active CLAP"),
                ]), encoding="utf-8"
            )
            (root / "library" / "parameters.json").write_text(
                json.dumps([
                    parameter("shared_control", "current live description"),
                    parameter("live_only", "current live parameter"),
                    parameter("tombstoned_live", "tombstoned parameter"),
                    parameter("excluded_live", "excluded parameter"),
                ]), encoding="utf-8"
            )
            (root / "library" / "catalogue-deleted.json").write_text(
                json.dumps(["tombstoned_live"]), encoding="utf-8"
            )
            (root / "registry" / "excluded.json").write_text(
                json.dumps({"entries": [{"technical_name": "excluded_live"}]}), encoding="utf-8"
            )

            with patch.object(audio_clap_rag, "DATA_ROOT", root):
                rows = audio_clap_rag._load_v3_parameters()

        by_name = {row["technical_name"]: row for row in rows}
        self.assertEqual(set(by_name), {"shared_control", "live_only"})
        self.assertEqual(by_name["shared_control"]["description_en"], "current live description")

    def test_missing_live_catalogue_fails_closed_despite_historical_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "datasets" / "old").mkdir(parents=True)
            (root / "datasets" / "latest.json").write_text(
                json.dumps({"version_id": "old"}), encoding="utf-8"
            )
            (root / "datasets" / "old" / "parameters.json").write_text(
                json.dumps([parameter("archived_only", "historical")]), encoding="utf-8"
            )

            with patch.object(audio_clap_rag, "DATA_ROOT", root):
                with self.assertRaisesRegex(RuntimeError, "live catalogue is unavailable"):
                    audio_clap_rag._load_v3_parameters()


if __name__ == "__main__":
    unittest.main()
