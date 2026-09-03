from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

from build_pattern_index import embed_text, resolve_backend
from intent_profile import profile_for_query


ROOT = Path(__file__).resolve().parent
INDEX_DIR = ROOT / "data" / "datasets" / "strudel_pattern_index"

SECTION_BLUEPRINTS = {
    16: [("intro", 2), ("main_a", 4), ("variation", 4), ("breakdown", 2), ("main_b", 4)],
    32: [("intro", 4), ("main_a", 8), ("variation", 8), ("breakdown", 4), ("main_b", 8)],
    48: [("intro", 4), ("main_a", 8), ("variation", 8), ("breakdown", 4), ("main_b", 8), ("lift", 8), ("outro", 8)],
    64: [("intro", 8), ("main_a", 8), ("variation", 8), ("breakdown", 8), ("main_b", 8), ("lift", 8), ("climax", 8), ("outro", 8)],
}

ROLE_ORDER = ["drums", "bass", "harmony", "melody", "texture"]
MAIN_SECTIONS = {"main_a", "variation", "main_b", "lift", "climax"}
TONAL_ROLES = {"bass", "harmony", "melody"}
SECTION_INTENSITY = {
    "intro": 0.28,
    "main_a": 0.68,
    "variation": 0.76,
    "breakdown": 0.22,
    "main_b": 0.82,
    "lift": 0.74,
    "climax": 0.92,
    "outro": 0.24,
}


def load_metadata(index_dir: Path) -> list[dict[str, Any]]:
    with (index_dir / "metadata.json").open("r", encoding="utf-8") as handle:
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


def retrieve_rows(query: str, rows: list[dict[str, Any]], *, backend: str, model: str, host: str, dims: int) -> list[dict[str, Any]]:
    query_vector = embed_text(query, backend=backend, model=model, host=host, dims=dims)
    scored = [{**row, "score": cosine_similarity(query_vector, row["vector"])} for row in rows]
    scored.sort(key=lambda row: row["score"], reverse=True)
    return scored


def choose_blueprint(bars_target: int) -> list[tuple[str, int]]:
    available = sorted(SECTION_BLUEPRINTS)
    selected = min(available, key=lambda bars: abs(bars - bars_target))
    return SECTION_BLUEPRINTS[selected]


def section_query(base_query: str, profile: dict[str, Any], section_name: str, role: str) -> str:
    moods = ", ".join(profile["moods"])
    return f"{base_query}\nsection:{section_name}\nrole:{role}\nmoods:{moods}\ncomplexity:{profile['complexity']}"


def safe_float(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, (int, float)) else fallback


def sanitize_expression(expression: str) -> str:
    expression = re.sub(r"//.*", "", expression)
    expression = re.sub(r"\._pianoroll\(\)", "", expression)
    expression = re.sub(r"\.pianoroll\(\)", "", expression)
    expression = re.sub(r"\.hush\(\)", "", expression)
    expression = re.sub(r"\n{3,}", "\n\n", expression)
    return expression.strip().rstrip(";")


def source_has_debug_markers(expression: str) -> bool:
    return bool(re.search(r"(?:_pianoroll|pianoroll|hush|mykeys|slider)", expression))


def strict_source_renderable(row: dict[str, Any], role: str, section_name: str) -> bool:
    expression = row.get("expression", "")
    sanitized = sanitize_expression(expression)
    unresolved = row.get("unresolved_identifiers") or []
    self_contained = safe_float(row.get("self_contained_score"), 0.0)
    methods = set(row.get("methods") or [])
    note_patterns = row.get("note_patterns") or []
    if self_contained < 0.94:
        return False
    if unresolved:
        return False
    if source_has_debug_markers(expression):
        return False
    if len(sanitized) > 320:
        return False
    if role in TONAL_ROLES and re.search(r"\b(?:rand|markov|pick|sometimesby|oftenby|rarelyby)\b", expression):
        return False
    if role in TONAL_ROLES and {"rand", "markov", "pick"} & methods:
        return False
    if role in TONAL_ROLES and "`" in expression:
        return False
    if role in TONAL_ROLES and any(len(pattern) > 96 for pattern in note_patterns):
        return False
    if role in {"bass", "melody"} and ".late(" in expression:
        return False
    if role == "melody" and ".struct(" in expression:
        return False
    if role == "bass" and "chord" in expression.lower():
        return False
    if role == "harmony" and row.get("target") == "note":
        return False
    if role == "melody" and row.get("estimated_bars") and safe_float(row.get("estimated_bars"), 0.0) < 2 and section_name in MAIN_SECTIONS:
        return False
    return True


