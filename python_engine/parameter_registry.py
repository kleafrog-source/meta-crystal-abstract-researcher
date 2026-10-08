"""Shared tombstone registry helpers for Combinatorial Genesis builders."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable


def registry_path(data_root: Path) -> Path:
    return data_root / "registry" / "excluded.json"


def read_registry(data_root: Path) -> dict[str, Any]:
    path = registry_path(data_root)
    if not path.exists():
        return {"version": 1, "updated_at": None, "entries": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries: dict[str, dict[str, Any]] = {}
    for entry in payload.get("entries") or []:
        name = str(entry.get("technical_name") or "").strip()
        if name:
            entries[name] = entry
    return {
        "version": 1,
        "updated_at": payload.get("updated_at"),
        "entries": [entries[name] for name in sorted(entries)],
    }


def excluded_names(data_root: Path) -> set[str]:
    return {str(entry["technical_name"]) for entry in read_registry(data_root)["entries"]}


def registry_sha256(data_root: Path) -> str:
    names = sorted(excluded_names(data_root))
    return hashlib.sha256(json.dumps(names, separators=(",", ":")).encode("utf-8")).hexdigest()


def filter_parameters(parameters: Iterable[dict[str, Any]], data_root: Path) -> list[dict[str, Any]]:
    excluded = excluded_names(data_root)
    return [item for item in parameters if str(item.get("technical_name") or "") not in excluded]
