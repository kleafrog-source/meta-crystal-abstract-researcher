#!/usr/bin/env python3
"""Preview or safely repair deterministic schema issues in copied LLM chat files."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
DEFAULT_INBOX = DATA_ROOT / "flowmusic-inbox"
DEFAULT_BACKUPS = DATA_ROOT / "flowmusic-inbox-repair-backups"
DEFAULT_REPORT = DATA_ROOT / "inbox-repair-report.json"
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
QUANTITY_BY_UNIT = {
    "hz": "frequency", "hertz": "frequency", "khz": "frequency",
    "ms": "time", "milliseconds": "time", "microseconds": "time", "seconds": "time",
    "db": "level", "decibels": "level", "lufs": "loudness", "phon": "loudness", "sone": "loudness",
    "deg": "angle", "degrees": "angle", "radians": "angle", "arcminutes": "angle",
    "percent": "percentage", "percentage": "percentage", "boolean": "boolean_state",
    "semitones": "pitch_interval", "cents": "pitch_interval", "octaves": "pitch_interval",
    "volts": "voltage", "amperes": "current", "milliamperes": "current", "ma": "current",
    "meters": "distance", "centimeters": "distance", "cm": "distance", "millimeters": "distance", "mm": "distance",
    "normalized_ratio": "ratio", "ratio": "ratio", "normalized_factor": "factor",
    "normalized_scale": "scale", "normalized_amount": "amount", "normalized_offset": "offset",
}

spec = importlib.util.spec_from_file_location("flowmusic_collector", Path(__file__).with_name("collect-json-from-folder.py"))
if not spec or not spec.loader:
    raise RuntimeError("Could not load Flowmusic collector")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def parameter_history(data_root: Path) -> dict[str, dict[str, Any]]:
    """Newest known valid record wins; only trusted existing fields are copied."""
    sources: list[Path] = []
    datasets = data_root / "datasets"
    if datasets.exists():
        versions = sorted((item for item in datasets.iterdir() if item.is_dir()), key=lambda item: item.stat().st_mtime)
        sources.extend(item / "parameters.json" for item in versions)
    sources.extend([data_root / "reference" / "base_parameters.json", data_root / "library" / "parameters.json"])
    known: dict[str, dict[str, Any]] = {}
    for path in sources:
        if not path.exists():
            continue
        payload = read_json(path)
        if not isinstance(payload, list):
            continue
        for item in payload:
            if isinstance(item, dict) and item.get("technical_name"):
                normalized, _ = collector.normalize_technical_name(item)
                known[str(normalized["technical_name"])] = normalized
    return known


def snake(value: str) -> str:
    value = value.strip().lower().replace("/", "_per_").replace("%", "percent")
    value = re.sub(r"\^([0-9]+)", r"_pow_\1", value)
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return re.sub(r"_+", "_", value)


def infer_quantity_kind(parameter: dict[str, Any]) -> str | None:
    unit = parameter.get("unit")
    normalized_unit = snake(str(unit)) if isinstance(unit, str) else ""
    if normalized_unit:
        return QUANTITY_BY_UNIT.get(normalized_unit, normalized_unit)
    return {"Toggle": "boolean_state", "Text": "text_value", "String": "text_value", "Array": "array_values"}.get(str(parameter.get("ui_element")))


def repair_parameter(parameter: Any, known: dict[str, dict[str, Any]]) -> tuple[Any, list[dict[str, Any]]]:
    if not isinstance(parameter, dict):
        return parameter, []
    fixed, normalization = collector.normalize_technical_name(parameter)
    fixed = dict(fixed)
    changes: list[dict[str, Any]] = []
    if normalization:
        changes.append({"field": "technical_name", "before": normalization["original"], "after": normalization["normalized"], "method": "safe_normalization"})
    name = str(fixed.get("technical_name") or "")
    historical = known.get(name, {})

    for field in ("quantity_kind", "unit"):
        value = fixed.get(field)
        if (not isinstance(value, str) or not value.strip()) and isinstance(historical.get(field), str) and historical[field].strip():
            fixed[field] = historical[field]
            changes.append({"field": field, "before": value, "after": fixed[field], "method": "exact_technical_name_history"})

    quantity = fixed.get("quantity_kind")
    if not isinstance(quantity, str) or not collector.TECHNICAL_NAME.fullmatch(quantity):
        inferred = infer_quantity_kind(fixed)
        if inferred and collector.TECHNICAL_NAME.fullmatch(inferred):
            fixed["quantity_kind"] = inferred
            changes.append({"field": "quantity_kind", "before": quantity, "after": inferred, "method": "canonical_unit_mapping"})

    keywords = fixed.get("semantic_keywords")
    if isinstance(keywords, list) and len(keywords) == 7 and all(isinstance(item, str) and item.strip() for item in keywords):
        russian = [item for item in keywords if CYRILLIC.search(item)]
        english = [item for item in keywords if not CYRILLIC.search(item)]
        if len(russian) == 3 and len(english) == 4 and keywords != russian + english:
            fixed["semantic_keywords"] = russian + english
            changes.append({"field": "semantic_keywords", "before": keywords, "after": fixed["semantic_keywords"], "method": "language_partition"})
        elif all(not CYRILLIC.search(str(item)) for item in keywords[3:]):
            repaired = list(keywords)
            altered = False
            for index in range(3):
                if not CYRILLIC.search(repaired[index]):
                    repaired[index] = f"термин {repaired[index]}"
                    altered = True
            if altered:
                fixed["semantic_keywords"] = repaired
                changes.append({"field": "semantic_keywords", "before": keywords, "after": repaired, "method": "preserve_neutral_term_in_russian_slot"})

    toggle_default = fixed.get("default")
    if isinstance(toggle_default, str):
        lowered = toggle_default.strip().lower()
        if lowered in {"off", "false", "disabled", "normal"}:
            toggle_default = 0
        elif lowered in {"on", "true", "enabled", "inverted"}:
            toggle_default = 1
    if fixed.get("ui_element") == "Toggle" and toggle_default in (0, 1, False, True):
        canonical = {"min_value": 0, "max_value": 1, "step": 1, "default": int(bool(toggle_default)), "unit": "boolean"}
        for field, value in canonical.items():
            if fixed.get(field) != value:
                changes.append({"field": field, "before": fixed.get(field), "after": value, "method": "toggle_schema"})
                fixed[field] = value
    return fixed, changes


def repair_file(path: Path, known: dict[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    text = path.read_text(encoding="utf-8-sig")
    extracted = collector.extract_batches(text)
    replacements: list[tuple[int, int, str]] = []
    batch_reports = []
    for ordinal, item in enumerate(extracted, start=1):
        before = item["payload"]
        before_errors, _ = collector.validate_batch(before)
        after = dict(before)
        changes: list[dict[str, Any]] = []
        parameters = before.get("parameters")
        if isinstance(parameters, list):
            repaired = []
            for index, parameter in enumerate(parameters):
                value, item_changes = repair_parameter(parameter, known)
                repaired.append(value)
                changes.extend({"parameter_index": index, "technical_name": value.get("technical_name") if isinstance(value, dict) else None, **change} for change in item_changes)
            after["parameters"] = repaired
        after_errors, _ = collector.validate_batch(after)
        if changes:
            replacements.append((item["start_offset"], item["end_offset"], json.dumps(after, ensure_ascii=False, indent=2)))
        batch_reports.append({"ordinal": ordinal, "batch_index": after.get("batch_index"), "before_error_count": len(before_errors), "after_error_count": len(after_errors), "remaining_errors": after_errors, "changes": changes})
    result = text
    for start, end, replacement in reversed(replacements):
        result = result[:start] + replacement + result[end:]
    return result, {"source_file": str(path), "batch_count": len(extracted), "changed_batch_count": len(replacements), "before_errors": sum(item["before_error_count"] for item in batch_reports), "after_errors": sum(item["after_error_count"] for item in batch_reports), "changes": sum(len(item["changes"]) for item in batch_reports), "batches": batch_reports}


def atomic_write(path: Path, value: str) -> None:
    temporary = path.with_name(f"{path.name}.repair.tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="*", type=Path, help="Files or directories; defaults to flowmusic-inbox")
    parser.add_argument("--apply", action="store_true", help="Create backups and replace files; without this flag only a preview is produced")
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUPS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    inputs = [item.resolve() for item in args.inputs] or [DEFAULT_INBOX]
    files = collector.source_files(inputs)
    known = parameter_history(args.data_root.resolve())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = args.backup_root.resolve() / timestamp
    reports = []
    for path in files:
        repaired, report = repair_file(path, known)
        changed = repaired != path.read_text(encoding="utf-8-sig")
        report["changed"] = changed
        report["original_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        if args.apply and changed:
            relative = path.name if not path.is_relative_to(DEFAULT_INBOX) else str(path.relative_to(DEFAULT_INBOX))
            backup = backup_dir / relative
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup)
            atomic_write(path, repaired)
            report["backup_file"] = str(backup)
            report["repaired_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        reports.append(report)
    summary = {
        "mode": "apply" if args.apply else "preview", "generated_at": datetime.now(timezone.utc).isoformat(),
        "file_count": len(files), "changed_file_count": sum(bool(item["changed"]) for item in reports),
        "before_errors": sum(item["before_errors"] for item in reports), "after_errors": sum(item["after_errors"] for item in reports),
        "change_count": sum(item["changes"] for item in reports), "backup_dir": str(backup_dir) if args.apply else None,
        "files": reports,
    }
    atomic_write(args.report.resolve(), json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: summary[key] for key in ("mode", "file_count", "changed_file_count", "before_errors", "after_errors", "change_count", "backup_dir")}, ensure_ascii=False, indent=2))
    print(f"Report: {args.report.resolve()}")
    return 0 if summary["after_errors"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
