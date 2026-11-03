"""Bang-bang thermostat baseline controller running on a parallel room clone."""

from typing import Dict, Any, Tuple
import backend.config as cfg
from backend.simulation.room import RoomGrid
from backend.simulation.actuators import FanActuator, ACActuator
from backend.simulation.sensors import VirtualSensor


class BangBangThermostat:
    """Conventional bang-bang (on-off) thermostat with hysteresis band.

    Used as an empirical baseline to compare thermal comfort and energy efficiency
    against the Mamdani fuzzy logic controller.
    """

    def __init__(
        self,
        setpoint: float = cfg.DEFAULT_SETPOINT_TEMP,
        hysteresis: float = cfg.BANG_BANG_HYSTERESIS,
        comfort_tolerance: float = cfg.COMFORT_TOLERANCE_TEMP,
    ) -> None:
        self.setpoint: float = setpoint
        self.hysteresis: float = hysteresis
        self.comfort_tolerance: float = comfort_tolerance

        # Dedicated actuator & sensor instances for the baseline room
        self.fan: FanActuator = FanActuator()
        self.ac: ACActuator = ACActuator()
        self.sensor: VirtualSensor = VirtualSensor(seed=1337)

        self.ac_state_on: bool = False
        self.switch_count: int = 0

        # Performance Metrics
        self.total_steps: int = 0
        self.comfort_steps: int = 0

    def set_setpoint(self, setpoint: float) -> None:
        """Update target temperature setpoint."""
        self.setpoint = float(setpoint)

    def step(self, grid: RoomGrid, dt: float) -> Tuple[float, float]:
        """Execute one control step on the baseline room grid.

        Returns
        -------
        Tuple[float, float]
            (commanded_fan_speed, commanded_ac_power)
        """
        temp, hum = self.sensor.sample(grid)
        self.total_steps += 1

        # Check comfort criteria
        if abs(temp - self.setpoint) <= self.comfort_tolerance:
            self.comfort_steps += 1

        # Hysteresis switching logic
        upper_threshold = self.setpoint + self.hysteresis
        lower_threshold = self.setpoint - self.hysteresis

        prev_state = self.ac_state_on
        if temp > upper_threshold:
            self.ac_state_on = True
        elif temp < lower_threshold:
            self.ac_state_on = False

        if self.ac_state_on != prev_state:
            self.switch_count += 1

        # Commanded actuator values
        target_ac = 100.0 if self.ac_state_on else 0.0
        target_fan = 80.0 if self.ac_state_on else 0.0

        self.ac.set_target(target_ac)
        self.fan.set_target(target_fan)

        # Advance actuator physics
        self.ac.update(dt)
        self.fan.update(dt)

        # Apply to baseline room grid
        self.ac.apply_to_grid(grid, dt)

        return target_fan, target_ac

    @property
    def comfort_percentage(self) -> float:
        """Percentage of time room remained within comfort bounds."""
        if self.total_steps == 0:
            return 100.0
        return float((self.comfort_steps / self.total_steps) * 100.0)

    @property
    def total_energy_kwh(self) -> float:
        """Cumulative electrical energy in kWh."""
        return (self.fan.energy_watt_hours + self.ac.energy_watt_hours) / 1000.0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize baseline performance for comparison telemetry."""
        return {
            "ac_state_on": self.ac_state_on,
            "switch_count": self.switch_count,
            "sensor_temp": round(self.sensor.filtered_temp, 2),
            "sensor_humidity": round(self.sensor.filtered_humidity, 2),
            "fan_speed": round(self.fan.current_speed, 1),
            "ac_power": round(self.ac.current_power, 1),
            "power_watts": round(self.fan.current_power_watts + self.ac.current_power_watts, 1),
            "energy_kwh": round(self.total_energy_kwh, 4),
            "comfort_percentage": round(self.comfort_percentage, 1),
        }

