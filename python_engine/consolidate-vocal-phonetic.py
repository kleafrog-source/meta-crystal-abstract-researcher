#!/usr/bin/env python3
"""Consolidate copied Flowmusic vocal-phonetic responses without losing provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "new-flowmusic-sync-parameters-task"
OUTPUT_DIR = ROOT / "data" / "combinatorial-genesis" / "vocal-phonetic"
LIBRARY = ROOT / "data" / "combinatorial-genesis" / "library" / "parameters.json"
PROTOCOL = "VOCAL_PHONETIC_PARAMETER_SYSTEM_V1"
PLACEHOLDERS = {"example_vocal_control_property"}
SOURCES = (
    SOURCE_DIR / "flowmusic-session.txt",
    SOURCE_DIR / "2-or 3 extra parameters written here - chat-Flowmusic Vocal Matrix Protocol.txt",
)


def digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def extract_batches(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8-sig")
    decoder = json.JSONDecoder()
    cursor = 0
    results: list[dict[str, Any]] = []
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
        if not isinstance(payload, dict) or payload.get("collection_protocol") != PROTOCOL:
            continue
        parameters = payload.get("parameters")
        if not isinstance(parameters, list):
            continue
        results.append({
            "source_file": path.name,
            "batch_index": payload.get("batch_index"),
            "start_offset": start,
            "raw_sha256": hashlib.sha256(text[start:end].encode("utf-8")).hexdigest(),
            "parameters": parameters,
        })
    return results


def validation_errors(parameter: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    name = parameter.get("technical_name")
    if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", name):
        errors.append("technical_name must be lowercase English snake_case")
    for field in ("name_ru", "description_en", "description_ru", "category", "sub_category", "unit", "quantity_kind"):
        if not isinstance(parameter.get(field), str) or not parameter[field].strip():
            errors.append(f"{field} is required")
    ui = parameter.get("ui_element")
    if ui == "Range":
        values = [parameter.get(key) for key in ("min_value", "max_value", "step", "default")]
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in values):
            errors.append("Range requires numeric min_value, max_value, step and default")
        elif not (values[0] <= values[3] <= values[1] and values[2] > 0):
            errors.append("Range bounds, step or default are invalid")
    elif ui == "Select":
        options = parameter.get("options")
        if not isinstance(options, list) or not options or not all(isinstance(item, str) and item for item in options):
            errors.append("Select requires non-empty string options")
        elif parameter.get("default") not in options:
            errors.append("Select default is not present in options")
        elif len(options) != len(set(options)):
            errors.append("Select options contain duplicates")
    elif ui == "Toggle":
        if parameter.get("default") not in (0, 1, False, True):
            errors.append("Toggle default must be boolean or 0/1")
    else:
        errors.append(f"unsupported ui_element: {ui}")
    tags = parameter.get("lyria_prompt_tags")
    if not isinstance(tags, list) or len(tags) != 3 or not all(isinstance(item, str) and item for item in tags):
        errors.append("lyria_prompt_tags must contain exactly 3 strings")
    keywords = parameter.get("semantic_keywords")
    if not isinstance(keywords, list) or len(keywords) != 7 or not all(isinstance(item, str) and item for item in keywords):
        errors.append("semantic_keywords must contain exactly 7 strings")
    return errors


def normalize_safe(parameter: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Repair representation-only issues while preserving parameter semantics."""
    result = deepcopy(parameter)
    changes: list[str] = []
    if result.get("ui_element") == "Select" and isinstance(result.get("options"), list):
        unique = list(dict.fromkeys(result["options"]))
        if len(unique) != len(result["options"]):
            result["options"] = unique
            changes.append("deduplicated Select options while preserving order")
    if result.get("ui_element") == "Toggle" and result.get("default") in {"enabled", "disabled"}:
        result["default"] = 1 if result["default"] == "enabled" else 0
        result["min_value"] = 0
        result["max_value"] = 1
        result["step"] = 1
        result["unit"] = "boolean"
        result.pop("options", None)
        changes.append("normalized enabled/disabled Toggle to boolean 0/1")
    return result, changes


