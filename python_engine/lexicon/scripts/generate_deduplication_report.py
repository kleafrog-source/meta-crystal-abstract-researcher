#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deduplication and Conflict Report Generator

Checks for duplicate IDs, duplicate symbols, and source conflicts.
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Set, Tuple
from collections import defaultdict

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Paths
LEXICON_DIR = SCRIPT_DIR / "lexicon"
MACHINE_DIR = LEXICON_DIR / "machine"
REPORTS_DIR = LEXICON_DIR / "reports"


def read_json_file(path: Path) -> Any:
    """Read a JSON file, return None if not found."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None


def check_duplicate_ids(all_entries: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Check for duplicate IDs across all entries."""
    id_map = defaultdict(list)
    
    for entry in all_entries:
        entry_id = entry.get("id")
        if entry_id:
            id_map[entry_id].append(entry.get("entity_type", "unknown"))
    
    duplicates = {k: v for k, v in id_map.items() if len(v) > 1}
    return duplicates


def classify_duplicate_symbols(
    all_entries: List[Dict[str, Any]]
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, List[Dict[str, Any]]]]:
    """Split duplicate symbols into acceptable reuse vs true ambiguity."""
    symbol_map = defaultdict(list)
    
    for entry in all_entries:
        if entry.get("entity_type") == "operator":
            symbol = entry.get("technical", {}).get("symbol")
            if symbol:
                symbol_map[symbol].append({
                    "id": entry.get("id"),
                    "name": entry.get("technical", {}).get("name"),
                    "namespace": entry.get("namespace"),
                    "operator_type": entry.get("technical", {}).get("operator_type"),
                    "description": entry.get("semantic", {}).get("description"),
                    "formula": entry.get("technical", {}).get("formula")
                })
    
    duplicates = {k: v for k, v in symbol_map.items() if len(v) > 1}
    ambiguous = {}
    shared = {}

    for symbol, entries in duplicates.items():
        operator_types = {entry.get("operator_type") for entry in entries}
        namespaces = {entry.get("namespace") for entry in entries}

        descriptions = {entry.get("description") for entry in entries if entry.get("description")}
        formulas = {entry.get("formula") for entry in entries if entry.get("formula")}
        names = {entry.get("name") for entry in entries if entry.get("name")}

        # Same symbol reused across different operator families is allowed:
        # these are overloaded symbolic notations rather than lexicon conflicts.
        if len(operator_types) > 1 or len(namespaces) > 1:
            shared[symbol] = entries
            continue

        # Same family but clearly distinct semantic/technical payloads is also
        # acceptable overload for lexicon lookup: name/formula/description
        # still disambiguate entries.
        if len(names) > 1 and (len(descriptions) > 1 or len(formulas) > 1):
            shared[symbol] = entries
            continue

        # Same symbol within the same family remains ambiguous.
        ambiguous[symbol] = entries

    return ambiguous, shared


def check_source_conflicts(all_entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Check for conflicts between Python and import JSON sources."""
    conflicts = []
    
    # Group entries by normalized name
    name_map = defaultdict(list)
    for entry in all_entries:
        if entry.get("entity_type") == "lexical_category":
            name = entry.get("technical", {}).get("name")
            if name:
                name_map[name].append(entry)
    
    for name, entries in name_map.items():
        if len(entries) > 1:
            # Check if entries have different sources
            sources = [entry.get("provenance", {}).get("extraction_method") for entry in entries]
            if len(set(sources)) > 1:
                conflicts.append({
                    "name": name,
                    "entity_type": "lexical_category",
                    "sources": sources,
                    "entries": [{"id": e.get("id"), "source": e.get("provenance", {}).get("extraction_method")} for e in entries],
                    "conflict_type": "source_conflict"
                })
    
    return conflicts


def main():
    """Generate deduplication and conflict reports."""
    print("=" * 70)
    print("Deduplication and Conflict Report Generator")
    print("=" * 70)
    
    # Read all machine files
    files_to_check = [
        MACHINE_DIR / "generation-parameters.json",
        MACHINE_DIR / "domain-flags.json",
        MACHINE_DIR / "structural-patterns.json",
        MACHINE_DIR / "metrics.json",
        MACHINE_DIR / "operators.json",
        MACHINE_DIR / "formulas.json",
        MACHINE_DIR / "constants.json",
        MACHINE_DIR / "lexical-categories.json"
    ]
    
    all_entries = []
    for file_path in files_to_check:
        data = read_json_file(file_path)
        if data:
            entries = data if isinstance(data, list) else [data]
            all_entries.extend(entries)
    
    print(f"Read {len(all_entries)} total entries")
    
    # Check duplicates
    duplicate_ids = check_duplicate_ids(all_entries)
    duplicate_symbols, shared_symbols = classify_duplicate_symbols(all_entries)
    source_conflicts = check_source_conflicts(all_entries)
    
    # Generate report
    report = {
        "report_timestamp": datetime.now().isoformat(),
        "summary": {
            "total_entries": len(all_entries),
            "duplicate_ids": len(duplicate_ids),
            "duplicate_symbols": len(duplicate_symbols),
            "shared_symbols": len(shared_symbols),
            "source_conflicts": len(source_conflicts)
        },
        "duplicate_ids": duplicate_ids,
        "duplicate_symbols": duplicate_symbols,
        "shared_symbols": shared_symbols,
        "source_conflicts": source_conflicts,
        "entity_type_counts": {}
    }
    
    # Count by entity type
    for entry in all_entries:
        entity_type = entry.get("entity_type", "unknown")
        report["entity_type_counts"][entity_type] = report["entity_type_counts"].get(entity_type, 0) + 1
    
    # Write reports
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(REPORTS_DIR / "duplicate-symbols.json", "w", encoding="utf-8") as f:
        json.dump({"duplicate_symbols": duplicate_symbols}, f, indent=2, ensure_ascii=False)

    with open(REPORTS_DIR / "shared-symbols.json", "w", encoding="utf-8") as f:
        json.dump({"shared_symbols": shared_symbols}, f, indent=2, ensure_ascii=False)
    
    with open(REPORTS_DIR / "import-source-conflicts.json", "w", encoding="utf-8") as f:
        json.dump({"source_conflicts": source_conflicts}, f, indent=2, ensure_ascii=False)
    
    with open(REPORTS_DIR / "deduplication-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\nReport written to: {REPORTS_DIR / 'deduplication-report.json'}")
    print(f"\nSummary:")
    print(f"  Total entries: {report['summary']['total_entries']}")
    print(f"  Duplicate IDs: {report['summary']['duplicate_ids']}")
    print(f"  Duplicate symbols: {report['summary']['duplicate_symbols']}")
    print(f"  Shared symbols: {report['summary']['shared_symbols']}")
    print(f"  Source conflicts: {report['summary']['source_conflicts']}")
    print(f"\nEntity type counts:")
    for entity_type, count in report["entity_type_counts"].items():
        print(f"  {entity_type}: {count}")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
