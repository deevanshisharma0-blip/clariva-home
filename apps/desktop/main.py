"""
NexusOS Desktop Launcher
Starts FastAPI backend (which serves the pre-built static frontend),
then opens a native PyWebView window.
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
API_HOST = os.environ.get("NEXUS_HOST", "127.0.0.1")
API_URL  = f"http://127.0.0.1:{API_PORT}"

# Static export — FastAPI serves the frontend
STATIC_OUT = WEB_DIR / "out"

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


def wait_for_api(timeout: int = 90) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=2)
            conn.request("GET", "/api/status")
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
        [python, "-m", "uvicorn", "apps.api.main:app",
         "--host", API_HOST, "--port", str(API_PORT)],
        cwd=str(ROOT),
        env=env,
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

    # Start FastAPI backend (also serves the static frontend from apps/web/out/)
    print("[nexus] Starting API backend…")
    start_api()

    # Wait for API to be ready
    print("[nexus] Waiting for API…")
    if wait_for_api(timeout=90):
        print("[nexus] API ready ✓")
    else:
        print("[nexus] WARNING: API did not respond in time — opening anyway")

    # API serves the static frontend at /  (apps/web/out/)
    target_url = f"{API_URL}/"
    static_ready = STATIC_OUT.exists() and (STATIC_OUT / "index.html").exists()

    if static_ready:
        print(f"[nexus] Serving pre-built frontend from {STATIC_OUT}")
    else:
        print("[nexus] WARNING: No pre-built frontend found — open browser manually at http://localhost:8000")

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
