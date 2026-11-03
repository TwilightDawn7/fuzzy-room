"""Virtual environmental sensor with noise injection and digital filtering."""

from typing import Tuple, Dict, Any
import numpy as np
import backend.config as cfg
from backend.simulation.room import RoomGrid


class VirtualSensor:
    """Virtual temperature and relative humidity sensor placed near occupant.

    Samples local grid conditions, injects realistic Gaussian instrumentation noise,
    and applies exponential moving average (EMA) low-pass smoothing.
    """

    def __init__(
        self,
        position_cell: Tuple[int, int, int] = cfg.SENSOR_LOCATION_CELL,
        temp_noise_std: float = cfg.SENSOR_TEMP_NOISE_STD,
        humidity_noise_std: float = cfg.SENSOR_HUMIDITY_NOISE_STD,
        ema_alpha: float = cfg.SENSOR_EMA_ALPHA,
        seed: int = 42,
    ) -> None:
        self.pos_x, self.pos_y, self.pos_z = position_cell
        self.temp_noise_std: float = temp_noise_std
        self.humidity_noise_std: float = humidity_noise_std
        self.ema_alpha: float = ema_alpha
        self.rng: np.random.Generator = np.random.default_rng(seed)

        # Filter state
        self.raw_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP
        self.raw_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY
        self.filtered_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP
        self.filtered_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY

    def sample(self, grid: RoomGrid) -> Tuple[float, float]:
        """Sample local grid cell, inject Gaussian noise, and apply filter."""
        raw_t, raw_h = grid.get_cell(self.pos_x, self.pos_y, self.pos_z)
        self.raw_temp = raw_t
        self.raw_humidity = raw_h

        # Inject instrumentation noise
        noise_t = self.rng.normal(0.0, self.temp_noise_std)
        noise_h = self.rng.normal(0.0, self.humidity_noise_std)

        measured_t = raw_t + noise_t
        measured_h = np.clip(raw_h + noise_h, 0.0, 100.0)

        # Exponential Moving Average filter
        self.filtered_temp += self.ema_alpha * (measured_t - self.filtered_temp)
        self.filtered_humidity += self.ema_alpha * (measured_h - self.filtered_humidity)

        return float(self.filtered_temp), float(self.filtered_humidity)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for telemetry."""
        return {
            "position": [self.pos_x, self.pos_y, self.pos_z],
            "raw_temp": round(self.raw_temp, 2),
            "raw_humidity": round(self.raw_humidity, 2),
            "temperature": round(self.filtered_temp, 2),
            "humidity": round(self.filtered_humidity, 2),
        }

