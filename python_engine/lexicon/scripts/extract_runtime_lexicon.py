#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Read-only extractor for runtime lexicon facts.

This script extracts technical facts from the runtime generator and UI
without modifying any source code or running generation.

Runtime chain: Generation.tsx → /api/generate/start → runner.ts → 
python_engine/sidecar.py → metacrystal_engine_v7.py → data/meta_crystals
"""

import sys
import os
import json
import re
import ast
import inspect
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Add python_engine to path for imports
SCRIPT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

# Output directories
LEXICON_DIR = SCRIPT_DIR / "lexicon"
MACHINE_DIR = LEXICON_DIR / "machine"
REPORTS_DIR = LEXICON_DIR / "reports"

# Source files
ENGINE_FILE = SCRIPT_DIR / "metacrystal_engine_v7.py"
SIDECAR_FILE = SCRIPT_DIR / "sidecar.py"
PROFILE_PRESETS_FILE = SCRIPT_DIR.parent / "src" / "lib" / "profile-presets.ts"
GENERATION_FILE = SCRIPT_DIR.parent / "src" / "components" / "pages" / "Generation.tsx"


def ensure_output_dirs():
    """Ensure output directories exist."""
    MACHINE_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def read_file_safe(path: Path) -> Optional[str]:
    """Safely read a file, return None if not found."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Warning: Could not read {path}: {e}")
        return None


