"""Fuzzification module for Mamdani FIS."""

from typing import Dict
from backend.fuzzy.variables import LinguisticVariable


def fuzzify_inputs(
    variables: Dict[str, LinguisticVariable],
    crisp_inputs: Dict[str, float]
) -> Dict[str, Dict[str, float]]:
    """Fuzzify multiple crisp inputs against their respective linguistic variables.

    Parameters
    ----------
    variables : Dict[str, LinguisticVariable]
        Dictionary of input linguistic variables.
    crisp_inputs : Dict[str, float]
        Dictionary of input names to crisp scalar values.

    Returns
    -------
    Dict[str, Dict[str, float]]
        Nested dictionary: var_name -> (set_name -> membership_degree).
    """
    fuzzified: Dict[str, Dict[str, float]] = {}

    for var_name, var in variables.items():
        if var_name not in crisp_inputs:
            raise KeyError(f"Missing required crisp input for variable '{var_name}'")
        raw_val = crisp_inputs[var_name]
        fuzzified[var_name] = var.fuzzify(raw_val)

    return fuzzified

