/**
 * Mamdani Output Aggregation & Defuzzification Canvas:
 * Plots individual clipped implication curves, combined max-aggregated fuzzy area,
 * vertical Centroid needle, Bisector dashed marker, and MOM dashed marker.
 */

export class AggregationCanvas {
  constructor(canvasElement, config = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.outputVar = config.outputVar || 'output';
    this.unit = config.unit || '%';
    this.universe = config.universe || [0, 100];
    this.outputSets = config.outputSets || {};

    this.padding = { top: 26, right: 16, bottom: 26, left: 32 };
    this.latestPayload = null;

    this.setupCanvasDPI();
    window.addEventListener('resize', () => {
      this.setupCanvasDPI();
      this.render();
    });
  }

  setupCanvasDPI() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = rect.width > 0 ? rect.width : 340;
    const height = rect.height > 0 ? rect.height : 150;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.displayWidth = width;
    this.displayHeight = height;
  }

  update(fuzzyPayload, outputSets) {
    this.latestPayload = fuzzyPayload;
    if (outputSets) this.outputSets = outputSets;
    this.render();
  }

  xToPx(x) {
    const [minX, maxX] = this.universe;
    const plotWidth = this.displayWidth - this.padding.left - this.padding.right;
    const clamped = Math.max(minX, Math.min(maxX, x));
    return this.padding.left + ((clamped - minX) / (maxX - minX)) * plotWidth;
  }

  yToPx(y) {
    const plotHeight = this.displayHeight - this.padding.top - this.padding.bottom;
    const clamped = Math.max(0, Math.min(1, y));
    return this.displayHeight - this.padding.bottom - clamped * plotHeight;
  }

  evaluateMF(mfType, params, x) {
    if (mfType === 'tri') {
      const [a, b, c] = params;
      if (x <= a || x >= c) return 0.0;
      if (x <= b) return (x - a) / (b - a);
      return (c - x) / (c - b);
    } else if (mfType === 'trap') {
      const [a, b, c, d] = params;
      if (x < b && a === b) return x <= b ? 1.0 : 0.0;
      if (x > c && c === d) return x >= c ? 1.0 : 0.0;
      if (x <= a || x >= d) return 0.0;
      if (x >= b && x <= c) return 1.0;
      if (x < b) return (x - a) / (b - a);
      return (d - x) / (d - c);
    }
    return 0.0;
  }

  render() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const [minX, maxX] = this.universe;
    const y0 = this.yToPx(0);

    // 1. Grid & Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    [0.5, 1.0].forEach((yVal) => {
      const py = this.yToPx(yVal);
      ctx.beginPath();
      ctx.moveTo(this.padding.left, py);
      ctx.lineTo(w - this.padding.right, py);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(yVal.toFixed(1), this.padding.left - 4, py + 3);
    });

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(this.padding.left, y0);
    ctx.lineTo(w - this.padding.right, y0);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0.0', this.padding.left - 4, y0 + 3);

    // X-Axis Ticks
    const numTicks = 5;
    ctx.textAlign = 'center';
    for (let i = 0; i <= numTicks; i++) {
      const val = minX + (i / numTicks) * (maxX - minX);
      const px = this.xToPx(val);
      ctx.fillText(`${Math.round(val)}${this.unit}`, px, h - 8);
    }

    if (!this.latestPayload) return;

    const { aggregated_curve, rules, centroid_x, bisector_x, mom_x, output, coordination_applied, pre_coordination_output } = this.latestPayload;

    // 2. Individual Clipped Implication Curves (Step 4: Implication)
    if (rules && this.outputSets) {
      const firedRules = rules.filter(r => r.firing_strength > 0.001);
      firedRules.forEach((r) => {
        const setName = r.consequent_set;
        const setDef = this.outputSets[setName];
        if (!setDef) return;

        const [mfType, params] = setDef;
        const clipHeight = r.firing_strength;
        const numSamples = 60;
        const step = (maxX - minX) / numSamples;

        ctx.save();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        let started = false;
        for (let i = 0; i <= numSamples; i++) {
          const x = minX + i * step;
          const rawY = this.evaluateMF(mfType, params, x);
          const clippedY = Math.min(rawY, clipHeight);
          const px = this.xToPx(x);
          const py = this.yToPx(clippedY);

          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        ctx.restore();
      });
    }

    // 3. Max-Aggregated Curve (Step 5: Aggregation)
    if (aggregated_curve && aggregated_curve.x && aggregated_curve.x.length > 0) {
      const xs = aggregated_curve.x;
      const ys = aggregated_curve.y;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(this.xToPx(xs[0]), y0);

      for (let i = 0; i < xs.length; i++) {
        ctx.lineTo(this.xToPx(xs[i]), this.yToPx(ys[i]));
      }

      ctx.lineTo(this.xToPx(xs[xs.length - 1]), y0);
      ctx.closePath();

      // Filled gradient
      const grad = ctx.createLinearGradient(0, this.padding.top, 0, y0);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
      grad.addColorStop(1, 'rgba(34, 211, 238, 0.05)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke outline
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        const px = this.xToPx(xs[i]);
        const py = this.yToPx(ys[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Defuzzification Comparison Markers (Step 6: Defuzzification)

    // A. Bisector (dashed orange)
    if (bisector_x !== undefined && !isNaN(bisector_x)) {
      const bx = this.xToPx(bisector_x);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, this.padding.top + 8);
      ctx.lineTo(bx, y0);
      ctx.stroke();
      ctx.restore();
    }

    // B. Mean-of-Maximum (MOM) (dashed violet)
    if (mom_x !== undefined && !isNaN(mom_x)) {
      const mx = this.xToPx(mom_x);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, this.padding.top + 8);
      ctx.lineTo(mx, y0);
      ctx.stroke();
      ctx.restore();
    }

    // C. Centroid (solid glowing cyan needle)
    if (centroid_x !== undefined && !isNaN(centroid_x)) {
      const cx = this.xToPx(centroid_x);

      ctx.save();
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.moveTo(cx, this.padding.top);
      ctx.lineTo(cx, y0);
      ctx.stroke();

      // Top indicator pin
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(cx, this.padding.top, 4, 0, Math.PI * 2);
      ctx.fill();

      // Centroid label badge
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0e17';
      const labelText = `Centroid: ${centroid_x.toFixed(1)}${this.unit}`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(labelText).width;

      const badgeX = Math.max(this.padding.left + 25, Math.min(w - this.padding.right - 25, cx));
      ctx.fillRect(badgeX - textWidth / 2 - 3, this.padding.top - 16, textWidth + 6, 13);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(badgeX - textWidth / 2 - 3, this.padding.top - 16, textWidth + 6, 13);

      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, badgeX, this.padding.top - 6);

      ctx.restore();
    }

    // D. Coordination Cap Marker if active
    if (coordination_applied && pre_coordination_output !== undefined) {
      const capX = this.xToPx(60.0);
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(capX, this.padding.top);
      ctx.lineTo(capX, y0);
      ctx.stroke();

      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ CAPPED 60%', capX, this.padding.top + 22);
      ctx.restore();
    }
  }
}

