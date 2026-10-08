#!/usr/bin/env python3
"""Run the complete Combinatorial Genesis inbox-to-runtime pipeline."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = PROJECT_ROOT / "data" / "combinatorial-genesis"
INBOX = DATA_ROOT / "flowmusic-inbox"
ARCHIVE = DATA_ROOT / "flowmusic-inbox-backup-archive"
RUN_REPORT = DATA_ROOT / "pipeline-last-run.json"
LOCK_FILE = DATA_ROOT / ".pipeline.lock"
STEPS = [
    "collect-json-from-folder.py",
    "prepare-combinatorial-corpus.py",
    "freeze-combinatorial-dataset.py",
    "build-combinatorial-runtime-index.py",
    "build-genesis-v3-composite-index.py",
]
ALLOWED_EXIT_CODES = {
    "collect-json-from-folder.py": {0, 2},  # 2 means invalid batches were quarantined.
}


def process_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_lock() -> int:
    for _attempt in range(2):
        try:
            lock_fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(lock_fd, str(os.getpid()).encode("ascii"))
            return lock_fd
        except FileExistsError:
            try:
                existing_pid = int(LOCK_FILE.read_text(encoding="ascii").strip())
            except (OSError, ValueError):
                existing_pid = 0
            if process_is_alive(existing_pid):
                raise RuntimeError(
                    f"Another Combinatorial Genesis pipeline run is already active (PID {existing_pid})."
                )
            LOCK_FILE.unlink(missing_ok=True)
    raise RuntimeError("Could not acquire Combinatorial Genesis pipeline lock.")


def latest_version() -> str | None:
    path = DATA_ROOT / "datasets" / "latest.json"
    if not path.exists():
        return None
    return str(json.loads(path.read_text(encoding="utf-8")).get("version_id") or "") or None


def write_report(payload: dict[str, object]) -> None:
    RUN_REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    try:
        lock_fd = acquire_lock()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 3

    try:
        return run_pipeline()
    finally:
        os.close(lock_fd)
        LOCK_FILE.unlink(missing_ok=True)


def run_pipeline() -> int:
    files = sorted(
        str(path.relative_to(INBOX))
        for path in INBOX.rglob("*")
        if path.is_file() and path.suffix.lower() in {".txt", ".md"}
    )
    if not files:
        print(f"No .txt/.md files found in {INBOX}", file=sys.stderr)
        return 1

    archive_files = sorted(
        str(path.relative_to(ARCHIVE))
        for path in ARCHIVE.rglob("*")
        if path.is_file() and path.suffix.lower() in {".txt", ".md"}
    ) if ARCHIVE.exists() else []

    started_at = datetime.now(timezone.utc).isoformat()
    version_before = latest_version()
    results: list[dict[str, object]] = []
    for index, script in enumerate(STEPS, start=1):
        print(
            json.dumps({"event": "step_started", "step": script, "current": index, "total": len(STEPS)}),
            flush=True,
        )
        command = [sys.executable, str(PROJECT_ROOT / "python_engine" / script)]
        if script == "collect-json-from-folder.py":
            command.extend([str(ARCHIVE), str(INBOX)])
        completed = subprocess.run(
            command,
            cwd=PROJECT_ROOT,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        result = {
            "script": script,
            "exit_code": completed.returncode,
            "status": "completed" if completed.returncode == 0 else "completed_with_quarantine",
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
        results.append(result)
        print(
            json.dumps(
                {"event": "step_finished", "step": script, "current": index, "total": len(STEPS), "exit_code": completed.returncode}
            ),
            flush=True,
        )
        if completed.returncode not in ALLOWED_EXIT_CODES.get(script, {0}):
            report = {
                "status": "failed",
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "inbox_files": files,
                "archive_files": archive_files,
                "version_before": version_before,
                "version_after": latest_version(),
                "steps": results,
            }
            write_report(report)
            print(json.dumps(report, ensure_ascii=False))
            return completed.returncode

    version_after = latest_version()
    report = {
        "status": "completed",
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "inbox_files": files,
        "archive_files": archive_files,
        "version_before": version_before,
        "version_after": version_after,
        "new_version_created": version_before != version_after,
        "steps": results,
    }
    write_report(report)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