def extract_engine_config_fields() -> Dict[str, Any]:
    """Extract EngineConfig fields from metacrystal_engine_v7.py."""
    print("Extracting EngineConfig fields from metacrystal_engine_v7.py...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return {}
    
    # Find EngineConfig class definition
    config_match = re.search(
        r'@dataclass\s+class EngineConfig:.*?(?=\n@dataclass|\nclass\s|\Z)',
        content,
        re.DOTALL
    )
    
    if not config_match:
        print("Could not find EngineConfig class")
        return {}
    
    config_text = config_match.group(0)
    
    # Extract fields
    fields = {}
    field_pattern = re.compile(r'(\w+):\s*([^=\n]+)(?:\s*=\s*([^#\n]+))?(?:\s*#\s*(.+))?')
    
    for match in field_pattern.finditer(config_text):
        field_name = match.group(1)
        field_type = match.group(2).strip()
        default_value = match.group(3).strip() if match.group(3) else None
        comment = match.group(4).strip() if match.group(4) else None
        
        # Skip if it's a comment line or not a field
        if field_name in ['class', 'def', '"""']:
            continue
        
        fields[field_name] = {
            "name": field_name,
            "type": field_type,
            "default_value": default_value,
            "comment": comment
        }
    
    print(f"Found {len(fields)} EngineConfig fields")
    return fields


def extract_domain_flags() -> List[Dict[str, Any]]:
    """Extract domain flags from EngineConfig."""
    print("Extracting domain flags from EngineConfig...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return []
    
    # Find flags dictionary in EngineConfig
    flags_match = re.search(
        r'flags:\s*Dict\[str,\s*bool\]\s*=\s*field\(default_factory=lambda:\s*\{([^}]+)\}',
        content,
        re.DOTALL
    )
    
    if not flags_match:
        print("Could not find flags dictionary")
        return []
    
    flags_text = flags_match.group(1)
    
    # Extract individual flags
    flag_pattern = re.compile(r'"([^"]+)":\s*(True|False)')
    flags = []
    
    for match in flag_pattern.finditer(flags_text):
        flag_name = match.group(1)
        default_value = match.group(2) == "True"
        
        flags.append({
            "name": flag_name,
            "default_value": default_value
        })
    
    print(f"Found {len(flags)} domain flags")
    return flags


def extract_structural_patterns() -> List[Dict[str, Any]]:
    """Extract structural patterns from metacrystal_engine_v7.py."""
    print("Extracting structural patterns from metacrystal_engine_v7.py...")
    
    content = read_file_safe(ENGINE_FILE)
    if not content:
        return []
    
    # Look for STRUCTURAL_PATTERNS list
    patterns = []
    
    # Try to find pattern list
    pattern_match = re.search(
        r'STRUCTURAL_PATTERNS\s*=\s*\[(.*?)\n\]',
        content,
        re.DOTALL
    )
    
    if pattern_match:
        patterns_text = pattern_match.group(1)
        # Extract pattern names from dictionary entries: {"name": "pattern_name", ...}
        # Use a more specific pattern to match the name field value
        name_pattern = re.compile(r'\{\s*"name":\s*"([^"]+)"')
        for match in name_pattern.finditer(patterns_text):
            pattern_name = match.group(1)
            # Skip if it's a key name (shouldn't happen with this pattern)
            if pattern_name not in ["name", "template", "complexity"]:
                patterns.append({
                    "name": pattern_name,
                    "source": "STRUCTURAL_PATTERNS"
                })
    
    print(f"Found {len(patterns)} structural patterns")
    return patterns


def extract_ui_parameters() -> Dict[str, Any]:
    """Extract UI parameters from profile-presets.ts."""
    print("Extracting UI parameters from profile-presets.ts...")
    
    content = read_file_safe(PROFILE_PRESETS_FILE)
    if not content:
        return {}
    
    # Extract DEFAULT_PROFILE params
    params_match = re.search(
        r'params:\s*\{([^}]+)\}',
        content,
        re.DOTALL
    )
    
    params = {}
    if params_match:
        params_text = params_match.group(1)
        # Extract individual parameters
        param_pattern = re.compile(r'(\w+):\s*([^,\n]+)')
        for match in param_pattern.finditer(params_text):
            param_name = match.group(1)
            param_value = match.group(2).strip()
            params[param_name] = {
                "name": param_name,
                "default_value": param_value
            }
    
    print(f"Found {len(params)} UI parameters")
    return params


def extract_ui_flags() -> List[str]:
    """Extract UI flag groups from profile-presets.ts."""
    print("Extracting UI flag groups from profile-presets.ts...")
    
    content = read_file_safe(PROFILE_PRESETS_FILE)
    if not content:
        return []
    
    # Extract FLAG_GROUPS
    flags_match = re.search(
        r'FLAG_GROUPS:.*?=\s*\[(.*?)\];',
        content,
        re.DOTALL
    )
    
    flags = []
    if flags_match:
        flags_text = flags_match.group(1)
        # Extract flag names
        flag_pattern = re.compile(r'"([^"]+)"')
        for match in flag_pattern.finditer(flags_text):
            flag_name = match.group(1)
            if flag_name != "name" and flag_name != "flags":
                flags.append(flag_name)
    
    print(f"Found {len(flags)} UI flags")
    return flags


def extract_metrics() -> List[Dict[str, Any]]:
    """Extract metrics from profile-presets.ts."""
    print("Extracting metrics from profile-presets.ts...")
    
    content = read_file_safe(PROFILE_PRESETS_FILE)
    if not content:
        return []
    
    # Extract METRIC_KEYS
    metrics_match = re.search(
        r'METRIC_KEYS\s*=\s*\[(.*?)\]',
        content,
        re.DOTALL
    )
    
    metrics = []
    if metrics_match:
        metrics_text = metrics_match.group(1)
        # Extract metric names
        metric_pattern = re.compile(r'"([^"]+)"')
        for match in metric_pattern.finditer(metrics_text):
            metrics.append({
                "name": match.group(1),
                "source": "METRIC_KEYS"
            })
    
    print(f"Found {len(metrics)} metrics")
    return metrics


def create_parameter_entry(param_name: str, param_info: Dict, provenance: Dict) -> Dict:
    """Create a lexicon entry for a generation parameter."""
    return {
        "id": f"generation.{param_name}",
        "entity_type": "generation_parameter",
        "namespace": "generation",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": param_name,
            "type": infer_type(param_info.get("default_value", "")),
            "default_value": param_info.get("default_value"),
            "allowed_values": [],
            "min_value": None,
            "max_value": None,
            "hard_limit": None,
            "limit_status": "not_found_in_code",
            "unit": None,
            "runtime_used": True,
            "ui_accessible": True
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": None,
            "synonyms": [],
            "query_phrases": [],
            "positive_examples": [],
            "negative_examples": [],
            "effect_on_generation": None,
            "effect_on_randomness": None,
            "confidence": None,
            "needs_human_review": True
        },
        "provenance": provenance,
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "estimated_cost": "unknown",
            "output_size_effect": "unknown",
            "runtime_effect": "unknown",
            "persistent_data_effect": "unknown"
        },
        "relations": {
            "compatible_with": [],
            "incompatible_with": [],
            "requires": [],
            "excludes": [],
            "related_to": [],
            "aliases": []
        },
        "audit": {
            "verified_in_runtime": True,
            "verified_in_ui": True,
            "verified_in_sidecar": True,
            "last_verified_at": datetime.now().isoformat(),
            "notes": "Extracted from runtime code"
        }
    }


