"""Capture Benchmark modal screenshot."""

import os
import subprocess
import time
import sys

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
browser_path = edge_path if os.path.exists(edge_path) else chrome_path

artifact_dir = r"C:\Users\Manish\.gemini\antigravity\brain\9ba502a0-cd89-41ed-8f11-f8effec85a98"
out_png = os.path.join(artifact_dir, "phase_6_benchmark_modal.png")
url = "http://127.0.0.1:8000/#benchmark"

print("Starting server...")
server_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--port", "8000", "--host", "127.0.0.1"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

time.sleep(3)

try:
    print(f"Capturing from {url} to {out_png}...")
    browser_cmd = [
        browser_path,
        "--headless=new",
        f"--screenshot={out_png}",
        "--window-size=1400,900",
        "--virtual-time-budget=6000",
        "--hide-scrollbars",
        url,
    ]
    subprocess.run(browser_cmd, check=True, timeout=30)
    if os.path.exists(out_png):
        print(f"SUCCESS: {os.path.basename(out_png)} ({os.path.getsize(out_png)} bytes)")
    else:
        print(f"FAILED: {out_png}")
finally:
    print("Terminating server...")
    server_proc.terminate()
    try:
        server_proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        server_proc.kill()
