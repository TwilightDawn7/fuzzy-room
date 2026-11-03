/**
 * Horizontal Reasoning Flow Pipeline Strip:
 * Lights up stages in sequence (Crisp Input ➜ Fuzzify ➜ Rules ➜ Aggregate ➜ Defuzzify ➜ Actuator)
 * and controls the "Explain Decision" modal narrative.
 */

export class ReasoningPipeline {
  constructor(pipelineElement, modalElement) {
    this.container = pipelineElement;
    this.modal = modalElement;

    this.stageElements = {
      crisp: document.getElementById('pipeStageCrisp'),
      fuzzify: document.getElementById('pipeStageFuzzify'),
      rules: document.getElementById('pipeStageRules'),
      aggregate: document.getElementById('pipeStageAggregate'),
      defuzzify: document.getElementById('pipeStageDefuzzify'),
      actuator: document.getElementById('pipeStageActuator'),
    };

    this.stageSubtext = {
      crisp: document.getElementById('pipeSubCrisp'),
      fuzzify: document.getElementById('pipeSubFuzzify'),
      rules: document.getElementById('pipeSubRules'),
      aggregate: document.getElementById('pipeSubAggregate'),
      defuzzify: document.getElementById('pipeSubDefuzzify'),
      actuator: document.getElementById('pipeSubActuator'),
    };

    this.btnExplain = document.getElementById('btnExplainDecision');
    this.closeModalBtn = document.getElementById('closeExplainModalBtn');
    this.explainContent = document.getElementById('explainModalContent');

    this.latestPayload = null;
    this.bindEvents();
  }

