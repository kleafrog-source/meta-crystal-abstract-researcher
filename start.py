#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Start the project-local Next.js production or development server on Windows."""

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


def open_browser_delayed() -> None:
    time.sleep(5)
    webbrowser.open("http://127.0.0.1:3000")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--production", action="store_true", help="start the production build (default)")
    mode.add_argument("--dev", action="store_true", help="start the webpack development server")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent
    node = shutil.which("node")
    python = Path(sys.executable).resolve()
    next_cli = project_root / "node_modules" / "next" / "dist" / "bin" / "next"

    if not node:
        print("Node.js was not found in PATH.", file=sys.stderr)
        return 1
    if not python.is_file():
        print(f"Python interpreter does not exist: {python}", file=sys.stderr)
        return 1
    if not next_cli.is_file():
        print(f"Project-local Next.js CLI was not found: {next_cli}", file=sys.stderr)
        return 1

    is_dev = args.dev
    command = [node, str(next_cli), "dev" if is_dev else "start"]
    if is_dev:
        command.append("--webpack")
    command.extend(["--hostname", "127.0.0.1", "--port", "3000"])

    child_env = os.environ.copy()
    child_env["NODE_ENV"] = "development" if is_dev else "production"
    child_env["PORT"] = "3000"
    child_env["HOSTNAME"] = "127.0.0.1"
    # Keep Prisma and Python work bound to this checkout, regardless of inherited shell values.
    child_env["DATABASE_URL"] = "file:./dev.db"
    child_env["PYTHON"] = str(python)
    child_env["PYTHON_EXECUTABLE"] = str(python)

    print(f"Project: {project_root}")
    print(f"Mode: {'development' if is_dev else 'production'}")
    print("Database: prisma/dev.db")
    print("Data: data/combinatorial-genesis and data/am-stage-snapshots")
    print(f"Python: {python}")
    print("Address: http://127.0.0.1:3000")
    print("Press Ctrl+C to stop the server.")

    if child_env.get("AM_CORE_OPEN_BROWSER") == "1":
        threading.Thread(target=open_browser_delayed, daemon=True).start()

    try:
        return subprocess.run(command, cwd=project_root, env=child_env, check=False).returncode
    except KeyboardInterrupt:
        print("\nStopped by user.")
        return 0
    except OSError as exc:
        print(f"Could not start the server: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
