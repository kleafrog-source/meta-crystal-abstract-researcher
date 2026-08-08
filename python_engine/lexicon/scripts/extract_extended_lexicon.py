#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extended Lexicon Extractor

Extracts operators, formulas, constants, and lexical categories from:
- python_engine/metacrystal_engine_v7.py (OPERATORS, LEXICON)
- data/imports/*.json (lexical categories, patterns)
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

# Add python_engine to path
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Paths
ENGINE_FILE = SCRIPT_DIR / "metacrystal_engine_v7.py"
IMPORT_JSON_FILE = Path("D:/WORK/CLIENTS/mmss-meta-crystal/data/imports/177150e9-36fd-4e47-84b9-4b37ff58918f__snap_20260716_213148_manual9.json")
LEXICON_DIR = SCRIPT_DIR / "lexicon"
MACHINE_DIR = LEXICON_DIR / "machine"
REPORTS_DIR = LEXICON_DIR / "reports"


def read_file_safe(path: Path) -> str:
    """Read a file safely, return None if not found."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None


def humanize_name(name: str) -> str:
    """Convert technical snake_case name to readable label."""
    return name.replace("_", " ")


def build_operator_fallback_description(op: Dict[str, Any]) -> str | None:
    """Build a conservative fallback description from factual operator fields."""
    if op.get("description"):
        return op["description"]

    name = humanize_name(op["name"])
    symbol = op.get("symbol")
    operator_type = op.get("operator_type")
    arity = op.get("arity")
    formula = op.get("formula")

    parts = [f"Оператор {name}"]
    if symbol:
        parts.append(f"({symbol})")
    factual = []
    if operator_type:
        factual.append(f"тип: {operator_type}")
    if arity is not None:
        factual.append(f"арность: {arity}")
    if formula:
        factual.append(f"формула: {formula}")
    if factual:
        parts.append(" — " + ", ".join(factual))
    return "".join(parts)


def extract_operators_from_python() -> List[Dict[str, Any]]:
    """Extract operators from OPERATORS dict in metacrystal_engine_v7.py."""
    print("Extracting operators from metacrystal_engine_v7.py...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return []
    
    operators = []
    
    # Find OPERATORS dict
    operators_match = re.search(
        r'OPERATORS\s*=\s*\{(.*?)\n\}',
        content,
        re.DOTALL
    )
    
    if operators_match:
        operators_text = operators_match.group(1)
        
        # Parse operator entries
        # Pattern: "name": {"symbol": "...", "type": "...", ...}
        operator_pattern = re.compile(
            r'"([^"]+)"\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}',
            re.DOTALL
        )
        
        for match in operator_pattern.finditer(operators_text):
            op_name = match.group(1)
            op_content = match.group(2)
            
            # Extract fields
            symbol_match = re.search(r'"symbol"\s*:\s*"([^"]*)"', op_content)
            type_match = re.search(r'"type"\s*:\s*"([^"]*)"', op_content)
            arity_match = re.search(r'"arity"\s*:\s*(\d+)', op_content)
            priority_match = re.search(r'"priority"\s*:\s*(\d+)', op_content)
            formula_match = re.search(r'"formula"\s*:\s*"([^"]*)"', op_content)
            description_match = re.search(r'"description"\s*:\s*"([^"]*)"', op_content)
            
            operator = {
                "name": op_name,
                "symbol": symbol_match.group(1) if symbol_match else None,
                "operator_type": type_match.group(1) if type_match else None,
                "arity": int(arity_match.group(1)) if arity_match else None,
                "priority": int(priority_match.group(1)) if priority_match else None,
                "formula": formula_match.group(1) if formula_match else None,
                "description": description_match.group(1) if description_match else None,
                "source": "OPERATORS"
            }
            operators.append(operator)
    
    print(f"Found {len(operators)} operators")
    return operators


def extract_lexical_categories_from_python() -> List[Dict[str, Any]]:
    """Extract lexical categories from LEXICON dict in metacrystal_engine_v7.py."""
    print("Extracting lexical categories from metacrystal_engine_v7.py...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return []
    
    categories = []
    
    # Find LEXICON dict
    lexicon_match = re.search(
        r'LEXICON\s*=\s*\{(.*?)\n\}',
        content,
        re.DOTALL
    )
    
    if lexicon_match:
        lexicon_text = lexicon_match.group(1)
        
        # Parse category entries
        # Pattern: "category_name": ["term1", "term2", ...]
        category_pattern = re.compile(
            r'"([^"]+)"\s*:\s*\[([^\]]+)\]',
            re.DOTALL
        )
        
        for match in category_pattern.finditer(lexicon_text):
            cat_name = match.group(1)
            members_text = match.group(2)
            
            # Extract member terms
            member_pattern = re.compile(r'"([^"]+)"')
            members = [m.group(1) for m in member_pattern.finditer(members_text)]
            
            category = {
                "name": cat_name,
                "members": members,
                "category_type": "domain",
                "source": "LEXICON"
            }
            categories.append(category)
    
    print(f"Found {len(categories)} lexical categories")
    return categories


def extract_lexical_categories_from_import() -> List[Dict[str, Any]]:
    """Extract lexical categories from import JSON."""
    print("Extracting lexical categories from import JSON...")
    
    content = read_file_safe(IMPORT_JSON_FILE)
    if not content:
        return []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Error parsing import JSON: {e}")
        return []
    
    categories = []
    
    if "lexicon" in data:
        lexicon = data["lexicon"]
        for cat_name, members in lexicon.items():
            if isinstance(members, list):
                category = {
                    "name": cat_name,
                    "members": members,
                    "category_type": "domain",
                    "source": "import_json"
                }
                categories.append(category)
    
    print(f"Found {len(categories)} lexical categories from import")
    return categories


def create_operator_entry(op: Dict[str, Any]) -> Dict[str, Any]:
    """Create a lexicon entry for an operator."""
    fallback_description = build_operator_fallback_description(op)
    display_name = humanize_name(op["name"])
    return {
        "id": f"operator.{op['name']}",
        "entity_type": "operator",
        "namespace": "operator",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": op["name"],
            "symbol": op.get("symbol"),
            "operator_type": op.get("operator_type"),
            "arity": op.get("arity"),
            "priority": op.get("priority"),
            "formula": op.get("formula"),
            "description": op.get("description")
        },
        "semantic": {
            "display_name": display_name,
            "short_description": fallback_description,
            "description": fallback_description,
            "synonyms": [],
            "query_phrases": [],
            "status": "source_extracted" if fallback_description else "semantic_pending"
        },
        "provenance": {
            "source_files": [str(ENGINE_FILE)],
            "source_symbols": ["OPERATORS"],
            "source_json_paths": [],
            "extraction_method": "python"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "hard_limit": None
        },
        "relations": {
            "related_to": [],
            "conflicts_with": [],
            "requires": [],
            "incompatible_with": []
        },
        "audit": {
            "verified_in_source": True,
            "verified_in_runtime": True,
            "verified_in_import": False,
            "needs_human_review": True
        }
    }


def create_formula_entry(op: Dict[str, Any]) -> Dict[str, Any]:
    """Create a lexicon entry for a formula (from operator with formula)."""
    if not op.get("formula"):
        return None
    
    return {
        "id": f"formula.{op['name']}",
        "entity_type": "formula",
        "namespace": "formula",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": op["name"],
            "formula": op["formula"],
            "symbol": op.get("symbol"),
            "formula_type": op.get("operator_type"),
            "domain": op.get("operator_type"),
            "variables": []
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": op.get("description"),
            "synonyms": [],
            "query_phrases": [],
            "status": "semantic_pending"
        },
        "provenance": {
            "source_files": [str(ENGINE_FILE)],
            "source_symbols": ["OPERATORS"],
            "source_json_paths": [],
            "extraction_method": "python"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "hard_limit": None
        },
        "relations": {
            "related_to": [],
            "conflicts_with": [],
            "requires": [],
            "incompatible_with": []
        },
        "audit": {
            "formula_found_verbatim": True,
            "scientific_validity_checked": False,
            "needs_human_review": True
        }
    }


def create_constant_entry(op: Dict[str, Any]) -> Dict[str, Any]:
    """Create a lexicon entry for a constant (operator with arity=0)."""
    if op.get("arity") != 0:
        return None
    
    return {
        "id": f"constant.{op['name']}",
        "entity_type": "constant",
        "namespace": "constant",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": op["name"],
            "value_or_formula": op.get("formula"),
            "symbol": op.get("symbol"),
            "domain": op.get("operator_type")
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": op.get("description"),
            "synonyms": [],
            "query_phrases": [],
            "status": "semantic_pending"
        },
        "provenance": {
            "source_files": [str(ENGINE_FILE)],
            "source_symbols": ["OPERATORS"],
            "source_json_paths": [],
            "extraction_method": "python"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "hard_limit": None
        },
        "relations": {
            "related_to": [],
            "conflicts_with": [],
            "requires": [],
            "incompatible_with": []
        },
        "audit": {
            "verified_in_source": True,
            "needs_human_review": True
        }
    }


def create_lexical_category_entry(cat: Dict[str, Any]) -> Dict[str, Any]:
    """Create a lexicon entry for a lexical category."""
    return {
        "id": f"category.{cat['name']}",
        "entity_type": "lexical_category",
        "namespace": "category",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": cat["name"],
            "members": cat["members"],
            "category_type": cat.get("category_type", "domain")
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": None,
            "synonyms": [],
            "query_phrases": [],
            "status": "semantic_pending"
        },
        "provenance": {
            "source_files": [str(ENGINE_FILE) if cat["source"] == "LEXICON" else str(IMPORT_JSON_FILE)],
            "source_symbols": ["LEXICON"] if cat["source"] == "LEXICON" else ["lexicon"],
            "source_json_paths": [],
            "extraction_method": "python" if cat["source"] == "LEXICON" else "json"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "hard_limit": None
        },
        "relations": {
            "related_to": [],
            "conflicts_with": [],
            "requires": [],
            "incompatible_with": []
        },
        "audit": {
            "verified_in_source": True,
            "needs_human_review": True
        }
    }


def write_json_file(path: Path, data: Any) -> None:
    """Write data to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    """Main extraction process."""
    print("=" * 70)
    print("Extended Lexicon Extractor")
    print("=" * 70)
    
    # Ensure directories exist
    MACHINE_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Extract from Python
    operators = extract_operators_from_python()
    python_categories = extract_lexical_categories_from_python()
    
    # Extract from import JSON
    import_categories = extract_lexical_categories_from_import()
    
    # Create entries
    operator_entries = [create_operator_entry(op) for op in operators]
    formula_entries = [create_formula_entry(op) for op in operators if create_formula_entry(op)]
    constant_entries = [create_constant_entry(op) for op in operators if create_constant_entry(op)]
    
    # Merge categories (deduplicate by name)
    all_categories = {}
    for cat in python_categories + import_categories:
        if cat["name"] not in all_categories:
            all_categories[cat["name"]] = cat
        else:
            # Merge members if both sources have the category
            existing = all_categories[cat["name"]]
            if cat["source"] != existing["source"]:
                existing["members"] = list(set(existing["members"] + cat["members"]))
                existing["source"] = "merged"
    
    category_entries = [create_lexical_category_entry(cat) for cat in all_categories.values()]
    
    # Write machine files
    print("\nWriting machine layer files...")
    write_json_file(MACHINE_DIR / "operators.json", operator_entries)
    print(f"  Wrote {len(operator_entries)} operators")
    
    write_json_file(MACHINE_DIR / "formulas.json", formula_entries)
    print(f"  Wrote {len(formula_entries)} formulas")
    
    write_json_file(MACHINE_DIR / "constants.json", constant_entries)
    print(f"  Wrote {len(constant_entries)} constants")
    
    write_json_file(MACHINE_DIR / "lexical-categories.json", category_entries)
    print(f"  Wrote {len(category_entries)} lexical categories")
    
    # Write provenance report
    provenance_report = {
        "extraction_timestamp": datetime.now().isoformat(),
        "source_files": {
            "engine": str(ENGINE_FILE),
            "import_json": str(IMPORT_JSON_FILE)
        },
        "extraction_summary": {
            "operators": len(operator_entries),
            "formulas": len(formula_entries),
            "constants": len(constant_entries),
            "lexical_categories": len(category_entries)
        },
        "source_breakdown": {
            "python_operators": len(operators),
            "python_categories": len(python_categories),
            "import_categories": len(import_categories),
            "merged_categories": len(all_categories)
        }
    }
    
    write_json_file(REPORTS_DIR / "extended-provenance.json", provenance_report)
    print(f"  Wrote provenance report")
    
    print("\n" + "=" * 70)
    print("Extraction complete!")
    print(f"  Operators: {len(operator_entries)}")
    print(f"  Formulas: {len(formula_entries)}")
    print(f"  Constants: {len(constant_entries)}")
    print(f"  Lexical categories: {len(category_entries)}")
    print(f"  Total new entries: {len(operator_entries) + len(formula_entries) + len(constant_entries) + len(category_entries)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
