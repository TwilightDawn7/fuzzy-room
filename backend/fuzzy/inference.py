"""Mamdani Fuzzy Inference Engine.

Performs rule evaluation, min-implication clipping, and max-aggregation.
"""

from typing import List, Dict, Tuple, Any
import numpy as np
from backend.fuzzy.variables import LinguisticVariable
from backend.fuzzy.rules import FuzzyRule


class MamdaniInferenceEngine:
    """Evaluates rules and aggregates output fuzzy sets."""

    def __init__(self, rules: List[FuzzyRule], output_var: LinguisticVariable) -> None:
        """Initialize inference engine.

        Parameters
        ----------
        rules : List[FuzzyRule]
            List of rules defining the knowledge base.
        output_var : LinguisticVariable
            Consequent linguistic variable.
        """
        self.rules: List[FuzzyRule] = rules
        self.output_var: LinguisticVariable = output_var

    def infer(
        self,
        fuzzified_inputs: Dict[str, Dict[str, float]]
    ) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        """Perform Mamdani inference.

        1. Computes firing strength for each rule (min T-norm).
        2. Clips each consequent fuzzy set (min implication).
        3. Aggregates all clipped sets into a single fuzzy set (max S-norm).

        Parameters
        ----------
        fuzzified_inputs : Dict[str, Dict[str, float]]
            Input degrees of membership.

        Returns
        -------
        Tuple[np.ndarray, List[Dict[str, Any]]]
            - Aggregated output curve (np.ndarray of length matching output_var.resolution)
            - Rule execution details: list of dicts with id, text, firing_strength, fired (bool),
              and clipped_curve (np.ndarray).
        """
        aggregated = np.zeros(self.output_var.resolution, dtype=np.float64)
        rule_evaluations: List[Dict[str, Any]] = []

        for rule in self.rules:
            strength = rule.compute_firing_strength(fuzzified_inputs)
            clipped = rule.clip_output(strength, self.output_var)

            # Max aggregation: S-norm
            if strength > 0.0:
                aggregated = np.maximum(aggregated, clipped)

            rule_evaluations.append({
                "id": rule.rule_id,
                "text": rule.text,
                "antecedents": rule.antecedents,
                "consequent_var": rule.consequent_var,
                "consequent_set": rule.consequent_set,
                "firing_strength": float(strength),
                "fired": bool(strength > 0.0),
                "clipped_curve": clipped,
            })

        return aggregated, rule_evaluations

