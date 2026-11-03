"""3D spatial grid representation for room temperature and humidity."""

from typing import Tuple, List, Dict, Any, Optional
import numpy as np
import backend.config as cfg


class RoomGrid:
    """Represents a discretized 3D room volume containing temperature (°C)

    and relative humidity (%) fields.
    """

    def __init__(
        self,
        nx: int = cfg.GRID_NX,
        ny: int = cfg.GRID_NY,
        nz: int = cfg.GRID_NZ,
        dims: Tuple[float, float, float] = cfg.ROOM_DIMS,
        initial_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP,
        initial_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY,
    ) -> None:
        """Initialize 3D room voxel grid.

        Parameters
        ----------
        nx, ny, nz : int
            Number of cells along X (length), Y (height), Z (width).
        dims : Tuple[float, float, float]
            Physical room dimensions in meters (Lx, Ly, Lz).
        initial_temp : float
            Initial uniform room temperature (°C).
        initial_humidity : float
            Initial uniform room relative humidity (%).
        """
        self.nx: int = nx
        self.ny: int = ny
        self.nz: int = nz
        self.dims: Tuple[float, float, float] = dims

        # Cell dimensions
        self.dx: float = dims[0] / nx
        self.dy: float = dims[1] / ny
        self.dz: float = dims[2] / nz
        self.cell_volume: float = self.dx * self.dy * self.dz  # m^3

        # Physical constants for air
        self.air_density: float = 1.204  # kg/m^3 at 20°C
        self.air_cp: float = 1005.0       # J / (kg * K)
        self.cell_heat_capacity: float = self.air_density * self.cell_volume * self.air_cp  # Joules / K

        # 3D Fields
        self.temperature: np.ndarray = np.full((nx, ny, nz), initial_temp, dtype=np.float64)
        self.humidity: np.ndarray = np.full((nx, ny, nz), initial_humidity, dtype=np.float64)

    def reset(
        self,
        initial_temp: float = cfg.DEFAULT_INITIAL_ROOM_TEMP,
        initial_humidity: float = cfg.DEFAULT_INITIAL_ROOM_HUMIDITY,
    ) -> None:
        """Reset temperature and humidity fields to uniform initial values."""
        self.temperature.fill(initial_temp)
        self.humidity.fill(initial_humidity)

    def copy(self) -> "RoomGrid":
        """Create an independent deep copy of the grid."""
        clone = RoomGrid(
            nx=self.nx,
            ny=self.ny,
            nz=self.nz,
            dims=self.dims,
        )
        clone.temperature = np.copy(self.temperature)
        clone.humidity = np.copy(self.humidity)
        return clone

    @property
    def mean_temp(self) -> float:
        """Average temperature across all cells."""
        return float(np.mean(self.temperature))

    @property
    def mean_humidity(self) -> float:
        """Average relative humidity across all cells."""
        return float(np.mean(self.humidity))

    @property
    def min_max_temp(self) -> Tuple[float, float]:
        """Min and max temperatures in the room."""
        return float(np.min(self.temperature)), float(np.max(self.temperature))

    def get_cell(self, x: int, y: int, z: int) -> Tuple[float, float]:
        """Get (temp, humidity) at integer cell coordinates."""
        clamped_x = int(np.clip(x, 0, self.nx - 1))
        clamped_y = int(np.clip(y, 0, self.ny - 1))
        clamped_z = int(np.clip(z, 0, self.nz - 1))
        return (
            float(self.temperature[clamped_x, clamped_y, clamped_z]),
            float(self.humidity[clamped_x, clamped_y, clamped_z]),
        )

    def to_flat_temperatures(self) -> List[float]:
        """Convert 3D temperature array to a 1D list of floats rounded for WebSocket transfer."""
        return [round(float(v), 2) for v in self.temperature.ravel()]

    def to_flat_humidity(self) -> List[float]:
        """Convert 3D humidity array to a 1D list of floats rounded for WebSocket transfer."""
        return [round(float(v), 2) for v in self.humidity.ravel()]

