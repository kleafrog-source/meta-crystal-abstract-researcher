#!/usr/bin/env python3
"""Freeze the current Combinatorial Genesis draft as an immutable content-addressed version."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from published_parameter_schema import clean_published_parameter, out_of_band_fields


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
OPTIONAL_ARTIFACTS = {
    "source_parameters": "source_parameters.json",
    "source_manifest": "source_manifest.json",
    "semantic_representatives": "semantic_representatives.json",
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
    for logical_name, filename in OPTIONAL_ARTIFACTS.items():
        path = source_dir / filename
        if not path.is_file():
            continue
        raw = path.read_bytes()
        payloads[logical_name] = json.loads(raw.decode("utf-8"))
        hashes[filename] = sha256_bytes(raw)
        combined.update(filename.encode("utf-8"))
        combined.update(b"\0")
        combined.update(json.dumps(stable_payload(payloads[logical_name]), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        combined.update(b"\0")
        combined.update(
            json.dumps(stable_payload(payloads[logical_name]), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            .encode("utf-8")
        )
        combined.update(b"\0")
    return payloads, hashes, combined.hexdigest()


def freeze_dataset(source_dir: Path, datasets_dir: Path, activate_latest: bool = True) -> tuple[Path, dict[str, Any], bool]:
    payloads, source_hashes, content_hash = load_artifacts(source_dir)
    parameter_source = payloads.get("source_parameters", payloads["parameters"])
    provenance = {
        str(row.get("technical_name")): out_of_band_fields(row)
        for row in parameter_source
        if isinstance(row, dict) and row.get("technical_name") and out_of_band_fields(row)
    }
    payloads["parameters"] = [clean_published_parameter(row) for row in parameter_source if isinstance(row, dict)]
    version_id = f"cg-v1-{content_hash[:12]}"
    version_dir = datasets_dir / version_id
    manifest_path = version_dir / "manifest.json"

    if version_dir.exists():
        if not manifest_path.exists():
            raise RuntimeError(f"Existing version directory has no manifest: {version_dir}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("content_sha256") != content_hash:
            raise RuntimeError(f"Immutable version hash mismatch: {version_dir}")
        if activate_latest:
            write_json(datasets_dir / "latest.json", {
                "version_id": version_id,
                "manifest": str(manifest_path),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        return version_dir, manifest, False

    version_dir.mkdir(parents=True, exist_ok=False)
    write_json(version_dir / "parameters.json", payloads["parameters"])
    write_json(version_dir / "provenance.json", provenance)
    write_json(version_dir / "atoms.json", payloads["atoms"])
    write_json(version_dir / "semantic_groups.json", payloads["semantic_groups"])
    if "semantic_representatives" in payloads:
        write_json(version_dir / "semantic_representatives.json", payloads["semantic_representatives"])
    if "source_manifest" in payloads:
        write_json(version_dir / "source_manifest.json", payloads["source_manifest"])
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
            "provenance": "provenance.json",
            "atoms": "atoms.json",
            "semantic_groups": "semantic_groups.json",
        },
        "source_revision": (payloads.get("source_manifest") or {}).get("catalogue_revision") or (payloads.get("source_manifest") or {}).get("source_sha256"),
        "eligible_parameter_count": (payloads.get("source_manifest") or {}).get("eligible_record_count"),
        "excluded_parameter_count": (payloads.get("source_manifest") or {}).get("excluded_record_count"),
        "v2_modified": False,
    }
    write_json(manifest_path, manifest)
    if activate_latest:
        write_json(datasets_dir / "latest.json", {
            "version_id": version_id,
            "manifest": str(manifest_path),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    return version_dir, manifest, True


def freeze_candidate_inputs(source_dir: Path, datasets_dir: Path) -> tuple[Path, dict[str, Any], bool]:
    """Write only the immutable parameter/atom inputs needed by a candidate runtime-atoms row."""
    source_manifest = json.loads((source_dir / "source_manifest.json").read_text(encoding="utf-8"))
    parameters = json.loads((source_dir / "source_parameters.json").read_text(encoding="utf-8"))
    atoms = json.loads((source_dir / "atom_corpus.json").read_text(encoding="utf-8"))
    if not isinstance(parameters, list) or not isinstance(atoms, list):
        raise ValueError("Candidate source parameters and atom corpus must be JSON arrays.")
    source_revision = source_manifest.get("catalogue_revision")
    if not isinstance(source_revision, str) or not source_revision:
        raise ValueError("Candidate source manifest has no pinned catalogue revision.")
    if len(parameters) != source_manifest.get("source_record_count"):
        raise ValueError("Candidate source parameter count does not match its pinned source manifest.")
    payload = {"schema_version": 1, "source_revision": source_revision, "parameters": parameters, "atoms": atoms}
    content_hash = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    version_id = f"cg-v1-{content_hash[:12]}"
    version_dir = datasets_dir / version_id
    manifest_path = version_dir / "manifest.json"
    if version_dir.exists():
        if not manifest_path.is_file():
            raise RuntimeError(f"Existing candidate frozen directory has no manifest: {version_dir}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("content_sha256") != content_hash:
            raise RuntimeError(f"Candidate frozen content hash mismatch: {version_dir}")
        for name in ("parameters.json", "atoms.json"):
            raw = (version_dir / name).read_bytes()
            if hashlib.sha256(raw).hexdigest() != manifest.get("files_sha256", {}).get(name):
                raise RuntimeError(f"Candidate frozen input checksum mismatch: {name}")
        return version_dir, manifest, False

    version_dir.mkdir(parents=True, exist_ok=False)
    write_json(version_dir / "parameters.json", parameters)
    write_json(version_dir / "atoms.json", atoms)
    manifest = {
        "schema_version": 1, "version_id": version_id, "content_sha256": content_hash,
        "source_revision": source_revision, "immutable": True, "candidate_only": True,
        "parameter_count": len(parameters), "atom_count": len(atoms),
        "files": {"parameters": "parameters.json", "atoms": "atoms.json"},
        "files_sha256": {
            name: hashlib.sha256((version_dir / name).read_bytes()).hexdigest()
            for name in ("parameters.json", "atoms.json")
        },
    }
    write_json(manifest_path, manifest)
    return version_dir, manifest, True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--datasets-dir", type=Path, default=DEFAULT_DATASETS_DIR)
    parser.add_argument("--no-activate", action="store_true", help="Create/reuse an immutable version without changing latest.json.")
    parser.add_argument("--candidate-inputs-only", action="store_true", help="Freeze only pinned source parameters and prepared atom rows for an inactive candidate; never reads/writes latest.json.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.candidate_inputs_only:
        version_dir, manifest, created = freeze_candidate_inputs(args.source_dir.resolve(), args.datasets_dir.resolve())
    else:
        version_dir, manifest, created = freeze_dataset(args.source_dir.resolve(), args.datasets_dir.resolve(), activate_latest=not args.no_activate)
    action = "Created" if created else "Reused"
    semantic_group_summary = f", {manifest['semantic_group_count']} semantic groups" if "semantic_group_count" in manifest else ""
    print(
        f"{action} {manifest['version_id']}: {manifest['parameter_count']} parameters, "
        f"{manifest['atom_count']} atoms{semantic_group_summary}\n"
        f"Path: {version_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
