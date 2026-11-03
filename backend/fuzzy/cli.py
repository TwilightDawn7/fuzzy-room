"""Command-line interface to evaluate and inspect the Mamdani Fuzzy System."""

import argparse
import sys
from typing import Dict
from backend.fuzzy.controller import FuzzyRoomCoordinator
import backend.config as cfg


def ascii_bar(val: float, max_val: float = 1.0, length: int = 20) -> str:
    """Render a text progress bar."""
    filled = int(round(length * (val / max_val))) if max_val > 0 else 0
    filled = max(0, min(length, filled))
    return f"[{'#' * filled}{'.' * (length - filled)}] {val:5.2f}"


def print_fis_table(payload: Dict) -> None:
    """Print readable ASCII diagnostics for a FIS payload."""
    name = payload.get("name", "FIS")
    print(f"\n========================================================")
    print(f"  {name.upper()} DIAGNOSTICS")
    print(f"========================================================")

    # Inputs & Memberships
    print("\n--- Crisp Inputs & Linguistic Memberships ---")
    for var, val in payload.get("inputs", {}).items():
        print(f"\n* Variable: {var} = {val}")
        memberships = payload.get("memberships", {}).get(var, {})
        for term, deg in memberships.items():
            active_marker = "<- ACTIVE" if deg > 0.01 else ""
            print(f"    {term:<12} {ascii_bar(deg)} {active_marker}")

    # Active Rules
    print("\n--- Rule Executions (Fired Rules) ---")
    rules = payload.get("rules", [])
    fired_rules = [r for r in rules if r.get("fired", False)]
    if not fired_rules:
        print("    (No rules fired - using safe default)")
    else:
        for r in fired_rules:
            strength = r["firing_strength"]
            print(f"  [Rule {r['id']:02d}] Strength: {ascii_bar(strength, 1.0, 15)}")
            print(f"            {r['text']}")

    # Defuzzification Results
    out_var = payload.get("output_var", "output")
    out_val = payload.get("output", 0.0)
    centroid = payload.get("centroid_x", 0.0)
    print(f"\n--- Output & Defuzzification ---")
    print(f"  Crisp {out_var}: {out_val:.2f}%  {ascii_bar(out_val, 100.0, 25)}")
    print(f"  Calculated Centroid: {centroid:.2f}")

    # Natural Language Explanation
    print(f"\n--- Reasoning Summary ---")
    print(f"  {payload.get('explanation', '')}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fuzzy-Room CLI: Mamdani Fuzzy Inference Engine Inspector"
    )
    parser.add_argument(
        "--temp",
        type=float,
        default=28.5,
        help="Room temperature in Celsius (default: 28.5 C)",
    )
    parser.add_argument(
        "--humidity",
        type=float,
        default=65.0,
        help="Relative humidity in % (default: 65.0%)",
    )
    parser.add_argument(
        "--setpoint",
        type=float,
        default=cfg.DEFAULT_SETPOINT_TEMP,
        help=f"Target temperature setpoint (default: {cfg.DEFAULT_SETPOINT_TEMP} C)",
    )
    parser.add_argument(
        "--method",
        type=str,
        default="centroid",
        choices=["centroid", "bisector", "mom"],
        help="Defuzzification method (default: centroid)",
    )

    args = parser.parse_args()

    coordinator = FuzzyRoomCoordinator()
    result = coordinator.evaluate(
        temperature=args.temp,
        humidity=args.humidity,
        setpoint_temp=args.setpoint,
        defuzz_method=args.method,
    )

    print("\n" + "=" * 60)
    print(f"   FUZZY-ROOM CONTROLLER INSPECTION")
    print(f"   Inputs: Temp={args.temp:.1f} C, Humidity={args.humidity:.1f}%, Setpoint={args.setpoint:.1f} C")
    print(f"   Temperature Error: {args.temp - args.setpoint:+.1f} C")
    print("=" * 60)

    print_fis_table(result["ac_payload"])
    print_fis_table(result["fan_payload"])

    if result.get("coordination_applied", False):
        print("\n" + "*" * 60)
        print("  NOTICE: Device Coordination Rule Activated!")
        print(f"  AC Power > 60% -> Fan Speed capped at {cfg.FAN_SPEED_CAP}%.")
        print("*" * 60)

    print(f"\nFINAL DECISION: Fan Speed = {result['fan_speed']}%, AC Power = {result['ac_power']}%\n")


if __name__ == "__main__":
    main()
