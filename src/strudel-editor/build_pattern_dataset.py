from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
PARSED_ROOT = ROOT / "data" / "datasets" / "parsed_patterns"
OUTPUT_ROOT = ROOT / "data" / "datasets"
JSONL_PATH = OUTPUT_ROOT / "strudel_patterns.jsonl"
PARQUET_PATH = OUTPUT_ROOT / "strudel_patterns.parquet"
MANIFEST_PATH = OUTPUT_ROOT / "strudel_patterns_manifest.json"


def load_records(parsed_root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted(parsed_root.glob("*.json")):
        if path.name == "manifest.json":
            continue
        with path.open("r", encoding="utf-8") as handle:
            records.append(json.load(handle))
    return records


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


ALLOWED_IDENTIFIERS = {
    "n", "note", "s", "sound", "stack", "arrange", "chord", "cat",
    "scale", "struct", "room", "gain", "lpf", "hpf", "clip", "attack",
    "release", "pan", "delay", "dict", "voicing", "anchor", "mask",
    "add", "sub", "transpose", "color", "piano", "bank", "begin", "end",
    "mode", "pick", "pickrestart", "slow", "fast", "rev", "euclid",
    "segment", "seg", "sometimesby", "oftenby", "rarelyby", "degradeby",
    "velocity", "late", "early", "layer", "apply", "mask", "hush", "whenmod",
    "every", "ply", "echo", "distort", "crush", "adsr", "fm", "am",
    "sine", "square", "triangle", "sawtooth", "supersaw", "noise",
    "rand", "irand", "perlin", "range", "jux", "reverb", "rsize", "rfade",
    "rdim", "rlp", "orbit", "out", "in", "setcpm", "setcps",
}


def count_pattern_atoms(values: list[str]) -> int:
    if not values:
        return 0
    total = 0
    for value in values:
        tokens = re.findall(r"[A-Za-z0-9_#~<>@!*.,:/+\-\[\]]+", value)
        total += len(tokens)
    return total


def estimate_length_bars(record: dict[str, Any], granularity: str) -> int:
    payload = " ".join(
        [
            *record.get("note_patterns", []),
            *record.get("sample_patterns", []),
            *record.get("struct_patterns", []),
        ]
    )
    payload = payload or record["expression"]
    if any(symbol in payload for symbol in ("@16", "*16", "/16", "!16")):
        return 16
    if any(symbol in payload for symbol in ("@8", "*8", "/8", "!8")):
        return 8
    if granularity == "macro":
        return 8
    if granularity == "phrase":
        return 4
    return 2


def detect_intensity(record: dict[str, Any], role: str) -> float:
    text = " ".join(
        [
            record["expression"],
            *record.get("sample_patterns", []),
            *record.get("note_patterns", []),
        ]
    ).lower()
    score = 0.35
    if role == "drums":
        score += 0.18
    if any(token in text for token in ("distort", "crush", "bd", "sd", "metal", "gunshot")):
        score += 0.22
    if any(token in text for token in ("room", "pad", "warm", "noise", "crackle", "triangle", "sine")):
        score -= 0.08
    if any(token in text for token in ("fast", "*8", "*16", "euclid", "hh")):
        score += 0.1
    return max(0.0, min(1.0, round(score, 3)))


def detect_density(record: dict[str, Any], granularity: str) -> float:
    count = count_pattern_atoms(record.get("note_patterns", []) + record.get("sample_patterns", []) + record.get("struct_patterns", []))
    base = count / 18
    if granularity == "macro":
        base += 0.15
    elif granularity == "phrase":
        base += 0.08
    return max(0.0, min(1.0, round(base, 3)))


def infer_mood_tags(record: dict[str, Any], role: str) -> list[str]:
    text = " ".join([record["expression"], *record.get("sample_patterns", []), *record.get("note_patterns", [])]).lower()
    tags: list[str] = []
    if any(token in text for token in ("room", "pad", "triangle", "sine", "noise", "crackle")):
        tags.append("ambient")
    if any(token in text for token in ("distort", "crush", "gunshot", "overdriven")):
        tags.append("aggressive")
    if any(token in text for token in ("hh", "bd", "sd", "euclid")):
        tags.append("groovy")
    if role in {"harmony", "layer"}:
        tags.append("harmonic")
    if role == "melody":
        tags.append("lead")
    if role == "bass":
        tags.append("low-end")
    return sorted(set(tags))


def infer_section_fit(role: str, intensity: float, density: float, granularity: str) -> list[str]:
    fits = ["body"]
    if granularity == "macro":
        fits.append("main")
    if intensity < 0.45:
        fits.extend(["intro", "breakdown", "outro"])
    if intensity > 0.58 or role == "drums":
        fits.extend(["drop", "climax"])
    if role in {"texture", "harmony"}:
        fits.append("transition")
    if density < 0.35:
        fits.append("sparse")
    if density > 0.7:
        fits.append("dense")
    return sorted(set(fits))


def infer_tone_family(record: dict[str, Any]) -> str | None:
    text = " ".join(record.get("note_patterns", [])).lower()
    if ":minor" in text or "m7" in text or "dim" in text:
        return "minor"
    if ":major" in text or "maj" in text:
        return "major"
    return None


def infer_instrument_family(record: dict[str, Any], role: str) -> str:
    text = " ".join(record.get("sample_patterns", [])).lower()
    if role == "drums":
        return "percussion"
    if "bass" in text:
        return "bass"
    if any(token in text for token in ("pad", "strings", "ensemble")):
        return "pad"
    if any(token in text for token in ("guitar", "piano", "harmonica", "oboe", "clarinet", "sax")):
        return "acoustic-ish"
    if any(token in text for token in ("saw", "square", "triangle", "sine", "supersaw")):
        return "synth"
    return "mixed"


def strip_strings_and_comments(expression: str) -> str:
    expression = re.sub(r"//.*", "", expression)
    expression = re.sub(r"/\*.*?\*/", "", expression, flags=re.DOTALL)
    expression = re.sub(r'"(?:\\.|[^"])*"', '""', expression)
    expression = re.sub(r"'(?:\\.|[^'])*'", "''", expression)
    expression = re.sub(r"`(?:\\.|[^`])*`", "``", expression)
    return expression


def unresolved_identifiers(record: dict[str, Any]) -> list[str]:
    source = strip_strings_and_comments(record["expression"])
    source = re.sub(r"\.[A-Za-z_][A-Za-z0-9_]*", " ", source)
    tokens = re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", source)
    known = set(ALLOWED_IDENTIFIERS)
    known.update(record.get("methods", []))
    known.add(record["target"])
    unresolved = []
    for token in tokens:
        normalized = token.lower()
        if normalized in known:
            continue
        if token in {"true", "false", "null", "undefined", "return", "const", "let", "var", "if", "else"}:
            continue
        unresolved.append(token)
    return sorted(set(unresolved))


def compute_self_contained_score(record: dict[str, Any], unresolved: list[str]) -> float:
    score = 1.0
    score -= min(0.75, len(unresolved) * 0.12)
    if re.search(r"\b(?:note|n|s|chord)\(\s*\)", record["expression"]):
        score -= 0.22
    if record["target"] == "arrange":
        score -= 0.12
    if len(record["expression"]) > 420:
        score -= 0.08
    if re.search(r"\b(?:hush|mykeys|slider)\b", record["expression"]):
        score -= 0.18
    if re.search(r"(?:_pianoroll|pianoroll)\s*\(", record["expression"]):
        score -= 0.12
    if re.search(r"//", record["expression"]):
        score -= 0.08
    return max(0.0, min(1.0, round(score, 3)))


def detect_granularity(record: dict[str, Any]) -> str:
    target = record["target"]
    expression = record["expression"]
    if target in {"stack", "arrange"}:
        return "macro"
    if len(record.get("note_patterns", [])) + len(record.get("sample_patterns", [])) > 1:
        return "phrase"
    if ".struct(" in expression or ".layer(" in expression:
        return "phrase"
    return "atom"


def detect_role(record: dict[str, Any]) -> str:
    target = record["target"]
    samples = " ".join(record.get("sample_patterns", []))
    methods = set(record.get("methods", []))
    note_patterns = record.get("note_patterns", [])
    if target == "arrange":
        return "timeline"
    if target == "stack":
        return "layer"
    if "bd" in samples or "sd" in samples or "hh" in samples or "rim" in samples:
        return "drums"
    if "bass" in samples or any("bass" in item.lower() for item in note_patterns):
        return "bass"
    if target in {"note", "n", "chord", "cat"}:
        if "voicing" in methods or target == "chord":
            return "harmony"
        return "melody"
    return "texture"


def build_template(record: dict[str, Any]) -> tuple[str, list[str]]:
    template = record["expression"]
    slots: list[str] = []
    replacements = [
        ("note_patterns", "NOTE_PATTERN"),
        ("sample_patterns", "SAMPLE"),
        ("struct_patterns", "STRUCT"),
    ]
    for field, token in replacements:
        for index, value in enumerate(record.get(field, []), start=1):
            slot = f"{token}_{index}"
            literal_variants = [f'"{value}"', f"'{value}'", f"`{value}`"]
            for literal in literal_variants:
                if literal in template:
                    template = template.replace(literal, f'"{{{slot}}}"', 1)
                    slots.append(slot)
                    break
    return template, slots


def build_retrieval_text(record: dict[str, Any], template: str, slots: list[str]) -> str:
    parts = [
        f"target: {record['target']}",
        f"role: {record['role']}",
        f"granularity: {record['granularity']}",
        f"source: {record['source_file']}",
    ]
    if record.get("label"):
        parts.append(f"label: {record['label']}")
    if record.get("tempo_markers"):
        parts.append(f"tempo: {'; '.join(record['tempo_markers'])}")
    if record.get("sample_patterns"):
        parts.append(f"samples: {' ; '.join(record['sample_patterns'])}")
    if record.get("note_patterns"):
        parts.append(f"note_patterns: {' ; '.join(record['note_patterns'])}")
    if record.get("struct_patterns"):
        parts.append(f"struct_patterns: {' ; '.join(record['struct_patterns'])}")
    if record.get("methods"):
        parts.append(f"methods: {' '.join(record['methods'])}")
    if slots:
        parts.append(f"template_slots: {' '.join(slots)}")
    parts.append(f"template: {normalize_space(template)}")
    parts.append(f"context: {normalize_space(record['context_block'])}")
    return "\n".join(parts)


def to_dataset_row(record: dict[str, Any]) -> dict[str, Any]:
    template, slots = build_template(record)
    granularity = detect_granularity(record)
    role = detect_role(record)
    density = detect_density(record, granularity)
    intensity = detect_intensity(record, role)
    mood_tags = infer_mood_tags(record, role)
    section_fit = infer_section_fit(role, intensity, density, granularity)
    unresolved = unresolved_identifiers(record)
    row = {
        "id": record["id"],
        "source_file": record["source_file"],
        "target": record["target"],
        "label": record.get("label"),
        "line_start": record["line_start"],
        "line_end": record["line_end"],
        "granularity": granularity,
        "role": role,
        "expression": record["expression"],
        "context_block": record["context_block"],
        "template_expression": template,
        "template_slots": slots,
        "primary_arg": record.get("primary_arg"),
        "sample_patterns": record.get("sample_patterns", []),
        "note_patterns": record.get("note_patterns", []),
        "struct_patterns": record.get("struct_patterns", []),
        "methods": record.get("methods", []),
        "transport_methods": record.get("transport_methods", []),
        "tempo_markers": record.get("tempo_markers", []),
        "has_slots": bool(slots),
        "estimated_bars": estimate_length_bars(record, granularity),
        "density_score": density,
        "intensity_score": intensity,
        "mood_tags": mood_tags,
        "section_fit": section_fit,
        "tone_family": infer_tone_family(record),
        "instrument_family": infer_instrument_family(record, role),
        "unresolved_identifiers": unresolved,
        "self_contained_score": compute_self_contained_score(record, unresolved),
    }
    row["retrieval_text"] = build_retrieval_text({**record, "granularity": granularity, "role": role}, template, slots)
    return row


def write_jsonl(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_parquet(rows: list[dict[str, Any]], path: Path) -> str:
    try:
        import pandas as pd
    except ImportError:
        return "skipped:pandas-not-installed"

    try:
        dataframe = pd.DataFrame(rows)
        dataframe.to_parquet(path, index=False)
        return "written"
    except Exception as error:  # pragma: no cover - environment dependent
        return f"skipped:{type(error).__name__}"


def write_manifest(rows: list[dict[str, Any]], parquet_status: str, path: Path) -> None:
    manifest = {
        "rows": len(rows),
        "targets": dict(sorted(Counter(row["target"] for row in rows).items())),
        "roles": dict(sorted(Counter(row["role"] for row in rows).items())),
        "granularity": dict(sorted(Counter(row["granularity"] for row in rows).items())),
        "section_fit": dict(sorted(Counter(tag for row in rows for tag in row["section_fit"]).items())),
        "jsonl": str(JSONL_PATH),
        "parquet": str(PARQUET_PATH),
        "parquet_status": parquet_status,
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build unified Strudel pattern dataset from parsed pattern files.")
    parser.add_argument("--input", type=Path, default=PARSED_ROOT)
    parser.add_argument("--jsonl", type=Path, default=JSONL_PATH)
    parser.add_argument("--parquet", type=Path, default=PARQUET_PATH)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()

    records = load_records(args.input.resolve())
    rows = [to_dataset_row(record) for record in records]
    write_jsonl(rows, args.jsonl.resolve())
    parquet_status = write_parquet(rows, args.parquet.resolve())
    write_manifest(rows, parquet_status, args.manifest.resolve())
    print(f"Built dataset with {len(rows)} rows")
    print(f"JSONL: {args.jsonl.resolve()}")
    print(f"Parquet: {args.parquet.resolve()} [{parquet_status}]")


if __name__ == "__main__":
    main()
