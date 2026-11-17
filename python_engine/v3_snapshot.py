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


def ensure_snapshot_revision_current(captured: dict[str, Any], current: dict[str, Any]) -> None:
    if captured.get("source_revision") != current.get("source_revision"):
        raise RuntimeError(
            "Effective catalogue changed during build; output remains tied to the captured snapshot and was not activated."
        )


def load_v3_snapshot(
    data_root: Path = DEFAULT_DATA_ROOT,
    *,
    snapshot_path: Path | None = None,
    source_revision: str | None = None,
    source_snapshot_sha256: str | None = None,
    excluded_sha256: str | None = None,
    excluded_count: int = 0,
) -> dict[str, Any]:
    """Return effective catalogue rows or an explicitly pinned immutable snapshot.

    When ``snapshot_path`` is supplied it is authoritative: latest.json, the live
    library and current registries are not consulted or merged into its rows.
    """
    if snapshot_path is not None:
        try:
            raw = snapshot_path.read_bytes()
        except FileNotFoundError as error:
            raise FileNotFoundError(f"Explicit candidate snapshot is unavailable: {snapshot_path}") from error
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, list) or any(
            not isinstance(item, dict) or not str(item.get("technical_name", "")).strip()
            for item in payload
        ):
            raise ValueError(f"Invalid candidate snapshot: {snapshot_path}")
        revision = source_revision or hashlib.sha256(raw).hexdigest()
        return {
            "schema_version": 1,
            "dataset_version": revision,
            "source_revision": revision,
            "parameter_count": len(payload),
            "library_count": len(payload),
            "frozen_count": 0,
            "excluded_count": excluded_count,
            "excluded_sha256": excluded_sha256 or hashlib.sha256(b"[]").hexdigest(),
            "content_sha256": source_snapshot_sha256 or hashlib.sha256(raw).hexdigest(),
            "parameters": payload,
        }

    latest_path = data_root / "datasets" / "latest.json"
    latest = _read(latest_path) if latest_path.is_file() else {}
    library_path = data_root / "library" / "parameters.json"
    library_raw = library_path.read_bytes()
    library = json.loads(library_raw.decode("utf-8"))
    tombstone_path = data_root / "library" / "catalogue-deleted.json"
    tombstone_raw = tombstone_path.read_bytes() if tombstone_path.exists() else b"[]"
    tombstone_payload = json.loads(tombstone_raw.decode("utf-8"))
    deleted = set(tombstone_payload if isinstance(tombstone_payload, list) else tombstone_payload.get("technical_names", []))
    registry_path = data_root / "registry" / "excluded.json"
    registry = _read(registry_path) if registry_path.exists() else {"entries": []}
    excluded = sorted({str(item.get("technical_name", "")) for item in registry.get("entries", []) if item.get("technical_name")})
    excluded_set = set(excluded)
    excluded_sha = _sha(excluded)

    records: dict[str, dict[str, Any]] = {}
    for item in library:
        name = str(item.get("technical_name", "")).strip()
        if name:
            records[name] = {**item, "source": "library"}

    parameters = [records[name] for name in sorted(records) if name not in excluded_set and name not in deleted]
    tombstone_sha = hashlib.sha256(tombstone_raw).hexdigest()
    revision = hashlib.sha256(
        f"{hashlib.sha256(library_raw).hexdigest()}\0{tombstone_sha}\0{excluded_sha}".encode("utf-8")
    ).hexdigest()
    return {
        "schema_version": 1,
        "dataset_version": str(latest.get("version_id") or "live-catalogue"),
        "source_revision": revision,
        "parameter_count": len(parameters),
        "library_count": len(parameters),
        "frozen_count": 0,
        "excluded_count": len(excluded),
        "excluded_sha256": excluded_sha,
        "content_sha256": hashlib.sha256(library_raw + b"\0" + tombstone_raw).hexdigest(),
        "parameters": parameters,
    }
