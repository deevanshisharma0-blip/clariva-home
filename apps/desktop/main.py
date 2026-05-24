"""
NexusOS Desktop Launcher
Starts FastAPI backend + Next.js UI, then opens a native PyWebView window.
"""
import sys
import os
import time
import subprocess
import threading
import signal
import http.client
from pathlib import Path

import webview

ROOT = Path(__file__).parent.parent.parent
API_DIR = ROOT / "apps" / "api"
WEB_DIR = ROOT / "apps" / "web"
DATA_DIR = ROOT / "data"
API_PORT = 8000
WEB_PORT = 3000
API_HOST = os.environ.get("NEXUS_HOST", "127.0.0.1")
WEB_HOST = os.environ.get("NEXUS_WEB_HOST", "127.0.0.1")
API_URL = f"http://127.0.0.1:{API_PORT}"
WEB_URL = f"http://127.0.0.1:{WEB_PORT}"

_procs: list[subprocess.Popen] = []


def find_python() -> str:
    candidates = [
        ROOT / ".venv" / "Scripts" / "python.exe",
        ROOT / ".venv" / "bin" / "python",
        Path(sys.executable),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return sys.executable


def find_npm() -> str:
    import shutil
    return shutil.which("npm") or "npm"


def wait_for_http(url: str, timeout: int = 60) -> bool:
    host = "127.0.0.1"
    path = "/api/status"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection(host, API_PORT, timeout=2)
            conn.request("GET", path)
            res = conn.getresponse()
            if res.status < 500:
                return True
        except Exception:
            pass
        time.sleep(0.75)
    return False


def wait_for_web(timeout: int = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", WEB_PORT, timeout=2)
            conn.request("GET", "/")
            res = conn.getresponse()
            if res.status < 500:
                return True
        except Exception:
            pass
        time.sleep(0.75)
    return False


def start_api():
    python = find_python()
    DATA_DIR.mkdir(exist_ok=True)
    env = {**os.environ, "PYTHONPATH": str(ROOT)}
    proc = subprocess.Popen(
        [python, "-m", "uvicorn", "apps.api.main:app", "--host", API_HOST, "--port", str(API_PORT)],
        cwd=str(ROOT),
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    _procs.append(proc)
    return proc


def start_web():
    # If static export exists, API serves it — no separate server needed
    static = WEB_DIR / ".next" / "standalone"
    out = WEB_DIR / "out"
    if out.exists() or static.exists():
        return None

    npm = find_npm()
    cmd = [npm, "run", "dev"]
    if WEB_HOST != "127.0.0.1":
        cmd = [npm, "run", "dev", "--", "-H", WEB_HOST]
    proc = subprocess.Popen(
        cmd,
        cwd=str(WEB_DIR),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    _procs.append(proc)
    return proc


def cleanup(*_):
    for p in _procs:
        try:
            p.terminate()
        except Exception:
            pass
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print("╔══════════════════════════════════════╗")
    print("║        NEXUS OS — Starting up        ║")
    print("╚══════════════════════════════════════╝")

    # Start backend
    print("[nexus] Starting API backend…")
    start_api()

    # Start web UI (if not pre-built)
    web_proc = start_web()
    if web_proc:
        print("[nexus] Starting Next.js dev server…")

    # Wait for API
    print("[nexus] Waiting for API…")
    if not wait_for_http(API_URL, timeout=60):
        print("[nexus] WARNING: API did not respond in time")

    # Wait for web UI
    target_url = WEB_URL
    if web_proc:
        print("[nexus] Waiting for web UI…")
        if not wait_for_web(timeout=90):
            print("[nexus] WARNING: Web UI did not respond — falling back to API")
            target_url = f"{API_URL}/"

    print(f"[nexus] Opening window → {target_url}")

    window = webview.create_window(
        "NexusOS — Autonomous Commerce Intelligence",
        url=target_url,
        width=1440,
        height=900,
        min_size=(1180, 760),
        background_color="#07070e",
        text_select=False,
    )

    webview.start(debug=False)
    cleanup()


if __name__ == "__main__":
    main()
