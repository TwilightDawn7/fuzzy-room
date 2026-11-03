/**
 * Live Mamdani Rule Table / Matrix:
 * Displays all 12 rules for Fan or AC FIS with antecedents, min() T-norm calculation,
 * animated firing strength bars, and violet active glow.
 */

export class RulesTable {
  constructor(containerElement) {
    this.container = containerElement;
    this.filterFiredOnly = false;
    this.latestRules = [];
  }

  setFilter(firedOnly) {
    this.filterFiredOnly = firedOnly;
    this.render();
  }

  update(rules, isFan) {
    this.latestRules = rules || [];
    this.isFan = isFan;
    this.render();
  }

  render() {
    if (!this.container) return;

    const rules = this.latestRules;
    const filteredRules = this.filterFiredOnly
      ? rules.filter(r => r.firing_strength > 0.001)
      : rules;

    if (filteredRules.length === 0) {
      this.container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No rules currently fired.
        </div>
      `;
      return;
    }

    let html = '<div class="rules-list">';

    filteredRules.forEach((r) => {
      const isFired = r.firing_strength > 0.001;
      const strengthPercent = (r.firing_strength * 100).toFixed(1);
      const activeClass = isFired ? 'rule-card active-fired' : 'rule-card';

      // Antecedent display
      const anteEntries = Object.entries(r.antecedents || {});
      const anteText = anteEntries.map(([k, v]) => `<span class="term-badge" title="${k}: ${v}"><strong>${v}</strong></span>`).join(' <span class="op-and">∧</span> ');

      // Consequent display
      const consText = `<span class="cons-badge" title="${r.consequent_var}: ${r.consequent_set}">➜ <strong>${r.consequent_set}</strong></span>`;

      html += `
        <div class="${activeClass}" data-rule-id="${r.id}">
          <div class="rule-top-row">
            <div class="rule-id-badge">
              <span class="rule-indicator-dot ${isFired ? 'fired-dot' : ''}"></span>
              <strong>R${r.id}</strong>
            </div>
            <div class="rule-antecedents">
              ${anteText}
            </div>
            <div class="rule-consequent">
              ${consText}
            </div>
          </div>

          <div class="rule-strength-row">
            <div class="strength-bar-track">
              <div class="strength-bar-fill" style="width: ${strengthPercent}%;"></div>
            </div>
            <div class="strength-val ${isFired ? 'fired-text' : ''}">
              ${r.firing_strength.toFixed(3)}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    this.container.innerHTML = html;
  }
}
