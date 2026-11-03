"""Global configuration for fuzzy-room.

Central repository for all tunable parameters across:
- Fuzzy logic membership functions, universes, and rule bases
- Physical simulation properties, room geometry, and solver settings
- Actuator limits, coordination rules, and sensor noise characteristics
- Server settings and defaults
"""

from typing import Dict, List, Tuple, Any

# ==============================================================================
# 1. FUZZY LOGIC SYSTEM CONSTANTS
# ==============================================================================

# Universe Discretization
DISCRETIZATION_POINTS: int = 501
EPSILON: float = 1e-9  # For numerical stability

# Universe Limits (min, max)
TEMP_UNIVERSE: Tuple[float, float] = (0.0, 50.0)             # Celsius
HUMIDITY_UNIVERSE: Tuple[float, float] = (0.0, 100.0)         # Relative Humidity %
TEMP_ERROR_UNIVERSE: Tuple[float, float] = (-10.0, 15.0)     # (T - T_setpoint) Celsius
FAN_SPEED_UNIVERSE: Tuple[float, float] = (0.0, 100.0)       # %
AC_POWER_UNIVERSE: Tuple[float, float] = (0.0, 100.0)        # %

# Default setpoint
DEFAULT_SETPOINT_TEMP: float = 24.0  # Celsius

# Fan FIS Membership Definitions
# Format: { "SetName": ("type", (params...)) }
#   tri: (a, b, c) where a=left, b=peak, c=right
#   trap: (a, b, c, d) where a=left, b=left-peak, c=right-peak, d=right
FAN_TEMP_SETS: Dict[str, Tuple[str, Tuple[float, ...]]] = {
    "Cold": ("trap", (0.0, 0.0, 10.0, 18.0)),
    "Cool": ("tri", (12.0, 19.0, 26.0)),
    "Warm": ("tri", (22.0, 28.0, 34.0)),
    "Hot":  ("trap", (30.0, 36.0, 50.0, 50.0)),
}

# Shared Humidity Sets (0 - 100%)
HUMIDITY_SETS: Dict[str, Tuple[str, Tuple[float, ...]]] = {
    "Dry":         ("trap", (0.0, 0.0, 25.0, 45.0)),
    "Comfortable": ("tri", (30.0, 50.0, 70.0)),
    "Humid":       ("trap", (55.0, 75.0, 100.0, 100.0)),
}

FAN_SPEED_SETS: Dict[str, Tuple[str, Tuple[float, ...]]] = {
    "Off":    ("trap", (0.0, 0.0, 5.0, 15.0)),
    "Slow":   ("tri", (10.0, 30.0, 50.0)),
    "Medium": ("tri", (40.0, 60.0, 80.0)),
    "Fast":   ("trap", (70.0, 85.0, 100.0, 100.0)),
}

# AC FIS Membership Definitions
AC_TEMP_ERROR_SETS: Dict[str, Tuple[str, Tuple[float, ...]]] = {
    "Below":    ("trap", (-10.0, -10.0, -3.0, 0.0)),
    "OnTarget": ("tri", (-2.0, 0.0, 2.0)),
    "Above":    ("tri", (1.0, 4.0, 8.0)),
    "WayAbove": ("trap", (6.0, 10.0, 15.0, 15.0)),
}

AC_POWER_SETS: Dict[str, Tuple[str, Tuple[float, ...]]] = {
    "Off":    ("trap", (0.0, 0.0, 5.0, 15.0)),
    "Low":    ("tri", (10.0, 30.0, 50.0)),
    "Medium": ("tri", (40.0, 60.0, 80.0)),
    "High":   ("trap", (70.0, 85.0, 100.0, 100.0)),
}

# Rule Matrices
# Fan FIS Rules: (Temperature, Humidity) -> Fan Speed
FAN_RULES: List[Tuple[str, str, str]] = [
    # Cold
    ("Cold", "Dry", "Off"),
    ("Cold", "Comfortable", "Off"),
    ("Cold", "Humid", "Slow"),
    # Cool
    ("Cool", "Dry", "Off"),
    ("Cool", "Comfortable", "Slow"),
    ("Cool", "Humid", "Slow"),
    # Warm
    ("Warm", "Dry", "Slow"),
    ("Warm", "Comfortable", "Medium"),
    ("Warm", "Humid", "Medium"),
    # Hot
    ("Hot", "Dry", "Medium"),
    ("Hot", "Comfortable", "Fast"),
    ("Hot", "Humid", "Fast"),
]

# AC FIS Rules: (Temperature Error, Humidity) -> Cooling Power
AC_RULES: List[Tuple[str, str, str]] = [
    # Below
    ("Below", "Dry", "Off"),
    ("Below", "Comfortable", "Off"),
    ("Below", "Humid", "Off"),
    # OnTarget
    ("OnTarget", "Dry", "Off"),
    ("OnTarget", "Comfortable", "Low"),
    ("OnTarget", "Humid", "Low"),
    # Above
    ("Above", "Dry", "Low"),
    ("Above", "Comfortable", "Medium"),
    ("Above", "Humid", "High"),
    # WayAbove
    ("WayAbove", "Dry", "Medium"),
    ("WayAbove", "Comfortable", "High"),
    ("WayAbove", "Humid", "High"),
]