def mood_overlap(profile: dict[str, Any], row: dict[str, Any]) -> int:
    return len(set(profile.get("moods", [])) & set(row.get("mood_tags", [])))


def row_has_role_material(row: dict[str, Any], role: str) -> bool:
    note_patterns = row.get("note_patterns") or []
    sample_patterns = row.get("sample_patterns") or []
    struct_patterns = row.get("struct_patterns") or []
    methods = set(row.get("methods") or [])
    target = row.get("target")
    if role == "drums":
        return bool(sample_patterns or struct_patterns or {"struct", "euclid"} & methods)
    if role == "bass":
        return bool(note_patterns or "bass" in (row.get("instrument_family") or ""))
    if role == "harmony":
        return bool(note_patterns or target == "chord" or {"chord", "voicing"} & methods)
    if role == "melody":
        return bool(note_patterns or target in {"note", "n"})
    if role == "texture":
        return bool(sample_patterns or {"room", "delay", "noise", "crush"} & methods or target in {"stack", "arrange"})
    return True


def row_is_usable(row: dict[str, Any], role: str, section_name: str) -> bool:
    if row["role"] != role:
        return False
    if not row_has_role_material(row, role):
        return False
    self_contained = safe_float(row.get("self_contained_score"), 0.0)
    unresolved = row.get("unresolved_identifiers") or []
    if self_contained < 0.26:
        return False
    if len(unresolved) > 6:
        return False
    estimated_bars = safe_float(row.get("estimated_bars"), 0.0)
    if section_name in MAIN_SECTIONS and estimated_bars and estimated_bars < 2:
        return False
    return True


def row_bonus(profile: dict[str, Any], section_name: str, role: str, row: dict[str, Any]) -> float:
    bonus = 0.0
    intensity = safe_float(row.get("intensity_score"), 0.5)
    density = safe_float(row.get("density_score"), 0.5)
    if role == row["role"]:
        bonus += 0.1
    if section_name in row.get("section_fit", []):
        bonus += 0.12
    if section_name.startswith("main") and row.get("has_slots"):
        bonus += 0.08
    target_intensity = SECTION_INTENSITY.get(section_name, 0.55)
    bonus += max(-0.08, 0.1 - abs(intensity - target_intensity) * 0.22)
    if section_name in {"intro", "breakdown", "outro"} and intensity < 0.55:
        bonus += 0.06
    if section_name in {"main_a", "main_b", "climax", "lift"} and intensity > 0.45:
        bonus += 0.06
    if section_name in MAIN_SECTIONS and density > 0.52:
        bonus += 0.05
    if section_name in {"intro", "breakdown", "outro"} and density < 0.64:
        bonus += 0.04
    if profile["prefers_minor"] and row.get("tone_family") == "minor":
        bonus += 0.04
    if profile["prefers_major"] and row.get("tone_family") == "major":
        bonus += 0.04
    overlap = mood_overlap(profile, row)
    if overlap:
        bonus += min(0.08, overlap * 0.03)
    self_contained = row.get("self_contained_score")
    if isinstance(self_contained, (int, float)):
        bonus += max(-0.22, (self_contained - 0.5) * 0.25)
    if row.get("unresolved_identifiers"):
        bonus -= min(0.24, len(row["unresolved_identifiers"]) * 0.04)
    if source_has_debug_markers(row.get("expression", "")):
        bonus -= 0.12
    return bonus


def layer_compatibility_bonus(row: dict[str, Any], chosen_layers: list[dict[str, Any]], usage_counts: dict[str, int]) -> float:
    bonus = 0.0
    sample_patterns = set(row.get("sample_patterns") or [])
    moods = set(row.get("mood_tags") or [])
    row_tone = row.get("tone_family")
    row_family = row.get("instrument_family")
    source_file = row.get("source_file")
    for other in chosen_layers:
        if other["id"] == row["id"]:
            bonus -= 0.2
        if other.get("source_file") == source_file:
            bonus -= 0.03
        if sample_patterns and sample_patterns & set(other.get("sample_patterns") or []):
            bonus -= 0.04
        if moods & set(other.get("mood_tags") or []):
            bonus += 0.025
        if row_tone and other.get("tone_family") == row_tone:
            bonus += 0.03
        if row_family and other.get("instrument_family") == row_family and row["role"] != other["role"]:
            bonus -= 0.03
    bonus -= min(0.16, usage_counts.get(row["id"], 0) * 0.05)
    return bonus


