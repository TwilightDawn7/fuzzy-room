"""FastAPI backend server for fuzzy-room digital twin.

Provides:
- 10 Hz WebSocket streaming endpoint (/ws) for simulation state and fuzzy explanation payloads
- REST endpoints: /config, /reset, /fuzzy/evaluate, /fuzzy/surface
- Static file serving for the frontend dashboard
"""

import asyncio
import os
import json
from contextlib import asynccontextmanager
from typing import Dict, Any, Set, List, Optional
import numpy as np

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import backend.config as cfg
from backend.simulation.engine import SimulationEngine
from backend.fuzzy.controller import FuzzyRoomCoordinator


# ==============================================================================
# Simulation State & Connection Manager
# ==============================================================================

sim_engine = SimulationEngine()
sim_task: Optional[asyncio.Task] = None
active_connections: Set[WebSocket] = set()

# Precomputed Control Surface Cache
cached_surface_data: Optional[Dict[str, Any]] = None


async def broadcast_state(payload: Dict[str, Any]) -> None:
    """Broadcast JSON payload to all connected WebSocket clients."""
    if not active_connections:
        return
    message = json.dumps(payload)
    disconnected = set()
    for ws in active_connections:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        active_connections.discard(ws)


async def simulation_loop() -> None:
    """10 Hz background task advancing room physics and broadcasting state."""
    print("Simulation broadcast loop started at 10 Hz.")
    try:
        while True:
            # Advance simulation step (dt = 0.1s)
            payload = sim_engine.step(cfg.SIM_DT)

            # Include 3D temperature voxels for volumetric rendering (downsampled for efficiency)
            # Shape is 12x6x10 = 720 floats
            payload["room_grid"] = {
                "shape": [cfg.GRID_NX, cfg.GRID_NY, cfg.GRID_NZ],
                "temperature": sim_engine.room.to_flat_temperatures(),
                "humidity": sim_engine.room.to_flat_humidity(),
            }

            await broadcast_state(payload)
            await asyncio.sleep(0.1)  # 10 Hz broadcast
    except asyncio.CancelledError:
        print("Simulation broadcast loop cancelled.")
    except Exception as e:
        print(f"Error in simulation loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and background simulation task."""
    global sim_task
    sim_task = asyncio.create_task(simulation_loop())
    yield
    if sim_task:
        sim_task.cancel()
        try:
            await sim_task
        except asyncio.CancelledError:
            pass


# ==============================================================================
# FastAPI Application Initialization
# ==============================================================================

app = FastAPI(
    title="Fuzzy-Room: 3D Digital Twin",
    description="3D room simulator controlled by a Mamdani fuzzy inference system implemented from scratch in NumPy.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Pydantic Schemas for REST API
# ==============================================================================

class EvaluateRequest(BaseModel):
    temperature: float = Field(28.5, description="Room temperature (°C)")
    humidity: float = Field(60.0, description="Relative humidity (%)")
    setpoint: float = Field(24.0, description="Target temperature setpoint (°C)")
    defuzz_method: str = Field("centroid", description="Defuzzification method ('centroid', 'bisector', 'mom')")


class ResetRequest(BaseModel):
    initial_temp: Optional[float] = cfg.DEFAULT_INITIAL_ROOM_TEMP
    initial_humidity: Optional[float] = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY
    setpoint: Optional[float] = cfg.DEFAULT_SETPOINT_TEMP


# ==============================================================================
# REST Endpoints
# ==============================================================================

@app.get("/config")
@app.get("/api/config")
async def get_config() -> Dict[str, Any]:
    """Return all tunable system configurations, universes, and rules."""
    return {
        "universes": {
            "temperature": cfg.TEMP_UNIVERSE,
            "humidity": cfg.HUMIDITY_UNIVERSE,
            "temp_error": cfg.TEMP_ERROR_UNIVERSE,
            "fan_speed": cfg.FAN_SPEED_UNIVERSE,
            "ac_power": cfg.AC_POWER_UNIVERSE,
        },
        "membership_sets": {
            "fan_temp": cfg.FAN_TEMP_SETS,
            "humidity": cfg.HUMIDITY_SETS,
            "fan_speed": cfg.FAN_SPEED_SETS,
            "ac_temp_error": cfg.AC_TEMP_ERROR_SETS,
            "ac_power": cfg.AC_POWER_SETS,
        },
        "rules": {
            "fan": cfg.FAN_RULES,
            "ac": cfg.AC_RULES,
        },
        "coordination": {
            "enabled": cfg.COORDINATION_ENABLED,
            "ac_threshold": cfg.AC_POWER_COORDINATION_THRESHOLD,
            "fan_cap": cfg.FAN_SPEED_CAP,
        },
        "room_grid": {
            "nx": cfg.GRID_NX,
            "ny": cfg.GRID_NY,
            "nz": cfg.GRID_NZ,
            "dimensions_m": cfg.ROOM_DIMS,
        },
        "actuator_ratings": {
            "ac_max_watts": cfg.AC_MAX_POWER_WATTS,
            "fan_max_watts": cfg.FAN_MAX_POWER_WATTS,
        },
    }


@app.post("/reset")
@app.post("/api/reset")
async def reset_simulation(req: ResetRequest = ResetRequest()) -> Dict[str, str]:
    """Reset room state, actuators, and baseline integrator statistics."""
    if req.setpoint is not None:
        sim_engine.set_setpoint(req.setpoint)
    sim_engine.reset(
        initial_temp=req.initial_temp,
        initial_humidity=req.initial_humidity,
    )
    return {"status": "ok", "message": "Simulation reset successfully"}


@app.post("/fuzzy/evaluate")
@app.post("/api/fuzzy/evaluate")
async def evaluate_fuzzy(req: EvaluateRequest) -> Dict[str, Any]:
    """Evaluate crisp inputs against the Mamdani coordinator and return explanation payloads."""
    coordinator = FuzzyRoomCoordinator()
    result = coordinator.evaluate(
        temperature=req.temperature,
        humidity=req.humidity,
        setpoint_temp=req.setpoint,
        defuzz_method=req.defuzz_method,
    )
    return result


@app.get("/fuzzy/surface")
@app.get("/api/fuzzy/surface")
async def get_fuzzy_surface() -> Dict[str, Any]:
    """Compute and cache 3D control surface grids for Fan speed and AC power."""
    global cached_surface_data
    if cached_surface_data is not None:
        return cached_surface_data

    # Generate 25x25 resolution grid
    t_vals = np.linspace(16.0, 40.0, 25)
    h_vals = np.linspace(15.0, 95.0, 25)

    coordinator = FuzzyRoomCoordinator()
    setpoint = cfg.DEFAULT_SETPOINT_TEMP

    fan_grid = []
    ac_grid = []

    for t in t_vals:
        fan_row = []
        ac_row = []
        for h in h_vals:
            res = coordinator.evaluate(t, h, setpoint_temp=setpoint)
            fan_row.append(res["fan_speed"])
            ac_row.append(res["ac_power"])
        fan_grid.append(fan_row)
        ac_grid.append(ac_row)

    cached_surface_data = {
        "setpoint": setpoint,
        "temperature_axis": [round(float(v), 2) for v in t_vals],
        "humidity_axis": [round(float(v), 2) for v in h_vals],
        "fan_surface": fan_grid,
        "ac_surface": ac_grid,
    }
    return cached_surface_data


# ==============================================================================
# WebSocket Endpoint
# ==============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Bidirectional WebSocket connection: streams state at 10 Hz; handles user commands."""
    await websocket.accept()
    active_connections.add(websocket)
    print(f"WebSocket client connected. Total clients: {len(active_connections)}")

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                cmd = json.loads(data_text)
                action = cmd.get("action", "")

                if action == "set_mode":
                    sim_engine.set_mode(cmd.get("mode", "AUTO"))

                elif action == "set_setpoint":
                    sim_engine.set_setpoint(float(cmd.get("setpoint", 24.0)))

                elif action == "set_manual":
                    sim_engine.set_manual_actuators(
                        fan_speed=cmd.get("fan_speed"),
                        ac_power=cmd.get("ac_power"),
                    )

                elif action == "set_disturbances":
                    sim_engine.disturbances.update_disturbances(
                        outside_temp=cmd.get("outside_temp"),
                        outside_humidity=cmd.get("outside_humidity"),
                        sun_on=cmd.get("sun_on"),
                        sun_intensity=cmd.get("sun_intensity"),
                        num_people=cmd.get("num_people"),
                        window_open=cmd.get("window_open"),
                    )

                elif action == "set_sim_speed":
                    sim_engine.sim_speed = float(np.clip(cmd.get("speed", 1.0), 0.5, 20.0))

                elif action == "load_scenario":
                    scenario = cmd.get("scenario", "").lower()
                    if scenario == "hot_afternoon":
                        sim_engine.set_setpoint(24.0)
                        sim_engine.disturbances.update_disturbances(
                            outside_temp=40.0,
                            outside_humidity=45.0,
                            sun_on=True,
                            sun_intensity=1.0,
                            num_people=1,
                            window_open=False,
                        )
                    elif scenario == "party":
                        sim_engine.set_setpoint(22.0)
                        sim_engine.disturbances.update_disturbances(
                            outside_temp=30.0,
                            outside_humidity=60.0,
                            sun_on=False,
                            num_people=8,
                            window_open=False,
                        )
                    elif scenario == "window_opened":
                        sim_engine.set_setpoint(24.0)
                        sim_engine.disturbances.update_disturbances(
                            outside_temp=38.0,
                            outside_humidity=75.0,
                            sun_on=True,
                            sun_intensity=0.8,
                            num_people=1,
                            window_open=True,
                        )
                    elif scenario == "night_cool_down":
                        sim_engine.set_setpoint(22.0)
                        sim_engine.disturbances.update_disturbances(
                            outside_temp=18.0,
                            outside_humidity=50.0,
                            sun_on=False,
                            sun_intensity=0.0,
                            num_people=1,
                            window_open=True,
                        )

                elif action == "reset":
                    sim_engine.reset(
                        initial_temp=cmd.get("initial_temp", cfg.DEFAULT_INITIAL_ROOM_TEMP),
                        initial_humidity=cmd.get("initial_humidity", cfg.DEFAULT_INITIAL_ROOM_HUMIDITY),
                    )

            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"Error handling WebSocket message: {e}")

    except WebSocketDisconnect:
        active_connections.discard(websocket)
        print(f"WebSocket client disconnected. Remaining clients: {len(active_connections)}")
    except Exception as e:
        active_connections.discard(websocket)
        print(f"WebSocket connection error: {e}")


# ==============================================================================
# Static File Mount (Frontend)
# ==============================================================================

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

