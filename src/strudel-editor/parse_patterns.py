from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "data" / "datasets" / "strudel_code_corpus"
DEFAULT_OUTPUT = ROOT / "data" / "datasets" / "parsed_patterns"
TARGETS = ("note", "sound", "stack", "arrange", "s", "n", "chord", "cat")


@dataclass
class Match:
    target: str
    start: int
    end: int
    expression: str


def line_number(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def column_number(text: str, index: int) -> int:
    last_break = text.rfind("\n", 0, index)
    return index + 1 if last_break == -1 else index - last_break


def read_string(text: str, index: int) -> int:
    quote = text[index]
    index += 1
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if quote == "`" and char == "$" and index + 1 < len(text) and text[index + 1] == "{":
            index = read_braced(text, index + 1)
            continue
        if char == quote:
            return index + 1
        index += 1
    return len(text)


def read_line_comment(text: str, index: int) -> int:
    end = text.find("\n", index)
    return len(text) if end == -1 else end


def read_block_comment(text: str, index: int) -> int:
    end = text.find("*/", index + 2)
    return len(text) if end == -1 else end + 2


def read_braced(text: str, index: int) -> int:
    return read_group(text, index, "{", "}")


def read_group(text: str, index: int, opener: str, closer: str) -> int:
    depth = 0
    while index < len(text):
        char = text[index]
        if char in ("'", '"', "`"):
            index = read_string(text, index)
            continue
        if text.startswith("//", index):
            index = read_line_comment(text, index)
            continue
        if text.startswith("/*", index):
            index = read_block_comment(text, index)
            continue
        if char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1
    return len(text)


def read_expression(text: str, open_paren_index: int) -> int:
    index = read_group(text, open_paren_index, "(", ")")
    while index < len(text):
        while index < len(text) and text[index].isspace():
            index += 1
        if text.startswith("//", index):
            index = read_line_comment(text, index)
            continue
        if text.startswith("/*", index):
            index = read_block_comment(text, index)
            continue
        if index >= len(text) or text[index] != ".":
            break
        member_match = re.match(r"\.([A-Za-z_][A-Za-z0-9_]*)", text[index:])
        if not member_match:
            break
        index += len(member_match.group(0))
        while index < len(text) and text[index].isspace():
            index += 1
        if index < len(text) and text[index] == "(":
            index = read_group(text, index, "(", ")")
        elif index < len(text) and text[index] == "[":
            index = read_group(text, index, "[", "]")
        else:
            while index < len(text) and re.match(r"[A-Za-z0-9_]", text[index]):
                index += 1
    return index


def collect_matches(text: str) -> list[Match]:
    pattern = re.compile(r"(?<![A-Za-z0-9_$])(" + "|".join(TARGETS) + r")\s*\(")
    matches: list[Match] = []
    index = 0
    while True:
        found = pattern.search(text, index)
        if not found:
            return matches
        start = found.start(1)
        open_paren = text.find("(", found.start(1), found.end(0) + 1)
        end = read_expression(text, open_paren)
        expression = text[start:end].strip()
        matches.append(Match(target=found.group(1), start=start, end=end, expression=expression))
        index = end


def surrounding_block(text: str, start: int, end: int) -> str:
    block_start = text.rfind("\n\n", 0, start)
    block_end = text.find("\n\n", end)
    if block_start == -1:
        block_start = 0
    else:
        block_start += 2
    if block_end == -1:
        block_end = len(text)
    return text[block_start:block_end].strip()


def nearest_label(text: str, start: int) -> str | None:
    for line in reversed(text[:start].splitlines()):
        stripped = line.strip()
        if stripped.startswith("$"):
            return stripped
        if stripped and not stripped.startswith("//"):
            break
    return None


def extract_strings(expression: str) -> list[str]:
    values: list[str] = []
    for quote, value in re.findall(r"(['\"`])((?:\\.|(?!\1).)*)\1", expression, flags=re.DOTALL):
        values.append(value)
    return values


def extract_methods(expression: str) -> list[str]:
    return re.findall(r"\.([A-Za-z_][A-Za-z0-9_]*)\s*\(", expression)


def extract_primary_arg(expression: str, target: str) -> str | None:
    match = re.match(rf"{re.escape(target)}\s*\(\s*(['\"`])((?:\\.|(?!\1).)*)\1", expression, flags=re.DOTALL)
    return match.group(2) if match else None


def extract_call_args(expression: str, names: tuple[str, ...]) -> list[str]:
    pattern = re.compile(
        r"(?<![A-Za-z0-9_$])(?:"
        + "|".join(re.escape(name) for name in names)
        + r")\s*\(\s*(['\"`])((?:\\.|(?!\1).)*)\1",
        flags=re.DOTALL,
    )
    return [value for _, value in pattern.findall(expression)]


def sanitize_slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "pattern"


def parse_file(path: Path, input_root: Path) -> tuple[list[dict], dict]:
    text = path.read_text(encoding="utf-8", errors="replace")
    relative = path.relative_to(input_root).as_posix()
    cps_values = re.findall(r"\bset(?:Cps|cpm)\s*\(([^)]+)\)", text)
    results: list[dict] = []

    for ordinal, match in enumerate(collect_matches(text), start=1):
        start_line = line_number(text, match.start)
        end_line = line_number(text, match.end)
        primary_arg = extract_primary_arg(match.expression, match.target)
        strings = extract_strings(match.expression)
        methods = extract_methods(match.expression)
        record = {
            "id": hashlib.sha1(f"{relative}:{match.start}:{match.expression}".encode("utf-8")).hexdigest()[:16],
            "source_file": relative,
            "source_path": str(path),
            "ordinal_in_file": ordinal,
            "target": match.target,
            "line_start": start_line,
            "line_end": end_line,
            "column_start": column_number(text, match.start),
            "label": nearest_label(text, match.start),
            "expression": match.expression,
            "context_block": surrounding_block(text, match.start, match.end),
            "primary_arg": primary_arg,
            "string_literals": strings,
            "methods": methods,
            "sample_patterns": extract_call_args(match.expression, ("s", "sound")),
            "note_patterns": extract_call_args(match.expression, ("note", "n", "chord", "cat")),
            "struct_patterns": extract_call_args(match.expression, ("struct",)),
            "transport_methods": [method for method in methods if method in {"cpm", "fast", "slow", "early", "late"}],
            "tempo_markers": cps_values,
        }
        results.append(record)

    summary = {
        "source_file": relative,
        "source_path": str(path),
        "patterns_found": len(results),
        "tempo_markers": cps_values,
        "targets": sorted({item["target"] for item in results}),
    }
    return results, summary


def write_outputs(records: list[dict], summaries: list[dict], output_root: Path) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    for record in records:
        relative_stem = sanitize_slug(Path(record["source_file"]).with_suffix("").as_posix())
        file_name = f"{record['id']}__{relative_stem}__L{record['line_start']}_{record['target']}.json"
        (output_root / file_name).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {
        "input_root": str(DEFAULT_INPUT),
        "output_root": str(output_root),
        "files_scanned": len(summaries),
        "patterns_written": len(records),
        "by_target": {
            target: sum(1 for record in records if record["target"] == target)
            for target in sorted({record["target"] for record in records})
        },
        "files": summaries,
    }
    (output_root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Strudel pattern expressions from a JS corpus.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Directory with source .js files.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Directory for parsed JSON records.")
    args = parser.parse_args()

    input_root = args.input.resolve()
    output_root = args.output.resolve()
    js_files = sorted(input_root.rglob("*.js"))
    if not js_files:
        raise SystemExit(f"No .js files found in {input_root}")

    records: list[dict] = []
    summaries: list[dict] = []
    for path in js_files:
        file_records, summary = parse_file(path, input_root)
        records.extend(file_records)
        summaries.append(summary)

    write_outputs(records, summaries, output_root)
    print(f"Scanned {len(js_files)} files and wrote {len(records)} pattern JSON files to {output_root}")


if __name__ == "__main__":
    main()
