"""Mamdani Fuzzy Logic Controller and Device Coordinator.

Encapsulates complete Mamdani FIS workflows and generates stable explanation payloads.
"""

from typing import Dict, List, Tuple, Any, Optional
import numpy as np

import backend.config as cfg
from backend.fuzzy.variables import LinguisticVariable
from backend.fuzzy.fuzzifier import fuzzify_inputs
from backend.fuzzy.rules import FuzzyRule
from backend.fuzzy.inference import MamdaniInferenceEngine
from backend.fuzzy.defuzzifier import defuzz, defuzz_centroid, defuzz_bisector, defuzz_mom
from backend.fuzzy.report import generate_natural_language_explanation


class MamdaniFIS:
    """A complete Mamdani Fuzzy Inference System."""

    def __init__(
        self,
        name: str,
        inputs: Dict[str, LinguisticVariable],
        output: LinguisticVariable,
        rules: List[FuzzyRule],
        safe_default: float = 0.0,
    ) -> None:
        """Initialize Mamdani FIS.

        Parameters
        ----------
        name : str
            Identifier for this FIS (e.g. 'Fan_Controller').
        inputs : Dict[str, LinguisticVariable]
            Dictionary of input variables.
        output : LinguisticVariable
            Output variable.
        rules : List[FuzzyRule]
            Rule base.
        safe_default : float
            Default output if rule aggregation yields zero area.
        """
        self.name: str = name
        self.inputs: Dict[str, LinguisticVariable] = inputs
        self.output: LinguisticVariable = output
        self.rules: List[FuzzyRule] = rules
        self.safe_default: float = safe_default

        self.inference_engine: MamdaniInferenceEngine = MamdaniInferenceEngine(
            self.rules, self.output
        )

    def evaluate(
        self,
        crisp_inputs: Dict[str, float],
        defuzz_method: str = "centroid",
    ) -> Tuple[float, Dict[str, Any]]:
        """Evaluate the FIS for crisp inputs and generate an explanation payload.

        Parameters
        ----------
        crisp_inputs : Dict[str, float]
            Crisp input values, e.g. {'temperature': 28.5, 'humidity': 65.0}.
        defuzz_method : str
            'centroid', 'bisector', or 'mom'.

        Returns
        -------
        Tuple[float, Dict[str, Any]]
            - Crisp defuzzified output value.
            - Full explanation payload driving the dashboard and diagnostics.
        """
        # 1. Fuzzification
        memberships = fuzzify_inputs(self.inputs, crisp_inputs)

        # 2. Rule evaluation and aggregation
        aggregated_curve, rule_evals = self.inference_engine.infer(memberships)

        # 3. Defuzzification
        crisp_output = defuzz(
            self.output.universe,
            aggregated_curve,
            method=defuzz_method,
            safe_default=self.safe_default,
        )

        # Centroid is always calculated for reference / visualization needle
        centroid_val = defuzz_centroid(
            self.output.universe,
            aggregated_curve,
            safe_default=self.safe_default,
        )
        bisector_val = defuzz_bisector(
            self.output.universe,
            aggregated_curve,
            safe_default=self.safe_default,
        )
        mom_val = defuzz_mom(
            self.output.universe,
            aggregated_curve,
            safe_default=self.safe_default,
        )

        # Format rules for payload
        serializable_rules = []
        for r in rule_evals:
            serializable_rules.append({
                "id": r["id"],
                "text": r["text"],
                "antecedents": r["antecedents"],
                "consequent_var": r["consequent_var"],
                "consequent_set": r["consequent_set"],
                "firing_strength": round(float(r["firing_strength"]), 4),
                "fired": bool(r["fired"]),
            })

        # Downsample curve slightly for WebSocket transfer efficiency (e.g. 101 points)
        step = max(1, len(self.output.universe) // 100)
        x_pts = [round(float(v), 2) for v in self.output.universe[::step]]
        y_pts = [round(float(v), 4) for v in aggregated_curve[::step]]

        payload: Dict[str, Any] = {
            "name": self.name,
            "inputs": {k: round(float(v), 2) for k, v in crisp_inputs.items()},
            "memberships": {
                var: {term: round(float(deg), 4) for term, deg in terms.items()}
                for var, terms in memberships.items()
            },
            "rules": serializable_rules,
            "aggregated_curve": {
                "x": x_pts,
                "y": y_pts,
            },
            "output_var": self.output.name,
            "output": round(float(crisp_output), 2),
            "centroid_x": round(float(centroid_val), 2),
            "bisector_x": round(float(bisector_val), 2),
            "mom_x": round(float(mom_val), 2),
            "defuzz_method": defuzz_method,
        }

        # Generate human-readable natural language summary
        payload["explanation"] = generate_natural_language_explanation(payload)

        return float(crisp_output), payload


def create_fan_fis() -> MamdaniFIS:
    """Factory creating the Fan FIS specified in config.py."""
    temp_var = LinguisticVariable("temperature", cfg.TEMP_UNIVERSE, cfg.DISCRETIZATION_POINTS, "°C")
    for name, (mft, p) in cfg.FAN_TEMP_SETS.items():
        temp_var.add_set(name, mft, p)

    humidity_var = LinguisticVariable("humidity", cfg.HUMIDITY_UNIVERSE, cfg.DISCRETIZATION_POINTS, "%")
    for name, (mft, p) in cfg.HUMIDITY_SETS.items():
        humidity_var.add_set(name, mft, p)

    fan_var = LinguisticVariable("fan_speed", cfg.FAN_SPEED_UNIVERSE, cfg.DISCRETIZATION_POINTS, "%")
    for name, (mft, p) in cfg.FAN_SPEED_SETS.items():
        fan_var.add_set(name, mft, p)

    rules: List[FuzzyRule] = []
    for idx, (t_term, h_term, out_term) in enumerate(cfg.FAN_RULES, start=1):
        rule = FuzzyRule(
            rule_id=idx,
            antecedents={"temperature": t_term, "humidity": h_term},
            consequent=("fan_speed", out_term),
        )
        rules.append(rule)

    return MamdaniFIS(
        name="Fan_Controller",
        inputs={"temperature": temp_var, "humidity": humidity_var},
        output=fan_var,
        rules=rules,
        safe_default=cfg.SAFE_DEFAULT_FAN_SPEED,
    )


def create_ac_fis() -> MamdaniFIS:
    """Factory creating the AC FIS specified in config.py."""
    err_var = LinguisticVariable("temp_error", cfg.TEMP_ERROR_UNIVERSE, cfg.DISCRETIZATION_POINTS, "°C")
    for name, (mft, p) in cfg.AC_TEMP_ERROR_SETS.items():
        err_var.add_set(name, mft, p)

    humidity_var = LinguisticVariable("humidity", cfg.HUMIDITY_UNIVERSE, cfg.DISCRETIZATION_POINTS, "%")
    for name, (mft, p) in cfg.HUMIDITY_SETS.items():
        humidity_var.add_set(name, mft, p)

    ac_var = LinguisticVariable("cooling_power", cfg.AC_POWER_UNIVERSE, cfg.DISCRETIZATION_POINTS, "%")
    for name, (mft, p) in cfg.AC_POWER_SETS.items():
        ac_var.add_set(name, mft, p)

    rules: List[FuzzyRule] = []
    for idx, (e_term, h_term, out_term) in enumerate(cfg.AC_RULES, start=1):
        rule = FuzzyRule(
            rule_id=idx,
            antecedents={"temp_error": e_term, "humidity": h_term},
            consequent=("cooling_power", out_term),
        )
        rules.append(rule)

    return MamdaniFIS(
        name="AC_Controller",
        inputs={"temp_error": err_var, "humidity": humidity_var},
        output=ac_var,
        rules=rules,
        safe_default=cfg.SAFE_DEFAULT_AC_POWER,
    )


class FuzzyRoomCoordinator:
    """Coordinates Fan FIS and AC FIS with mutual cooperation policy."""

    def __init__(self) -> None:
        self.fan_fis: MamdaniFIS = create_fan_fis()
        self.ac_fis: MamdaniFIS = create_ac_fis()
        self.coordination_enabled: bool = cfg.COORDINATION_ENABLED

    def evaluate(
        self,
        temperature: float,
        humidity: float,
        setpoint_temp: float = cfg.DEFAULT_SETPOINT_TEMP,
        defuzz_method: str = "centroid",
    ) -> Dict[str, Any]:
        """Evaluate both systems and apply coordination rule.

        Coordination:
        If AC power > 60%, cap the fan output at 60% (Medium) so the two devices cooperate.

        Returns
        -------
        Dict[str, Any]
            {
                'fan_speed': float,
                'ac_power': float,
                'fan_payload': dict,
                'ac_payload': dict,
                'coordination_applied': bool
            }
        """
        temp_error = float(temperature - setpoint_temp)

        # Evaluate AC first to determine power requirement
        ac_power, ac_payload = self.ac_fis.evaluate(
            {"temp_error": temp_error, "humidity": humidity},
            defuzz_method=defuzz_method,
        )

        # Evaluate Fan
        fan_speed, fan_payload = self.fan_fis.evaluate(
            {"temperature": temperature, "humidity": humidity},
            defuzz_method=defuzz_method,
        )

        # Device Coordination
        coordination_applied = False
        pre_coord_fan = fan_speed
        if self.coordination_enabled and ac_power > cfg.AC_POWER_COORDINATION_THRESHOLD:
            if fan_speed > cfg.FAN_SPEED_CAP:
                fan_speed = cfg.FAN_SPEED_CAP
                coordination_applied = True
                fan_payload["coordination_applied"] = True
                fan_payload["pre_coordination_output"] = round(pre_coord_fan, 2)
                fan_payload["coordination_cap"] = cfg.FAN_SPEED_CAP
                fan_payload["output"] = round(fan_speed, 2)
                # Re-generate natural language explanation with coordination note
                fan_payload["explanation"] = generate_natural_language_explanation(fan_payload)

        return {
            "fan_speed": round(fan_speed, 2),
            "ac_power": round(ac_power, 2),
            "fan": fan_payload,
            "ac": ac_payload,
            "fan_payload": fan_payload,
            "ac_payload": ac_payload,
            "coordination_applied": coordination_applied,
            "inputs": {
                "temperature": round(temperature, 2),
                "humidity": round(humidity, 2),
                "setpoint": round(setpoint_temp, 2),
                "temp_error": round(temp_error, 2),
            },
        }