  bindEvents() {
    if (this.btnExplain) {
      this.btnExplain.addEventListener('click', () => this.showModal());
    }

    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => this.hideModal());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.hideModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && this.modal.classList.contains('visible')) {
        this.hideModal();
      }
    });
  }

  showModal() {
    if (!this.modal) return;
    this.renderExplanation();
    this.modal.classList.add('visible');
  }

  hideModal() {
    if (!this.modal) return;
    this.modal.classList.remove('visible');
  }

  update(payload) {
    if (!payload || !payload.fuzzy) return;
    this.latestPayload = payload;

    const sensor = payload.sensor || {};
    const fuzzy = payload.fuzzy;
    const fan = fuzzy.fan || {};
    const ac = fuzzy.ac || {};

    // 1. Crisp Inputs stage
    if (this.stageSubtext.crisp && sensor.temperature !== undefined) {
      this.stageSubtext.crisp.textContent = `${sensor.temperature.toFixed(1)}°C, ${sensor.humidity.toFixed(0)}%`;
    }

    // 2. Fuzzification stage (highlight dominant sets)
    if (this.stageSubtext.fuzzify && fan.memberships && fan.memberships.temperature) {
      const topTemp = Object.entries(fan.memberships.temperature)
        .sort((a, b) => b[1] - a[1])[0];
      if (topTemp && topTemp[1] > 0) {
        this.stageSubtext.fuzzify.textContent = `μ(${topTemp[0]})=${topTemp[1].toFixed(2)}`;
      }
    }

    // 3. Rule Evaluation stage (fired count)
    if (this.stageSubtext.rules && fan.rules && ac.rules) {
      const firedFan = fan.rules.filter(r => r.firing_strength > 0.001).length;
      const firedAc = ac.rules.filter(r => r.firing_strength > 0.001).length;
      this.stageSubtext.rules.textContent = `${firedFan + firedAc} Fired (Max)`;
    }

    // 4. Aggregation stage
    if (this.stageSubtext.aggregate) {
      this.stageSubtext.aggregate.textContent = `Max Envelope`;
    }

    // 5. Defuzzification stage (Centroid)
    if (this.stageSubtext.defuzzify && fan.centroid_x !== undefined) {
      this.stageSubtext.defuzzify.textContent = `Fan ${fan.centroid_x.toFixed(0)}% | AC ${ac.centroid_x.toFixed(0)}%`;
    }

    // 6. Actuators stage
    if (this.stageSubtext.actuator && payload.fan && payload.ac) {
      const fanSpeed = payload.fan.current_speed !== undefined ? payload.fan.current_speed : (payload.fan.speed_percent || 0);
      const acPower = payload.ac.current_power !== undefined ? payload.ac.current_power : (payload.ac.power_percent || 0);
      const capTag = fan.coordination_applied ? ' [CAP]' : '';
      this.stageSubtext.actuator.textContent = `F:${Math.round(fanSpeed)}%${capTag} A:${Math.round(acPower)}%`;
    }

    // Micro-pulse animation across stages
    Object.values(this.stageElements).forEach((el) => {
      if (el) {
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 150);
      }
    });
  }

  renderExplanation() {
    if (!this.explainContent || !this.latestPayload) return;

    const p = this.latestPayload;
    const fuzzy = p.fuzzy || {};
    const fan = fuzzy.fan || {};
    const ac = fuzzy.ac || {};
    const sensor = p.sensor || {};
    const setpoint = p.setpoint || 24.0;
    const tempError = (sensor.temperature - setpoint).toFixed(2);

    let html = `
      <div class="explain-section">
        <h4 style="color: var(--cyan-accent); margin-bottom: 8px;">1. Real-Time Physical State</h4>
        <p style="font-size: 13px; line-height: 1.6; color: var(--text-main);">
          Occupant sensor sampled room temperature at <strong style="color: #fb923c;">${sensor.temperature.toFixed(2)} °C</strong>
          and humidity at <strong style="color: #38bdf8;">${sensor.humidity.toFixed(1)} %</strong>.
          The target setpoint is <strong>${setpoint.toFixed(1)} °C</strong>, resulting in a temperature error of
          <strong style="color: ${tempError >= 0 ? '#fb923c' : '#38bdf8'};">${tempError > 0 ? '+' : ''}${tempError} °C</strong>.
        </p>
      </div>

      <div class="explain-section" style="margin-top: 14px;">
        <h4 style="color: var(--violet-accent); margin-bottom: 8px;">2. Air Conditioner Mamdani Inference</h4>
        <div class="explain-quote">
          ${ac.explanation || 'Evaluating AC FIS rules...'}
        </div>
        <div style="font-size: 12px; margin-top: 6px; color: var(--text-muted); font-family: var(--font-mono);">
          Defuzzification Comparison: Centroid = <strong>${ac.centroid_x}%</strong>, Bisector = <strong>${ac.bisector_x}%</strong>, MOM = <strong>${ac.mom_x}%</strong>.
        </div>
      </div>

      <div class="explain-section" style="margin-top: 14px;">
        <h4 style="color: var(--cyan-accent); margin-bottom: 8px;">3. Ceiling Fan Mamdani Inference</h4>
        <div class="explain-quote">
          ${fan.explanation || 'Evaluating Fan FIS rules...'}
        </div>
        <div style="font-size: 12px; margin-top: 6px; color: var(--text-muted); font-family: var(--font-mono);">
          Defuzzification Comparison: Centroid = <strong>${fan.centroid_x}%</strong>, Bisector = <strong>${fan.bisector_x}%</strong>, MOM = <strong>${fan.mom_x}%</strong>.
        </div>
      </div>
    `;

    if (fan.coordination_applied) {
      html += `
        <div class="explain-section" style="margin-top: 14px; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 10px; background: rgba(239, 68, 68, 0.08);">
          <h4 style="color: var(--red-accent); margin-bottom: 4px;">⚡ Device Coordination Policy Triggered</h4>
          <p style="font-size: 12px; line-height: 1.5; color: var(--text-main);">
            AC cooling power exceeds <strong>60%</strong> (${ac.output}%). Under the mutual cooperation rule, the ceiling fan speed has been automatically capped at
            <strong>60% (Medium)</strong> (down from its uncoordinated raw calculation of ${fan.pre_coordination_output}%) to prevent turbulent interference with the directional cold-air jet.
          </p>
        </div>
      `;
    }

    this.explainContent.innerHTML = html;
  }
}
