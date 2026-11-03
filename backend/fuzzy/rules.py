"""Fuzzy Rule definition and evaluation."""

from typing import Dict, Tuple, Any
import numpy as np
from backend.fuzzy.variables import LinguisticVariable


class FuzzyRule:
    """Represents a Mamdani IF-THEN fuzzy rule with conjunction (AND) using min T-norm."""

    def __init__(
        self,
        rule_id: int,
        antecedents: Dict[str, str],
        consequent: Tuple[str, str],
        description: str = "",
    ) -> None:
        """Initialize a fuzzy rule.

        Parameters
        ----------
        rule_id : int
            Numeric identifier for this rule.
        antecedents : Dict[str, str]
            Input condition mapping, e.g. {"temperature": "Warm", "humidity": "Comfortable"}.
        consequent : Tuple[str, str]
            Output assignment (output_var_name, set_name), e.g. ("fan_speed", "Medium").
        description : str
            Optional human-readable description.
        """
        self.rule_id: int = rule_id
        self.antecedents: Dict[str, str] = antecedents
        self.consequent_var: str = consequent[0]
        self.consequent_set: str = consequent[1]

        # Generate human-readable text if not provided
        if not description:
            ant_str = " AND ".join(f"{var} IS {term}" for var, term in antecedents.items())
            self.text: str = f"IF {ant_str} THEN {self.consequent_var} IS {self.consequent_set}"
        else:
            self.text = description

    def compute_firing_strength(
        self,
        fuzzified_inputs: Dict[str, Dict[str, float]]
    ) -> float:
        """Compute the firing strength (alpha) of the rule using min T-norm for AND.

        Parameters
        ----------
        fuzzified_inputs : Dict[str, Dict[str, float]]
            Input memberships: var_name -> (set_name -> degree).

        Returns
        -------
        float
            Firing strength alpha in [0.0, 1.0].
        """
        strengths = []
        for var_name, term_name in self.antecedents.items():
            if var_name not in fuzzified_inputs:
                raise KeyError(f"Variable '{var_name}' not found in fuzzified inputs")
            if term_name not in fuzzified_inputs[var_name]:
                raise KeyError(f"Fuzzy set '{term_name}' not found for variable '{var_name}'")
            strengths.append(fuzzified_inputs[var_name][term_name])

        return float(min(strengths)) if strengths else 0.0

    def clip_output(
        self,
        firing_strength: float,
        output_var: LinguisticVariable
    ) -> np.ndarray:
        """Implicate / clip the consequent fuzzy set using min-operator.

        Parameters
        ----------
        firing_strength : float
            Firing strength alpha.
        output_var : LinguisticVariable
            Output linguistic variable object.

        Returns
        -------
        np.ndarray
            Discretized clipped membership curve.
        """
        base_curve = output_var.get_curve(self.consequent_set)
        if firing_strength <= 0.0:
            return np.zeros_like(base_curve)
        return np.minimum(firing_strength, base_curve)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize rule metadata for client / payload."""
        return {
            "id": self.rule_id,
            "text": self.text,
            "antecedents": self.antecedents,
            "consequent_var": self.consequent_var,
            "consequent_set": self.consequent_set,
        }

