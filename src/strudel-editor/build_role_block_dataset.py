from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
PATTERN_DATASET_JSONL = ROOT / "data" / "datasets" / "strudel_patterns.jsonl"
OUTPUT_ROOT = ROOT / "data" / "datasets"
JSONL_PATH = OUTPUT_ROOT / "strudel_role_blocks.jsonl"
MANIFEST_PATH = OUTPUT_ROOT / "strudel_role_blocks_manifest.json"

ROLE_WHITELIST = {"drums", "bass", "harmony", "melody", "texture"}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def infer_style_tags(row: dict[str, Any]) -> list[str]:
    text = " ".join(
        [
            row.get("expression", ""),
            row.get("template_expression", ""),
            *(row.get("sample_patterns") or []),
            *(row.get("mood_tags") or []),
        ]
    ).lower()
    tags: list[str] = []
    if any(token in text for token in ("square", "chiptune", "8bit", "arcade", "game")):
        tags.append("retro")
    if any(token in text for token in ("pad", "room", "triangle", "crackle", "ambient", "drone")):
        tags.append("ambient")
    if any(token in text for token in ("distort", "crush", "noise", "metal", "industrial", "harsh")):
        tags.append("industrial")
    if any(token in text for token in ("euclid", "glitch", "broken", "fractured")):
        tags.append("idm")
    if any(token in text for token in ("delay", "echo", "dub", "chord")):
        tags.append("dub")
    if any(token in text for token in ("tribal", "ritual", "percussion")):
        tags.append("tribal")
    return sorted(set(tags))


def infer_scale_hint(row: dict[str, Any]) -> str | None:
    expression = " ".join([row.get("expression", ""), row.get("template_expression", "")]).lower()
    match = re.search(r'scale\("([^"]+)"\)', expression)
    if match:
        return match.group(1)
    tone_family = row.get("tone_family")
    if tone_family == "minor":
        return "A4:minor"
    if tone_family == "major":
        return "C4:major"
    return None


def infer_section_role(row: dict[str, Any]) -> str:
    section_fit = set(row.get("section_fit") or [])
    if {"intro", "outro"} & section_fit and row.get("intensity_score", 0.5) < 0.45:
        return "support"
    if {"drop", "climax"} & section_fit and row.get("intensity_score", 0.5) > 0.6:
        return "peak"
    if row.get("role") in {"harmony", "texture"}:
        return "bed"
    if row.get("role") in {"melody", "bass"}:
        return "driver"
    return "support"


def build_retrieval_text(row: dict[str, Any], style_tags: list[str], scale_hint: str | None, section_role: str) -> str:
    parts = [
        f"role: {row['role']}",
        f"source: {row.get('source_file', '')}",
        f"granularity: {row.get('granularity', '')}",
        f"bars: {row.get('estimated_bars', '')}",
        f"energy: {row.get('intensity_score', '')}",
        f"density: {row.get('density_score', '')}",
        f"section_role: {section_role}",
    ]
    if style_tags:
        parts.append(f"styles: {' '.join(style_tags)}")
    if scale_hint:
        parts.append(f"scale_hint: {scale_hint}")
    if row.get("instrument_family"):
        parts.append(f"instrument_family: {row['instrument_family']}")
    if row.get("mood_tags"):
        parts.append(f"moods: {' '.join(row['mood_tags'])}")
    if row.get("section_fit"):
        parts.append(f"section_fit: {' '.join(row['section_fit'])}")
    parts.append(f"code: {row.get('template_expression') or row.get('expression')}")
    return " | ".join(str(part) for part in parts if part)


def to_role_block(row: dict[str, Any]) -> dict[str, Any] | None:
    role = row.get("role")
    if role not in ROLE_WHITELIST:
        return None
    self_contained = float(row.get("self_contained_score", 0.0) or 0.0)
    unresolved = row.get("unresolved_identifiers") or []
    if self_contained < 0.72:
        return None
    if len(unresolved) > 2:
        return None

    style_tags = infer_style_tags(row)
    scale_hint = infer_scale_hint(row)
    section_role = infer_section_role(row)
    source_id = str(row.get("id"))
    block_id = hashlib.sha1(f"{source_id}:{role}".encode("utf-8")).hexdigest()[:16]
    renderable_code = row.get("template_expression") or row.get("expression")
    retrieval_text = build_retrieval_text(row, style_tags, scale_hint, section_role)

    return {
        "id": block_id,
        "source_id": source_id,
        "source_file": row.get("source_file"),
        "role": role,
        "block_type": section_role,
        "granularity": row.get("granularity"),
        "estimated_bars": row.get("estimated_bars"),
        "energy": row.get("intensity_score"),
        "density": row.get("density_score"),
        "section_fit": row.get("section_fit", []),
        "style_tags": style_tags,
        "mood_tags": row.get("mood_tags", []),
        "instrument_family": row.get("instrument_family"),
        "tone_family": row.get("tone_family"),
        "scale_hint": scale_hint,
        "sample_patterns": row.get("sample_patterns", []),
        "note_patterns": row.get("note_patterns", []),
        "struct_patterns": row.get("struct_patterns", []),
        "methods": row.get("methods", []),
        "renderable_code": renderable_code,
        "retrieval_text": retrieval_text,
    }


def write_jsonl(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_manifest(rows: list[dict[str, Any]], path: Path) -> None:
    manifest = {
        "rows": len(rows),
        "roles": dict(sorted(Counter(row["role"] for row in rows).items())),
        "block_types": dict(sorted(Counter(row["block_type"] for row in rows).items())),
        "style_tags": dict(sorted(Counter(tag for row in rows for tag in row["style_tags"]).items())),
        "jsonl": str(JSONL_PATH),
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build role-block dataset from the unified Strudel pattern dataset.")
    parser.add_argument("--input", type=Path, default=PATTERN_DATASET_JSONL)
    parser.add_argument("--jsonl", type=Path, default=JSONL_PATH)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()

    rows = load_jsonl(args.input.resolve())
    blocks = [block for row in rows if (block := to_role_block(row))]
    write_jsonl(blocks, args.jsonl.resolve())
    write_manifest(blocks, args.manifest.resolve())
    print(f"Built role-block dataset with {len(blocks)} rows")


if __name__ == "__main__":
    main()