# Device Coordination Rule
# If AC power > 60%, cap the fan output at 60% (Medium) so the two devices cooperate.
COORDINATION_ENABLED: bool = True
AC_POWER_COORDINATION_THRESHOLD: float = 60.0  # %
FAN_SPEED_CAP: float = 60.0                   # %

# Safe default outputs when rule aggregation yields zero area
SAFE_DEFAULT_FAN_SPEED: float = 0.0
SAFE_DEFAULT_AC_POWER: float = 0.0

# ==============================================================================
# 2. ROOM SIMULATION & PHYSICAL CONSTANTS
# ==============================================================================

# 3D Grid Dimensions (cells)
GRID_NX: int = 12  # Length along X axis (e.g., 6.0 m)
GRID_NY: int = 6   # Height along Y axis (e.g., 3.0 m)
GRID_NZ: int = 10  # Width along Z axis (e.g., 5.0 m)

ROOM_DIMS: Tuple[float, float, float] = (6.0, 3.0, 5.0)  # meters (X, Y, Z)

# Simulation time stepping
SIM_DT: float = 0.1             # Seconds per simulation step
DEFAULT_SIM_SPEED: float = 2.0  # Multiplier (1x to 20x)
STATE_STREAM_HZ: float = 10.0   # Broadcast frequency

# Thermal & Diffusion properties
AIR_THERMAL_DIFFUSIVITY: float = 0.045      # Effective thermal diffusion coefficient
AIR_MOISTURE_DIFFUSIVITY: float = 0.040     # Effective vapor diffusion coefficient
FAN_DIFFUSION_BOOST: float = 3.5            # Multiplier for diffusion near active fan
FAN_SWIRL_STRENGTH: float = 0.4             # Angular swirl velocity intensity
BUOYANCY_FACTOR: float = 0.015              # Vertical draft per degree difference

# Boundary Conductance & Losses
WALL_INSULATION_CONDUCTANCE: float = 0.0012  # Heat loss rate through walls
WINDOW_CLOSED_CONDUCTANCE: float = 0.0040    # Window heat transfer rate (closed)
WINDOW_OPEN_INFILTRATION: float = 0.150      # Exchange rate with outside when open

# Disturbances & Sources
HEAT_PER_PERSON_WATTS: float = 100.0         # Sensible thermal wattage
MOISTURE_PER_PERSON_G_HR: float = 50.0       # Grams of moisture / hr
SOLAR_HEAT_GAIN_MAX: float = 0.15            # Direct heating per step in sunbeam patch

# Baseline Environment
DEFAULT_OUTSIDE_TEMP: float = 32.0          # Celsius
DEFAULT_OUTSIDE_HUMIDITY: float = 65.0      # %
DEFAULT_INITIAL_ROOM_TEMP: float = 28.0     # Celsius
DEFAULT_INITIAL_ROOM_HUMIDITY: float = 60.0 # %

# Sensor Specification
SENSOR_LOCATION_CELL: Tuple[int, int, int] = (6, 2, 5)  # Occupant vicinity (X, Y, Z)
SENSOR_TEMP_NOISE_STD: float = 0.12                     # Celsius Gaussian noise
SENSOR_HUMIDITY_NOISE_STD: float = 0.40                 # % Gaussian noise
SENSOR_EMA_ALPHA: float = 0.25                          # Exponential smoothing factor

# Actuator Physical Specifications
AC_MAX_COOLING_RATE: float = 3.6            # Temp drop per second in jet stream at 100%
AC_MAX_DEHUMIDIFY_RATE: float = 2.0         # Moisture reduction per second at 100%
AC_POSITION_CELL: Tuple[int, int, int] = (1, 4, 5)   # Mounted on X=0 wall
FAN_POSITION_CELL: Tuple[int, int, int] = (6, 5, 5)  # Ceiling center (Y=top)

# Actuator Power Ratings (Watts)
AC_MAX_POWER_WATTS: float = 1500.0          # Max electrical power at 100%
AC_STANDBY_POWER_WATTS: float = 15.0        # Idle electronics standby power
FAN_MAX_POWER_WATTS: float = 65.0           # Max electrical power at 100%
FAN_STANDBY_POWER_WATTS: float = 2.0        # Idle electronics standby power

# Window and Door Cell Coordinate Slices
WINDOW_X_INDEX: int = GRID_NX - 1           # Located on far X wall
WINDOW_Y_RANGE: Tuple[int, int] = (2, 5)    # Vertical cell indices [min, max)
WINDOW_Z_RANGE: Tuple[int, int] = (3, 7)    # Depth cell indices [min, max)

DOOR_X_INDEX: int = 0                       # Located on near X wall
DOOR_Y_RANGE: Tuple[int, int] = (0, 4)      # Vertical cell indices [min, max)
DOOR_Z_RANGE: Tuple[int, int] = (1, 3)      # Depth cell indices [min, max)

# Bang-Bang Baseline Thermostat
BANG_BANG_HYSTERESIS: float = 0.5           # Celsius (turn on at setpoint + 0.5, off at -0.5)
COMFORT_TOLERANCE_TEMP: float = 1.0         # Celsius (|T - T_setpoint| <= 1.0 is comfortable)

# ==============================================================================
# 3. SERVER & FRONTEND CONSTANTS
# ==============================================================================
SERVER_HOST: str = "0.0.0.0"
SERVER_PORT: int = 8000

