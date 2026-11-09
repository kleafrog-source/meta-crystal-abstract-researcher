#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Startup script for the Meta Crystal app.
Starts the Next.js dev server and optionally opens the browser.
"""

import os
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


def main():
    project_root = Path(__file__).parent.resolve()
    os.chdir(project_root)

    print("Starting Meta Crystal app...")
    print(f"Working directory: {project_root}")

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

    print("\nStarting Next.js server...")
    print("App URL: http://localhost:3000")

    try:
        if os.getenv("AM_CORE_OPEN_BROWSER") == "1":
            browser_thread = threading.Thread(target=open_browser_delayed, daemon=True)
            browser_thread.start()

        print("Press Ctrl+C to stop the server.\n")
        process = subprocess.run(
            ["pnpm", "exec", "next", "dev", "--webpack", "-p", "3000"],
            check=False,
        )
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
