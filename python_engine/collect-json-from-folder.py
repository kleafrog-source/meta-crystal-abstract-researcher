#!/usr/bin/env python3
"""Collect Flowmusic lexical batches from .txt/.md files without losing provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "combinatorial-genesis" / "flowmusic-inbox"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "combinatorial-genesis" / "flowmusic-output"
DEFAULT_REFERENCE = (
    PROJECT_ROOT
    / "data"
    / "combinatorial-genesis"
    / "reference"
    / "base_parameters.json"
)
PROTOCOL = "FLOWMUSIC_LEXICAL_MULTI_ACCOUNT_V1"
TECHNICAL_NAME = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
UI_ELEMENTS = {"Range", "Select", "Toggle", "Text", "Array", "String"}
UNIT_ALIASES = {
    "hz": "hz",
    "db": "db",
    "decibels": "db",
    "ms": "ms",
    "milliseconds": "ms",
    "deg": "deg",
    "degrees": "deg",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def nearest_label(text: str, start: int, previous_end: int) -> str:
    prefix = text[previous_end:start]
    lines = [line.strip() for line in prefix.splitlines() if line.strip()]
    if not lines:
        return "unlabeled"
    label = lines[-1].strip("#*- ")
    return label[:160] or "unlabeled"


def extract_batches(text: str) -> list[dict[str, Any]]:
    """Use JSONDecoder.raw_decode so nested arrays/objects remain intact."""
    decoder = json.JSONDecoder()
    batches: list[dict[str, Any]] = []
    cursor = 0
    previous_end = 0

    while True:
        start = text.find("{", cursor)
        if start < 0:
            break
        try:
            payload, end = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            cursor = start + 1
            continue

        cursor = end
        if not isinstance(payload, dict) or not str(payload.get("collection_protocol", "")).startswith("FLOWMUSIC_"):
            continue

        raw_json = text[start:end]
        batches.append(
            {
                "source_label": nearest_label(text, start, previous_end),
                "raw_sha256": sha256_text(raw_json),
                "raw_json": raw_json,
                "payload": payload,
                "start_offset": start,
                "end_offset": end,
            }
        )
        previous_end = end

    return batches


def is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and abs(value) != float("inf")


def is_string_list(value: Any, expected: int | None = None) -> bool:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return False
    return expected is None or len(value) == expected


def normalize_technical_name(parameter: Any) -> tuple[Any, dict[str, str] | None]:
    """Normalize safe snake_case variants without guessing transliterations."""
    if not isinstance(parameter, dict):
        return parameter, None
    name = parameter.get("technical_name")
    if not isinstance(name, str):
        return parameter, None
    normalized = name.lower().replace("l-system", "lsystem")
    normalized = re.sub(r"-+", "_", normalized)
    if normalized == name or not TECHNICAL_NAME.fullmatch(normalized):
        return parameter, None
    result = deepcopy(parameter)
    result["technical_name"] = normalized
    return result, {"original": name, "normalized": normalized}


def validate_parameter(parameter: Any, index: int) -> list[str]:
    prefix = f"parameters[{index}]"
    errors: list[str] = []
    if not isinstance(parameter, dict):
        return [f"{prefix} must be an object"]

    name = parameter.get("technical_name")
    if not isinstance(name, str) or not TECHNICAL_NAME.fullmatch(name):
        errors.append(f"{prefix}.technical_name must be English snake_case")

    for field in ("name_ru", "description_en", "description_ru", "category", "sub_category", "unit"):
        if not isinstance(parameter.get(field), str) or not parameter[field].strip():
            errors.append(f"{prefix}.{field} is required")
    if len(str(parameter.get("name_ru", ""))) > 120:
        errors.append(f"{prefix}.name_ru exceeds 120 characters")
    if len(str(parameter.get("description_en", ""))) > 360:
        errors.append(f"{prefix}.description_en exceeds 360 characters")
    if len(str(parameter.get("description_ru", ""))) > 420:
        errors.append(f"{prefix}.description_ru exceeds 420 characters")
    quantity_kind = parameter.get("quantity_kind")
    if not isinstance(quantity_kind, str) or not TECHNICAL_NAME.fullmatch(quantity_kind):
        errors.append(f"{prefix}.quantity_kind must be non-empty English snake_case")

    ui_element = parameter.get("ui_element")
    if ui_element not in UI_ELEMENTS:
        errors.append(f"{prefix}.ui_element is unsupported")
    elif ui_element == "Range":
        values = [parameter.get(key) for key in ("min_value", "max_value", "step", "default")]
        if not all(is_finite_number(value) for value in values):
            errors.append(f"{prefix} Range values must be finite numbers")
        else:
            min_value, max_value, step, default = values
            if min_value > max_value:
                errors.append(f"{prefix}.min_value exceeds max_value")
            if not min_value <= default <= max_value:
                errors.append(f"{prefix}.default is outside the range")
            if step <= 0:
                errors.append(f"{prefix}.step must be positive")
    elif ui_element == "Select":
        options = parameter.get("options")
        if not is_string_list(options) or not options:
            errors.append(f"{prefix}.options must be a non-empty string array")
        else:
            if len(options) != len(set(options)):
                errors.append(f"{prefix}.options must be unique")
            if parameter.get("default") not in options:
                errors.append(f"{prefix}.default must be present in options")
    elif ui_element == "Toggle":
        if not (
            parameter.get("min_value") == 0
            and parameter.get("max_value") == 1
            and parameter.get("step") == 1
            and parameter.get("default") in (0, 1)
            and parameter.get("unit") == "boolean"
        ):
            errors.append(f"{prefix} Toggle requires min_value 0, max_value 1, step 1, default 0 or 1, and unit boolean")
    elif ui_element == "Text":
        if not isinstance(parameter.get("default"), str) or parameter.get("unit") != "text":
            errors.append(f"{prefix} Text requires a string default and unit text")
    elif ui_element == "String":
        if not isinstance(parameter.get("default"), str):
            errors.append(f"{prefix} String requires a string default")
    elif ui_element == "Array":
        default = parameter.get("default")
        if not isinstance(default, list) or not default or not all(is_finite_number(value) for value in default):
            errors.append(f"{prefix} Array requires a non-empty array of finite numbers as default")

    tags = parameter.get("lyria_prompt_tags")
    if not is_string_list(tags, 3) or any(not item.strip() for item in tags):
        errors.append(f"{prefix}.lyria_prompt_tags must contain exactly 3 non-empty strings")
    keywords = parameter.get("semantic_keywords")
    if not is_string_list(keywords, 7) or any(not item.strip() for item in keywords):
        errors.append(f"{prefix}.semantic_keywords must contain exactly 7 non-empty strings")
    elif any(not re.search(r"[А-Яа-яЁё]", item) for item in keywords[:3]) or any(re.search(r"[А-Яа-яЁё]", item) for item in keywords[3:]):
        errors.append(f"{prefix}.semantic_keywords must contain 3 Russian strings followed by 4 English strings")
    return errors


def validate_batch_details(
    payload: dict[str, Any],
) -> tuple[list[str], list[list[str]], list[str]]:
    batch_errors: list[str] = []
    warnings: list[str] = []
    if payload.get("collection_protocol") != PROTOCOL:
        batch_errors.append(f"collection_protocol must be {PROTOCOL}")
    batch_index = payload.get("batch_index")
    if not isinstance(batch_index, int) or isinstance(batch_index, bool) or batch_index < 1:
        batch_errors.append("batch_index must be a positive integer")
    parameters = payload.get("parameters")
    if not isinstance(parameters, list):
        return batch_errors + ["parameters must be an array"], [], warnings
    if not parameters:
        batch_errors.append("parameters must contain at least one parameter")
    names: list[str] = []
    parameter_errors: list[list[str]] = []
    for index, parameter in enumerate(parameters):
        parameter_errors.append(validate_parameter(parameter, index))
        if isinstance(parameter, dict) and isinstance(parameter.get("technical_name"), str):
            names.append(parameter["technical_name"])
    duplicates = [name for name, count in Counter(names).items() if count > 1]
    if duplicates:
        batch_errors.append(f"duplicate technical_name values inside batch: {', '.join(sorted(duplicates))}")
    return batch_errors, parameter_errors, warnings


def validate_batch(payload: dict[str, Any]) -> tuple[list[str], list[str]]:
    batch_errors, parameter_errors, warnings = validate_batch_details(payload)
    return batch_errors + [error for errors in parameter_errors for error in errors], warnings


def source_files(inputs: Iterable[Path]) -> list[Path]:
    files: set[Path] = set()
    for input_path in inputs:
        path = input_path.resolve()
        if path.is_file() and path.suffix.lower() in {".txt", ".md"}:
            files.add(path)
        elif path.is_dir():
            files.update(item.resolve() for item in path.rglob("*") if item.is_file() and item.suffix.lower() in {".txt", ".md"})
    return sorted(files, key=lambda item: str(item).lower())


def load_reference_names(path: Path | None) -> set[str]:
    if path is None or not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        str(item.get("technical_name"))
        for item in payload
        if isinstance(item, dict) and item.get("technical_name")
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalized_category(value: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value.lower())).strip("_")


def build_normalization_report(occurrences: list[dict[str, Any]]) -> dict[str, Any]:
    parameters = [entry["parameter"] for entry in occurrences]
    units: dict[str, set[str]] = defaultdict(set)
    categories: dict[str, set[str]] = defaultdict(set)
    unique_by_name: dict[str, dict[str, Any]] = {}

    for parameter in parameters:
        unit = str(parameter.get("unit", "")).strip()
        if unit:
            units[UNIT_ALIASES.get(unit.lower(), unit.lower())].add(unit)
        category = str(parameter.get("category", "")).strip()
        if category:
            categories[normalized_category(category)].add(category)
        name = str(parameter.get("technical_name", "")).strip().lower()
        if name and name not in unique_by_name:
            unique_by_name[name] = parameter

    near_pairs: list[dict[str, Any]] = []
    names = sorted(unique_by_name)
    for index, left in enumerate(names):
        left_tokens = set(left.split("_"))
        for right in names[index + 1 :]:
            right_tokens = set(right.split("_"))
            score = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
            if score >= 0.5:
                near_pairs.append(
                    {
                        "left": left,
                        "right": right,
                        "token_jaccard": round(score, 4),
                        "review_status": "pending",
                    }
                )

    return {
        "note": "Suggestions only; raw and canonical records were not rewritten.",
        "unit_alias_groups": {
            canonical: sorted(variants)
            for canonical, variants in sorted(units.items())
            if len(variants) > 1
        },
        "category_alias_groups": {
            canonical: sorted(variants)
            for canonical, variants in sorted(categories.items())
            if len(variants) > 1
        },
        "lexical_near_duplicate_pairs": sorted(
            near_pairs,
            key=lambda item: (-item["token_jaccard"], item["left"], item["right"]),
        ),
    }


def collect(files: list[Path], output_dir: Path, reference_names: set[str]) -> dict[str, Any]:
    batches: list[dict[str, Any]] = []
    occurrences: list[dict[str, Any]] = []
    rejected_occurrences: list[dict[str, Any]] = []
    file_reports: list[dict[str, Any]] = []

    for path in files:
        text = path.read_text(encoding="utf-8-sig")
        extracted = extract_batches(text)
        file_reports.append({"source_file": str(path), "batch_count": len(extracted), "file_sha256": sha256_text(text)})
        for ordinal, item in enumerate(extracted, start=1):
            payload = deepcopy(item["payload"])
            raw_parameters = payload.get("parameters")
            name_normalizations: dict[int, dict[str, str]] = {}
            if isinstance(raw_parameters, list):
                normalized_parameters = []
                for parameter_index, parameter in enumerate(raw_parameters):
                    normalized, normalization = normalize_technical_name(parameter)
                    normalized_parameters.append(normalized)
                    if normalization:
                        name_normalizations[parameter_index] = normalization
                payload["parameters"] = normalized_parameters
            batch_errors, parameter_errors, warnings = validate_batch_details(payload)
            errors = batch_errors + [error for item_errors in parameter_errors for error in item_errors]
            batch_id = f"{path.stem}:{ordinal}:b{payload.get('batch_index', 'unknown')}"
            parameters = payload.get("parameters") if isinstance(payload.get("parameters"), list) else []
            overlap_names = sorted(
                str(parameter.get("technical_name"))
                for parameter in parameters
                if isinstance(parameter, dict) and parameter.get("technical_name") in reference_names
            )
            batch_record = {
                "batch_id": batch_id,
                "source_file": str(path),
                "source_label": item["source_label"],
                "collection_protocol": payload.get("collection_protocol"),
                "batch_index": payload.get("batch_index"),
                "raw_sha256": item["raw_sha256"],
                "parameter_count": len(parameters),
                "reference_overlap_names": overlap_names,
                "valid": not errors,
                "errors": errors,
                "warnings": warnings,
                "parameter_reviews": [
                    {
                        "parameter_index": index,
                        "technical_name": parameter.get("technical_name") if isinstance(parameter, dict) else None,
                        "valid": not parameter_errors[index] and not batch_errors,
                        "errors": batch_errors + parameter_errors[index],
                        "technical_name_normalization": name_normalizations.get(index),
                    }
                    for index, parameter in enumerate(parameters)
                ],
                "raw_response": item["raw_json"],
            }
            batches.append(batch_record)
            for parameter_index, parameter in enumerate(parameters):
                if not isinstance(parameter, dict):
                    continue
                item_errors = batch_errors + parameter_errors[parameter_index]
                occurrence = {
                    "parameter": parameter,
                    "provenance": {
                        "batch_id": batch_id,
                        "source_file": str(path),
                        "source_label": item["source_label"],
                        "batch_index": payload.get("batch_index"),
                        "parameter_index": parameter_index,
                        "raw_sha256": item["raw_sha256"],
                        "technical_name_normalization": name_normalizations.get(parameter_index),
                    },
                }
                if item_errors:
                    occurrence["validation_errors"] = item_errors
                    rejected_occurrences.append(occurrence)
                else:
                    occurrences.append(occurrence)

    by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for occurrence in occurrences:
        name = str(occurrence["parameter"].get("technical_name", "")).strip().lower()
        if name:
            by_name[name].append(occurrence)

    canonical: list[dict[str, Any]] = []
    for name, grouped in sorted(by_name.items()):
        record = deepcopy(grouped[0]["parameter"])
        sources = [entry["provenance"] for entry in grouped]
        distinct_payloads = {
            json.dumps(entry["parameter"], ensure_ascii=False, sort_keys=True)
            for entry in grouped
        }
        record["_collection"] = {
            "occurrence_count": len(grouped),
            "source_count": len({(source["source_file"], source["source_label"]) for source in sources}),
            "reference_overlap": name in reference_names,
            "variant_count": len(distinct_payloads),
            "sources": sources,
        }
        canonical.append(record)

    duplicate_names = {
        name: len(grouped)
        for name, grouped in sorted(by_name.items())
        if len(grouped) > 1
    }
    rejection_reason_counts = Counter(
        error
        for occurrence in rejected_occurrences
        for error in occurrence.get("validation_errors", [])
    )
    invalid_batch_details = [
        {
            "batch_id": batch["batch_id"],
            "source_file": batch["source_file"],
            "source_label": batch["source_label"],
            "parameter_count": batch["parameter_count"],
            "errors": batch["errors"],
            "invalid_parameters": [review for review in batch["parameter_reviews"] if not review["valid"]],
        }
        for batch in batches
        if not batch["valid"]
    ]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "protocol": PROTOCOL,
        "files": file_reports,
        "files_processed": len(files),
        "batches_found": len(batches),
        "valid_batches": sum(1 for batch in batches if batch["valid"]),
        "invalid_batches": sum(1 for batch in batches if not batch["valid"]),
        "raw_occurrences": len(occurrences) + len(rejected_occurrences),
        "accepted_occurrences": len(occurrences),
        "rejected_occurrences": len(rejected_occurrences),
        "rejection_reason_counts": dict(sorted(rejection_reason_counts.items())),
        "invalid_batch_details": invalid_batch_details,
        "unique_exact_names": len(canonical),
        "duplicate_occurrences": len(occurrences) - len(canonical),
        "duplicate_names": duplicate_names,
        "reference_overlap_occurrences": sum(
            1 for occurrence in occurrences if occurrence["parameter"].get("technical_name") in reference_names
        ),
    }

    write_json(output_dir / "flowmusic_batches.json", batches)
    write_json(output_dir / "flowmusic_occurrences.json", occurrences)
    write_json(output_dir / "flowmusic_rejected_occurrences.json", rejected_occurrences)
    write_json(output_dir / "unified_parameters_lexical.json", canonical)
    write_json(output_dir / "collection_report.json", report)
    write_json(output_dir / "normalization_report.json", build_normalization_report(occurrences))
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="*", type=Path, help="Input .txt/.md files or folders")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--reference-dataset", type=Path, default=DEFAULT_REFERENCE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inputs = args.inputs or [DEFAULT_INPUT_DIR]
    files = source_files(inputs)
    if not files:
        print(f"No .txt/.md files found. Put exports in: {DEFAULT_INPUT_DIR}")
        return 1
    reference_names = load_reference_names(args.reference_dataset)
    report = collect(files, args.output_dir.resolve(), reference_names)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nOutput: {args.output_dir.resolve()}")
    return 0 if report["invalid_batches"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
