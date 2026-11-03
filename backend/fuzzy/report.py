"""Explanation and reporting generator for Mamdani FIS decisions."""

from typing import Dict, Any, List


def generate_natural_language_explanation(
    payload: Dict[str, Any]
) -> str:
    """Generate a clear, human-readable sentence explaining why a specific

    fuzzy output decision was reached.

    Parameters
    ----------
    payload : Dict[str, Any]
        Explanation payload from MamdaniFIS.evaluate().

    Returns
    -------
    str
        Plain-English explanation of inputs, dominant active rules, and result.
    """
    fis_name = payload.get("name", "Controller")
    crisp_inputs = payload.get("inputs", {})
    memberships = payload.get("memberships", {})
    rules: List[Dict[str, Any]] = payload.get("rules", [])
    output_val = payload.get("output", 0.0)
    output_var = payload.get("output_var", "output")

    # Build input descriptions with nonzero memberships
    input_descs = []
    for var, val in crisp_inputs.items():
        active_terms = [
            f"{term}: {deg:.2f}"
            for term, deg in memberships.get(var, {}).items()
            if deg > 0.01
        ]
        if active_terms:
            terms_str = ", ".join(active_terms)
            input_descs.append(f"{var}={val:.1f} ({terms_str})")
        else:
            input_descs.append(f"{var}={val:.1f}")

    inputs_summary = " and ".join(input_descs)

    # Find dominant fired rules
    fired_rules = [r for r in rules if r.get("firing_strength", 0.0) > 0.01]
    fired_rules.sort(key=lambda r: r.get("firing_strength", 0.0), reverse=True)

    if not fired_rules:
        return (
            f"[{fis_name}] Inputs {inputs_summary} did not activate any rules. "
            f"Default safe {output_var} of {output_val:.1f}% applied."
        )

    top_rule = fired_rules[0]
    top_strength = top_rule["firing_strength"]
    top_text = top_rule["text"]
    rule_count = len(fired_rules)

    if rule_count == 1:
        rules_clause = f"Rule #{top_rule['id']} ('{top_text}') fired with strength {top_strength:.2f}"
    else:
        rules_clause = (
            f"Dominant Rule #{top_rule['id']} ('{top_text}') fired at {top_strength:.2f} "
            f"(along with {rule_count - 1} other active rule{'s' if rule_count > 2 else ''})"
        )

    explanation = (
        f"[{fis_name}] Given {inputs_summary}, {rules_clause}. "
        f"Defuzzified {output_var} is {output_val:.1f}%."
    )

    if payload.get("coordination_applied", False):
        orig_val = payload.get("pre_coordination_output", output_val)
        cap = payload.get("coordination_cap", 60.0)
        explanation += f" Device coordination rule engaged (AC > 60%): output capped from {orig_val:.1f}% to {cap:.1f}%."

    return explanation