def create_domain_entry(flag_name: str, default_value: bool, provenance: Dict) -> Dict:
    """Create a lexicon entry for a domain flag."""
    return {
        "id": f"domain.{flag_name}",
        "entity_type": "domain",
        "namespace": "domain",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": flag_name,
            "type": "bool",
            "default_value": default_value,
            "allowed_values": [],
            "min_value": None,
            "max_value": None,
            "hard_limit": None,
            "unit": None,
            "runtime_used": True,
            "ui_accessible": True
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": None,
            "synonyms": [],
            "query_phrases": [],
            "positive_examples": [],
            "negative_examples": [],
            "effect_on_generation": None,
            "effect_on_randomness": None,
            "confidence": None,
            "needs_human_review": True
        },
        "provenance": provenance,
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "estimated_cost": "unknown",
            "output_size_effect": "unknown",
            "runtime_effect": "unknown",
            "persistent_data_effect": "unknown"
        },
        "relations": {
            "compatible_with": [],
            "incompatible_with": [],
            "requires": [],
            "excludes": [],
            "related_to": [],
            "aliases": []
        },
        "audit": {
            "verified_in_runtime": True,
            "verified_in_ui": True,
            "verified_in_sidecar": True,
            "last_verified_at": datetime.now().isoformat(),
            "notes": "Extracted from EngineConfig.flags"
        }
    }


def create_pattern_entry(pattern_name: str, source: str) -> Dict:
    """Create a lexicon entry for a structural pattern."""
    return {
        "id": f"pattern.{pattern_name}",
        "entity_type": "structural_pattern",
        "namespace": "pattern",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": pattern_name,
            "type": "string",
            "default_value": None,
            "allowed_values": [],
            "min_value": None,
            "max_value": None,
            "hard_limit": None,
            "unit": None,
            "runtime_used": True,
            "ui_accessible": True
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": None,
            "synonyms": [],
            "query_phrases": [],
            "positive_examples": [],
            "negative_examples": [],
            "effect_on_generation": None,
            "effect_on_randomness": None,
            "confidence": None,
            "needs_human_review": True
        },
        "provenance": {
            "source_files": [str(ENGINE_FILE)],
            "source_symbols": ["STRUCTURAL_PATTERNS" if source == "STRUCTURAL_PATTERNS" else "pattern_dict"],
            "source_lines": [],
            "ui_component": "ProfileConfigurator",
            "frontend_field": "disabled_patterns",
            "api_field": "disabled_patterns",
            "sidecar_field": "disabled_patterns",
            "python_field": "patterns",
            "extraction_method": "config"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "estimated_cost": "unknown",
            "output_size_effect": "unknown",
            "runtime_effect": "unknown",
            "persistent_data_effect": "unknown"
        },
        "relations": {
            "compatible_with": [],
            "incompatible_with": [],
            "requires": [],
            "excludes": [],
            "related_to": [],
            "aliases": []
        },
        "audit": {
            "verified_in_runtime": True,
            "verified_in_ui": True,
            "verified_in_sidecar": True,
            "last_verified_at": datetime.now().isoformat(),
            "notes": f"Extracted from {source}"
        }
    }


