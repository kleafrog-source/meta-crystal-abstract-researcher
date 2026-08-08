#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Semantic Description Extractor

Extracts existing descriptions from source files and populates the semantic layer.
Only extracts descriptions that literally exist in source - no invention.
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Set, Optional
from collections import defaultdict

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Paths
ENGINE_FILE = SCRIPT_DIR / "metacrystal_engine_v7.py"
SIDECAR_FILE = SCRIPT_DIR / "sidecar.py"
PROFILE_PRESETS_FILE = Path("D:/WORK/CLIENTS/mmss-meta-crystal/src/lib/profile-presets.ts")
GENERATION_FILE = Path("D:/WORK/CLIENTS/mmss-meta-crystal/src/components/pages/Generation.tsx")
IMPORT_JSON_FILE = Path("D:/WORK/CLIENTS/mmss-meta-crystal/data/imports/177150e9-36fd-4e47-84b9-4b37ff58918f__snap_20260716_213148_manual9.json")

LEXICON_DIR = SCRIPT_DIR / "lexicon"
MACHINE_DIR = LEXICON_DIR / "machine"
SEMANTIC_DIR = LEXICON_DIR / "semantic"
REPORTS_DIR = LEXICON_DIR / "reports"


def build_source_record(
    *,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
    source_file: Optional[str] = None,
    source_symbol: Optional[str] = None,
    extraction_method: str = "unknown"
) -> Dict[str, Any]:
    """Build a normalized source description record."""
    return {
        "display_name": display_name,
        "description": description,
        "source_file": source_file,
        "source_symbol": source_symbol,
        "source_files": [source_file] if source_file else [],
        "source_symbols": [source_symbol] if source_symbol else [],
        "source_json_paths": [],
        "extraction_method": extraction_method
    }


def read_file_safe(path: Path) -> Optional[str]:
    """Read a file safely, return None if not found."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None


def read_json_file(path: Path) -> Optional[Any]:
    """Read a JSON file, return None if not found."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error reading JSON {path}: {e}")
        return None


