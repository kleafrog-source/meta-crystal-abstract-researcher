#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lexicon validator - checks schemas, IDs, references, and types.

This script validates the lexicon entries against JSON schemas
and checks for unresolved references, type mismatches, and other issues.
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Set
import re

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Directories
LEXICON_DIR = SCRIPT_DIR / "lexicon"
SCHEMA_DIR = LEXICON_DIR / "schema"
MACHINE_DIR = LEXICON_DIR / "machine"
SEMANTIC_DIR = LEXICON_DIR / "semantic"
RELATIONS_DIR = LEXICON_DIR / "relations"
REPORTS_DIR = LEXICON_DIR / "reports"


def read_json_file(path: Path) -> Optional[Dict]:
    """Read a JSON file, return None if not found or invalid."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None


def validate_id_uniqueness(entries: List[Dict]) -> List[str]:
    """Check that all IDs are unique."""
    ids = [e.get("id") for e in entries if e.get("id")]
    duplicates = [id for id in ids if ids.count(id) > 1]
    return list(set(duplicates))


def validate_required_fields(entry: Dict, schema_name: str) -> List[str]:
    """Validate that required fields are present."""
    errors = []
    
    required_fields = [
        "id", "entity_type", "namespace", "status", "version",
        "technical", "semantic", "provenance", "safety", "relations", "audit"
    ]
    
    for field in required_fields:
        if field not in entry:
            errors.append(f"Missing required field: {field}")
    
    # Validate technical fields based on entity_type
    if "technical" in entry:
        tech = entry["technical"]
        entity_type = entry.get("entity_type")
        
        if entity_type in ["generation_parameter", "domain", "structural_pattern", "metric"]:
            tech_required = ["name", "runtime_used", "ui_accessible"]
            for field in tech_required:
                if field not in tech:
                    errors.append(f"Missing technical field: {field}")
        elif entity_type in ["operator", "formula", "constant", "lexical_category"]:
            # These don't require runtime_used/ui_accessible
            if "name" not in tech:
                errors.append("Missing technical field: name")
    
    # Validate semantic fields
    if "semantic" in entry:
        sem = entry["semantic"]
        # needs_human_review is optional for new entity types
        # Only check for original entity types
        entity_type = entry.get("entity_type")
        if entity_type in ["generation_parameter", "domain", "structural_pattern", "metric"]:
            if "needs_human_review" not in sem:
                errors.append("Missing semantic field: needs_human_review")
    
    # Validate provenance fields
    if "provenance" in entry:
        prov = entry["provenance"]
        if "extraction_method" not in prov:
            errors.append("Missing provenance field: extraction_method")
    
    # Validate safety fields
    if "safety" in entry:
        safety = entry["safety"]
        if "risk_level" not in safety:
            errors.append("Missing safety field: risk_level")
    
    # Validate audit fields based on entity_type
    if "audit" in entry:
        audit = entry["audit"]
        entity_type = entry.get("entity_type")
        
        if entity_type in ["generation_parameter", "domain", "structural_pattern", "metric"]:
            audit_required = ["verified_in_runtime", "verified_in_ui", "verified_in_sidecar"]
            for field in audit_required:
                if field not in audit:
                    errors.append(f"Missing audit field: {field}")
        # Other entity types have different audit fields
    
    return errors


def validate_entity_type(entry: Dict) -> List[str]:
    """Validate entity_type is one of the allowed values."""
    errors = []
    
    allowed_types = [
        "generation_parameter", "domain", "structural_pattern",
        "operator", "invariant", "metric", "constraint",
        "formula", "constant", "lexical_category"
    ]
    
    entity_type = entry.get("entity_type")
    if entity_type not in allowed_types:
        errors.append(f"Invalid entity_type: {entity_type}")
    
    return errors


def validate_status(entry: Dict) -> List[str]:
    """Validate status is one of the allowed values."""
    errors = []
    
    allowed_statuses = [
        "machine_extracted", "semantic_pending", "draft",
        "validated", "deprecated", "unknown"
    ]
    
    status = entry.get("status")
    if status not in allowed_statuses:
        errors.append(f"Invalid status: {status}")
    
    return errors


def validate_namespace(entry: Dict) -> List[str]:
    """Validate namespace matches entity_type."""
    errors = []
    
    entity_type = entry.get("entity_type")
    namespace = entry.get("namespace")
    
    namespace_map = {
        "generation_parameter": "generation",
        "domain": "domain",
        "structural_pattern": "pattern",
        "operator": "operator",
        "invariant": "invariant",
        "metric": "metric",
        "constraint": "constraint",
        "formula": "formula",
        "constant": "constant",
        "lexical_category": "category"
    }
    
    expected_namespace = namespace_map.get(entity_type)
    if expected_namespace and namespace != expected_namespace:
        errors.append(f"Namespace mismatch: expected {expected_namespace}, got {namespace}")
    
    return errors


def validate_id_format(entry: Dict) -> List[str]:
    """Validate ID format matches entity_type and namespace."""
    errors = []
    
    entity_type = entry.get("entity_type")
    entry_id = entry.get("id")
    
    if not entry_id:
        errors.append("Missing ID")
        return errors
    
    # ID should be in format: namespace.name
    namespace = entry.get("namespace")
    expected_prefix = f"{namespace}."
    
    if not entry_id.startswith(expected_prefix):
        errors.append(f"ID format error: should start with {expected_prefix}")
    
    return errors


def validate_relations(entries: List[Dict]) -> Dict[str, List[str]]:
    """Validate that relation references resolve to existing IDs."""
    all_ids = set(e.get("id") for e in entries if e.get("id"))
    unresolved = {}
    
    for entry in entries:
        entry_id = entry.get("id")
        if not entry_id:
            continue
        
        relations = entry.get("relations", {})
        entry_unresolved = []
        
        for relation_type in ["compatible_with", "incompatible_with", "requires", "excludes", "related_to", "aliases"]:
            related_ids = relations.get(relation_type, [])
            for related_id in related_ids:
                if related_id not in all_ids:
                    entry_unresolved.append(f"{relation_type}: {related_id}")
        
        if entry_unresolved:
            unresolved[entry_id] = entry_unresolved
    
    return unresolved


def validate_type_consistency(entry: Dict) -> List[str]:
    """Validate type consistency between technical and default_value."""
    errors = []
    
    tech = entry.get("technical", {})
    tech_type = tech.get("type")
    default_value = tech.get("default_value")
    
    if not tech_type or default_value is None:
        return errors
    
    # Basic type checks
    if tech_type == "bool":
        if default_value not in ["true", "false", True, False]:
            errors.append(f"Type mismatch: bool default should be true/false, got {default_value}")
    elif tech_type == "int":
        if not str(default_value).isdigit() and default_value is not True and default_value is not False:
            errors.append(f"Type mismatch: int default should be numeric, got {default_value}")
    elif tech_type == "float":
        try:
            float(default_value)
        except (ValueError, TypeError):
            errors.append(f"Type mismatch: float default should be numeric, got {default_value}")
    elif tech_type == "string":
        if not isinstance(default_value, str):
            errors.append(f"Type mismatch: string default should be a string, got {default_value}")
    
    return errors


def validate_range_consistency(entry: Dict) -> List[str]:
    """Validate that min_value <= max_value."""
    errors = []
    
    tech = entry.get("technical", {})
    min_value = tech.get("min_value")
    max_value = tech.get("max_value")
    
    if min_value is not None and max_value is not None:
        try:
            if float(min_value) > float(max_value):
                errors.append(f"Range error: min_value ({min_value}) > max_value ({max_value})")
        except (ValueError, TypeError):
            errors.append(f"Range error: min_value and max_value should be numeric")
    
    return errors


def validate_provenance(entry: Dict) -> List[str]:
    """Validate provenance information is present for runtime-used entries."""
    errors = []
    
    tech = entry.get("technical", {})
    provenance = entry.get("provenance", {})
    
    if tech.get("runtime_used"):
        if not provenance.get("source_files"):
            errors.append("Runtime-used entry missing source_files in provenance")
        if not provenance.get("extraction_method"):
            errors.append("Runtime-used entry missing extraction_method in provenance")
    
    if tech.get("ui_accessible"):
        if not provenance.get("ui_component"):
            errors.append("UI-accessible entry missing ui_component in provenance")
    
    return errors


def validate_semantic_separation(entry: Dict) -> List[str]:
    """Validate that semantic layer doesn't modify machine facts."""
    errors = []
    
    # This is a placeholder for future validation
    # For now, we just check that semantic fields don't contain technical values
    
    return errors


