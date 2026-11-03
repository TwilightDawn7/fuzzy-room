"""Fuzzy membership functions implemented from scratch in NumPy.

Supports both scalar float inputs and 1D numpy arrays.
Implements:
- Triangular membership function: triangular(x, a, b, c)
- Trapezoidal membership function: trapezoidal(x, a, b, c, d)
"""

from typing import Union
import numpy as np

ArrayOrFloat = Union[float, int, np.ndarray]


def triangular(x: ArrayOrFloat, a: float, b: float, c: float) -> ArrayOrFloat:
    """Calculate triangular fuzzy membership degree for x given parameters (a, b, c).

    Parameters
    ----------
    x : float or np.ndarray
        Input value(s) in the universe of discourse.
    a : float
        Left foot (membership = 0).
    b : float
        Peak / center (membership = 1).
    c : float
        Right foot (membership = 0).

    Returns
    -------
    float or np.ndarray
        Membership degree in range [0.0, 1.0].
    """
    if not (a <= b <= c):
        raise ValueError(f"Triangular parameters must satisfy a <= b <= c; got ({a}, {b}, {c})")

    is_scalar = np.isscalar(x)
    x_arr = np.atleast_1d(np.asarray(x, dtype=np.float64))

    y = np.zeros_like(x_arr, dtype=np.float64)

    # Left slope: a < x < b
    if b > a:
        left_mask = (x_arr > a) & (x_arr < b)
        y[left_mask] = (x_arr[left_mask] - a) / (b - a)

    # Right slope: b < x < c
    if c > b:
        right_mask = (x_arr > b) & (x_arr < c)
        y[right_mask] = (c - x_arr[right_mask]) / (c - b)

    # Peak: x == b
    y[x_arr == b] = 1.0

    # Strict clamping to [0, 1]
    y = np.clip(y, 0.0, 1.0)

    return float(y[0]) if is_scalar else y


def trapezoidal(x: ArrayOrFloat, a: float, b: float, c: float, d: float) -> ArrayOrFloat:
    """Calculate trapezoidal fuzzy membership degree for x given parameters (a, b, c, d).

    Supports left-shoulder (a == b) and right-shoulder (c == d) trapezoids.

    Parameters
    ----------
    x : float or np.ndarray
        Input value(s) in the universe of discourse.
    a : float
        Left foot (membership rises from 0).
    b : float
        Left shoulder (membership reaches 1).
    c : float
        Right shoulder (membership starts dropping from 1).
    d : float
        Right foot (membership reaches 0).

    Returns
    -------
    float or np.ndarray
        Membership degree in range [0.0, 1.0].
    """
    if not (a <= b <= c <= d):
        raise ValueError(f"Trapezoidal parameters must satisfy a <= b <= c <= d; got ({a}, {b}, {c}, {d})")

    is_scalar = np.isscalar(x)
    x_arr = np.atleast_1d(np.asarray(x, dtype=np.float64))

    y = np.zeros_like(x_arr, dtype=np.float64)

    # Plateau: b <= x <= c
    plateau_mask = (x_arr >= b) & (x_arr <= c)
    y[plateau_mask] = 1.0

    # Left side
    if b > a:
        left_mask = (x_arr > a) & (x_arr < b)
        y[left_mask] = (x_arr[left_mask] - a) / (b - a)
    else:  # Left shoulder (a == b)
        y[x_arr <= b] = 1.0

    # Right side
    if d > c:
        right_mask = (x_arr > c) & (x_arr < d)
        y[right_mask] = (d - x_arr[right_mask]) / (d - c)
    else:  # Right shoulder (c == d)
        y[x_arr >= c] = 1.0

    # Boundaries
    if a != b:
        y[x_arr <= a] = 0.0
    if c != d:
        y[x_arr >= d] = 0.0

    # Clamping
    y = np.clip(y, 0.0, 1.0)

    return float(y[0]) if is_scalar else y
