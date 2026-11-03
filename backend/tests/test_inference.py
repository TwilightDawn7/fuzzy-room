"""Unit tests for fuzzification, inference, defuzzification, and device coordination."""

import pytest
import numpy as np

import backend.config as cfg
from backend.fuzzy.variables import LinguisticVariable
from backend.fuzzy.fuzzifier import fuzzify_inputs
from backend.fuzzy.rules import FuzzyRule
from backend.fuzzy.inference import MamdaniInferenceEngine
from backend.fuzzy.defuzzifier import defuzz_centroid, defuzz_bisector, defuzz_mom, defuzz
from backend.fuzzy.controller import create_fan_fis, create_ac_fis, FuzzyRoomCoordinator
from backend.fuzzy.membership import triangular, trapezoidal


class TestVariablesAndFuzzifier:
    """Tests for linguistic variable management and fuzzification."""

    def test_variable_creation_and_clamping(self):
        var = LinguisticVariable("temperature", (0.0, 50.0), resolution=501)
        assert var.universe_min == 0.0
        assert var.universe_max == 50.0
        assert len(var.universe) == 501
        assert var.clamp(-5.0) == 0.0
        assert var.clamp(55.0) == 50.0
        assert var.clamp(25.0) == 25.0

    def test_fuzzification_partition_of_unity(self):
        """Test that overlapping triangular sets sum to 1.0 at intersections."""
        var = LinguisticVariable("x", (0.0, 100.0), 501)
        var.add_set("Low", "tri", (0.0, 0.0, 50.0))
        var.add_set("Mid", "tri", (0.0, 50.0, 100.0))
        var.add_set("High", "tri", (50.0, 100.0, 100.0))

        # At 25: Low = 0.5, Mid = 0.5
        m25 = var.fuzzify(25.0)
        assert m25["Low"] == pytest.approx(0.5)
        assert m25["Mid"] == pytest.approx(0.5)
        assert m25["High"] == pytest.approx(0.0)
        assert (m25["Low"] + m25["Mid"] + m25["High"]) == pytest.approx(1.0)


class TestRulesAndInference:
    """Tests for rule evaluation and Mamdani min-max aggregation."""

    def test_rule_min_conjunction(self):
        """AND conjunction must take the minimum membership degree."""
        out_var = LinguisticVariable("fan", (0.0, 100.0), 101)
        out_var.add_set("Fast", "trap", (70.0, 85.0, 100.0, 100.0))

        rule = FuzzyRule(
            rule_id=1,
            antecedents={"temp": "Hot", "humidity": "Comfortable"},
            consequent=("fan", "Fast"),
        )

        fuzzified = {
            "temp": {"Hot": 0.8},
            "humidity": {"Comfortable": 0.3},
        }
        strength = rule.compute_firing_strength(fuzzified)
        assert strength == pytest.approx(0.3)

    def test_consequent_clipping(self):
        """Rule clipping should truncate output set at firing strength."""
        out_var = LinguisticVariable("fan", (0.0, 100.0), 101)
        out_var.add_set("Fast", "trap", (70.0, 85.0, 100.0, 100.0))

        rule = FuzzyRule(1, {"temp": "Hot"}, ("fan", "Fast"))
        clipped = rule.clip_output(0.65, out_var)
        assert np.max(clipped) == pytest.approx(0.65)
        assert np.min(clipped) == 0.0


class TestDefuzzifiers:
    """Tests for defuzzification algorithms."""

    def test_centroid_symmetric_triangle(self):
        """Centroid of symmetric triangle must equal its center peak."""
        x = np.linspace(0.0, 100.0, 501)
        y = triangular(x, 20.0, 50.0, 80.0)
        c = defuzz_centroid(x, y)
        assert c == pytest.approx(50.0, abs=1e-2)

    def test_centroid_symmetric_trapezoid(self):
        """Centroid of symmetric trapezoid must equal its center."""
        x = np.linspace(0.0, 100.0, 501)
        y = trapezoidal(x, 20.0, 40.0, 60.0, 80.0)
        c = defuzz_centroid(x, y)
        assert c == pytest.approx(50.0, abs=1e-2)

    def test_bisector_symmetric_shape(self):
        """Bisector of symmetric shape must split it evenly at center."""
        x = np.linspace(0.0, 100.0, 501)
        y = triangular(x, 20.0, 50.0, 80.0)
        b = defuzz_bisector(x, y)
        assert b == pytest.approx(50.0, abs=1e-2)

    def test_mom_symmetric_plateau(self):
        """Mean of maximum on symmetric plateau [40, 60] should equal 50."""
        x = np.linspace(0.0, 100.0, 501)
        y = trapezoidal(x, 20.0, 40.0, 60.0, 80.0)
        m = defuzz_mom(x, y)
        assert m == pytest.approx(50.0, abs=1e-2)

    def test_zero_activation_safe_fallback(self):
        """Empty membership curve must safely return the designated fallback."""
        x = np.linspace(0.0, 100.0, 501)
        y_zero = np.zeros_like(x)
        assert defuzz_centroid(x, y_zero, safe_default=12.5) == 12.5
        assert defuzz_bisector(x, y_zero, safe_default=25.0) == 25.0
        assert defuzz_mom(x, y_zero, safe_default=37.5) == 37.5


class TestFuzzyControllerAndCoordination:
    """Tests for complete FIS and device coordination."""

    def test_explanation_payload_structure(self):
        """Payload must contain all required visual diagnostic keys."""
        fan_fis = create_fan_fis()
        crisp_out, payload = fan_fis.evaluate({"temperature": 28.0, "humidity": 60.0})

        assert isinstance(crisp_out, float)
        assert "name" in payload
        assert "inputs" in payload
        assert "memberships" in payload
        assert "rules" in payload
        assert "aggregated_curve" in payload
        assert "output" in payload
        assert "centroid_x" in payload
        assert "explanation" in payload

        # Check rule record details
        for r in payload["rules"]:
            assert "id" in r
            assert "text" in r
            assert "firing_strength" in r
            assert "fired" in r

    def test_device_coordination_cap(self):
        """When AC power > 60%, Fan speed must be capped at 60%."""
        coordinator = FuzzyRoomCoordinator()
        # High temperature & high humidity -> high AC power and high fan demand
        result = coordinator.evaluate(temperature=38.0, humidity=80.0, setpoint_temp=22.0)

        assert result["ac_power"] > 60.0
        assert result["fan_speed"] <= 60.0
        assert result["coordination_applied"] is True

    def test_device_coordination_disabled_when_ac_low(self):
        """When AC power <= 60%, Fan speed is not capped."""
        coordinator = FuzzyRoomCoordinator()
        # Room near setpoint
        result = coordinator.evaluate(temperature=24.5, humidity=40.0, setpoint_temp=24.0)

        assert result["ac_power"] <= 60.0
        assert result["coordination_applied"] is False

