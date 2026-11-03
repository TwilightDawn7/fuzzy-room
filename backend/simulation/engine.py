"""Vectorized 3D room physics simulation engine with concurrent baseline benchmark."""

from typing import Dict, Any, Tuple, Optional
import numpy as np

import backend.config as cfg
from backend.simulation.room import RoomGrid
from backend.simulation.actuators import FanActuator, ACActuator
from backend.simulation.disturbances import DisturbanceManager
from backend.simulation.sensors import VirtualSensor
from backend.simulation.thermostat import BangBangThermostat
from backend.fuzzy.controller import FuzzyRoomCoordinator


class SimulationEngine:
    """Master simulation engine managing spatial 3D physics, actuators, disturbances,

    and parallel fuzzy vs. bang-bang performance tracking.
    """

    def __init__(
        self,
        setpoint_temp: float = cfg.DEFAULT_SETPOINT_TEMP,
        initial_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP,
        initial_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY,
    ) -> None:
        self.setpoint_temp: float = setpoint_temp
        self.sim_time: float = 0.0
        self.sim_speed: float = cfg.DEFAULT_SIM_SPEED
        self.mode: str = "AUTO"  # 'AUTO' (Fuzzy) or 'MANUAL' (User-controlled)

        # Manual actuator overrides
        self.manual_fan_speed: float = 0.0
        self.manual_ac_power: float = 0.0

        # Primary Room (Controlled by Fuzzy FIS or Manual)
        self.room: RoomGrid = RoomGrid(
            initial_temp=initial_temp,
            initial_humidity=initial_humidity,
        )
        self.fan: FanActuator = FanActuator()
        self.ac: ACActuator = ACActuator()
        self.sensor: VirtualSensor = VirtualSensor(seed=42)
        self.disturbances: DisturbanceManager = DisturbanceManager()
        self.fuzzy_coordinator: FuzzyRoomCoordinator = FuzzyRoomCoordinator()

        # Parallel Baseline Room (Controlled by Bang-Bang Thermostat)
        self.baseline_room: RoomGrid = RoomGrid(
            initial_temp=initial_temp,
            initial_humidity=initial_humidity,
        )
        self.thermostat: BangBangThermostat = BangBangThermostat(setpoint=setpoint_temp)

        # Performance Tracking for Primary Controller
        self.total_steps: int = 0
        self.comfort_steps: int = 0
        self.latest_fuzzy_result: Dict[str, Any] = {}

    def set_mode(self, mode: str) -> None:
        """Set control mode: 'AUTO' or 'MANUAL'."""
        m = mode.upper()
        if m in ("AUTO", "MANUAL"):
            self.mode = m

    def set_setpoint(self, temp: float) -> None:
        """Update target comfort temperature."""
        self.setpoint_temp = float(temp)
        self.thermostat.set_setpoint(temp)

    def set_manual_actuators(self, fan_speed: float = None, ac_power: float = None) -> None:
        """Set manual actuator values when in MANUAL mode."""
        if fan_speed is not None:
            self.manual_fan_speed = float(np.clip(fan_speed, 0.0, 100.0))
        if ac_power is not None:
            self.manual_ac_power = float(np.clip(ac_power, 0.0, 100.0))

    def reset(
        self,
        initial_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP,
        initial_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY,
    ) -> None:
        """Reset rooms, actuators, and integrator statistics to initial conditions."""
        self.sim_time = 0.0
        self.total_steps = 0
        self.comfort_steps = 0

        self.room.reset(initial_temp, initial_humidity)
        self.baseline_room.reset(initial_temp, initial_humidity)

        self.fan = FanActuator()
        self.ac = ACActuator()
        self.sensor = VirtualSensor(seed=42)

        self.thermostat = BangBangThermostat(setpoint=self.setpoint_temp)
        self.latest_fuzzy_result = {}

    def _step_physics(
        self,
        grid: RoomGrid,
        fan: FanActuator,
        ac: ACActuator,
        dt: float,
    ) -> None:
        """Vectorized 3D physical integration:

        1. Diffusion with Robin boundary conditions at all walls.
        2. Forced convective advection (AC jet and ceiling fan vortex).
        3. Buoyant natural draft.
        4. Actuator thermal/moisture injection.
        5. Environmental disturbances.
        """
        nx, ny, nz = grid.nx, grid.ny, grid.nz
        dx_sq = grid.dx ** 2
        dy_sq = grid.dy ** 2
        dz_sq = grid.dz ** 2

        t = grid.temperature
        h = grid.humidity

        # ----------------------------------------------------------------------
        # 1. 3D Diffusion with Coupled Boundary Conduction (Robin BC)
        # ----------------------------------------------------------------------
        lap_t = np.zeros_like(t)
        lap_h = np.zeros_like(h)

        # Interior 3D Laplacian (7-point stencil)
        lap_t[1:-1, 1:-1, 1:-1] = (
            (t[2:, 1:-1, 1:-1] - 2 * t[1:-1, 1:-1, 1:-1] + t[:-2, 1:-1, 1:-1]) / dx_sq
            + (t[1:-1, 2:, 1:-1] - 2 * t[1:-1, 1:-1, 1:-1] + t[1:-1, :-2, 1:-1]) / dy_sq
            + (t[1:-1, 1:-1, 2:] - 2 * t[1:-1, 1:-1, 1:-1] + t[1:-1, 1:-1, :-2]) / dz_sq
        )
        lap_h[1:-1, 1:-1, 1:-1] = (
            (h[2:, 1:-1, 1:-1] - 2 * h[1:-1, 1:-1, 1:-1] + h[:-2, 1:-1, 1:-1]) / dx_sq
            + (h[1:-1, 2:, 1:-1] - 2 * h[1:-1, 1:-1, 1:-1] + h[1:-1, :-2, 1:-1]) / dy_sq
            + (h[1:-1, 1:-1, 2:] - 2 * h[1:-1, 1:-1, 1:-1] + h[1:-1, 1:-1, :-2]) / dz_sq
        )

        # Wall Robin boundary coupling with ambient outside temperature
        h_wall = cfg.WALL_INSULATION_CONDUCTANCE * 6.0
        out_t = self.disturbances.outside_temp
        out_h = self.disturbances.outside_humidity

        # X walls
        lap_t[0, :, :] += (t[1, :, :] - t[0, :, :]) / dx_sq + h_wall * (out_t - t[0, :, :])
        lap_t[-1, :, :] += (t[-2, :, :] - t[-1, :, :]) / dx_sq + h_wall * (out_t - t[-1, :, :])
        lap_h[0, :, :] += (h[1, :, :] - h[0, :, :]) / dx_sq
        lap_h[-1, :, :] += (h[-2, :, :] - h[-1, :, :]) / dx_sq

        # Y: Floor (insulated Neumann) and Ceiling (Robin)
        lap_t[:, 0, :] += (t[:, 1, :] - t[:, 0, :]) / dy_sq
        lap_t[:, -1, :] += (t[:, -2, :] - t[:, -1, :]) / dy_sq + h_wall * 1.2 * (out_t - t[:, -1, :])
        lap_h[:, 0, :] += (h[:, 1, :] - h[:, 0, :]) / dy_sq
        lap_h[:, -1, :] += (h[:, -2, :] - h[:, -1, :]) / dy_sq

        # Z side walls
        lap_t[:, :, 0] += (t[:, :, 1] - t[:, :, 0]) / dz_sq + h_wall * (out_t - t[:, :, 0])
        lap_t[:, :, -1] += (t[:, :, -2] - t[:, :, -1]) / dz_sq + h_wall * (out_t - t[:, :, -1])
        lap_h[:, :, 0] += (h[:, :, 1] - h[:, :, 0]) / dz_sq
        lap_h[:, :, -1] += (h[:, :, -2] - h[:, :, -1]) / dz_sq

        # Effective diffusion coefficient boosted by fan mixing
        d_eff_temp = cfg.AIR_THERMAL_DIFFUSIVITY * (1.0 + (fan.current_speed / 100.0) * cfg.FAN_DIFFUSION_BOOST)
        d_eff_hum = cfg.AIR_MOISTURE_DIFFUSIVITY * (1.0 + (fan.current_speed / 100.0) * cfg.FAN_DIFFUSION_BOOST)

        t += d_eff_temp * lap_t * dt
        h += d_eff_hum * lap_h * dt

        # ----------------------------------------------------------------------
        # 2. Convective Advection (Upwind Scheme)
        # ----------------------------------------------------------------------
        # A. AC Jet: streams forward in +X along upper layer (y in [3, 4], z in [3, 6])
        if ac.current_power > 1.0:
            u_ac = (ac.current_power / 100.0) * 1.8
            cfl_x = min(u_ac * dt / grid.dx, 0.45)
            # Upwind transport along +X
            t[2:9, 3:5, 3:7] -= cfl_x * (t[2:9, 3:5, 3:7] - t[1:8, 3:5, 3:7])
            h[2:9, 3:5, 3:7] -= cfl_x * (h[2:9, 3:5, 3:7] - h[1:8, 3:5, 3:7])

        # B. Ceiling Fan: pushes air down in -Y column beneath fan blades
        if fan.current_speed > 1.0:
            v_fan = (fan.current_speed / 100.0) * 1.6
            cfl_y = min(v_fan * dt / grid.dy, 0.45)
            # Upwind transport downward from y+1 to y
            t[4:8, 0:5, 3:7] -= cfl_y * (t[4:8, 0:5, 3:7] - t[4:8, 1:6, 3:7])
            h[4:8, 0:5, 3:7] -= cfl_y * (h[4:8, 0:5, 3:7] - h[4:8, 1:6, 3:7])

        # ----------------------------------------------------------------------
        # 3. Apply AC Cooling & Dehumidification
        # ----------------------------------------------------------------------
        ac.apply_to_grid(grid, dt)

        # ----------------------------------------------------------------------
        # 4. Apply Disturbances (Window, Sun, Occupants)
        # ----------------------------------------------------------------------
        self.disturbances.apply_to_grid(grid, dt)

        # Numerical bounds safety clamping
        np.clip(t, -10.0, 60.0, out=t)
        np.clip(h, 0.0, 100.0, out=h)

    def step(self, raw_dt: float = cfg.SIM_DT) -> Dict[str, Any]:
        """Execute one complete multi-physics simulation step.

        Parameters
        ----------
        raw_dt : float
            Simulation time increment (scaled by sim_speed).

        Returns
        -------
        Dict[str, Any]
            Full telemetry payload including sensors, actuators, room summary,
            fuzzy explanations, and baseline comparisons.
        """
        dt = raw_dt * self.sim_speed
        self.sim_time += dt
        self.total_steps += 1

        # ----------------------------------------------------------------------
        # A. SENSE PRIMARY ROOM
        # ----------------------------------------------------------------------
        sensor_temp, sensor_hum = self.sensor.sample(self.room)

        # Comfort metric check
        if abs(sensor_temp - self.setpoint_temp) <= cfg.COMFORT_TOLERANCE_TEMP:
            self.comfort_steps += 1

        # ----------------------------------------------------------------------
        # B. CONTROL PRIMARY ROOM
        # ----------------------------------------------------------------------
        if self.mode == "AUTO":
            # Mamdani Fuzzy System + Device Coordination
            self.latest_fuzzy_result = self.fuzzy_coordinator.evaluate(
                temperature=sensor_temp,
                humidity=sensor_hum,
                setpoint_temp=self.setpoint_temp,
            )
            target_fan = self.latest_fuzzy_result["fan_speed"]
            target_ac = self.latest_fuzzy_result["ac_power"]
        else:
            # Manual mode
            target_fan = self.manual_fan_speed
            target_ac = self.manual_ac_power
            # Evaluate fuzzy passively for diagnostic visibility
            self.latest_fuzzy_result = self.fuzzy_coordinator.evaluate(
                temperature=sensor_temp,
                humidity=sensor_hum,
                setpoint_temp=self.setpoint_temp,
            )

        self.fan.set_target(target_fan)
        self.ac.set_target(target_ac)

        # Advance actuator dynamics
        self.fan.update(dt)
        self.ac.update(dt)

        # ----------------------------------------------------------------------
        # C. ADVANCE PRIMARY ROOM PHYSICS
        # ----------------------------------------------------------------------
        self._step_physics(self.room, self.fan, self.ac, dt)

        # ----------------------------------------------------------------------
        # D. ADVANCE PARALLEL BASELINE (BANG-BANG) ROOM
        # ----------------------------------------------------------------------
        self.thermostat.step(self.baseline_room, dt)
        self._step_physics(self.baseline_room, self.thermostat.fan, self.thermostat.ac, dt)

        return self.get_state_payload()

    @property
    def comfort_percentage(self) -> float:
        """Percentage of time primary room was within ±1.0°C of setpoint."""
        if self.total_steps == 0:
            return 100.0
        return float((self.comfort_steps / self.total_steps) * 100.0)

    @property
    def total_energy_kwh(self) -> float:
        """Cumulative electrical energy of primary room devices in kWh."""
        return (self.fan.energy_watt_hours + self.ac.energy_watt_hours) / 1000.0

    def get_state_payload(self) -> Dict[str, Any]:
        """Compile comprehensive state dictionary for WebSockets and diagnostics."""
        min_t, max_t = self.room.min_max_temp

        payload: Dict[str, Any] = {
            "sim_time": round(self.sim_time, 1),
            "sim_speed": round(self.sim_speed, 1),
            "mode": self.mode,
            "setpoint": round(self.setpoint_temp, 1),
            # Sensor
            "sensor": self.sensor.to_dict(),
            # Primary Actuators
            "fan": self.fan.to_dict(),
            "ac": self.ac.to_dict(),
            "total_power_watts": round(self.fan.current_power_watts + self.ac.current_power_watts, 1),
            "energy_kwh": round(self.total_energy_kwh, 4),
            "comfort_percentage": round(self.comfort_percentage, 1),
            # Environment / Disturbances
            "disturbances": self.disturbances.to_dict(),
            # Room Aggregate Metrics
            "room_summary": {
                "mean_temp": round(self.room.mean_temp, 2),
                "mean_humidity": round(self.room.mean_humidity, 2),
                "min_temp": round(min_t, 2),
                "max_temp": round(max_t, 2),
            },
            # Fuzzy Explanation Payloads
            "fuzzy": self.latest_fuzzy_result,
            # Baseline Thermostat Comparison
            "baseline": self.thermostat.to_dict(),
        }

        return payload
