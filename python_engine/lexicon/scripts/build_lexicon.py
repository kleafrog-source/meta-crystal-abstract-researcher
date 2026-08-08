#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build script for meta-lexicon.

This script combines machine and semantic layers into a validated lexicon
ready for runtime use.
"""

import sys
import os
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Directories
LEXICON_DIR = SCRIPT_DIR / "lexicon"
MACHINE_DIR = LEXICON_DIR / "machine"
SEMANTIC_DIR = LEXICON_DIR / "semantic"
RELATIONS_DIR = LEXICON_DIR / "relations"
REPORTS_DIR = LEXICON_DIR / "reports"
DATA_DIR = SCRIPT_DIR.parent / "data"
VALIDATED_DIR = DATA_DIR / "meta_lexicon" / "validated"
SNAPSHOTS_DIR = DATA_DIR / "meta_lexicon" / "snapshots"


def read_json_file(path: Path) -> Any:
    """Read a JSON file, return None if not found."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None


def write_json_file(path: Path, data: Any) -> bool:
    """Write data to JSON file."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error writing {path}: {e}")
        return False


def merge_machine_and_semantic(machine_entries: List[Dict], semantic_entries: List[Dict]) -> List[Dict]:
    """Merge machine facts with semantic descriptions."""
    # Create lookup by ID
    semantic_lookup = {e["id"]: e for e in semantic_entries if e.get("id")}
    
    merged = []
    for machine_entry in machine_entries:
        entry_id = machine_entry.get("id")
        if not entry_id:
            continue
        
        # Start with machine entry
        merged_entry = machine_entry.copy()
        
        # Merge semantic data if available
        if entry_id in semantic_lookup:
            semantic_entry = semantic_lookup[entry_id]
            
            # Update semantic fields
            merged_entry["semantic"] = semantic_entry.get("semantic", merged_entry["semantic"])
            
            # Update status if semantic is more advanced
            status_priority = {
                "validated": 5,
                "draft": 4,
                "semantic_pending": 3,
                "machine_extracted": 2,
                "deprecated": 1,
                "unknown": 0
            }
            
            machine_status = machine_entry.get("status", "unknown")
            semantic_status = semantic_entry.get("status", "unknown")
            
            if status_priority.get(semantic_status, 0) > status_priority.get(machine_status, 0):
                merged_entry["status"] = semantic_status
        
        merged.append(merged_entry)
    
    return merged


def merge_relations(entries: List[Dict], relations_data: Dict) -> List[Dict]:
    """Merge relations data into entries."""
    if not relations_data:
        return entries
    
    # Create lookup by ID
    relations_lookup = relations_data.get("relations", {})
    
    for entry in entries:
        entry_id = entry.get("id")
        if entry_id in relations_lookup:
            entry["relations"] = relations_lookup[entry_id]
    
    return entries


def create_snapshot(validated_dir: Path, snapshots_dir: Path) -> str:
    """Create a snapshot of the current validated lexicon."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot_name = f"lexicon_snapshot_{timestamp}"
    snapshot_path = snapshots_dir / snapshot_name
    
    if validated_dir.exists():
        shutil.copytree(validated_dir, snapshot_path)
        return snapshot_name
    return ""


def main():
    """Main build function."""
    print("=" * 70)
    print("Lexicon Builder")
    print("=" * 70)
    
    # Ensure output directories exist
    VALIDATED_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Read machine layer
    print("\nReading machine layer...")
    machine_files = {
        "generation-parameters.json": "generation_parameter",
        "domain-flags.json": "domain",
        "structural-patterns.json": "structural_pattern",
        "metrics.json": "metric",
        "operators.json": "operator",
        "formulas.json": "formula",
        "constants.json": "constant",
        "lexical-categories.json": "lexical_category"
    }
    
    machine_data = {}
    for filename, entity_type in machine_files.items():
        file_path = MACHINE_DIR / filename
        data = read_json_file(file_path)
        if data:
            machine_data[entity_type] = data
            print(f"  Read {len(data)} {entity_type} entries")
        else:
            print(f"  Warning: Could not read {filename}")
    
    # Read semantic layer (if exists)
    print("\nReading semantic layer...")
    semantic_data = {}
    for entity_type in machine_data.keys():
        filename = f"{entity_type}s.json"  # pluralize
        file_path = SEMANTIC_DIR / filename
        data = read_json_file(file_path)
        if data:
            semantic_data[entity_type] = data
            print(f"  Read {len(data)} {entity_type} semantic entries")
        else:
            print(f"  No semantic data for {entity_type}")
    
    # Read relations (if exists)
    print("\nReading relations...")
    relations_file = RELATIONS_DIR / "compatibility.json"
    relations_data = read_json_file(relations_file)
    if relations_data:
        print(f"  Read relations data")
    else:
        print(f"  No relations data")
    
    # Create snapshot before building
    print("\nCreating snapshot...")
    snapshot_name = create_snapshot(VALIDATED_DIR, SNAPSHOTS_DIR)
    if snapshot_name:
        print(f"  Created snapshot: {snapshot_name}")
    
    # Build validated lexicon
    print("\nBuilding validated lexicon...")
    total_entries = 0
    
    for entity_type, machine_entries in machine_data.items():
        semantic_entries = semantic_data.get(entity_type, [])
        
        # Merge machine and semantic
        merged_entries = merge_machine_and_semantic(machine_entries, semantic_entries)
        
        # Merge relations
        merged_entries = merge_relations(merged_entries, relations_data)
        
        # Write to validated directory
        filename = f"{entity_type}s.json"
        output_path = VALIDATED_DIR / filename
        
        if write_json_file(output_path, merged_entries):
            print(f"  Wrote {len(merged_entries)} {entity_type} entries to validated/")
            total_entries += len(merged_entries)
    
    # Write build report
    build_report = {
        "build_timestamp": datetime.now().isoformat(),
        "snapshot": snapshot_name,
        "summary": {
            "total_entries": total_entries,
            "entity_types": list(machine_data.keys())
        },
        "machine_layer": {
            "files": list(machine_files.keys()),
            "entries_count": {k: len(v) for k, v in machine_data.items()}
        },
        "semantic_layer": {
            "has_data": bool(semantic_data),
            "entries_count": {k: len(v) for k, v in semantic_data.items()}
        },
        "relations": {
            "has_data": bool(relations_data)
        }
    }
    
    report_path = REPORTS_DIR / "build-report.json"
    write_json_file(report_path, build_report)
    print(f"\nBuild report written to: {report_path}")
    
    print("\n" + "=" * 70)
    print("Build complete!")
    print(f"  Total entries: {total_entries}")
    print(f"  Validated directory: {VALIDATED_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    main()
