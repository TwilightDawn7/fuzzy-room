"""Validation test suite: comparing custom NumPy Mamdani FIS against scikit-fuzzy.

Tests across at least 50 random inputs to ensure exact mathematical agreement.
"""

import pytest
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

import backend.config as cfg
from backend.fuzzy.controller import create_fan_fis, create_ac_fis


def build_skfuzzy_fan_system():
    """Build identical Fan FIS in scikit-fuzzy for cross-validation."""
    u_temp = np.linspace(*cfg.TEMP_UNIVERSE, cfg.DISCRETIZATION_POINTS)
    u_hum = np.linspace(*cfg.HUMIDITY_UNIVERSE, cfg.DISCRETIZATION_POINTS)
    u_fan = np.linspace(*cfg.FAN_SPEED_UNIVERSE, cfg.DISCRETIZATION_POINTS)

    temp_ant = ctrl.Antecedent(u_temp, "temperature")
    hum_ant = ctrl.Antecedent(u_hum, "humidity")
    fan_con = ctrl.Consequent(u_fan, "fan_speed", defuzzify_method="centroid")

    for k, (mft, p) in cfg.FAN_TEMP_SETS.items():
        temp_ant[k] = fuzz.trapmf(u_temp, p) if mft == "trap" else fuzz.trimf(u_temp, p)
    for k, (mft, p) in cfg.HUMIDITY_SETS.items():
        hum_ant[k] = fuzz.trapmf(u_hum, p) if mft == "trap" else fuzz.trimf(u_hum, p)
    for k, (mft, p) in cfg.FAN_SPEED_SETS.items():
        fan_con[k] = fuzz.trapmf(u_fan, p) if mft == "trap" else fuzz.trimf(u_fan, p)

    rules = [ctrl.Rule(temp_ant[t] & hum_ant[h], fan_con[out]) for (t, h, out) in cfg.FAN_RULES]
    sys = ctrl.ControlSystem(rules)
    return ctrl.ControlSystemSimulation(sys)


def build_skfuzzy_ac_system():
    """Build identical AC FIS in scikit-fuzzy for cross-validation."""
    u_err = np.linspace(*cfg.TEMP_ERROR_UNIVERSE, cfg.DISCRETIZATION_POINTS)
    u_hum = np.linspace(*cfg.HUMIDITY_UNIVERSE, cfg.DISCRETIZATION_POINTS)
    u_ac = np.linspace(*cfg.AC_POWER_UNIVERSE, cfg.DISCRETIZATION_POINTS)

    err_ant = ctrl.Antecedent(u_err, "temp_error")
    hum_ant = ctrl.Antecedent(u_hum, "humidity")
    ac_con = ctrl.Consequent(u_ac, "cooling_power", defuzzify_method="centroid")

    for k, (mft, p) in cfg.AC_TEMP_ERROR_SETS.items():
        err_ant[k] = fuzz.trapmf(u_err, p) if mft == "trap" else fuzz.trimf(u_err, p)
    for k, (mft, p) in cfg.HUMIDITY_SETS.items():
        hum_ant[k] = fuzz.trapmf(u_hum, p) if mft == "trap" else fuzz.trimf(u_hum, p)
    for k, (mft, p) in cfg.AC_POWER_SETS.items():
        ac_con[k] = fuzz.trapmf(u_ac, p) if mft == "trap" else fuzz.trimf(u_ac, p)

    rules = [ctrl.Rule(err_ant[e] & hum_ant[h], ac_con[out]) for (e, h, out) in cfg.AC_RULES]
    sys = ctrl.ControlSystem(rules)
    return ctrl.ControlSystemSimulation(sys)


class TestVsScikitFuzzy:
    """Rigorous comparison against scikit-fuzzy reference implementation."""

    def test_fan_fis_50_random_inputs(self):
        """Evaluate Fan FIS across 60 random (temperature, humidity) pairs."""
        rng = np.random.default_rng(seed=42)
        sim_sk = build_skfuzzy_fan_system()
        our_fan = create_fan_fis()

        # Sample across valid operating range (avoiding extreme edges where no rules fire)
        temps = rng.uniform(5.0, 48.0, size=60)
        humidities = rng.uniform(5.0, 95.0, size=60)

        differences = []
        for t, h in zip(temps, humidities):
            # scikit-fuzzy
            sim_sk.input["temperature"] = float(t)
            sim_sk.input["humidity"] = float(h)
            sim_sk.compute()
            sk_val = float(sim_sk.output["fan_speed"])

            # our custom NumPy Mamdani FIS
            our_val, _ = our_fan.evaluate({"temperature": float(t), "humidity": float(h)})

            diff = abs(sk_val - our_val)
            differences.append(diff)

            # Strict assertion per individual sample
            assert diff < 0.05, f"Discrepancy at T={t:.2f}, H={h:.2f}: skfuzzy={sk_val:.4f}, ours={our_val:.4f}"

        max_diff = max(differences)
        avg_diff = sum(differences) / len(differences)
        print(f"\n[Fan FIS vs skfuzzy] Tested 60 inputs: Max Diff={max_diff:.6f}, Avg Diff={avg_diff:.6f}")
        assert max_diff < 0.05

    def test_ac_fis_50_random_inputs(self):
        """Evaluate AC FIS across 60 random (temp_error, humidity) pairs."""
        rng = np.random.default_rng(seed=1337)
        sim_sk = build_skfuzzy_ac_system()
        our_ac = create_ac_fis()

        errors = rng.uniform(-8.0, 14.0, size=60)
        humidities = rng.uniform(5.0, 95.0, size=60)

        differences = []
        for e, h in zip(errors, humidities):
            sim_sk.input["temp_error"] = float(e)
            sim_sk.input["humidity"] = float(h)
            sim_sk.compute()
            sk_val = float(sim_sk.output["cooling_power"])

            our_val, _ = our_ac.evaluate({"temp_error": float(e), "humidity": float(h)})

            diff = abs(sk_val - our_val)
            differences.append(diff)

            assert diff < 0.05, f"Discrepancy at Err={e:.2f}, H={h:.2f}: skfuzzy={sk_val:.4f}, ours={our_val:.4f}"

        max_diff = max(differences)
        avg_diff = sum(differences) / len(differences)
        print(f"\n[AC FIS vs skfuzzy] Tested 60 inputs: Max Diff={max_diff:.6f}, Avg Diff={avg_diff:.6f}")
        assert max_diff < 0.05