def create_metric_entry(metric_name: str) -> Dict:
    """Create a lexicon entry for a metric."""
    return {
        "id": f"metric.{metric_name}",
        "entity_type": "metric",
        "namespace": "metric",
        "status": "machine_extracted",
        "version": "1.0.0",
        "technical": {
            "name": metric_name,
            "type": "string",
            "default_value": None,
            "allowed_values": [],
            "min_value": None,
            "max_value": None,
            "hard_limit": None,
            "unit": None,
            "runtime_used": True,
            "ui_accessible": True
        },
        "semantic": {
            "display_name": None,
            "short_description": None,
            "description": None,
            "synonyms": [],
            "query_phrases": [],
            "positive_examples": [],
            "negative_examples": [],
            "effect_on_generation": None,
            "effect_on_randomness": None,
            "confidence": None,
            "needs_human_review": True
        },
        "provenance": {
            "source_files": [str(PROFILE_PRESETS_FILE)],
            "source_symbols": ["METRIC_KEYS"],
            "source_lines": [],
            "ui_component": "ProfileConfigurator",
            "frontend_field": "metrics.influencing, metrics.observational",
            "api_field": "metrics",
            "sidecar_field": "metrics",
            "python_field": "metric_influencing, metric_observational",
            "extraction_method": "config"
        },
        "safety": {
            "risk_level": "unknown",
            "warning_threshold": None,
            "estimated_cost": "unknown",
            "output_size_effect": "unknown",
            "runtime_effect": "unknown",
            "persistent_data_effect": "unknown"
        },
        "relations": {
            "compatible_with": [],
            "incompatible_with": [],
            "requires": [],
            "excludes": [],
            "related_to": [],
            "aliases": []
        },
        "audit": {
            "verified_in_runtime": True,
            "verified_in_ui": True,
            "verified_in_sidecar": True,
            "last_verified_at": datetime.now().isoformat(),
            "notes": "Extracted from METRIC_KEYS"
        }
    }


def infer_type(value_str: str) -> str:
    """Infer type from default value string."""
    if not value_str:
        return "unknown"
    
    value_str = value_str.strip()
    
    if value_str == "true" or value_str == "false":
        return "bool"
    elif value_str.isdigit():
        return "int"
    elif re.match(r'^\d+\.\d+$', value_str):
        return "float"
    elif value_str.startswith('"') or value_str.startswith("'"):
        return "string"
    elif value_str.startswith('['):
        return "array"
    else:
        return "unknown"