def validate_file(file_path: Path, entity_type: str) -> Dict[str, Any]:
    """Validate a single lexicon file."""
    print(f"Validating {file_path.name}...")
    
    data = read_json_file(file_path)
    if not data:
        return {
            "file": str(file_path),
            "valid": False,
            "error": "Could not read file",
            "entries": []
        }
    
    entries = data if isinstance(data, list) else [data]
    
    validation_results = {
        "file": str(file_path),
        "entity_type": entity_type,
        "valid": True,
        "entries": [],
        "duplicate_ids": [],
        "unresolved_relations": {}
    }
    
    # Check for duplicate IDs
    duplicate_ids = validate_id_uniqueness(entries)
    if duplicate_ids:
        validation_results["duplicate_ids"] = duplicate_ids
        validation_results["valid"] = False
    
    # Validate each entry
    for entry in entries:
        entry_errors = []
        
        entry_errors.extend(validate_required_fields(entry, entity_type))
        entry_errors.extend(validate_entity_type(entry))
        entry_errors.extend(validate_status(entry))
        entry_errors.extend(validate_namespace(entry))
        entry_errors.extend(validate_id_format(entry))
        entry_errors.extend(validate_type_consistency(entry))
        entry_errors.extend(validate_range_consistency(entry))
        entry_errors.extend(validate_provenance(entry))
        entry_errors.extend(validate_semantic_separation(entry))
        
        validation_results["entries"].append({
            "id": entry.get("id"),
            "valid": len(entry_errors) == 0,
            "errors": entry_errors
        })
        
        if entry_errors:
            validation_results["valid"] = False
    
    # Validate relations across all entries
    unresolved = validate_relations(entries)
    if unresolved:
        validation_results["unresolved_relations"] = unresolved
        validation_results["valid"] = False
    
    return validation_results