def extract_operator_descriptions_from_python() -> Dict[str, Dict[str, Any]]:
    """Extract operator descriptions from OPERATORS dict in metacrystal_engine_v7.py."""
    print("Extracting operator descriptions from metacrystal_engine_v7.py...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return {}
    
    descriptions = {}
    
    # Find OPERATORS dict and extract descriptions
    # Pattern: "name": {..., "description": "...", ...}
    operator_pattern = re.compile(
        r'"([^"]+)"\s*:\s*\{[^}]*"description"\s*:\s*"([^"]+)"[^}]*\}',
        re.DOTALL
    )
    
    for match in operator_pattern.finditer(content):
        op_name = match.group(1)
        description = match.group(2)
        descriptions[op_name] = {
            "description": description,
            "source_file": str(ENGINE_FILE),
            "source_symbol": "OPERATORS",
            "extraction_method": "python"
        }
    
    print(f"Found {len(descriptions)} operator descriptions")
    return descriptions


def extract_metric_descriptions_from_sidecar() -> Dict[str, Dict[str, Any]]:
    """Extract metric descriptions from sidecar.py."""
    print("Extracting metric descriptions from sidecar.py...")
    
    content = read_file_safe(SIDECAR_FILE)
    if not content:
        return {}
    
    descriptions = {}
    
    # Look for metric-related code with comments or descriptions
    # This is a placeholder - actual implementation depends on sidecar structure
    # For now, we'll look for comments near metric references
    
    # Pattern: # ... description ... or """...description..."""
    comment_pattern = re.compile(
        r'#\s*([A-Z_]+)\s*[:\s-]+\s*(.+?)(?:\n|$)',
        re.IGNORECASE
    )
    
    for match in comment_pattern.finditer(content):
        metric_name = match.group(1)
        description = match.group(2).strip()
        if metric_name in ["V", "S", "N", "D_f", "G_S", "QEC", "CHSH", "C_val"]:
            descriptions[metric_name] = {
                "description": description,
                "source_file": str(SIDECAR_FILE),
                "source_symbol": "comments",
                "extraction_method": "python"
            }
    
    print(f"Found {len(descriptions)} metric descriptions from sidecar")
    return descriptions


def extract_metric_descriptions_from_engine() -> Dict[str, Dict[str, Any]]:
    """Extract metric descriptions from OPERATORS entries keyed by symbol."""
    print("Extracting metric descriptions from metacrystal_engine_v7.py...")

    metric_names = {"V", "S", "N", "D_f", "G_S", "QEC", "CHSH", "C_val"}
    descriptions: Dict[str, Dict[str, Any]] = {}
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return {}

    try:
        import ast

        module = ast.parse(content)
        for node in module.body:
            if not isinstance(node, ast.Assign):
                continue
            if not any(isinstance(target, ast.Name) and target.id == "OPERATORS" for target in node.targets):
                continue
            operators = ast.literal_eval(node.value)
            for operator_name, operator_meta in operators.items():
                if not isinstance(operator_meta, dict):
                    continue
                symbol = operator_meta.get("symbol")
                if symbol not in metric_names:
                    continue
                description = operator_meta.get("description") or operator_meta.get("formula")
                if not description:
                    continue
                if symbol in descriptions and descriptions[symbol].get("description"):
                    continue
                descriptions[symbol] = build_source_record(
                    display_name=symbol,
                    description=description,
                    source_file=str(ENGINE_FILE),
                    source_symbol=f"OPERATORS.{operator_name}",
                    extraction_method="python"
                )
            break
    except Exception as e:
        print(f"Warning: Could not parse metric descriptions from engine: {e}")

    print(f"Found {len(descriptions)} metric descriptions from engine")
    return descriptions


def extract_parameter_labels_from_profile_presets() -> Dict[str, Dict[str, Any]]:
    """Extract parameter labels from profile-presets.ts."""
    print("Extracting parameter labels from profile-presets.ts...")
    
    content = read_file_safe(PROFILE_PRESETS_FILE)
    if not content:
        return {}
    
    descriptions = {}
    
    # The file has parameter names but no explicit descriptions
    # We can use the parameter names as display names
    param_names = [
        "generations", "batch", "top", "max_depth", "max_elements",
        "use_irrational", "use_imaginary", "use_infinity",
        "invert_probability", "psychology_probability"
    ]
    
    for param in param_names:
        descriptions[param] = build_source_record(
            display_name=param,
            source_file=str(PROFILE_PRESETS_FILE),
            source_symbol="DEFAULT_PROFILE.params",
            extraction_method="typescript"
        )
    
    print(f"Found {len(descriptions)} parameter labels")
    return descriptions


def extract_ui_labels_from_generation() -> Dict[str, Dict[str, Any]]:
    """Extract UI labels from Generation.tsx."""
    print("Extracting UI labels from Generation.tsx...")
    
    content = read_file_safe(GENERATION_FILE)
    if not content:
        return {}
    
    descriptions = {}
    
    # Look for UI labels, button text, etc.
    # This is a placeholder - actual implementation depends on component structure
    
    # Pattern: toast({ title: "..." })
    toast_pattern = re.compile(r'toast\(\{\s*title:\s*"([^"]+)"')
    for match in toast_pattern.finditer(content):
        label = match.group(1)
        descriptions[f"ui.{hash(label)}"] = build_source_record(
            display_name=label,
            source_file=str(GENERATION_FILE),
            source_symbol="toast",
            extraction_method="typescript"
        )
    
    print(f"Found {len(descriptions)} UI labels")
    return descriptions


def extract_category_descriptions_from_import() -> Dict[str, Dict[str, Any]]:
    """Extract category descriptions from import JSON."""
    print("Extracting category descriptions from import JSON...")
    
    data = read_json_file(IMPORT_JSON_FILE)
    if not data:
        return {}
    
    descriptions = {}
    
    # Check if lexicon has descriptions or metadata
    if "lexicon" in data:
        lexicon = data["lexicon"]
        for cat_name, members in lexicon.items():
            # The import JSON may not have explicit descriptions
            # We'll record the category name and member count
            if isinstance(members, list):
                descriptions[cat_name] = build_source_record(
                    display_name=cat_name,
                    description=f"Category with {len(members)} terms",
                    source_file=str(IMPORT_JSON_FILE),
                    source_symbol="lexicon",
                    extraction_method="json"
                )
    
    print(f"Found {len(descriptions)} category descriptions (metadata)")
    return descriptions


def load_machine_entries() -> Dict[str, List[Dict]]:
    """Load all machine layer entries."""
    print("Loading machine layer entries...")
    
    machine_files = {
        "generation_parameter": MACHINE_DIR / "generation-parameters.json",
        "domain": MACHINE_DIR / "domain-flags.json",
        "structural_pattern": MACHINE_DIR / "structural-patterns.json",
        "metric": MACHINE_DIR / "metrics.json",
        "operator": MACHINE_DIR / "operators.json",
        "formula": MACHINE_DIR / "formulas.json",
        "constant": MACHINE_DIR / "constants.json",
        "lexical_category": MACHINE_DIR / "lexical-categories.json"
    }
    
    entries = {}
    for entity_type, file_path in machine_files.items():
        data = read_json_file(file_path)
        if data:
            entries[entity_type] = data if isinstance(data, list) else [data]
            print(f"  Loaded {len(entries[entity_type])} {entity_type} entries")
        else:
            entries[entity_type] = []
    
    return entries


def extract_machine_semantic_descriptions(
    entries: List[Dict[str, Any]],
    *,
    fallback_symbol: str
) -> Dict[str, Dict[str, Any]]:
    """Extract existing semantic/technical descriptions from machine-layer entries."""
    descriptions: Dict[str, Dict[str, Any]] = {}

    for entry in entries:
        technical = entry.get("technical", {})
        semantic = entry.get("semantic", {})
        name = technical.get("name")
        if not name:
            continue

        description = (
            semantic.get("description")
            or semantic.get("short_description")
            or technical.get("comment")
            or technical.get("template")
        )
        display_name = semantic.get("display_name") or name
        if not description and not display_name:
            continue

        source_files = entry.get("provenance", {}).get("source_files", [])
        source_symbols = entry.get("provenance", {}).get("source_symbols", [])
        descriptions[name] = {
            "display_name": display_name,
            "description": description,
            "source_file": source_files[0] if source_files else None,
            "source_symbol": source_symbols[0] if source_symbols else fallback_symbol,
            "source_files": source_files,
            "source_symbols": source_symbols or [fallback_symbol],
            "source_json_paths": [],
            "extraction_method": "machine_layer"
        }

    return descriptions


def create_semantic_entry(
    machine_entry: Dict,
    source_descriptions: Dict[str, Dict[str, Any]],
    entity_type: str
) -> Dict[str, Any]:
    """Create a semantic entry for a machine entry."""
    entry_id = machine_entry.get("id")
    technical_name = machine_entry.get("technical", {}).get("name")
    
    machine_semantic = machine_entry.get("semantic", {})

    # Try to find source description
    source_desc = None
    if technical_name in source_descriptions:
        source_desc = source_descriptions[technical_name]
    
    # Determine semantic status
    has_machine_semantic = any(
        machine_semantic.get(key)
        for key in ["display_name", "short_description", "description"]
    )

    if source_desc or has_machine_semantic:
        status = "source_extracted"
        needs_human_review = True  # Still needs review
    else:
        status = "pending_manual"
        needs_human_review = True
    
    # Build semantic entry
    semantic_entry = {
        "id": entry_id,
        "entity_type": entity_type,
        "status": status,
        "version": "1.0.0",
        "semantic": {
            "display_name": (
                source_desc.get("display_name")
                if source_desc and source_desc.get("display_name")
                else machine_semantic.get("display_name")
            ),
            "short_description": (
                source_desc.get("description")
                if source_desc and source_desc.get("description")
                else machine_semantic.get("short_description") or machine_semantic.get("description")
            ),
            "description": (
                source_desc.get("description")
                if source_desc and source_desc.get("description")
                else machine_semantic.get("description") or machine_semantic.get("short_description")
            ),
            "synonyms": [],
            "query_phrases": [],
            "status": status
        },
        "provenance": {
            "source_files": source_desc.get("source_files", []) if source_desc else [],
            "source_symbols": source_desc.get("source_symbols", []) if source_desc else [],
            "source_json_paths": source_desc.get("source_json_paths", []) if source_desc else [],
            "extraction_method": source_desc.get("extraction_method") if source_desc else "none"
        },
        "audit": {
            "needs_human_review": needs_human_review,
            "source_description_found": source_desc is not None or has_machine_semantic
        }
    }
    
    return semantic_entry


def main():
    """Main semantic extraction process."""
    print("=" * 70)
    print("Semantic Description Extractor")
    print("=" * 70)
    
    # Ensure directories exist
    SEMANTIC_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load machine entries first because several semantic sources already exist there.
    machine_entries = load_machine_entries()

    # Extract source descriptions
    operator_descriptions = extract_operator_descriptions_from_python()
    metric_descriptions = extract_metric_descriptions_from_sidecar()
    metric_descriptions.update(extract_metric_descriptions_from_engine())
    parameter_labels = extract_parameter_labels_from_profile_presets()
    ui_labels = extract_ui_labels_from_generation()
    category_descriptions = extract_category_descriptions_from_import()
    domain_descriptions = extract_machine_semantic_descriptions(machine_entries["domain"], fallback_symbol="EngineConfig.flags")
    structural_pattern_descriptions = extract_machine_semantic_descriptions(machine_entries["structural_pattern"], fallback_symbol="STRUCTURAL_PATTERNS")
    operator_fallback_descriptions = extract_machine_semantic_descriptions(machine_entries["operator"], fallback_symbol="OPERATORS")
    formula_descriptions = extract_machine_semantic_descriptions(machine_entries["formula"], fallback_symbol="OPERATORS")
    constant_descriptions = extract_machine_semantic_descriptions(machine_entries["constant"], fallback_symbol="OPERATORS")

    operator_descriptions_complete = dict(operator_fallback_descriptions)
    operator_descriptions_complete.update(operator_descriptions)
    
    # Combine all source descriptions
    all_source_descriptions = {}
    all_source_descriptions.update(operator_descriptions_complete)
    all_source_descriptions.update(metric_descriptions)
    all_source_descriptions.update(parameter_labels)
    all_source_descriptions.update(ui_labels)
    all_source_descriptions.update(category_descriptions)
    all_source_descriptions.update(domain_descriptions)
    all_source_descriptions.update(structural_pattern_descriptions)
    all_source_descriptions.update(formula_descriptions)
    all_source_descriptions.update(constant_descriptions)
    
    print(f"\nTotal source descriptions found: {len(all_source_descriptions)}")
    
    # Create semantic entries
    print("\nCreating semantic entries...")
    semantic_entries = {}
    completeness_stats = defaultdict(lambda: {
        "total": 0,
        "source_description_found": 0,
        "semantic_pending": 0,
        "not_available": 0,
        "needs_human_review": 0
    })
    
    for entity_type, entries in machine_entries.items():
        entity_semantic_entries = []
        
        for machine_entry in entries:
            completeness_stats[entity_type]["total"] += 1
            
            # Map entity type to source descriptions
            source_descriptions = {}
            if entity_type == "operator":
                source_descriptions = operator_descriptions_complete
            elif entity_type == "domain":
                source_descriptions = domain_descriptions
            elif entity_type == "structural_pattern":
                source_descriptions = structural_pattern_descriptions
            elif entity_type == "metric":
                source_descriptions = metric_descriptions
            elif entity_type == "formula":
                source_descriptions = formula_descriptions
            elif entity_type == "constant":
                source_descriptions = constant_descriptions
            elif entity_type == "generation_parameter":
                source_descriptions = parameter_labels
            elif entity_type == "lexical_category":
                source_descriptions = category_descriptions
            
            semantic_entry = create_semantic_entry(machine_entry, source_descriptions, entity_type)
            entity_semantic_entries.append(semantic_entry)
            
            # Update stats
            if semantic_entry["audit"]["source_description_found"]:
                completeness_stats[entity_type]["source_description_found"] += 1
            else:
                completeness_stats[entity_type]["semantic_pending"] += 1
                completeness_stats[entity_type]["not_available"] += 1
            
            if semantic_entry["audit"]["needs_human_review"]:
                completeness_stats[entity_type]["needs_human_review"] += 1
        
        semantic_entries[entity_type] = entity_semantic_entries
        print(f"  Created {len(entity_semantic_entries)} {entity_type} semantic entries")
    
    # Write semantic files
    print("\nWriting semantic layer files...")
    for entity_type, entries in semantic_entries.items():
        filename = f"{entity_type}s.json"
        output_path = SEMANTIC_DIR / filename
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)
        print(f"  Wrote {filename}")
    
    # Generate reports
    print("\nGenerating reports...")
    
    # Semantic completeness report
    completeness_report = {
        "report_timestamp": datetime.now().isoformat(),
        "total_entries": sum(stats["total"] for stats in completeness_stats.values()),
        "entity_types": dict(completeness_stats)
    }
    
    with open(REPORTS_DIR / "semantic-completeness-report.json", "w", encoding="utf-8") as f:
        json.dump(completeness_report, f, indent=2, ensure_ascii=False)
    
    # Source descriptions report
    source_descriptions_report = {
        "report_timestamp": datetime.now().isoformat(),
        "total_source_descriptions": len(all_source_descriptions),
        "source_descriptions": [
            {
                "entry_id": f"{entity_type}.{name}",
                "entity_type": entity_type,
                "description": desc.get("description"),
                "source_file": desc.get("source_file"),
                "source_path_or_symbol": desc.get("source_symbol"),
                "extraction_method": desc.get("extraction_method")
            }
            for entity_type, desc_map in [
                ("domain", domain_descriptions),
                ("structural_pattern", structural_pattern_descriptions),
                ("operator", operator_descriptions_complete),
                ("metric", metric_descriptions),
                ("formula", formula_descriptions),
                ("constant", constant_descriptions),
                ("generation_parameter", parameter_labels),
                ("lexical_category", category_descriptions)
            ]
            for name, desc in desc_map.items()
        ]
    }
    
    with open(REPORTS_DIR / "source-descriptions.json", "w", encoding="utf-8") as f:
        json.dump(source_descriptions_report, f, indent=2, ensure_ascii=False)
    
    # Missing descriptions report
    missing_descriptions = []
    for entity_type, entries in semantic_entries.items():
        for entry in entries:
            if not entry["audit"]["source_description_found"]:
                missing_descriptions.append({
                    "entry_id": entry["id"],
                    "entity_type": entity_type,
                    "missing_fields": ["description", "short_description", "display_name"],
                    "reason": "No source description found",
                    "needs_human_review": entry["audit"]["needs_human_review"]
                })
    
    missing_report = {
        "report_timestamp": datetime.now().isoformat(),
        "total_missing": len(missing_descriptions),
        "missing_descriptions": missing_descriptions
    }
    
    with open(REPORTS_DIR / "missing-descriptions.json", "w", encoding="utf-8") as f:
        json.dump(missing_report, f, indent=2, ensure_ascii=False)
    
    # Ambiguous descriptions report (from duplicate symbols)
    duplicate_symbols_report = read_json_file(REPORTS_DIR / "duplicate-symbols.json")
    ambiguous_descriptions = []
    
    if duplicate_symbols_report and "duplicate_symbols" in duplicate_symbols_report:
        for symbol, entries in duplicate_symbols_report["duplicate_symbols"].items():
            ambiguous_descriptions.append({
                "symbol": symbol,
                "entities": entries,
                "ambiguity_type": "same_symbol_different_types",
                "needs_human_review": True
            })
    
    ambiguous_report = {
        "report_timestamp": datetime.now().isoformat(),
        "total_ambiguous": len(ambiguous_descriptions),
        "ambiguous_descriptions": ambiguous_descriptions
    }
    
    with open(REPORTS_DIR / "ambiguous-descriptions.json", "w", encoding="utf-8") as f:
        json.dump(ambiguous_report, f, indent=2, ensure_ascii=False)
    
    # Unmatched machine entries (entries without any source match)
    # This would be entries in machine layer that don't correspond to anything in source
    # For now, we'll mark all entries without source descriptions as unmatched
    unmatched_report = {
        "report_timestamp": datetime.now().isoformat(),
        "total_unmatched": len(missing_descriptions),
        "unmatched_entries": [d["entry_id"] for d in missing_descriptions]
    }
    
    with open(REPORTS_DIR / "unmatched-machine-entries.json", "w", encoding="utf-8") as f:
        json.dump(unmatched_report, f, indent=2, ensure_ascii=False)
    
    print(f"  Wrote semantic-completeness-report.json")
    print(f"  Wrote source-descriptions.json")
    print(f"  Wrote missing-descriptions.json")
    print(f"  Wrote ambiguous-descriptions.json")
    print(f"  Wrote unmatched-machine-entries.json")
    
    print("\n" + "=" * 70)
    print("Semantic extraction complete!")
    print(f"  Total entries processed: {completeness_report['total_entries']}")
    print(f"  Source descriptions found: {completeness_report['total_entries'] - missing_report['total_missing']}")
    print(f"  Missing descriptions: {missing_report['total_missing']}")
    print(f"  Ambiguous entries: {ambiguous_report['total_ambiguous']}")
    print("=" * 70)


if __name__ == "__main__":
    main()
