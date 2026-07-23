#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Startup script for the Meta Crystal app.
Starts the Next.js dev server and optionally opens the browser.
"""

import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


if sys.platform == "win32":
    import codecs

    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer)
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.buffer)


def open_browser_delayed():
    time.sleep(5)
    print("Opening browser...")
    webbrowser.open("http://localhost:3000")


def stop_previous_project_processes(project_root: Path):
    """Stop only processes related to this project or bound to port 3000."""
    if sys.platform != "win32":
        return

    project_marker = str(project_root).replace("\\", "\\\\")
    cleanup_script = rf"""
$ErrorActionPreference = 'SilentlyContinue'
$project = '{project_marker}'

Get-CimInstance Win32_Process |
  Where-Object {{
    $_.CommandLine -and
    $_.ProcessId -ne $PID -and
    (
      $_.CommandLine -like "*$project*" -or
      $_.CommandLine -like "*python_engine\\sidecar.py*"
    )
  }} |
  ForEach-Object {{
    try {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }} catch {{}}
  }}

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {{
    try {{ Stop-Process -Id $_ -Force -ErrorAction Stop }} catch {{}}
  }}
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", cleanup_script],
        capture_output=True,
        text=True,
        check=False,
    )


def main():
    project_root = Path(__file__).parent.resolve()
    os.chdir(project_root)

    print("Starting Meta Crystal app...")
    print(f"Working directory: {project_root}")

    print("\nCleaning previous project processes...")
    stop_previous_project_processes(project_root)

    print("\nChecking dependencies...")
    try:
        node_result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, check=False
        )
        if node_result.returncode == 0:
            print(f"Node.js: {node_result.stdout.strip()}")
        else:
            print("Node.js not found.")
            return 1
    except Exception as exc:
        print(f"Node.js not found: {exc}")
        return 1

    print(f"Python: {sys.version.split()[0]}")

    print("\nChecking database configuration...")
    try:
        from dotenv import load_dotenv

        load_dotenv()
        db_url = os.getenv("DATABASE_URL", "")
        if "postgresql" in db_url:
            print("Database: PostgreSQL")
        elif "sqlite" in db_url or "file:" in db_url:
            print("Database: SQLite")
        else:
            print("Database is not configured in .env")
    except ImportError:
        print("python-dotenv is not installed, skipping .env check")

    print("\nStarting Next.js server...")
    print("App URL: http://localhost:3000")

    try:
        browser_thread = threading.Thread(target=open_browser_delayed, daemon=True)
        browser_thread.start()

        npm_cmd = shutil.which("npm.cmd") or shutil.which("npm") or "npm"
        print("Press Ctrl+C to stop the server.\n")
        process = subprocess.run([npm_cmd, "run", "dev"], check=False)
        if process.returncode != 0:
            print(f"Server exited with code: {process.returncode}")
            return 1
    except KeyboardInterrupt:
        print("\nStopped by user.")
        return 0
    except Exception as exc:
        print(f"Unexpected error: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
