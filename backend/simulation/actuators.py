"""Physical modeling for Fan and AC actuators with inertial dynamics and spatial coupling."""

from typing import Tuple, Dict, Any
import numpy as np
import backend.config as cfg
from backend.simulation.room import RoomGrid


class FanActuator:
    """Ceiling fan physical model with rotational inertia, mixing diffusion boost,

    swirl vortex field, and power consumption.
    """

    def __init__(
        self,
        position_cell: Tuple[int, int, int] = cfg.FAN_POSITION_CELL,
        max_power_watts: float = cfg.FAN_MAX_POWER_WATTS,
        standby_power_watts: float = cfg.FAN_STANDBY_POWER_WATTS,
        time_constant: float = 2.0,  # Inertia response time in seconds
    ) -> None:
        self.pos_x, self.pos_y, self.pos_z = position_cell
        self.max_power_watts: float = max_power_watts
        self.standby_power_watts: float = standby_power_watts
        self.time_constant: float = time_constant

        self.target_speed: float = 0.0   # [0, 100] %
        self.current_speed: float = 0.0  # [0, 100] % with inertia

        # Angular velocity for visual spin (radians / sec)
        self.angular_velocity: float = 0.0
        self.angle: float = 0.0

        # Cumulative electrical energy (Watt-hours)
        self.energy_watt_hours: float = 0.0

    def set_target(self, speed_percent: float) -> None:
        """Set commanded fan speed (0.0 to 100.0%)."""
        self.target_speed = float(np.clip(speed_percent, 0.0, 100.0))

    def update(self, dt: float) -> None:
        """Advance inertial spin dynamics."""
        alpha = dt / max(self.time_constant, 0.1)
        alpha = min(alpha, 1.0)
        self.current_speed += alpha * (self.target_speed - self.current_speed)
        self.current_speed = float(np.clip(self.current_speed, 0.0, 100.0))

        # Max angular speed: ~15 rad/s (approx 140 RPM)
        self.angular_velocity = (self.current_speed / 100.0) * 15.0
        self.angle = (self.angle + self.angular_velocity * dt) % (2.0 * np.pi)

        # Accumulate energy
        power = self.current_power_watts
        self.energy_watt_hours += (power * (dt / 3600.0))

    @property
    def current_power_watts(self) -> float:
        """Instantaneous power in Watts (cubic aerodynamic fan affinity law + standby)."""
        if self.current_speed < 7.0:
            return self.standby_power_watts
        fraction = (self.current_speed - 7.0) / 93.0
        # Aerodynamic power scales with cube of RPM; motor loss has linear component
        aero_factor = 0.7 * (fraction ** 3) + 0.3 * (fraction ** 2)
        return self.standby_power_watts + (self.max_power_watts - self.standby_power_watts) * aero_factor

    def get_mixing_mask(self, nx: int, ny: int, nz: int) -> np.ndarray:
        """Generate 3D spatial mask of diffusion augmentation below fan."""
        mask = np.ones((nx, ny, nz), dtype=np.float64)
        if self.current_speed < 7.0:
            return mask

        speed_ratio = (self.current_speed - 7.0) / 93.0
        boost_max = 1.0 + (cfg.FAN_DIFFUSION_BOOST - 1.0) * speed_ratio

        # Compute radial distance from fan center (X, Z) for all cells below ceiling (Y <= pos_y)
        for x in range(nx):
            for z in range(nz):
                r_sq = (x - self.pos_x) ** 2 + (z - self.pos_z) ** 2
                # Cylindrical plume of radius 2.5 cells
                if r_sq <= 8.0:
                    radial_attenuation = np.exp(-r_sq / 4.0)
                    for y in range(self.pos_y + 1):
                        vertical_factor = 0.5 + 0.5 * (y / max(self.pos_y, 1))
                        local_boost = 1.0 + (boost_max - 1.0) * radial_attenuation * vertical_factor
                        mask[x, y, z] = local_boost

        return mask

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for telemetry."""
        return {
            "target_speed": round(self.target_speed, 1),
            "current_speed": round(self.current_speed, 1),
            "rpm": round(self.angular_velocity * 60.0 / (2.0 * np.pi), 1),
            "power_watts": round(self.current_power_watts, 1),
            "energy_kwh": round(self.energy_watt_hours / 1000.0, 4),
        }


class ACActuator:
    """Wall-mounted Air Conditioner physical model with directional cold jet,

    dehumidification coil, variable louver angle, and electrical power consumption.
    """

    def __init__(
        self,
        position_cell: Tuple[int, int, int] = cfg.AC_POSITION_CELL,
        max_power_watts: float = cfg.AC_MAX_POWER_WATTS,
        standby_power_watts: float = cfg.AC_STANDBY_POWER_WATTS,
        time_constant: float = 1.5,  # Compressor lag in seconds
    ) -> None:
        self.pos_x, self.pos_y, self.pos_z = position_cell
        self.max_power_watts: float = max_power_watts
        self.standby_power_watts: float = standby_power_watts
        self.time_constant: float = time_constant

        self.target_power: float = 0.0   # [0, 100] %
        self.current_power: float = 0.0  # [0, 100] % with compressor ramp
        self.louver_angle_deg: float = 0.0  # 0 (shut) to 45 (fully open)

        # Cumulative electrical energy (Watt-hours)
        self.energy_watt_hours: float = 0.0

    def set_target(self, power_percent: float) -> None:
        """Set commanded cooling power (0.0 to 100.0%)."""
        self.target_power = float(np.clip(power_percent, 0.0, 100.0))

    def update(self, dt: float) -> None:
        """Advance compressor lag dynamics and update louvers."""
        alpha = dt / max(self.time_constant, 0.1)
        alpha = min(alpha, 1.0)
        self.current_power += alpha * (self.target_power - self.current_power)
        self.current_power = float(np.clip(self.current_power, 0.0, 100.0))

        # Louver opens proportionally: 0 to 45 degrees
        self.louver_angle_deg = (self.current_power / 100.0) * 45.0

        # Accumulate energy
        power = self.current_power_watts
        self.energy_watt_hours += (power * (dt / 3600.0))

    @property
    def current_power_watts(self) -> float:
        """Instantaneous power in Watts."""
        if self.current_power < 7.0:
            return self.standby_power_watts
        fraction = (self.current_power - 7.0) / 93.0
        # Inverter compressor baseline + linear capacity scaling
        return self.standby_power_watts + (self.max_power_watts - self.standby_power_watts) * fraction

    def apply_to_grid(self, grid: RoomGrid, dt: float) -> None:
        """Inject cold directional air jet and remove humidity."""
        # When fuzzy system outputs 'Off' (centroid ~5.4%), compressor is in standby
        if self.current_power < 7.0:
            return

        power_frac = (self.current_power - 7.0) / 93.0

        # 1. Cold Jet: 3D convective plume streaming across +X from outlet
        base_cooling = cfg.AC_MAX_COOLING_RATE * power_frac * dt

        # Plume penetrates forward across X and slightly expands laterally in Y and Z
        for dx_offset in range(min(8, grid.nx - self.pos_x)):
            x_target = self.pos_x + dx_offset
            axial_decay = np.exp(-dx_offset / 3.5)

            for dy in range(-1, 1):
                y_target = self.pos_y + dy
                if 0 <= y_target < grid.ny:
                    for dz in range(-1, 2):
                        z_target = self.pos_z + dz
                        if 0 <= z_target < grid.nz:
                            radial_attenuation = 1.0 / (1.0 + abs(dy) * 0.8 + abs(dz) * 0.6)
                            delta_t = base_cooling * axial_decay * radial_attenuation * 0.85
                            grid.temperature[x_target, y_target, z_target] -= delta_t

        # 2. Dehumidification around intake
        intake_y = min(self.pos_y + 1, grid.ny - 1)
        moisture_drop = cfg.AC_MAX_DEHUMIDIFY_RATE * power_frac * dt
        z_min = max(0, self.pos_z - 1)
        z_max = min(grid.nz, self.pos_z + 2)
        grid.humidity[self.pos_x, intake_y, z_min:z_max] = np.maximum(
            0.0, grid.humidity[self.pos_x, intake_y, z_min:z_max] - moisture_drop * 0.5
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for telemetry."""
        return {
            "target_power": round(self.target_power, 1),
            "current_power": round(self.current_power, 1),
            "louver_angle": round(self.louver_angle_deg, 1),
            "power_watts": round(self.current_power_watts, 1),
            "energy_kwh": round(self.energy_watt_hours / 1000.0, 4),
        }
