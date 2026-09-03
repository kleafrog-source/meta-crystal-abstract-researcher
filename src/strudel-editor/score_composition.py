from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_payload(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Score a composed Strudel track payload.")
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    payload = load_payload(args.input.resolve())
    quality = payload.get("quality", {})
    sections = payload.get("sections", [])
    issues = []
    if quality.get("score_20", 0) < 10:
        issues.append("quality below target threshold")
    if quality.get("section_count", 0) < 4:
        issues.append("too few sections")
    if quality.get("total_bars", 0) < 24:
        issues.append("track too short")
    if len(quality.get("roles_present", [])) < 4:
        issues.append("insufficient role coverage")
    print(
        json.dumps(
            {
                "quality": quality,
                "section_names": [section["section"] for section in sections],
                "issues": issues,
                "passes_minimum": not issues,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
