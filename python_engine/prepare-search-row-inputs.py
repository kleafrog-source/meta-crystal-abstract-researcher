#!/usr/bin/env python3
"""Prepare CLAP and SigLIP row inputs from one pinned catalogue snapshot, without models."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from audio_clap_rag import _load_v3_parameters
from morpho_siglip import build_parameter_rows
from v3_snapshot import load_v3_snapshot

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ANCHOR_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis" / "v3" / "anchoring"
STATIC_INPUTS = (
    ("qwen3/anchors/axes.json", ANCHOR_ROOT / "axes.json"),
    ("qwen3/anchors/polarity_matrix.json", ANCHOR_ROOT / "polarity_matrix.json"),
    ("qwen3/anchors/calibration/strong_set.json", ANCHOR_ROOT / "calibration" / "strong_set.json"),
    ("qwen3/anchors/calibration/neutral_set.json", ANCHOR_ROOT / "calibration" / "neutral_set.json"),
)


def write_json(path: Path, payload: object) -> bytes:
    raw = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return raw


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--source-snapshot-sha256", required=True)
    parser.add_argument("--excluded-sha256", required=True)
    parser.add_argument("--excluded-count", type=int, default=0)
    args = parser.parse_args()

    snapshot = load_v3_snapshot(
        snapshot_path=args.snapshot,
        source_revision=args.source_revision,
        source_snapshot_sha256=args.source_snapshot_sha256,
        excluded_sha256=args.excluded_sha256,
        excluded_count=args.excluded_count,
    )
    receipt = {
        "schema_version": 1,
        "source_revision": args.source_revision,
        "source_snapshot_sha256": args.source_snapshot_sha256,
        "rows": None,
    }
    outputs = []
    for name, rows in (
        ("clap-input.json", _load_v3_parameters(snapshot)),
        ("siglip-input.json", build_parameter_rows(snapshot)),
    ):
        payload = {**receipt, "rows": rows}
        raw = write_json(args.output_dir / name, payload)
        outputs.append({"path": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})

    for name, source_path in STATIC_INPUTS:
        raw = source_path.read_bytes()
        json.loads(raw.decode("utf-8"))
        target = args.output_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        outputs.append({"path": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})

    manifest_path = args.output_dir / "prepare-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("status") != "prepared":
        raise ValueError("Base model-free prepare manifest is not complete.")
    entries = {str(item["path"]): item for item in manifest.get("outputs", []) if isinstance(item, dict) and item.get("path")}
    entries.update({item["path"]: item for item in outputs})
    manifest["outputs"] = [entries[key] for key in sorted(entries)]
    write_json(manifest_path, manifest)
    for item in outputs:
        raw = (args.output_dir / item["path"]).read_bytes()
        if len(raw) != item["bytes"] or hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise ValueError(f"Read-back verification failed: {item['path']}")
    print(json.dumps({"status": "prepared", "model_called": False, "outputs": outputs}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
