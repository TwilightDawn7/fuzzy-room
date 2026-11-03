"""Defuzzification methods implemented from scratch in NumPy.

Implements:
- Centroid (Center of Gravity / COG)
- Bisector (Area bisection)
- Mean of Maximum (MOM)
- Safe fallback for zero-activation / empty membership edge cases.
"""

from typing import Literal
import numpy as np

DefuzzMethod = Literal["centroid", "bisector", "mom"]


def defuzz_centroid(
    x: np.ndarray,
    y: np.ndarray,
    safe_default: float = 0.0
) -> float:
    """Calculate the centroid (center of gravity) of the aggregated fuzzy set.

    Uses piecewise trapezoidal/triangular sub-area integration for high numerical accuracy.

    Parameters
    ----------
    x : np.ndarray
        Discretized universe of discourse.
    y : np.ndarray
        Aggregated fuzzy membership values corresponding to x.
    safe_default : float
        Value to return if total area is zero (no rules fired).

    Returns
    -------
    float
        Crisp defuzzified value.
    """
    total_sum = float(np.sum(y))
    if total_sum <= 1e-12 or np.isnan(total_sum):
        return safe_default

    # Piecewise integration over sub-intervals
    sum_moment_area = 0.0
    sum_area = 0.0

    # Vectorized computation across adjacent segments [i-1, i]
    x1 = x[:-1]
    x2 = x[1:]
    y1 = y[:-1]
    y2 = y[1:]

    dx = x2 - x1
    sum_y = y1 + y2

    # Ignore segments where both heights are zero
    active_mask = (sum_y > 1e-12) & (dx > 0)
    if not np.any(active_mask):
        return safe_default

    x1_a = x1[active_mask]
    dx_a = dx[active_mask]
    y1_a = y1[active_mask]
    y2_a = y2[active_mask]
    sum_y_a = sum_y[active_mask]

    # Sub-area of trapezoid: dx * (y1 + y2) / 2
    areas = 0.5 * dx_a * sum_y_a

    # Centroid x-coordinate of a trapezoid on [x1, x2]:
    # x_c = x1 + dx * (2*y2 + y1) / (3 * (y1 + y2))
    moments_x = x1_a + dx_a * (2.0 * y2_a + y1_a) / (3.0 * sum_y_a)

    sum_moment_area = float(np.sum(moments_x * areas))
    sum_area = float(np.sum(areas))

    if sum_area <= 1e-12:
        return safe_default

    return float(sum_moment_area / sum_area)


def defuzz_bisector(
    x: np.ndarray,
    y: np.ndarray,
    safe_default: float = 0.0
) -> float:
    """Calculate the bisector of area of the aggregated fuzzy set.

    Finds the universe coordinate x* where the area to the left equals
    the area to the right (half of total area).

    Parameters
    ----------
    x : np.ndarray
        Discretized universe of discourse.
    y : np.ndarray
        Aggregated fuzzy membership values.
    safe_default : float
        Value to return if total area is zero.

    Returns
    -------
    float
        Crisp defuzzified value.
    """
    total_sum = float(np.sum(y))
    if total_sum <= 1e-12 or np.isnan(total_sum):
        return safe_default

    # Compute trapezoidal segment areas
    dx = x[1:] - x[:-1]
    seg_areas = 0.5 * dx * (y[:-1] + y[1:])
    total_area = float(np.sum(seg_areas))

    if total_area <= 1e-12:
        return safe_default

    half_area = total_area / 2.0
    cum_areas = np.concatenate(([0.0], np.cumsum(seg_areas)))

    # Find index where cumulative area crosses half_area
    idx = int(np.searchsorted(cum_areas, half_area))
    if idx == 0:
        return float(x[0])
    if idx >= len(x):
        return float(x[-1])

    # Interpolate within segment [idx-1, idx]
    area_prev = cum_areas[idx - 1]
    area_needed = half_area - area_prev
    x1 = x[idx - 1]
    x2 = x[idx]
    y1 = y[idx - 1]
    y2 = y[idx]
    dx_seg = x2 - x1

    # Solve quadratic equation for delta_x:
    # area_needed = delta_x * y1 + 0.5 * delta_x^2 * (y2 - y1) / dx_seg
    slope = (y2 - y1) / dx_seg if dx_seg > 0 else 0.0
    if abs(slope) < 1e-10:
        # Uniform height rectangle
        delta_x = area_needed / max(y1, 1e-12)
    else:
        # 0.5 * slope * dx^2 + y1 * dx - area_needed = 0
        a_quad = 0.5 * slope
        b_quad = y1
        c_quad = -area_needed
        disc = b_quad**2 - 4 * a_quad * c_quad
        if disc < 0:
            delta_x = dx_seg / 2.0
        else:
            delta_x = (-b_quad + np.sqrt(disc)) / (2.0 * a_quad)

    delta_x = float(np.clip(delta_x, 0.0, dx_seg))
    return float(x1 + delta_x)


def defuzz_mom(
    x: np.ndarray,
    y: np.ndarray,
    safe_default: float = 0.0
) -> float:
    """Calculate the Mean of Maximum (MOM) of the aggregated fuzzy set.

    Parameters
    ----------
    x : np.ndarray
        Discretized universe of discourse.
    y : np.ndarray
        Aggregated fuzzy membership values.
    safe_default : float
        Value to return if max membership is zero.

    Returns
    -------
    float
        Mean of the coordinates attaining maximum membership.
    """
    max_val = float(np.max(y))
    if max_val <= 1e-12:
        return safe_default

    # Values within 1e-6 of max_val are considered plateau points
    plateau_points = x[y >= (max_val - 1e-6)]
    if len(plateau_points) == 0:
        return safe_default

    return float(np.mean(plateau_points))


def defuzz(
    x: np.ndarray,
    y: np.ndarray,
    method: str = "centroid",
    safe_default: float = 0.0
) -> float:
    """General defuzzification interface.

    Parameters
    ----------
    x : np.ndarray
        Discretized universe array.
    y : np.ndarray
        Aggregated fuzzy membership values.
    method : str
        'centroid', 'bisector', or 'mom'.
    safe_default : float
        Safe default value if curve has zero area.

    Returns
    -------
    float
        Crisp defuzzified value.
    """
    m = method.lower()
    if m == "centroid":
        return defuzz_centroid(x, y, safe_default=safe_default)
    elif m == "bisector":
        return defuzz_bisector(x, y, safe_default=safe_default)
    elif m in ("mom", "mean_of_maximum"):
        return defuzz_mom(x, y, safe_default=safe_default)
    else:
        raise ValueError(f"Unknown defuzzification method: '{method}'. Choose 'centroid', 'bisector', or 'mom'.")