def choose_role_layer(query: str, rows: list[dict[str, Any]], profile: dict[str, Any], section_name: str, role: str, chosen_layers: list[dict[str, Any]], usage_counts: dict[str, int], *, backend: str, model: str, host: str, dims: int) -> dict[str, Any] | None:
    pool = [row for row in rows if row_is_usable(row, role, section_name)]
    ranked = retrieve_rows(query, pool, backend=backend, model=model, host=host, dims=dims)
    best = None
    best_score = -1.0
    for row in ranked[:18]:
        score = row["score"] + row_bonus(profile, section_name, role, row)
        score += layer_compatibility_bonus(row, chosen_layers, usage_counts)
        if score > best_score:
            best_score = score
            best = {**row, "selection_score": score}
    return best


def pick_value(row: dict[str, Any], kind: str, fallback: str) -> str:
    values = row.get(kind) or []
    return values[0] if values else fallback


def choose_scale(profile: dict[str, Any], role: str) -> str:
    if profile.get("prefers_major"):
        return "C4:major" if role != "bass" else "C2:major"
    if profile.get("prefers_minor") or "ambient" in profile.get("moods", []) or "aggressive" in profile.get("moods", []):
        return "A4:minor" if role != "bass" else "A2:minor"
    return "D4:dorian" if role != "bass" else "D2:dorian"


def choose_gain(section_name: str) -> float:
    if section_name == "intro":
        return 0.72
    if section_name == "breakdown":
        return 0.58
    if section_name in {"main_b", "climax"}:
        return 1.08
    if section_name == "lift":
        return 0.92
    return 1.0


def scale_root(scale: str) -> str:
    return scale.split(":", 1)[0]


def scale_mode(scale: str) -> str:
    return scale.split(":", 1)[1] if ":" in scale else "minor"


def section_scale(profile: dict[str, Any], role: str, section_name: str) -> str:
    base = choose_scale(profile, role)
    root = scale_root(base)
    mode = scale_mode(base)
    if role == "bass":
        if section_name == "breakdown":
            return f"{root}:{mode}"
        if section_name in {"variation", "main_b", "climax"}:
            return f"{root}:{mode}"
        return base
    if role == "harmony" and section_name == "breakdown":
        return f"{root}:{mode}"
    if role == "melody":
        if section_name in {"variation", "main_b", "climax"} and mode == "minor":
            return f"{root}:minor"
        return base
    return base


def choose_struct(row: dict[str, Any], role: str, section_name: str, profile: dict[str, Any]) -> str:
    default_patterns = {
        "drums": {
            "intro": "x ~ ~ ~",
            "main_a": "x ~ x [~ x]",
            "variation": "x [~ x] x*2 ~",
            "breakdown": "~ ~ x ~",
            "main_b": "x [~ x] [x x] ~",
            "lift": "x*2 [~ x] x ~",
            "climax": "x [x x] x*2 [~ x]",
            "outro": "x ~ ~ [~ x]",
        },
        "texture": {
            "intro": "x ~",
            "main_a": "x ~ x ~",
            "variation": "x [~ x] x ~",
            "breakdown": "~ x",
            "main_b": "x ~ x [~ x]",
            "lift": "x [x x]",
            "climax": "x*2 x ~",
            "outro": "x ~",
        },
    }
    struct_patterns = row.get("struct_patterns") or []
    if struct_patterns and role == "drums":
        return struct_patterns[0]
    if role in default_patterns:
        return default_patterns[role][section_name]
    return "x ~ x ~"


