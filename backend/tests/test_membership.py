"""Unit tests for fuzzy membership functions implemented in NumPy."""

import pytest
import numpy as np
from backend.fuzzy.membership import triangular, trapezoidal


class TestTriangularMF:
    """Tests for triangular membership function."""

    def test_peak_and_feet(self):
        """Peak should be 1.0, feet should be 0.0."""
        a, b, c = 10.0, 20.0, 30.0
        assert triangular(a, a, b, c) == pytest.approx(0.0)
        assert triangular(b, a, b, c) == pytest.approx(1.0)
        assert triangular(c, a, b, c) == pytest.approx(0.0)

    def test_intermediate_values(self):
        """Values on slopes should be linearly proportional."""
        a, b, c = 10.0, 20.0, 30.0
        # Halfway up left slope
        assert triangular(15.0, a, b, c) == pytest.approx(0.5)
        # Three-quarters up right slope
        assert triangular(22.5, a, b, c) == pytest.approx(0.75)

    def test_outside_support(self):
        """Values outside [a, c] should return 0.0."""
        a, b, c = 10.0, 20.0, 30.0
        assert triangular(5.0, a, b, c) == 0.0
        assert triangular(35.0, a, b, c) == 0.0

    def test_vectorized_array(self):
        """Array input should return array of matching shape and valid range [0, 1]."""
        x = np.linspace(0, 40, 401)
        y = triangular(x, 10.0, 20.0, 30.0)
        assert isinstance(y, np.ndarray)
        assert y.shape == x.shape
        assert np.all(y >= 0.0)
        assert np.all(y <= 1.0)
        assert np.max(y) == pytest.approx(1.0)

    def test_invalid_parameters_raise(self):
        """Non-increasing parameters must raise ValueError."""
        with pytest.raises(ValueError):
            triangular(15.0, 20.0, 10.0, 30.0)


class TestTrapezoidalMF:
    """Tests for trapezoidal membership function."""

    def test_plateau_and_feet(self):
        """Plateau [b, c] should be 1.0, feet should be 0.0."""
        a, b, c, d = 10.0, 20.0, 30.0, 40.0
        assert trapezoidal(a, a, b, c, d) == pytest.approx(0.0)
        assert trapezoidal(b, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(25.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(c, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(d, a, b, c, d) == pytest.approx(0.0)

    def test_left_shoulder(self):
        """Left shoulder trapezoid (a == b) should be 1.0 for x <= b."""
        a, b, c, d = 0.0, 0.0, 10.0, 18.0
        assert trapezoidal(0.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(5.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(10.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(14.0, a, b, c, d) == pytest.approx(0.5)
        assert trapezoidal(18.0, a, b, c, d) == pytest.approx(0.0)
        assert trapezoidal(25.0, a, b, c, d) == 0.0

    def test_right_shoulder(self):
        """Right shoulder trapezoid (c == d) should be 1.0 for x >= c."""
        a, b, c, d = 30.0, 36.0, 50.0, 50.0
        assert trapezoidal(25.0, a, b, c, d) == 0.0
        assert trapezoidal(30.0, a, b, c, d) == pytest.approx(0.0)
        assert trapezoidal(33.0, a, b, c, d) == pytest.approx(0.5)
        assert trapezoidal(36.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(45.0, a, b, c, d) == pytest.approx(1.0)
        assert trapezoidal(50.0, a, b, c, d) == pytest.approx(1.0)

    def test_vectorized_array(self):
        """Vectorized execution produces bounded arrays."""
        x = np.linspace(-10, 60, 701)
        y = trapezoidal(x, 10.0, 20.0, 30.0, 40.0)
        assert isinstance(y, np.ndarray)
        assert y.shape == x.shape
        assert np.all(y >= 0.0)
        assert np.all(y <= 1.0)

    def test_invalid_parameters_raise(self):
        """Non-increasing parameters must raise ValueError."""
        with pytest.raises(ValueError):
            trapezoidal(10.0, 20.0, 15.0, 30.0, 40.0)

