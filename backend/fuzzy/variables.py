"""Linguistic variables and fuzzy set definitions."""

from typing import Dict, Tuple, Optional
import numpy as np
from backend.fuzzy.membership import triangular, trapezoidal


class LinguisticVariable:
    """Represents a linguistic variable with a discretized universe of discourse

    and named fuzzy membership sets.
    """

    def __init__(
        self,
        name: str,
        universe_range: Tuple[float, float],
        resolution: int = 501,
        unit: str = "",
    ) -> None:
        """Initialize a linguistic variable.

        Parameters
        ----------
        name : str
            Variable name, e.g. 'temperature', 'fan_speed'.
        universe_range : Tuple[float, float]
            (min, max) bounds of the universe of discourse.
        resolution : int
            Number of points for discretization (default: 501).
        unit : str
            Physical unit (e.g. '°C', '%').
        """
        self.name: str = name
        self.universe_min: float = float(universe_range[0])
        self.universe_max: float = float(universe_range[1])
        self.resolution: int = resolution
        self.unit: str = unit

        # Discretized universe array
        self.universe: np.ndarray = np.linspace(
            self.universe_min, self.universe_max, self.resolution, dtype=np.float64
        )

        # Dictionary of fuzzy sets: set_name -> (mf_type, params)
        self.sets: Dict[str, Tuple[str, Tuple[float, ...]]] = {}
        # Precomputed membership curves over the universe array
        self.curves: Dict[str, np.ndarray] = {}

    def add_set(self, name: str, mf_type: str, params: Tuple[float, ...]) -> "LinguisticVariable":
        """Add a named fuzzy set to this linguistic variable.

        Parameters
        ----------
        name : str
            Linguistic term, e.g. 'Cold', 'Warm'.
        mf_type : str
            'tri' or 'trap'.
        params : Tuple[float, ...]
            Parameters for triangular (a, b, c) or trapezoidal (a, b, c, d).
        """
        mf_type_clean = mf_type.lower()
        if mf_type_clean == "tri":
            if len(params) != 3:
                raise ValueError(f"Triangular set '{name}' expects 3 parameters, got {len(params)}")
            curve = np.asarray(triangular(self.universe, *params), dtype=np.float64)
        elif mf_type_clean == "trap":
            if len(params) != 4:
                raise ValueError(f"Trapezoidal set '{name}' expects 4 parameters, got {len(params)}")
            curve = np.asarray(trapezoidal(self.universe, *params), dtype=np.float64)
        else:
            raise ValueError(f"Unsupported membership function type: '{mf_type}'")

        self.sets[name] = (mf_type_clean, tuple(float(p) for p in params))
        self.curves[name] = curve
        return self

    def get_curve(self, set_name: str) -> np.ndarray:
        """Get the discretized membership curve for a given fuzzy set."""
        if set_name not in self.curves:
            raise KeyError(f"Set '{set_name}' not defined on variable '{self.name}'")
        return self.curves[set_name]

    def clamp(self, value: float) -> float:
        """Clamp crisp value within the variable's universe range."""
        return float(np.clip(value, self.universe_min, self.universe_max))

    def fuzzify(self, crisp_value: float) -> Dict[str, float]:
        """Compute membership degrees for a crisp scalar value across all sets.

        Parameters
        ----------
        crisp_value : float
            Crisp input value. Clamped to universe range.

        Returns
        -------
        Dict[str, float]
            Mapping of set_name -> membership degree in [0.0, 1.0].
        """
        clamped_val = self.clamp(crisp_value)
        memberships: Dict[str, float] = {}

        for set_name, (mf_type, params) in self.sets.items():
            if mf_type == "tri":
                deg = float(triangular(clamped_val, *params))
            elif mf_type == "trap":
                deg = float(trapezoidal(clamped_val, *params))
            else:
                deg = 0.0
            memberships[set_name] = deg

        return memberships

