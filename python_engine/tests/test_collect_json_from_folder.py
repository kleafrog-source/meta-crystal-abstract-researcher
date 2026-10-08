import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "collect-json-from-folder.py"
SPEC = importlib.util.spec_from_file_location("flowmusic_collector", SCRIPT_PATH)
assert SPEC and SPEC.loader
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


def parameter(name: str) -> dict:
    return {
        "technical_name": name,
        "name_ru": "Тестовый параметр",
        "description_en": "Controls a test amount; lower values reduce it and higher values increase it.",
        "description_ru": "Управляет тестовой величиной; низкие значения уменьшают её, высокие увеличивают.",
        "category": "Testing",
        "sub_category": "Collector",
        "ui_element": "Range",
        "min_value": 0.0,
        "max_value": 1.0,
        "step": 0.01,
        "default": 0.5,
        "unit": "normalized_ratio",
        "lyria_prompt_tags": ["test one", "test two", "test three"],
        "semantic_keywords": [
            "тест один",
            "тест два",
            "тест три",
            "test one",
            "test two",
            "test three",
            "test four",
        ],
    }


def batch(batch_index: int, names: list[str]) -> dict:
    return {
        "collection_protocol": collector.PROTOCOL,
        "batch_index": batch_index,
        "parameters": [parameter(name) for name in names],
    }


class CollectorTests(unittest.TestCase):
    def test_extracts_multiple_nested_batches_and_labels(self) -> None:
        first = batch(1, [f"first_probe_{index}_ratio" for index in range(10)])
        second = batch(2, [f"second_probe_{index}_ratio" for index in range(10)])
        text = f"account A answer 1:\n{json.dumps(first)}\n\naccount B answer 2:\n{json.dumps(second)}"

        extracted = collector.extract_batches(text)

        self.assertEqual(2, len(extracted))
        self.assertEqual("account A answer 1:", extracted[0]["source_label"])
        self.assertEqual("account B answer 2:", extracted[1]["source_label"])
        self.assertEqual(10, len(extracted[0]["payload"]["parameters"]))

    def test_validation_rejects_duplicate_name_inside_batch(self) -> None:
        names = [f"duplicate_probe_{index}_ratio" for index in range(9)] + ["duplicate_probe_0_ratio"]
        errors, _ = collector.validate_batch(batch(1, names))
        self.assertTrue(any("duplicate technical_name" in error for error in errors))

    def test_collect_preserves_cross_batch_duplicate_provenance(self) -> None:
        shared = "shared_probe_amount_ratio"
        first_names = [shared] + [f"alpha_probe_{index}_ratio" for index in range(9)]
        second_names = [shared] + [f"beta_probe_{index}_ratio" for index in range(9)]

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(
                f"account A:\n{json.dumps(batch(1, first_names))}\naccount B:\n{json.dumps(batch(1, second_names))}",
                encoding="utf-8",
            )
            output = root / "output"

            report = collector.collect([source], output, {shared})
            canonical = json.loads((output / "unified_parameters_lexical.json").read_text(encoding="utf-8"))
            shared_record = next(item for item in canonical if item["technical_name"] == shared)

            self.assertEqual(20, report["raw_occurrences"])
            self.assertEqual(19, report["unique_exact_names"])
            self.assertEqual(2, shared_record["_collection"]["occurrence_count"])
            self.assertEqual(2, shared_record["_collection"]["source_count"])
            self.assertTrue(shared_record["_collection"]["reference_overlap"])

    def test_collect_quarantines_only_invalid_parameters(self) -> None:
        valid_names = [f"valid_probe_{index}_ratio" for index in range(10)]
        invalid = batch(2, [f"invalid_probe_{index}_ratio" for index in range(10)])
        invalid["parameters"][0]["unit"] = ""

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(
                f"valid:\n{json.dumps(batch(1, valid_names))}\ninvalid:\n{json.dumps(invalid)}",
                encoding="utf-8",
            )
            output = root / "output"

            report = collector.collect([source], output, set())
            canonical = json.loads((output / "unified_parameters_lexical.json").read_text(encoding="utf-8"))
            rejected = json.loads((output / "flowmusic_rejected_occurrences.json").read_text(encoding="utf-8"))

            self.assertEqual(20, report["raw_occurrences"])
            self.assertEqual(19, report["accepted_occurrences"])
            self.assertEqual(1, report["rejected_occurrences"])
            self.assertEqual(19, len(canonical))
            self.assertEqual(1, len(rejected))
            self.assertIn("parameters[0].unit is required", rejected[0]["validation_errors"])

    def test_batch_size_is_not_limited_to_ten_parameters(self) -> None:
        payload = batch(1, [f"large_probe_{index}_ratio" for index in range(19)])

        errors, _ = collector.validate_batch(payload)

        self.assertEqual([], errors)

    def test_collect_lowercases_an_otherwise_valid_technical_name(self) -> None:
        payload = batch(1, ["filter_gain_dB"])

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(json.dumps(payload), encoding="utf-8")
            output = root / "output"

            report = collector.collect([source], output, set())
            canonical = json.loads((output / "unified_parameters_lexical.json").read_text(encoding="utf-8"))
            occurrences = json.loads((output / "flowmusic_occurrences.json").read_text(encoding="utf-8"))

            self.assertEqual(1, report["accepted_occurrences"])
            self.assertEqual("filter_gain_db", canonical[0]["technical_name"])
            self.assertEqual(
                {"original": "filter_gain_dB", "normalized": "filter_gain_db"},
                occurrences[0]["provenance"]["technical_name_normalization"],
            )

    def test_collect_does_not_guess_cyrillic_transliteration(self) -> None:
        payload = batch(1, ["filter_частота_hz"])

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            output = root / "output"

            report = collector.collect([source], output, set())

            self.assertEqual(0, report["accepted_occurrences"])
            self.assertEqual(1, report["rejected_occurrences"])

    def test_collect_normalizes_lsystem_as_one_semantic_token(self) -> None:
        payload = batch(1, ["generative_l-system_recursion_depth_limit"])

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(json.dumps(payload), encoding="utf-8")
            output = root / "output"

            report = collector.collect([source], output, set())
            canonical = json.loads((output / "unified_parameters_lexical.json").read_text(encoding="utf-8"))

            self.assertEqual(1, report["accepted_occurrences"])
            self.assertEqual("generative_lsystem_recursion_depth_limit", canonical[0]["technical_name"])

    def test_collect_replaces_other_hyphens_with_underscores(self) -> None:
        payload = batch(1, ["mid-side_balance_ratio"])

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "answers.txt"
            source.write_text(json.dumps(payload), encoding="utf-8")
            output = root / "output"

            report = collector.collect([source], output, set())
            canonical = json.loads((output / "unified_parameters_lexical.json").read_text(encoding="utf-8"))

            self.assertEqual(1, report["accepted_occurrences"])
            self.assertEqual("mid_side_balance_ratio", canonical[0]["technical_name"])


if __name__ == "__main__":
    unittest.main()
