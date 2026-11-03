/**
 * Canvas 2D Membership Function Renderer:
 * Renders linguistic variables, trapezoidal/triangular curves, shaded activation
 * areas, glowing crisp input needles, and term degree badges.
 */

export class MembershipCanvas {
  constructor(canvasElement, config) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.name = config.name || 'Variable';
    this.unit = config.unit || '';
    this.universe = config.universe || [0, 100];
    this.sets = config.sets || {};
    this.colors = config.colors || {
      Cold: '#38bdf8', Cool: '#22d3ee', Warm: '#fb923c', Hot: '#ef4444',
      Dry: '#fbbf24', Comfortable: '#10b981', Humid: '#38bdf8',
      Below: '#38bdf8', OnTarget: '#10b981', Above: '#fb923c', WayAbove: '#ef4444',
      Off: '#94a3b8', Slow: '#22d3ee', Medium: '#fb923c', Fast: '#a78bfa',
      Low: '#22d3ee', High: '#ef4444'
    };

    this.defaultColor = '#a78bfa';
    this.padding = { top: 22, right: 16, bottom: 24, left: 32 };
    this.crispValue = null;
    this.memberships = {};

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
    const height = rect.height > 0 ? rect.height : 140;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.displayWidth = width;
    this.displayHeight = height;
  }

  update(crispValue, memberships) {
    this.crispValue = crispValue;
    this.memberships = memberships || {};
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

  /**
   * Evaluate membership function value at x
   */
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

    // 1. Grid & Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Horizontal grid at y = 0.5 and y = 1.0
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

    // Baseline y = 0
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    const y0 = this.yToPx(0);
    ctx.beginPath();
    ctx.moveTo(this.padding.left, y0);
    ctx.lineTo(w - this.padding.right, y0);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0.0', this.padding.left - 4, y0 + 3);

    // X-Axis Ticks
    const [minX, maxX] = this.universe;
    const numTicks = 5;
    ctx.textAlign = 'center';
    for (let i = 0; i <= numTicks; i++) {
      const val = minX + (i / numTicks) * (maxX - minX);
      const px = this.xToPx(val);
      ctx.fillText(`${Math.round(val)}${this.unit}`, px, h - 8);
    }

    // 2. Draw Membership Sets
    const setKeys = Object.keys(this.sets);
    const numSamples = 120;
    const step = (maxX - minX) / numSamples;

    setKeys.forEach((setName) => {
      const [mfType, params] = this.sets[setName];
      const color = this.colors[setName] || this.defaultColor;
      const deg = this.memberships[setName] || 0.0;

      // Sample curve points
      const pts = [];
      for (let i = 0; i <= numSamples; i++) {
        const x = minX + i * step;
        const y = this.evaluateMF(mfType, params, x);
        pts.push({ x, y, px: this.xToPx(x), py: this.yToPx(y) });
      }

      // Shaded area clipped to degree if degree > 0
      if (deg > 0.005) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].px, y0);

        for (let i = 0; i < pts.length; i++) {
          const clampedY = Math.min(pts[i].y, deg);
          ctx.lineTo(pts[i].px, this.yToPx(clampedY));
        }

        ctx.lineTo(pts[pts.length - 1].px, y0);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, this.yToPx(deg), 0, y0);
        grad.addColorStop(0, hexToRgba(color, 0.45));
        grad.addColorStop(1, hexToRgba(color, 0.08));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // Full curve outline
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].px, pts[0].py);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].px, pts[i].py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = deg > 0.005 ? 2.0 : 1.2;
      ctx.stroke();

      // Set Name Label near peak
      let peakX = (params[1] + (params[2] !== undefined ? params[2] : params[1])) / 2;
      peakX = Math.max(minX + 2, Math.min(maxX - 2, peakX));
      const peakPx = this.xToPx(peakX);
      const labelY = this.yToPx(0.92) - 4;

      ctx.fillStyle = deg > 0.005 ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.font = deg > 0.005 ? 'bold 10px "Inter", sans-serif' : '9px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(setName, peakPx, labelY);

      ctx.restore();
    });

    // 3. Crisp Input Needle
    if (this.crispValue !== null && !isNaN(this.crispValue)) {
      const needleX = this.xToPx(this.crispValue);

      ctx.save();
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(needleX, this.padding.top);
      ctx.lineTo(needleX, y0);
      ctx.stroke();

      // Top indicator pin
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(needleX, this.padding.top, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Readout label
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0e17';
      const labelText = `${this.crispValue.toFixed(1)}${this.unit}`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(labelText).width;

      const badgeX = Math.max(this.padding.left + 15, Math.min(w - this.padding.right - 15, needleX));
      ctx.fillRect(badgeX - textWidth / 2 - 3, this.padding.top - 14, textWidth + 6, 12);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(badgeX - textWidth / 2 - 3, this.padding.top - 14, textWidth + 6, 12);

      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, badgeX, this.padding.top - 5);

      ctx.restore();
    }
  }
}

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

