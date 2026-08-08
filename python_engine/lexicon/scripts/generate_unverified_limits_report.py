#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate unverified-limits report.

This script identifies entries without verified limits and categorizes them
by limit_status.
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Directories
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


def main():
    """Generate unverified-limits report."""
    print("=" * 70)
    print("Unverified Limits Report Generator")
    print("=" * 70)
    
    # Ensure reports directory exists
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Read machine layer files
    files_to_check = [
        MACHINE_DIR / "generation-parameters.json",
        MACHINE_DIR / "domain-flags.json",
        MACHINE_DIR / "structural-patterns.json",
        MACHINE_DIR / "metrics.json"
    ]
    
    unverified_entries = []
    limit_status_counts = {}
    
    for file_path in files_to_check:
        if not file_path.exists():
            print(f"Warning: {file_path} does not exist, skipping")
            continue
        
        data = read_json_file(file_path)
        if not data:
            continue
        
        entries = data if isinstance(data, list) else [data]
        
        for entry in entries:
            technical = entry.get("technical", {})
            limit_status = technical.get("limit_status", "unknown")
            
            # Count by status
            limit_status_counts[limit_status] = limit_status_counts.get(limit_status, 0) + 1
            
            # Add to unverified if not verified_in_code
            if limit_status not in ["verified_in_code", "verified_in_tests"]:
                unverified_entries.append({
                    "id": entry.get("id"),
                    "entity_type": entry.get("entity_type"),
                    "name": technical.get("name"),
                    "limit_status": limit_status,
                    "min_value": technical.get("min_value"),
                    "max_value": technical.get("max_value"),
                    "hard_limit": technical.get("hard_limit")
                })
    
    # Generate report
    report = {
        "report_timestamp": datetime.now().isoformat(),
        "summary": {
            "total_entries_checked": sum(limit_status_counts.values()),
            "unverified_entries": len(unverified_entries),
            "verified_entries": limit_status_counts.get("verified_in_code", 0) + limit_status_counts.get("verified_in_tests", 0),
            "limit_status_breakdown": limit_status_counts
        },
        "unverified_entries": unverified_entries,
        "by_entity_type": {}
    }
    
    # Group by entity type
    for entry in unverified_entries:
        entity_type = entry.get("entity_type", "unknown")
        if entity_type not in report["by_entity_type"]:
            report["by_entity_type"][entity_type] = []
        report["by_entity_type"][entity_type].append(entry)
    
    # Write report
    report_path = REPORTS_DIR / "unverified-limits.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\nReport written to: {report_path}")
    print(f"\nSummary:")
    print(f"  Total entries checked: {report['summary']['total_entries_checked']}")
    print(f"  Unverified entries: {report['summary']['unverified_entries']}")
    print(f"  Verified entries: {report['summary']['verified_entries']}")
    print(f"\nLimit status breakdown:")
    for status, count in limit_status_counts.items():
        print(f"  {status}: {count}")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
