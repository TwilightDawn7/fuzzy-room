"""Tests for FastAPI REST and WebSocket endpoints."""

import pytest
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_get_config(client):
    """Test /config REST endpoint."""
    response = client.get("/config")
    assert response.status_code == 200
    data = response.json()
    assert "universes" in data
    assert "membership_sets" in data
    assert "rules" in data
    assert "coordination" in data
    assert "room_grid" in data


def test_post_reset(client):
    """Test /reset REST endpoint."""
    response = client.post("/reset", json={"initial_temp": 28.0, "setpoint": 24.0})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_post_fuzzy_evaluate(client):
    """Test /fuzzy/evaluate REST endpoint."""
    payload = {
        "temperature": 30.0,
        "humidity": 65.0,
        "setpoint": 24.0,
        "defuzz_method": "centroid",
    }
    response = client.post("/fuzzy/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "fan_speed" in data
    assert "ac_power" in data
    assert "fan_payload" in data
    assert "ac_payload" in data
    assert "explanation" in data["ac_payload"]
    assert "explanation" in data["fan_payload"]


def test_get_fuzzy_surface(client):
    """Test /fuzzy/surface REST endpoint."""
    response = client.get("/fuzzy/surface")
    assert response.status_code == 200
    data = response.json()
    assert "temperature_axis" in data
    assert "humidity_axis" in data
    assert "fan_surface" in data
    assert "ac_surface" in data
    assert len(data["fan_surface"]) == 25
    assert len(data["fan_surface"][0]) == 25


def test_websocket_stream_and_commands(client):
    """Test WebSocket /ws connection, state streaming, and command routing."""
    with client.websocket_connect("/ws") as websocket:
        # Receive first state frame
        data = websocket.receive_json()
        assert "sim_time" in data
        assert "sensor" in data
        assert "fan" in data
        assert "ac" in data
        assert "fuzzy" in data
        assert "baseline" in data
        assert "room_grid" in data

        # Send a command to change setpoint
        websocket.send_json({"action": "set_setpoint", "setpoint": 22.5})

        # Send a command to switch mode
        websocket.send_json({"action": "set_mode", "mode": "MANUAL"})

        # Send a command to load scenario
        websocket.send_json({"action": "load_scenario", "scenario": "party"})

        # Receive next frame to verify stability
        data_after = websocket.receive_json()
        assert data_after["mode"] == "MANUAL"


def test_static_files_served(client):
    """Test that index.html and all frontend ES module files are served properly."""
    paths = [
        "/",
        "/css/style.css",
        "/js/main.js",
        "/js/socket.js",
        "/js/scene.js",
        "/js/ui/controls.js",
        "/js/ui/membershipCharts.js",
        "/js/ui/rulesTable.js",
        "/js/ui/aggregationPlot.js",
        "/js/ui/timeSeries.js",
        "/js/ui/reasoningPipeline.js",
        "/js/objects/fan.js",
        "/js/objects/ac.js",
        "/js/objects/person.js",
        "/js/objects/room.js",
        "/js/effects/heatmap.js",
        "/js/effects/airflow.js",
        "/js/ui/controlSurface.js",
        "/js/ui/benchmarkModal.js",
        "/js/ui/presentationTour.js",
    ]
    for p in paths:
        res = client.get(p)
        assert res.status_code == 200, f"Static asset {p} returned status {res.status_code}"


