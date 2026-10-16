#!/usr/bin/env python3
"""Add Vocal Phonetic Parameter System V1 batches to V3 library."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BATCH_DIR = PROJECT_ROOT / "new-flowmusic-sync-parameters-task"
LIBRARY_PATH = PROJECT_ROOT / "data" / "combinatorial-genesis" / "library" / "parameters.json"


def load_batch(file_path: Path) -> dict[str, Any]:
    """Load a single JSON batch."""
    with open(file_path, encoding="utf-8") as f:
        return json.load(f)


def load_library() -> list[dict[str, Any]]:
    """Load existing V3 library parameters."""
    if not LIBRARY_PATH.exists():
        return []
    with open(LIBRARY_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_library(parameters: list[dict[str, Any]]) -> None:
    """Save parameters to V3 library."""
    LIBRARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(parameters, f, ensure_ascii=False, indent=2)


def merge_parameters(
    existing: list[dict[str, Any]], new_batches: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Merge new parameters into existing library, avoiding duplicates."""
    existing_names = {p["technical_name"] for p in existing}
    merged = list(existing)
    stats = {
        "total_new": 0,
        "added": 0,
        "skipped": 0,
        "duplicates": 0,
    }

    for batch in new_batches:
        batch_protocol = batch.get("collection_protocol", "")
        batch_index = batch.get("batch_index", 0)
        parameters = batch.get("parameters", [])

        stats["total_new"] += len(parameters)

        for param in parameters:
            name = param.get("technical_name")
            if not name:
                continue

            if name in existing_names:
                stats["duplicates"] += 1
                stats["skipped"] += 1
                print(f"  SKIP (duplicate): {name}")
            else:
                # Add source metadata
                param["_source_protocol"] = batch_protocol
                param["_source_batch"] = batch_index
                merged.append(param)
                existing_names.add(name)
                stats["added"] += 1
                print(f"  ADD: {name}")

    return merged, stats


def main() -> None:
    """Main entry point."""
    print("Adding Vocal Phonetic Parameter System V1 to V3 library...")
    print(f"Library path: {LIBRARY_PATH}")
    print(f"Batch directory: {BATCH_DIR}")
    print()

    # Load existing library
    existing = load_library()
    print(f"Existing parameters: {len(existing)}")
    print()

    # Load all batches
    batch_files = sorted(BATCH_DIR.glob("vocal_phonetic_batch_*.json"))
    print(f"Found {len(batch_files)} batch files:")
    for bf in batch_files:
        print(f"  - {bf.name}")
    print()

    new_batches = []
    for bf in batch_files:
        print(f"Loading {bf.name}...")
        batch = load_batch(bf)
        protocol = batch.get("collection_protocol")
        batch_idx = batch.get("batch_index")
        param_count = len(batch.get("parameters", []))
        print(f"  Protocol: {protocol}")
        print(f"  Batch index: {batch_idx}")
        print(f"  Parameters: {param_count}")
        new_batches.append(batch)
        print()

    # Merge
    print("Merging parameters...")
    merged, stats = merge_parameters(existing, new_batches)
    print()

    # Print stats
    print("Statistics:")
    print(f"  Total new parameters: {stats['total_new']}")
    print(f"  Added: {stats['added']}")
    print(f"  Skipped (duplicates): {stats['skipped']}")
    print(f"  Final library size: {len(merged)}")
    print()

    # Save
    if stats["added"] > 0:
        print("Saving updated library...")
        save_library(merged)
        print("Done!")
    else:
        print("No new parameters to add.")


if __name__ == "__main__":
    main()
