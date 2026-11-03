"""Script to capture a high-resolution screenshot of the 3D scene."""

import os
import subprocess
import time
import sys

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
browser_path = edge_path if os.path.exists(edge_path) else chrome_path

out_png = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "phase_4_digital_twin_scene.png")
url = "http://127.0.0.1:8000/"

print(f"Starting server...")
server_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--port", "8000", "--host", "127.0.0.1"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

time.sleep(3)

try:
    print(f"Capturing screenshot from {url} to {out_png} using {browser_path}...")
    browser_cmd = [
        browser_path,
        "--headless=new",
        f"--screenshot={out_png}",
        "--window-size=1400,900",
        "--virtual-time-budget=6000",
        "--hide-scrollbars",
        url,
    ]
    subprocess.run(browser_cmd, check=True, timeout=25)

    if os.path.exists(out_png):
        size = os.path.getsize(out_png)
        print(f"SUCCESS: Screenshot created! File size: {size} bytes.")
    else:
        print("ERROR: Screenshot file was not created.")
finally:
    print("Terminating server...")
    server_proc.terminate()
    try:
        server_proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        server_proc.kill()

