"""Canonical read-only V3 parameter snapshot shared by analytical tools."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _javascript_json_numbers(payload: Any) -> Any:
    """Normalize integral floats the way JSON.stringify serializes them."""
    if isinstance(payload, dict):
        return {key: _javascript_json_numbers(value) for key, value in payload.items()}
    if isinstance(payload, list):
        return [_javascript_json_numbers(value) for value in payload]
    if isinstance(payload, float) and payload.is_integer():
        return int(payload)
    return payload


def _sha(payload: Any) -> str:
    raw = json.dumps(_javascript_json_numbers(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def load_v3_snapshot(data_root: Path = DEFAULT_DATA_ROOT) -> dict[str, Any]:
    """Return the active library-over-frozen snapshot in deterministic order."""
    latest = _read(data_root / "datasets" / "latest.json")
    frozen_path = data_root / "datasets" / str(latest["version_id"]) / "parameters.json"
    library_path = data_root / "library" / "parameters.json"
    frozen = _read(frozen_path)
    library = _read(library_path)
    registry_path = data_root / "registry" / "excluded.json"
    registry = _read(registry_path) if registry_path.exists() else {"entries": []}
    excluded = sorted({str(item.get("technical_name", "")) for item in registry.get("entries", []) if item.get("technical_name")})
    excluded_set = set(excluded)

    records: dict[str, dict[str, Any]] = {}
    for item in frozen:
        name = str(item.get("technical_name", "")).strip()
        if name:
            records[name] = {**item, "source": "frozen"}
    for item in library:
        name = str(item.get("technical_name", "")).strip()
        if name:
            records[name] = {**item, "source": "library"}

    parameters = [records[name] for name in sorted(records) if name not in excluded_set]
    excluded_sha = _sha(excluded)
    return {
        "schema_version": 1,
        "dataset_version": str(latest["version_id"]),
        "parameter_count": len(parameters),
        "library_count": sum(item["source"] == "library" for item in parameters),
        "frozen_count": sum(item["source"] == "frozen" for item in parameters),
        "excluded_count": len(excluded),
        "excluded_sha256": excluded_sha,
        "content_sha256": hashlib.sha256(frozen_path.read_bytes() + b"\0" + library_path.read_bytes()).hexdigest(),
        "parameters": parameters,
    }
