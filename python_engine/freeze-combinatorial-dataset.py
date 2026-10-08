#!/usr/bin/env python3
"""Freeze the current Combinatorial Genesis draft as an immutable content-addressed version."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "data" / "combinatorial-genesis" / "flowmusic-output"
DEFAULT_DATASETS_DIR = PROJECT_ROOT / "data" / "combinatorial-genesis" / "datasets"
ARTIFACTS = {
    "parameters": "unified_parameters_semantic_draft.json",
    "atoms": "atom_corpus.json",
    "semantic_groups": "semantic_groups.json",
    "quality_report": "quality_report.json",
    "semantic_triage_report": "semantic_auto_triage_report.json",
    "embedding_metadata": "semantic_embeddings_meta.json",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def stable_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: stable_payload(item)
            for key, item in value.items()
            if key not in {"generated_at", "updated_at", "endpoint"}
        }
    if isinstance(value, list):
        return [stable_payload(item) for item in value]
    return value


def load_artifacts(source_dir: Path) -> tuple[dict[str, Any], dict[str, str], str]:
    payloads: dict[str, Any] = {}
    hashes: dict[str, str] = {}
    combined = hashlib.sha256()
    for logical_name, filename in ARTIFACTS.items():
        path = source_dir / filename
        raw = path.read_bytes()
        payloads[logical_name] = json.loads(raw.decode("utf-8"))
        hashes[filename] = sha256_bytes(raw)
        combined.update(filename.encode("utf-8"))
        combined.update(b"\0")
        combined.update(
            json.dumps(stable_payload(payloads[logical_name]), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            .encode("utf-8")
        )
        combined.update(b"\0")
    return payloads, hashes, combined.hexdigest()


def freeze_dataset(source_dir: Path, datasets_dir: Path) -> tuple[Path, dict[str, Any], bool]:
    payloads, source_hashes, content_hash = load_artifacts(source_dir)
    version_id = f"cg-v1-{content_hash[:12]}"
    version_dir = datasets_dir / version_id
    manifest_path = version_dir / "manifest.json"

    if version_dir.exists():
        if not manifest_path.exists():
            raise RuntimeError(f"Existing version directory has no manifest: {version_dir}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("content_sha256") != content_hash:
            raise RuntimeError(f"Immutable version hash mismatch: {version_dir}")
        write_json(datasets_dir / "latest.json", {
            "version_id": version_id,
            "manifest": str(manifest_path),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return version_dir, manifest, False

    version_dir.mkdir(parents=True, exist_ok=False)
    write_json(version_dir / "parameters.json", payloads["parameters"])
    write_json(version_dir / "atoms.json", payloads["atoms"])
    write_json(version_dir / "semantic_groups.json", payloads["semantic_groups"])
    manifest = {
        "schema_version": 1,
        "version_id": version_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "content_sha256": content_hash,
        "immutable": True,
        "publish_status": "experimental",
        "parameter_count": len(payloads["parameters"]),
        "atom_count": len(payloads["atoms"]),
        "semantic_group_count": len(payloads["semantic_groups"]),
        "quality_gate": payloads["quality_report"],
        "semantic_triage": payloads["semantic_triage_report"],
        "embedding": payloads["embedding_metadata"],
        "source_sha256": source_hashes,
        "files": {
            "parameters": "parameters.json",
            "atoms": "atoms.json",
            "semantic_groups": "semantic_groups.json",
        },
        "v2_modified": False,
    }
    write_json(manifest_path, manifest)
    write_json(datasets_dir / "latest.json", {
        "version_id": version_id,
        "manifest": str(manifest_path),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return version_dir, manifest, True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--datasets-dir", type=Path, default=DEFAULT_DATASETS_DIR)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    version_dir, manifest, created = freeze_dataset(args.source_dir.resolve(), args.datasets_dir.resolve())
    action = "Created" if created else "Reused"
    print(
        f"{action} {manifest['version_id']}: {manifest['parameter_count']} parameters, "
        f"{manifest['atom_count']} atoms, {manifest['semantic_group_count']} semantic groups\n"
        f"Path: {version_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