def choose_note_pattern(row: dict[str, Any], role: str, section_name: str, profile: dict[str, Any]) -> str:
    query_moods = set(profile.get("moods", []))
    source = row.get("note_patterns") or []
    if source:
        return source[0]
    arpeggio = "playful" in query_moods or "arpeggio" in " ".join(query_moods)
    if role == "bass":
        if "ambient" in query_moods:
            return "0 ~ 0 ~ 3 ~ 5 ~"
        if "aggressive" in query_moods:
            return "0 0 ~ 2 3 ~ 5 ~"
        return "0 ~ 2 ~ 3 ~ 5 ~"
    if role == "harmony":
        if section_name == "breakdown":
            return "[0,2,4] ~ [3,5,7] ~"
        if section_name in {"lift", "climax"}:
            return "[0,2,4] [4,6,8] [3,5,7] [5,7,9]"
        return "[0,2,4] [3,5,7] [4,6,8] [1,3,5]"
    if role == "melody":
        if arpeggio:
            if section_name in {"main_b", "climax"}:
                return "0 2 4 7 9 7 4 2"
            if section_name == "variation":
                return "0 4 7 9 7 4 2 0"
            return "0 2 4 7"
        if "ambient" in query_moods:
            return "0 ~ 2 ~ 4 ~ 7 ~"
        return "0 3 5 7"
    return "0 2 4 7"


def choose_sample(row: dict[str, Any], role: str, profile: dict[str, Any]) -> str:
    sample_patterns = row.get("sample_patterns") or []
    if sample_patterns:
        return sample_patterns[0]
    query_moods = set(profile.get("moods", []))
    if role == "drums":
        return "bd hh sd hh"
    if role == "bass":
        return "sawtooth" if "aggressive" in query_moods else "triangle"
    if role == "harmony":
        return "triangle" if "ambient" in query_moods else "supersaw"
    if role == "melody":
        return "square"
    return "crackle"


def canonical_role_code(row: dict[str, Any], role: str, section_name: str, profile: dict[str, Any]) -> str:
    gain = choose_gain(section_name)
    struct = choose_struct(row, role, section_name, profile)
    sample = choose_sample(row, role, profile)
    note_pattern = choose_note_pattern(row, role, section_name, profile)
    scale = choose_scale(profile, role)

    if role == "drums":
        accent = ".distort(0.12)" if section_name in {"main_b", "climax"} and "aggressive" in profile.get("moods", []) else ""
        return f's("{sample}").struct("{struct}").gain({gain}){accent}'
    if role == "bass":
        bass_sample = sample if sample not in {"bd", "sd", "hh", "bd hh sd hh"} else "sawtooth"
        cutoff = 320 if section_name == "breakdown" else 540
        return f'n("{note_pattern}").scale("{scale}").s("{bass_sample}").lpf({cutoff}).gain({gain})'
    if role == "harmony":
        chord_pattern = note_pattern if "[" in note_pattern or "," in note_pattern else "[0,2,4] [3,5,7] [4,6,8] [1,3,5]"
        synth = sample if sample not in {"bd", "sd", "hh", "bd hh sd hh"} else "triangle"
        room = 0.7 if "ambient" in profile.get("moods", []) else 0.42
        return f'n("{chord_pattern}").scale("{scale}").s("{synth}").room({room}).gain({gain})'
    if role == "melody":
        lead_sample = sample if sample not in {"bd", "sd", "hh", "bd hh sd hh"} else "square"
        speed = ".fast(2)" if section_name in {"variation", "climax"} else ""
        return f'n("{note_pattern}").scale("{scale}").s("{lead_sample}").gain({gain}){speed}'
    texture_sample = sample if sample else "crackle"
    room = 0.85 if section_name in {"intro", "breakdown", "outro"} else 0.62
    return f's("{texture_sample}").struct("{struct}").room({room}).gain({gain})'


def render_layer(row: dict[str, Any], role: str, section_name: str, profile: dict[str, Any]) -> tuple[str, str]:
    source_expression = sanitize_expression(row["expression"])
    if strict_source_renderable(row, role, section_name) and row_has_role_material(row, role):
        return source_expression, "source"
    return canonical_role_code(row, role, section_name, profile), "canonical"


def inject_scale_if_missing(code: str, scale: str) -> str:
    if ".scale(" in code:
        return re.sub(r"\.scale\((\"[^\"]+\"|'[^']+')\)", f'.scale("{scale}")', code, count=1)
    for token in ('n("', "n('", 'note("', "note('", 'chord("', "chord('"):
        index = code.find(token)
        if index != -1:
            insert_at = index + len(token)
            closing = code.find(")", insert_at)
            if closing != -1:
                return code[: closing + 1] + f'.scale("{scale}")' + code[closing + 1 :]
    return code


def normalize_gain(code: str, target_gain: float) -> str:
    if ".gain(" in code:
        return re.sub(r"\.gain\([^)]+\)", f".gain({target_gain})", code, count=1)
    return f"{code}.gain({target_gain})"