def choose_conflict_variant(variants: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    """Prefer richer controlled vocabularies and directional value descriptions."""
    def score(item: dict[str, Any]) -> tuple[int, int, int, int]:
        parameter = item["parameter"]
        description = str(parameter.get("description_en", "")).lower()
        directional = int("lower values" in description and "higher values" in description)
        options = len(parameter.get("options", [])) if isinstance(parameter.get("options"), list) else 0
        return options, directional, item["occurrences"], len(description)

    selected = max(variants, key=score)
    return selected["parameter"], "selected richest options/directional description, then strongest provenance"


def schema_group(category: str) -> str:
    if any(token in category for token in ("language", "phonetic", "polyglot", "glossolalia", "linguistic", "meta_tagging")):
        return "language_and_phonetics"
    if any(token in category for token in ("spatial", "binaural", "mastering", "stereo", "mix_engineering")):
        return "spatial_and_mastering"
    if any(token in category for token in ("generative", "algorithmic", "midi", "transport", "recursion", "omega", "tier", "vector", "stability", "metric", "evolutionary")):
        return "generative_and_transport"
    if any(token in category for token in ("dsp", "processing", "modulation", "distortion", "synthesis", "phase", "envelope", "spectral", "dynamics", "granular", "stochastic", "nonlinear", "material", "acoustic", "psychoacoustic")):
        return "dsp_and_fx_processing"
    return "vocal_morphology"


def property_schema(parameter: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "title": parameter["name_ru"],
        "description": parameter["description_en"],
        "x_description_ru": parameter["description_ru"],
        "x_category": parameter["category"],
        "x_sub_category": parameter["sub_category"],
        "x_unit": parameter["unit"],
        "x_quantity_kind": parameter["quantity_kind"],
        "x_lyria_prompt_tags": parameter["lyria_prompt_tags"],
        "x_semantic_keywords": parameter["semantic_keywords"],
    }
    if parameter["ui_element"] == "Range":
        result.update(type="number", minimum=parameter["min_value"], maximum=parameter["max_value"], multipleOf=parameter["step"], default=parameter["default"])
    elif parameter["ui_element"] == "Select":
        result.update(type="string", enum=parameter["options"], default=parameter["default"])
    else:
        result.update(type="boolean", default=bool(parameter["default"]))
    return result


def build_schema(parameters: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, dict[str, Any]] = defaultdict(dict)
    for parameter in parameters:
        groups[schema_group(parameter["category"])][parameter["technical_name"]] = property_schema(parameter)
    properties: dict[str, Any] = {}
    for group, entries in sorted(groups.items()):
        properties[group] = {
            "type": "object",
            "additionalProperties": False,
            "properties": dict(sorted(entries.items())),
            "required": sorted(entries),
        }
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://meta-crystal.local/schemas/vocal-phonetic-parameter-system-v1.json",
        "title": "Vocal Phonetic Parameter System V1",
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": sorted(properties),
        "x_vocal_matrix_format": "[iso_lang⊕iso_lang]-[TECH4]-[FX4]_[I][S][E][A]",
        "x_vocal_matrix_presets": {
            "germanic_precision": {"languages": ["de", "goh"], "technique": "VGUT", "fx": "DRV1"},
            "nordic_frost": {"languages": ["is", "sv"], "technique": "VFRY", "fx": ["PSH1", "GRN1"]},
            "latin_gothic": {"languages": ["lat", "prg"], "technique": ["VCLR", "VGUT"], "fx": "RVB1"},
            "nippon_cyber": {"languages": ["ja"], "technique": ["VFRY", "VCLR"], "fx": "FMT1"},
            "slavic_brutality": {"languages": ["cu", "orv"], "technique": "VGUT", "fx": "PSH1"},
            "polyglot_singularity": {"minimum_languages": 3, "technique": "VGUT", "fx": "GRN1"},
            "ambient_post_metal": {"languages": ["is", "cy"], "technique": "VWSP", "fx": ["DLY1", "RVB1"]},
        },
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def consolidate() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    occurrences: dict[str, list[dict[str, Any]]] = defaultdict(list)
    batches: list[dict[str, Any]] = []
    placeholders: list[dict[str, Any]] = []
    for path in SOURCES:
        for batch in extract_batches(path):
            batches.append({key: value for key, value in batch.items() if key != "parameters"} | {"parameter_count": len(batch["parameters"])})
            for index, parameter in enumerate(batch["parameters"]):
                if not isinstance(parameter, dict) or not isinstance(parameter.get("technical_name"), str):
                    continue
                origin = {
                    "source_file": batch["source_file"],
                    "batch_index": batch["batch_index"],
                    "parameter_index": index,
                    "raw_sha256": batch["raw_sha256"],
                }
                if parameter["technical_name"] in PLACEHOLDERS:
                    placeholders.append({"parameter": parameter, "origin": origin, "reason": "explicit schema placeholder"})
                    continue
                occurrences[parameter["technical_name"]].append({"parameter": parameter, "origin": origin})

    # The user supplied batch 42 is byte-for-byte equivalent at parameter level to this
    # full 138-option record already copied in the secondary transcript as batch 41.
    manual = occurrences.get("parallel_vocal_spectral_separation_strategy", [])
    if manual:
        manual[0].setdefault("additional_origins", []).append({
            "source": "user_supplied_batch_42",
            "batch_index": 42,
            "session_url": "https://www.flowmusic.app/session/9d98bcef-a5a1-4df5-9373-0cd776c687ff",
        })

    accepted: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    resolutions: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    normalizations: list[dict[str, Any]] = []
    provenance: dict[str, Any] = {}
    for name, variants in sorted(occurrences.items()):
        by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for variant in variants:
            by_hash[digest(variant["parameter"])].append(variant)
        summarized_variants = [
            {
                "sha256": key,
                "parameter": values[0]["parameter"],
                "origins": [item["origin"] for item in values],
                "occurrences": len(values),
            }
            for key, values in by_hash.items()
        ]
        if len(by_hash) > 1:
            conflict = {
                "technical_name": name,
                "variant_count": len(by_hash),
                "variants": summarized_variants,
            }
            conflicts.append(conflict)
            parameter, reason = choose_conflict_variant(summarized_variants)
            resolutions.append({
                "technical_name": name,
                "selected_sha256": digest(parameter),
                "reason": reason,
            })
        else:
            parameter = deepcopy(variants[0]["parameter"])
        parameter, changes = normalize_safe(parameter)
        if changes:
            normalizations.append({"technical_name": name, "changes": changes})
        errors = validation_errors(parameter)
        if errors:
            rejected.append({"technical_name": name, "errors": errors, "parameter": parameter, "origins": [item["origin"] for item in variants]})
            continue
        accepted.append(parameter)
        origins = [item["origin"] for item in variants]
        for item in variants:
            origins.extend(item.get("additional_origins", []))
        provenance[name] = origins

    report = {
        "protocol": PROTOCOL,
        "source_files": [str(path) for path in SOURCES],
        "batches_found": len(batches),
        "batch_indices": sorted({item["batch_index"] for item in batches if isinstance(item["batch_index"], int)}),
        "occurrences": sum(len(items) for items in occurrences.values()),
        "unique_technical_names": len(occurrences),
        "accepted_unique": len(accepted),
        "conflicting_unique": len(conflicts),
        "auto_resolved_conflicts": len(resolutions),
        "rejected_unique": len(rejected),
        "safe_normalizations": len(normalizations),
        "placeholder_occurrences": len(placeholders),
        "ui_elements": dict(Counter(item["ui_element"] for item in accepted)),
        "select_option_count": sum(len(item.get("options", [])) for item in accepted if item["ui_element"] == "Select"),
        "largest_selects": sorted(
            ({"technical_name": item["technical_name"], "options": len(item.get("options", []))} for item in accepted if item["ui_element"] == "Select"),
            key=lambda item: item["options"], reverse=True,
        )[:20],
        "conflicts": conflicts,
        "resolutions": resolutions,
        "normalizations": normalizations,
        "rejected": rejected,
        "placeholders": placeholders,
        "provenance": provenance,
    }
    return accepted, report


def apply_to_library(parameters: list[dict[str, Any]]) -> dict[str, int]:
    library = json.loads(LIBRARY.read_text(encoding="utf-8"))
    existing = {item.get("technical_name") for item in library}
    additions = []
    for parameter in parameters:
        if parameter["technical_name"] in existing:
            continue
        item = deepcopy(parameter)
        item["_source_protocol"] = PROTOCOL
        item["_source_collection"] = "flowmusic_vocal_phonetic_consolidated_v1"
        additions.append(item)
    if additions:
        write_json(LIBRARY, library + additions)
    return {"before": len(library), "added": len(additions), "after": len(library) + len(additions)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Append accepted, non-conflicting records to the V3 library")
    args = parser.parse_args()
    accepted, report = consolidate()
    schema = build_schema(accepted)
    write_json(OUTPUT_DIR / "parameters.json", accepted)
    write_json(OUTPUT_DIR / "schema.json", schema)
    # Replace the earlier incomplete generated schema beside the copied sessions.
    write_json(SOURCE_DIR / "vocal_phonetic_parameter_system_v1_schema.json", schema)
    if args.apply:
        report["library_update"] = apply_to_library(accepted)
    write_json(OUTPUT_DIR / "report.json", report)
    print(json.dumps({key: value for key, value in report.items() if key not in {"conflicts", "rejected", "placeholders", "provenance"}}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
