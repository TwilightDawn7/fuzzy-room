/**
 * Real-Time Rolling Time Series Chart:
 * Tracks Temperature, Setpoint, Humidity, Fan Speed, and AC Power over a rolling 60-second window.
 * High-performance Canvas 2D implementation with glowing traces, gridlines, and tooltips.
 */

export class TimeSeriesChart {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.maxPoints = options.maxPoints || 300; // ~30-60s at 5-10 Hz
    this.padding = { top: 20, right: 35, bottom: 24, left: 35 };

    // Channels config
    this.channels = {
      temp: { name: 'Temperature', color: '#fb923c', visible: true, unit: '°C', min: 16, max: 36 },
      setpoint: { name: 'Setpoint', color: '#10b981', visible: true, unit: '°C', min: 16, max: 36, dashed: true },
      humidity: { name: 'Humidity', color: '#38bdf8', visible: true, unit: '%', min: 0, max: 100 },
      fan: { name: 'Fan Speed', color: '#22d3ee', visible: true, unit: '%', min: 0, max: 100 },
      ac: { name: 'AC Power', color: '#a78bfa', visible: true, unit: '%', min: 0, max: 100 },
    };

    // Data buffer
    this.history = [];
    this.hoverX = null;

    this.setupCanvasDPI();
    this.bindHoverEvents();
    window.addEventListener('resize', () => {
      this.setupCanvasDPI();
      this.render();
    });
  }

  setupCanvasDPI() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = rect.width > 0 ? rect.width : 600;
    const height = rect.height > 0 ? rect.height : 140;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.displayWidth = width;
    this.displayHeight = height;
  }

  bindHoverEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = null;
      this.render();
    });
  }

  toggleChannel(channelKey) {
    if (this.channels[channelKey]) {
      this.channels[channelKey].visible = !this.channels[channelKey].visible;
      this.render();
    }
  }

  pushData(point) {
    // point: { time, temp, setpoint, humidity, fan, ac }
    this.history.push(point);
    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const plotW = w - this.padding.left - this.padding.right;
    const plotH = h - this.padding.top - this.padding.bottom;
    const y0 = h - this.padding.bottom;

    // 1. Gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);

    // Horizontal lines (0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const py = this.padding.top + (1 - frac) * plotH;
      ctx.beginPath();
      ctx.moveTo(this.padding.left, py);
      ctx.lineTo(w - this.padding.right, py);
      ctx.stroke();

      // Left axis label: Temperature (16 to 36 C)
      const tVal = 16 + frac * 20;
      ctx.fillStyle = 'rgba(251, 146, 60, 0.6)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${tVal.toFixed(0)}°`, this.padding.left - 4, py + 3);

      // Right axis label: Percentage (0 to 100%)
      const pVal = frac * 100;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(`${pVal.toFixed(0)}%`, w - this.padding.right + 4, py + 3);
    }

    ctx.setLineDash([]);

    if (this.history.length < 2) return;

    // X coordinate mapping
    const getPx = (idx) => this.padding.left + (idx / (this.history.length - 1)) * plotW;

    // Y coordinate mapping
    const getPy = (val, min, max) => {
      const clamped = Math.max(min, Math.min(max, val));
      const frac = (clamped - min) / (max - min);
      return this.padding.top + (1 - frac) * plotH;
    };

    // 2. Draw Each Channel
    const channelKeys = ['humidity', 'fan', 'ac', 'setpoint', 'temp'];

    channelKeys.forEach((key) => {
      const ch = this.channels[key];
      if (!ch.visible) return;

      ctx.save();
      ctx.beginPath();

      for (let i = 0; i < this.history.length; i++) {
        const d = this.history[i];
        const val = d[key] !== undefined ? d[key] : 0;
        const px = getPx(i);
        const py = getPy(val, ch.min, ch.max);

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.strokeStyle = ch.color;
      ctx.lineWidth = (key === 'temp' || key === 'setpoint') ? 2.0 : 1.5;

      if (ch.dashed) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.stroke();
      ctx.restore();
    });

    // 3. Hover Crosshair & Tooltip
    if (this.hoverX !== null && this.hoverX >= this.padding.left && this.hoverX <= w - this.padding.right) {
      const frac = (this.hoverX - this.padding.left) / plotW;
      const idx = Math.min(this.history.length - 1, Math.max(0, Math.round(frac * (this.history.length - 1))));
      const dataPoint = this.history[idx];

      if (dataPoint) {
        const px = getPx(idx);

        // Vertical cursor
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(px, this.padding.top);
        ctx.lineTo(px, y0);
        ctx.stroke();

        // Tooltip box
        const lines = [
          `T: ${dataPoint.temp ? dataPoint.temp.toFixed(1) : '--'}°C (SP ${dataPoint.setpoint ? dataPoint.setpoint.toFixed(1) : '--'}°C)`,
          `H: ${dataPoint.humidity ? dataPoint.humidity.toFixed(0) : '--'}%`,
          `Fan: ${dataPoint.fan ? dataPoint.fan.toFixed(0) : '--'}% | AC: ${dataPoint.ac ? dataPoint.ac.toFixed(0) : '--'}%`
        ];

        ctx.setLineDash([]);
        ctx.font = '10px "JetBrains Mono", monospace';
        const boxW = 160;
        const boxH = 46;
        const boxX = Math.max(this.padding.left + 5, Math.min(w - this.padding.right - boxW - 5, px - boxW / 2));
        const boxY = this.padding.top + 4;

        ctx.fillStyle = 'rgba(10, 14, 23, 0.9)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(lines[0], boxX + 6, boxY + 14);
        ctx.fillStyle = 'var(--cyan-accent, #22d3ee)';
        ctx.fillText(lines[1], boxX + 6, boxY + 27);
        ctx.fillStyle = 'var(--violet-accent, #a78bfa)';
        ctx.fillText(lines[2], boxX + 6, boxY + 40);

        ctx.restore();
      }
    }
  }
}