def main():
    """Main validation function."""
    print("=" * 70)
    print("Lexicon Validator")
    print("=" * 70)
    
    # Ensure reports directory exists
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Files to validate
    files_to_validate = [
        (MACHINE_DIR / "generation-parameters.json", "generation_parameter"),
        (MACHINE_DIR / "domain-flags.json", "domain"),
        (MACHINE_DIR / "structural-patterns.json", "structural_pattern"),
        (MACHINE_DIR / "metrics.json", "metric"),
        (MACHINE_DIR / "operators.json", "operator"),
        (MACHINE_DIR / "formulas.json", "formula"),
        (MACHINE_DIR / "constants.json", "constant"),
        (MACHINE_DIR / "lexical-categories.json", "lexical_category"),
    ]
    
    all_results = []
    all_entries = []
    
    for file_path, entity_type in files_to_validate:
        if file_path.exists():
            result = validate_file(file_path, entity_type)
            all_results.append(result)
            
            # Collect all entries for cross-file validation
            data = read_json_file(file_path)
            if data:
                entries = data if isinstance(data, list) else [data]
                all_entries.extend(entries)
        else:
            print(f"Warning: {file_path} does not exist, skipping")
            all_results.append({
                "file": str(file_path),
                "valid": False,
                "error": "File does not exist",
                "entries": []
            })
    
    # Cross-file ID uniqueness check
    all_ids = [e.get("id") for e in all_entries if e.get("id")]
    cross_file_duplicates = [id for id in all_ids if all_ids.count(id) > 1]
    
    # Cross-file relation validation
    cross_file_unresolved = validate_relations(all_entries)
    
    # Generate summary
    total_files = len(all_results)
    valid_files = sum(1 for r in all_results if r["valid"])
    total_entries = sum(len(r.get("entries", [])) for r in all_results)
    valid_entries = sum(1 for r in all_results for e in r.get("entries", []) if e["valid"])
    
    print("\n" + "=" * 70)
    print("Validation Summary")
    print("=" * 70)
    print(f"Files validated: {total_files}")
    print(f"Valid files: {valid_files}")
    print(f"Invalid files: {total_files - valid_files}")
    print(f"Total entries: {total_entries}")
    print(f"Valid entries: {valid_entries}")
    print(f"Invalid entries: {total_entries - valid_entries}")
    
    if cross_file_duplicates:
        print(f"Cross-file duplicate IDs: {len(cross_file_duplicates)}")
        for dup in cross_file_duplicates:
            print(f"  - {dup}")
    
    if cross_file_unresolved:
        print(f"Unresolved relations: {len(cross_file_unresolved)} entries")
    
    # Generate validation report
    report = {
        "validation_timestamp": datetime.now().isoformat(),
        "summary": {
            "total_files": total_files,
            "valid_files": valid_files,
            "invalid_files": total_files - valid_files,
            "total_entries": total_entries,
            "valid_entries": valid_entries,
            "invalid_entries": total_entries - valid_entries
        },
        "cross_file_issues": {
            "duplicate_ids": cross_file_duplicates,
            "unresolved_relations": cross_file_unresolved
        },
        "file_results": all_results
    }
    
    report_path = REPORTS_DIR / "validation-report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\nValidation report written to: {report_path}")
    
    # Exit with error code if validation failed
    if not all(r["valid"] for r in all_results) or cross_file_duplicates or cross_file_unresolved:
        print("\n❌ Validation failed!")
        sys.exit(1)
    else:
        print("\n✅ Validation passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
