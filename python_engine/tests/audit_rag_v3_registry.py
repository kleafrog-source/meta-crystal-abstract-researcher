#!/usr/bin/env python3
"""Sequential registry-leak audit against the running V3 API."""

from __future__ import annotations

import json
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = "http://localhost:3000/api/rag-v3/propose-parameters"
REGISTRY = ROOT / "data" / "combinatorial-genesis" / "registry" / "excluded.json"
REPORT = ROOT / "reports" / f"STAGE5_REGISTRY_LEAK_AUDIT_{date.today().isoformat()}.md"
QUERIES = [
    "warm analog bass, deep sub, soft attack",
    "aggressive acid lead, screaming resonance",
    "airy pad, wide stereo, long reverb tail",
    "punchy drum, tight kick, short decay",
    "glitchy texture, granular, broken beats",
    "make it darker, lower cutoff, more muffled",
    "make it brighter, higher cutoff, screaming resonance",
    "add more reverb, spacious, wet, long tail",
    "make it tighter, dry, punchy, short decay",
    "slower attack, softer, gentler",
]


def main() -> int:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    excluded = {entry["technical_name"] for entry in registry.get("entries", [])}
    rows = []
    leaks = []
    for query in QUERIES:
        body = json.dumps({
            "query": query, "top_k": 50, "current_values": {}, "instruction_context": [],
            "sources": {"library": True, "frozen": True, "atoms": True, "generated": True},
        }).encode("utf-8")
        request = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.load(response)
        names = {item["technical_name"] for item in payload.get("results", [])}
        found = sorted(names & excluded)
        leaks.extend((query, name) for name in found)
        rows.append((query, len(names), found))
        print(f"{query}: leaks={found}", flush=True)
    lines = [
        "# Stage 5 registry leak audit", "", f"Excluded parameters: {len(excluded)}", "",
        "| Query | Top-K returned | Leaks |", "|---|---:|---|",
        *[f"| {query} | {count} | {', '.join(found) if found else '0'} |" for query, count, found in rows],
        "", f"**registry_leak:** {len(leaks)}", "", f"**Result:** {'PASS' if not leaks else 'FAIL'}", "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"REPORT={REPORT}")
    return 0 if not leaks else 1


if __name__ == "__main__":
    raise SystemExit(main())
