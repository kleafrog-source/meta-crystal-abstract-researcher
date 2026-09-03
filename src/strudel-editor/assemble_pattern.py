from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any

from build_pattern_index import embed_text


ROOT = Path(__file__).resolve().parent
INDEX_DIR = ROOT / "data" / "datasets" / "strudel_pattern_index"

ROLE_SLOT_MAP = {
    "SAMPLE": ["drums", "texture", "bass", "melody", "harmony"],
    "NOTE_PATTERN": ["melody", "harmony", "bass", "texture"],
    "STRUCT": ["drums", "timeline", "layer", "texture"],
}

ROLE_HINTS = {
    "drums": ["drum", "rhythm", "kick", "snare", "hat", "percussion", "groove", "beat"],
    "bass": ["bass", "sub", "low-end", "warm bass"],
    "melody": ["lead", "melody", "arp", "arpeggio", "hook", "riff"],
    "harmony": ["pad", "chord", "harmony", "voicing", "ambient pad"],
    "texture": ["texture", "noise", "atmosphere", "room", "space", "ambient"],
    "timeline": ["timeline", "arrangement", "section", "phrase"],
    "layer": ["layer", "stack", "combined", "full arrangement"],
}


def load_metadata(index_dir: Path) -> list[dict[str, Any]]:
    path = index_dir / "metadata.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a * a for a in vec_a))
    mag_b = math.sqrt(sum(b * b for b in vec_b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def retrieve(
    query: str,
    rows: list[dict[str, Any]],
    *,
    backend: str,
    model: str,
    host: str,
    dims: int,
    role: str | None = None,
    granularity: str | None = None,
    top_k: int = 8,
) -> list[dict[str, Any]]:
    filtered = rows
    if role:
        filtered = [row for row in filtered if row.get("role") == role]
    if granularity:
        filtered = [row for row in filtered if row.get("granularity") == granularity]
    query_vector = embed_text(query, backend=backend, model=model, host=host, dims=dims)
    scored = [(cosine_similarity(query_vector, row["vector"]), row) for row in filtered]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [{**row, "score": score} for score, row in scored[:top_k]]


def slot_names(template_expression: str) -> list[str]:
    return re.findall(r"\{([A-Z_0-9]+)\}", template_expression)


def compatibility_bonus(query: str, row: dict[str, Any], slot_name: str) -> float:
    bonus = 0.0
    query_lower = query.lower()
    role = row.get("role", "")
    for hint in ROLE_HINTS.get(role, []):
        if hint in query_lower:
            bonus += 0.03
    if slot_name.startswith("SAMPLE_") and row.get("sample_patterns"):
        bonus += 0.08
    if slot_name.startswith("NOTE_PATTERN_") and row.get("note_patterns"):
        bonus += 0.08
    if slot_name.startswith("STRUCT_") and row.get("struct_patterns"):
        bonus += 0.08
    if row.get("granularity") == "phrase":
        bonus += 0.03
    if row.get("granularity") == "atom":
        bonus += 0.01
    return bonus


def choose_macro_template(query: str, macro_hits: list[dict[str, Any]]) -> dict[str, Any]:
    ranked: list[tuple[float, dict[str, Any]]] = []
    for hit in macro_hits:
        slots = slot_names(hit["template_expression"])
        score = hit["score"]
        if slots:
            score += 0.18
            score += min(len(slots), 4) * 0.04
        if any(keyword in query.lower() for keyword in ("ambient", "pad", "bass", "drum", "arpeggio", "groove")):
            if hit.get("role") == "layer":
                score += 0.03
        ranked.append((score, hit))
    ranked.sort(key=lambda item: item[0], reverse=True)
    chosen = {**ranked[0][1], "macro_selection_score": ranked[0][0]}
    return chosen


def best_for_slot(
    query: str,
    rows: list[dict[str, Any]],
    slot_name: str,
    *,
    backend: str,
    model: str,
    host: str,
    dims: int,
    used_ids: set[str],
    top_k: int = 6,
) -> dict[str, Any] | None:
    slot_prefix = slot_name.split("_")[0]
    candidate_roles = ROLE_SLOT_MAP.get(slot_prefix, ["texture"])
    ranked: list[tuple[float, dict[str, Any]]] = []
    for role in candidate_roles:
        hits = retrieve(
            query,
            rows,
            backend=backend,
            model=model,
            host=host,
            dims=dims,
            role=role,
            granularity=None,
            top_k=top_k,
        )
        for hit in hits:
            if hit["id"] in used_ids:
                continue
            adjusted = hit["score"] + compatibility_bonus(query, hit, slot_name)
            ranked.append((adjusted, hit))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    best = {**ranked[0][1], "slot_selection_score": ranked[0][0]}
    return best


def resolve_slot_value(slot_name: str, filler: dict[str, Any]) -> str:
    if slot_name.startswith("SAMPLE_"):
        values = filler.get("sample_patterns") or []
        return values[0] if values else "bd"
    if slot_name.startswith("NOTE_PATTERN_"):
        values = filler.get("note_patterns") or []
        return values[0] if values else "0 2 4"
    if slot_name.startswith("STRUCT_"):
        values = filler.get("struct_patterns") or []
        return values[0] if values else "1 ~ 1 ~"
    return "?"


def strip_placeholder_quotes(expression: str) -> str:
    return re.sub(r'"(\{[A-Z_0-9]+\})"', r"\1", expression)


def assemble_code(template_expression: str, fillers_by_slot: dict[str, dict[str, Any]]) -> str:
    code = strip_placeholder_quotes(template_expression)
    for slot_name, filler in fillers_by_slot.items():
        code = code.replace(f"{{{slot_name}}}", resolve_slot_value(slot_name, filler))
    return code


def main() -> None:
    parser = argparse.ArgumentParser(description="Assemble Strudel code by filling macro template slots from semantic retrieval.")
    parser.add_argument("query", type=str)
    parser.add_argument("--index", type=Path, default=INDEX_DIR)
    parser.add_argument("--backend", choices=["hash", "ollama", "sentence-transformers"], default="hash")
    parser.add_argument("--model", default="qllama/bge-m3:q8_0")
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--hash-dims", type=int, default=768)
    args = parser.parse_args()

    rows = load_metadata(args.index.resolve())
    macro_hits = retrieve(
        args.query,
        rows,
        backend=args.backend,
        model=args.model,
        host=args.ollama_host,
        dims=args.hash_dims,
        granularity="macro",
        top_k=12,
    )
    if not macro_hits:
        raise SystemExit("No macro templates found.")

    template = choose_macro_template(args.query, macro_hits)
    template_slot_names = slot_names(template["template_expression"])

    fillers: dict[str, dict[str, Any]] = {}
    used_ids: set[str] = {template["id"]}
    for current_slot in template_slot_names:
        filler = best_for_slot(
            f"{args.query}\nslot:{current_slot}\nmacro:{template['template_expression']}",
            rows,
            current_slot,
            backend=args.backend,
            model=args.model,
            host=args.ollama_host,
            dims=args.hash_dims,
            used_ids=used_ids,
        )
        if filler:
            fillers[current_slot] = filler
            used_ids.add(filler["id"])

    final_code = assemble_code(template["template_expression"], fillers)
    payload = {
        "query": args.query,
        "macro_template": {
            "id": template["id"],
            "score": round(template["score"], 6),
            "selection_score": round(template.get("macro_selection_score", template["score"]), 6),
            "source_file": template["source_file"],
            "template_expression": template["template_expression"],
        },
        "macro_candidates": [
            {
                "id": hit["id"],
                "score": round(hit["score"], 6),
                "source_file": hit["source_file"],
                "slot_count": len(slot_names(hit["template_expression"])),
                "template_expression": hit["template_expression"],
            }
            for hit in macro_hits[:5]
        ],
        "slots": {
            slot_name: {
                "filler_id": filler["id"],
                "score": round(filler["score"], 6),
                "selection_score": round(filler.get("slot_selection_score", filler["score"]), 6),
                "role": filler["role"],
                "source_file": filler["source_file"],
                "template_expression": filler["template_expression"],
                "resolved_value": resolve_slot_value(slot_name, filler),
            }
            for slot_name, filler in fillers.items()
        },
        "code": final_code,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
