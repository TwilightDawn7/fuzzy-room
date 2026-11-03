"""Headless scenario simulation and validation runner.

Runs the three benchmark scenarios:
1. Hot Afternoon (Outside 40°C, Sun ON)
2. Party (8 occupants, humidity surge)
3. Window Opened (sudden infiltration disturbance)

Compares Mamdani Fuzzy Logic Controller against Bang-Bang Thermostat baseline
and saves publication-quality comparison figures.
"""

import os
import sys
from typing import Dict, List, Tuple, Any

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import numpy as np
import matplotlib
matplotlib.use("Agg")  # Non-interactive headless backend
import matplotlib.pyplot as plt

from backend.simulation.engine import SimulationEngine
import backend.config as cfg


def run_scenario(
    name: str,
    duration_sec: float,
    setpoint: float,
    initial_temp: float,
    initial_hum: float,
    disturbance_schedule: Any,
) -> Dict[str, Any]:
    """Execute a headless simulation scenario over time."""
    sim = SimulationEngine(
        setpoint_temp=setpoint,
        initial_temp=initial_temp,
        initial_humidity=initial_hum,
    )
    sim.sim_speed = 1.0  # Exact 1x physical time step for accurate benchmarking

    dt = cfg.SIM_DT
    steps = int(duration_sec / dt)

    records = {
        "time": [],
        "fuzzy_temp": [],
        "fuzzy_hum": [],
        "fuzzy_ac": [],
        "fuzzy_fan": [],
        "fuzzy_energy": [],
        "base_temp": [],
        "base_hum": [],
        "base_ac": [],
        "base_fan": [],
        "base_energy": [],
        "outside_temp": [],
        "setpoint": [],
    }

    for step in range(steps):
        t = step * dt
        # Apply dynamic disturbance schedule
        disturbance_schedule(sim, t)

        payload = sim.step(dt)

        records["time"].append(t)
        records["fuzzy_temp"].append(payload["sensor"]["temperature"])
        records["fuzzy_hum"].append(payload["sensor"]["humidity"])
        records["fuzzy_ac"].append(payload["ac"]["current_power"])
        records["fuzzy_fan"].append(payload["fan"]["current_speed"])
        records["fuzzy_energy"].append(payload["energy_kwh"])

        records["base_temp"].append(payload["baseline"]["sensor_temp"])
        records["base_hum"].append(payload["baseline"]["sensor_humidity"])
        records["base_ac"].append(payload["baseline"]["ac_power"])
        records["base_fan"].append(payload["baseline"]["fan_speed"])
        records["base_energy"].append(payload["baseline"]["energy_kwh"])

        records["outside_temp"].append(payload["disturbances"]["outside_temp"])
        records["setpoint"].append(setpoint)

    summary = {
        "name": name,
        "duration_sec": duration_sec,
        "fuzzy_comfort_pct": sim.comfort_percentage,
        "base_comfort_pct": sim.thermostat.comfort_percentage,
        "fuzzy_final_energy_kwh": sim.total_energy_kwh,
        "base_final_energy_kwh": sim.thermostat.total_energy_kwh,
        "base_switch_count": sim.thermostat.switch_count,
        "records": records,
    }
    return summary