def normalize_tonal_layer_code(code: str, role: str, section_name: str, profile: dict[str, Any]) -> str:
    if role not in TONAL_ROLES:
        return code
    scale = section_scale(profile, role, section_name)
    normalized = inject_scale_if_missing(code, scale)
    normalized = normalize_gain(normalized, choose_gain(section_name))
    if role == "bass" and ".lpf(" not in normalized:
        cutoff = 320 if section_name == "breakdown" else 540
        normalized = f"{normalized}.lpf({cutoff})"
    if role == "harmony" and ".room(" not in normalized:
        room = 0.7 if "ambient" in profile.get("moods", []) else 0.42
        normalized = f"{normalized}.room({room})"
    if role == "melody" and "playful" in profile.get("moods", []) and section_name in {"variation", "main_b", "climax"} and ".fast(" not in normalized:
        normalized = f"{normalized}.fast(2)"
    return normalized


def post_assembly_normalize_sections(sections: list[dict[str, Any]], profile: dict[str, Any]) -> list[dict[str, Any]]:
    normalized_sections: list[dict[str, Any]] = []
    for section in sections:
        normalized_layers = []
        for layer in section["layers"]:
            normalized_code = normalize_tonal_layer_code(layer["rendered_code"], layer["role"], section["section"], profile)
            normalized_layers.append({**layer, "rendered_code": sanitize_expression(normalized_code)})
        body = ",\n  ".join(layer["rendered_code"] for layer in normalized_layers)
        normalized_sections.append({**section, "layers": normalized_layers, "code": f"stack(\n  {body}\n)"})
    return normalized_sections


def assemble_section(section_name: str, bars: int, layers: list[dict[str, Any]]) -> dict[str, Any]:
    rendered_layers = []
    for layer in layers:
        rendered_code, render_mode = render_layer(layer, layer["role"], section_name, layer["intent_profile"])
        rendered_layers.append(
            {
                "id": layer["id"],
                "role": layer["role"],
                "source_file": layer["source_file"],
                "selection_score": round(layer["selection_score"], 6),
                "self_contained_score": safe_float(layer.get("self_contained_score"), 0.0),
                "unresolved_identifiers": layer.get("unresolved_identifiers", []),
                "instrument_family": layer.get("instrument_family"),
                "mood_tags": layer.get("mood_tags", []),
                "estimated_bars": layer.get("estimated_bars"),
                "rendered_code": rendered_code,
                "render_mode": render_mode,
            }
        )
    body = ",\n  ".join(layer["rendered_code"] for layer in rendered_layers)
    code = f"stack(\n  {body}\n)"
    return {
        "section": section_name,
        "bars": bars,
        "layers": rendered_layers,
        "code": code,
    }


def post_normalize(sections: list[dict[str, Any]], profile: dict[str, Any]) -> str:
    bpm = sum(profile["tempo_range"]) / 2
    cpm = max(10, round(bpm / 4, 2))
    arranged = ",\n  ".join(f'[{section["bars"]}, {section["code"]}]' for section in sections)
    return sanitize_expression(f"arrange(\n  {arranged}\n).cpm({cpm})\n") + "\n"