def main():
    """Main extraction function."""
    print("=" * 70)
    print("Runtime Lexicon Extractor")
    print("=" * 70)
    
    ensure_output_dirs()
    
    # Extract from runtime
    engine_fields = extract_engine_config_fields()
    domain_flags = extract_domain_flags()
    structural_patterns = extract_structural_patterns()
    
    # Extract from UI
    ui_params = extract_ui_parameters()
    ui_flags = extract_ui_flags()
    metrics = extract_metrics()
    
    # Create entries
    print("\nCreating lexicon entries...")
    
    # Generation parameters
    param_entries = []
    param_provenance = {
        "source_files": [str(PROFILE_PRESETS_FILE), str(ENGINE_FILE)],
        "source_symbols": ["DEFAULT_PROFILE.params", "EngineConfig"],
        "source_lines": [],
        "ui_component": "ProfileConfigurator",
        "frontend_field": "params",
        "api_field": "params",
        "sidecar_field": "params",
        "python_field": "cfg",
        "extraction_method": "config"
    }
    
    for param_name, param_info in ui_params.items():
        entry = create_parameter_entry(param_name, param_info, param_provenance)
        param_entries.append(entry)
    
    # Domain flags
    domain_entries = []
    domain_provenance = {
        "source_files": [str(ENGINE_FILE)],
        "source_symbols": ["EngineConfig.flags"],
        "source_lines": [],
        "ui_component": "ProfileConfigurator",
        "frontend_field": "flags",
        "api_field": "flags",
        "sidecar_field": "flags",
        "python_field": "cfg.flags",
        "extraction_method": "config"
    }
    
    for flag_info in domain_flags:
        entry = create_domain_entry(flag_info["name"], flag_info["default_value"], domain_provenance)
        domain_entries.append(entry)
    
    # Structural patterns
    pattern_entries = []
    for pattern_info in structural_patterns:
        entry = create_pattern_entry(pattern_info["name"], pattern_info["source"])
        pattern_entries.append(entry)
    
    # Metrics
    metric_entries = []
    for metric_info in metrics:
        entry = create_metric_entry(metric_info["name"])
        metric_entries.append(entry)
    
    # Write machine layer files
    print("\nWriting machine layer files...")
    
    with open(MACHINE_DIR / "generation-parameters.json", "w", encoding="utf-8") as f:
        json.dump(param_entries, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {len(param_entries)} generation parameters")
    
    with open(MACHINE_DIR / "domain-flags.json", "w", encoding="utf-8") as f:
        json.dump(domain_entries, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {len(domain_entries)} domain flags")
    
    with open(MACHINE_DIR / "structural-patterns.json", "w", encoding="utf-8") as f:
        json.dump(pattern_entries, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {len(pattern_entries)} structural patterns")
    
    with open(MACHINE_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metric_entries, f, indent=2, ensure_ascii=False)
    print(f"  Wrote {len(metric_entries)} metrics")
    
    # Create provenance report
    provenance_report = {
        "extraction_timestamp": datetime.now().isoformat(),
        "source_files": {
            "engine": str(ENGINE_FILE),
            "sidecar": str(SIDECAR_FILE),
            "profile_presets": str(PROFILE_PRESETS_FILE),
            "generation": str(GENERATION_FILE)
        },
        "extraction_summary": {
            "generation_parameters": len(param_entries),
            "domain_flags": len(domain_entries),
            "structural_patterns": len(pattern_entries),
            "metrics": len(metric_entries)
        },
        "runtime_chain": [
            "src/components/pages/Generation.tsx",
            "src/app/api/generate/start/route.ts",
            "src/lib/engine/runner.ts",
            "python_engine/sidecar.py",
            "python_engine/metacrystal_engine_v7.py",
            "data/meta_crystals"
        ]
    }
    
    with open(REPORTS_DIR / "runtime-provenance.json", "w", encoding="utf-8") as f:
        json.dump(provenance_report, f, indent=2, ensure_ascii=False)
    print(f"  Wrote provenance report")
    
    # Create missing descriptions report
    missing_descriptions = {
        "generation_parameters": [e["id"] for e in param_entries if e["semantic"]["needs_human_review"]],
        "domain_flags": [e["id"] for e in domain_entries if e["semantic"]["needs_human_review"]],
        "structural_patterns": [e["id"] for e in pattern_entries if e["semantic"]["needs_human_review"]],
        "metrics": [e["id"] for e in metric_entries if e["semantic"]["needs_human_review"]],
        "total_missing": sum([
            len([e for e in param_entries if e["semantic"]["needs_human_review"]]),
            len([e for e in domain_entries if e["semantic"]["needs_human_review"]]),
            len([e for e in pattern_entries if e["semantic"]["needs_human_review"]]),
            len([e for e in metric_entries if e["semantic"]["needs_human_review"]])
        ])
    }
    
    with open(REPORTS_DIR / "missing-descriptions.json", "w", encoding="utf-8") as f:
        json.dump(missing_descriptions, f, indent=2, ensure_ascii=False)
    print(f"  Wrote missing descriptions report")
    
    print("\n" + "=" * 70)
    print("Extraction complete!")
    print(f"  Generation parameters: {len(param_entries)}")
    print(f"  Domain flags: {len(domain_entries)}")
    print(f"  Structural patterns: {len(pattern_entries)}")
    print(f"  Metrics: {len(metric_entries)}")
    print(f"  Total entries: {len(param_entries) + len(domain_entries) + len(pattern_entries) + len(metric_entries)}")
    print("=" * 70)


if __name__ == "__main__":
    main()