def plot_scenario_results(summary: Dict[str, Any], save_path: str) -> None:
    """Generate 4-panel diagnostic comparison plot."""
    rec = summary["records"]
    t = rec["time"]
    setpoint = rec["setpoint"][0]

    plt.style.use("dark_background")
    fig, axs = plt.subplots(4, 1, figsize=(11, 13), sharex=True)
    fig.patch.set_facecolor("#0a0e17")

    for ax in axs:
        ax.set_facecolor("#111827")
        ax.grid(True, color="#1f293d", linestyle="--", alpha=0.7)
        ax.tick_params(colors="#94a3b8")
        for spine in ax.spines.values():
            spine.set_color("#334155")

    # 1. Temperature Plot
    axs[0].plot(t, rec["outside_temp"], label="Outside Temp", color="#fb923c", linestyle=":", linewidth=1.5)
    axs[0].axhline(setpoint, label=f"Setpoint ({setpoint}°C)", color="#a78bfa", linestyle="--", linewidth=1.5)
    axs[0].fill_between(
        t,
        setpoint - cfg.COMFORT_TOLERANCE_TEMP,
        setpoint + cfg.COMFORT_TOLERANCE_TEMP,
        color="#a78bfa",
        alpha=0.15,
        label="±1.0°C Comfort Band",
    )
    axs[0].plot(t, rec["base_temp"], label="Bang-Bang Thermostat", color="#ef4444", linewidth=1.8, alpha=0.85)
    axs[0].plot(t, rec["fuzzy_temp"], label="Fuzzy Logic Controller", color="#22d3ee", linewidth=2.2)
    axs[0].set_ylabel("Temperature (°C)", color="#e2e8f0", fontsize=11)
    axs[0].set_title(
        f"Scenario: {summary['name']} | Thermal Response & Comfort Comparison",
        color="#f8fafc",
        fontsize=13,
        pad=10,
        fontweight="bold",
    )
    axs[0].legend(loc="upper right", facecolor="#1e293b", edgecolor="#334155", fontsize=9)

    # 2. Relative Humidity Plot
    axs[1].plot(t, rec["base_hum"], label="Bang-Bang Baseline", color="#ef4444", linewidth=1.6, alpha=0.85)
    axs[1].plot(t, rec["fuzzy_hum"], label="Fuzzy Controller", color="#38bdf8", linewidth=2.0)
    axs[1].set_ylabel("Humidity (%)", color="#e2e8f0", fontsize=11)
    axs[1].legend(loc="upper right", facecolor="#1e293b", edgecolor="#334155", fontsize=9)

    # 3. Actuator Power / Speeds
    axs[2].plot(t, rec["base_ac"], label="Bang-Bang AC (0/100%)", color="#f87171", linestyle="--", linewidth=1.4)
    axs[2].plot(t, rec["fuzzy_ac"], label="Fuzzy AC Cooling Power %", color="#22d3ee", linewidth=2.0)
    axs[2].plot(t, rec["fuzzy_fan"], label="Fuzzy Fan Speed %", color="#a78bfa", linewidth=1.8)
    axs[2].set_ylabel("Actuator Level (%)", color="#e2e8f0", fontsize=11)
    axs[2].set_ylim(-5, 105)
    axs[2].legend(loc="upper right", facecolor="#1e293b", edgecolor="#334155", fontsize=9)

    # 4. Energy Consumption
    axs[3].plot(t, rec["base_energy"], label=f"Bang-Bang Total ({summary['base_final_energy_kwh']:.3f} kWh)", color="#ef4444", linewidth=1.8)
    axs[3].plot(t, rec["fuzzy_energy"], label=f"Fuzzy Total ({summary['fuzzy_final_energy_kwh']:.3f} kWh)", color="#10b981", linewidth=2.2)
    axs[3].set_ylabel("Energy (kWh)", color="#e2e8f0", fontsize=11)
    axs[3].set_xlabel("Time (seconds)", color="#e2e8f0", fontsize=11)
    axs[3].legend(loc="upper left", facecolor="#1e293b", edgecolor="#334155", fontsize=9)

    # Annotate metrics box
    metrics_text = (
        f"Fuzzy Comfort: {summary['fuzzy_comfort_pct']:.1f}% | Energy: {summary['fuzzy_final_energy_kwh']:.3f} kWh\n"
        f"Bang-Bang Comfort: {summary['base_comfort_pct']:.1f}% | Energy: {summary['base_final_energy_kwh']:.3f} kWh\n"
        f"Thermostat Relay Switches: {summary['base_switch_count']} cycles"
    )
    axs[3].text(
        0.98,
        0.08,
        metrics_text,
        transform=axs[3].transAxes,
        ha="right",
        va="bottom",
        fontsize=9,
        bbox=dict(boxstyle="round,pad=0.5", facecolor="#0f172a", edgecolor="#38bdf8", alpha=0.9),
    )

    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=160, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close()
    print(f"Saved plot: {save_path}")


