"""Environmental disturbances: ambient heat exchange, window state, solar beam, and occupants."""

from typing import Dict, Any, Tuple
import numpy as np
import backend.config as cfg
from backend.simulation.room import RoomGrid


class DisturbanceManager:
    """Manages environmental boundary conditions and internal heat/moisture sources."""

    def __init__(
        self,
        outside_temp: float = cfg.DEFAULT_OUTSIDE_TEMP,
        outside_humidity: float = cfg.DEFAULT_OUTSIDE_HUMIDITY,
        sun_on: bool = False,
        sun_intensity: float = 1.0,
        num_people: int = 1,
        window_open: bool = False,
    ) -> None:
        self.outside_temp: float = outside_temp
        self.outside_humidity: float = outside_humidity
        self.sun_on: bool = sun_on
        self.sun_intensity: float = sun_intensity
        self.num_people: int = num_people
        self.window_open: bool = window_open

    def update_disturbances(
        self,
        outside_temp: float = None,
        outside_humidity: float = None,
        sun_on: bool = None,
        sun_intensity: float = None,
        num_people: int = None,
        window_open: bool = None,
    ) -> None:
        """Update any disturbance setting dynamically."""
        if outside_temp is not None:
            self.outside_temp = float(outside_temp)
        if outside_humidity is not None:
            self.outside_humidity = float(outside_humidity)
        if sun_on is not None:
            self.sun_on = bool(sun_on)
        if sun_intensity is not None:
            self.sun_intensity = float(np.clip(sun_intensity, 0.0, 1.0))
        if num_people is not None:
            self.num_people = int(np.clip(num_people, 0, 10))
        if window_open is not None:
            self.window_open = bool(window_open)

    def apply_to_grid(self, grid: RoomGrid, dt: float) -> None:
        """Apply window infiltration, solar beam, and occupant loads."""
        # ----------------------------------------------------------------------
        # 1. Window Infiltration (When Window is Open)
        # ----------------------------------------------------------------------
        win_x = cfg.WINDOW_X_INDEX
        y_min, y_max = cfg.WINDOW_Y_RANGE
        z_min, z_max = cfg.WINDOW_Z_RANGE

        if self.window_open:
            # Direct turbulent exchange through open window opening
            win_rate_temp = cfg.WINDOW_OPEN_INFILTRATION * dt
            win_rate_hum = cfg.WINDOW_OPEN_INFILTRATION * dt

            grid.temperature[win_x, y_min:y_max, z_min:z_max] += win_rate_temp * (
                self.outside_temp - grid.temperature[win_x, y_min:y_max, z_min:z_max]
            )
            grid.humidity[win_x, y_min:y_max, z_min:z_max] += win_rate_hum * (
                self.outside_humidity - grid.humidity[win_x, y_min:y_max, z_min:z_max]
            )
            if win_x > 0:
                grid.temperature[win_x - 1, y_min:y_max, z_min:z_max] += (win_rate_temp * 0.4) * (
                    self.outside_temp - grid.temperature[win_x - 1, y_min:y_max, z_min:z_max]
                )
                grid.humidity[win_x - 1, y_min:y_max, z_min:z_max] += (win_rate_hum * 0.4) * (
                    self.outside_humidity - grid.humidity[win_x - 1, y_min:y_max, z_min:z_max]
                )

        # ----------------------------------------------------------------------
        # 2. Solar Radiation Gain (Sunbeam through window onto floor)
        # ----------------------------------------------------------------------
        if self.sun_on and self.sun_intensity > 0.01:
            solar_power = cfg.SOLAR_HEAT_GAIN_MAX * self.sun_intensity * dt
            # Sunbeam illuminates floor patch
            sun_patch_x = slice(4, 9)
            sun_patch_z = slice(3, 7)
            grid.temperature[sun_patch_x, 0, sun_patch_z] += solar_power * 0.7
            grid.temperature[sun_patch_x, 1, sun_patch_z] += solar_power * 0.3

        # ----------------------------------------------------------------------
        # 3. Occupant Sensible Heat and Moisture Exhalation
        # ----------------------------------------------------------------------
        if self.num_people > 0:
            occ_x = slice(5, 8)
            occ_y = slice(1, 3)
            occ_z = slice(4, 7)

            # Realistic thermal emission (~100 W/person)
            temp_gain = (0.015 * self.num_people * dt)
            humidity_gain = (0.035 * self.num_people * dt)

            grid.temperature[occ_x, occ_y, occ_z] += temp_gain
            grid.humidity[occ_x, occ_y, occ_z] = np.clip(
                grid.humidity[occ_x, occ_y, occ_z] + humidity_gain, 0.0, 100.0
            )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for telemetry."""
        return {
            "outside_temp": round(self.outside_temp, 1),
            "outside_humidity": round(self.outside_humidity, 1),
            "sun_on": self.sun_on,
            "sun_intensity": round(self.sun_intensity, 2),
            "num_people": self.num_people,
            "window_open": self.window_open,
        }