def score_track(profile: dict[str, Any], sections: list[dict[str, Any]]) -> dict[str, Any]:
    section_count = len(sections)
    total_bars = sum(section["bars"] for section in sections)
    roles_present = {layer["role"] for section in sections for layer in section["layers"]}
    render_modes = Counter(layer["render_mode"] for section in sections for layer in section["layers"])
    unresolved_total = sum(len(layer.get("unresolved_identifiers", [])) for section in sections for layer in section["layers"])
    unique_codes = len({layer["rendered_code"] for section in sections for layer in section["layers"]})
    total_layers = sum(len(section["layers"]) for section in sections)
    avg_unique_ratio = unique_codes / max(total_layers, 1)
    debug_marker_count = sum(1 for section in sections for layer in section["layers"] if source_has_debug_markers(layer["rendered_code"]))
    canonical_ratio = sum(1 for section in sections for layer in section["layers"] if layer["render_mode"] == "canonical") / max(total_layers, 1)
    requested_role_coverage = len(set(profile.get("requested_roles", [])) & roles_present) / max(1, len(set(profile.get("requested_roles", []))))
    long_tonal_count = sum(
        1
        for section in sections
        for layer in section["layers"]
        if layer["role"] in TONAL_ROLES and len(layer["rendered_code"]) > 180
    )
    score = 0.0
    score += min(1.0, section_count / 6) * 0.16
    score += min(1.0, len(roles_present) / 5) * 0.15
    score += min(1.0, total_bars / max(profile["bars_target"], 1)) * 0.14
    score += requested_role_coverage * 0.12
    if profile["requires_variation"] and any(section["section"] == "variation" for section in sections):
        score += 0.08
    if any(section["section"] == "breakdown" for section in sections):
        score += 0.07
    if any(section["section"] in {"main_b", "climax"} for section in sections):
        score += 0.07
    score += min(0.1, avg_unique_ratio * 0.1)
    if render_modes.get("source", 0) >= max(1, total_layers // 3):
        score += 0.05
    missing_main_roles = 0
    for section in sections:
        if section["section"] not in MAIN_SECTIONS:
            continue
        present = {layer["role"] for layer in section["layers"]}
        for role in {"drums", "bass", "harmony"}:
            if role not in present:
                missing_main_roles += 1
    score -= min(0.22, missing_main_roles * 0.03)
    score -= min(0.36, unresolved_total * 0.025)
    score -= min(0.18, debug_marker_count * 0.06)
    if canonical_ratio > 0.55:
        score -= min(0.18, (canonical_ratio - 0.55) * 0.45)
    score -= min(0.16, long_tonal_count * 0.04)
    if avg_unique_ratio < 0.55:
        score -= 0.12
    if requested_role_coverage < 0.75:
        score -= 0.12
    score = max(0.0, min(0.92, score))
    twenty_scale = round(score * 20, 2)
    return {
        "score_0_1": round(score, 4),
        "score_20": twenty_scale,
        "total_bars": total_bars,
        "section_count": section_count,
        "roles_present": sorted(roles_present),
        "unresolved_identifier_count": unresolved_total,
        "unique_layer_ratio": round(avg_unique_ratio, 4),
        "render_modes": dict(render_modes),
        "debug_marker_count": debug_marker_count,
        "canonical_ratio": round(canonical_ratio, 4),
        "requested_role_coverage": round(requested_role_coverage, 4),
        "long_tonal_count": long_tonal_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose a multi-section Strudel track from semantic pattern retrieval.")
    parser.add_argument("query", type=str)
    parser.add_argument("--index", type=Path, default=INDEX_DIR)
    parser.add_argument("--backend", choices=["auto", "hash", "ollama", "sentence-transformers"], default="auto")
    parser.add_argument("--model", default="qllama/bge-m3:q8_0")
    parser.add_argument("--ollama-host", default="http://localhost:11434")
    parser.add_argument("--hash-dims", type=int, default=768)
    args = parser.parse_args()

    actual_backend = resolve_backend(args.backend, args.ollama_host)
    rows = load_metadata(args.index.resolve())
    profile = profile_for_query(args.query)
    blueprint = choose_blueprint(profile["bars_target"])
    usage_counts: dict[str, int] = {}
    sections = []

    for section_name, bars in blueprint:
        layers = []
        active_roles = [role for role in ROLE_ORDER if role in profile["requested_roles"] or role in {"drums", "bass", "harmony"}]
        if section_name in {"intro", "outro"}:
            active_roles = [role for role in active_roles if role != "melody"] + ["texture"]
        if section_name == "breakdown":
            active_roles = [role for role in active_roles if role in {"bass", "harmony", "texture"}]
        for role in active_roles:
            row = choose_role_layer(
                section_query(args.query, profile, section_name, role),
                rows,
                profile,
                section_name,
                role,
                layers,
                usage_counts,
                backend=actual_backend,
                model=args.model,
                host=args.ollama_host,
                dims=args.hash_dims,
            )
            if row:
                usage_counts[row["id"]] = usage_counts.get(row["id"], 0) + 1
                row["intent_profile"] = profile
                layers.append(row)
        if layers:
            section = assemble_section(section_name, bars, layers)
            sections.append(section)

    sections = post_assembly_normalize_sections(sections, profile)
    final_code = post_normalize(sections, profile)
    quality = score_track(profile, sections)
    print(
        json.dumps(
            {
                "query": args.query,
                "backend": actual_backend,
                "intent_profile": profile,
                "blueprint": blueprint,
                "sections": sections,
                "quality": quality,
                "code": final_code,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