def run_all_scenarios() -> None:
    output_dir = os.path.join(os.path.dirname(__file__), "..", "notebooks")
    os.makedirs(output_dir, exist_ok=True)

    print("\n=======================================================")
    print("   RUNNING HEADLESS VALIDATION SCENARIOS")
    print("=======================================================\n")

    # ------------------------------------------------------------------
    # Scenario 1: Hot Afternoon (Outside 40°C, Sun ON)
    # ------------------------------------------------------------------
    def sched_hot_afternoon(sim: SimulationEngine, t: float):
        sim.disturbances.update_disturbances(
            outside_temp=40.0,
            outside_humidity=45.0,
            sun_on=True,
            sun_intensity=1.0,
            num_people=1,
            window_open=False,
        )

    print("Running Scenario 1: Hot Afternoon...")
    res1 = run_scenario(
        name="Hot Afternoon (Outside 40°C, Sun ON)",
        duration_sec=250.0,
        setpoint=24.0,
        initial_temp=32.0,
        initial_hum=55.0,
        disturbance_schedule=sched_hot_afternoon,
    )
    plot_scenario_results(res1, os.path.join(output_dir, "scenario_1_hot_afternoon.png"))
    print(f"  Fuzzy: Comfort={res1['fuzzy_comfort_pct']:.1f}%, Energy={res1['fuzzy_final_energy_kwh']:.3f} kWh")
    print(f"  Bang-Bang: Comfort={res1['base_comfort_pct']:.1f}%, Energy={res1['base_final_energy_kwh']:.3f} kWh, Switches={res1['base_switch_count']}")

    # ------------------------------------------------------------------
    # Scenario 2: Party (8 Occupants entering, humidity rising)
    # ------------------------------------------------------------------
    def sched_party(sim: SimulationEngine, t: float):
        # 8 people arrive at t=40s
        people = 8 if t >= 40.0 else 1
        sim.disturbances.update_disturbances(
            outside_temp=30.0,
            outside_humidity=60.0,
            sun_on=False,
            num_people=people,
            window_open=False,
        )

    print("\nRunning Scenario 2: Party (Occupant & Humidity Surge)...")
    res2 = run_scenario(
        name="Party (8 Occupants Surge at t=40s)",
        duration_sec=250.0,
        setpoint=22.0,
        initial_temp=24.0,
        initial_hum=50.0,
        disturbance_schedule=sched_party,
    )
    plot_scenario_results(res2, os.path.join(output_dir, "scenario_2_party.png"))
    print(f"  Fuzzy: Comfort={res2['fuzzy_comfort_pct']:.1f}%, Energy={res2['fuzzy_final_energy_kwh']:.3f} kWh")
    print(f"  Bang-Bang: Comfort={res2['base_comfort_pct']:.1f}%, Energy={res2['base_final_energy_kwh']:.3f} kWh, Switches={res2['base_switch_count']}")

    # ------------------------------------------------------------------
    # Scenario 3: Window Opened (Sudden infiltration disturbance)
    # ------------------------------------------------------------------
    def sched_window(sim: SimulationEngine, t: float):
        # Window open between t=50s and t=130s
        win_open = (50.0 <= t <= 130.0)
        sim.disturbances.update_disturbances(
            outside_temp=38.0,
            outside_humidity=75.0,
            sun_on=True,
            sun_intensity=0.8,
            num_people=1,
            window_open=win_open,
        )

    print("\nRunning Scenario 3: Window Opened (Sudden Infiltration)...")
    res3 = run_scenario(
        name="Window Opened (Open t=50s to 130s, Outside 38°C)",
        duration_sec=250.0,
        setpoint=24.0,
        initial_temp=24.2,
        initial_hum=52.0,
        disturbance_schedule=sched_window,
    )
    plot_scenario_results(res3, os.path.join(output_dir, "scenario_3_window_opened.png"))
    print(f"  Fuzzy: Comfort={res3['fuzzy_comfort_pct']:.1f}%, Energy={res3['fuzzy_final_energy_kwh']:.3f} kWh")
    print(f"  Bang-Bang: Comfort={res3['base_comfort_pct']:.1f}%, Energy={res3['base_final_energy_kwh']:.3f} kWh, Switches={res3['base_switch_count']}")

    print("\nAll 3 scenarios simulated and plots saved successfully!")


if __name__ == "__main__":
    run_all_scenarios()
