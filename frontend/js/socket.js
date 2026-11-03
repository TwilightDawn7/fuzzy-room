/**
 * WebSocket client communicating with FastAPI backend at 10 Hz.
 */

export class SimSocket {
  constructor(options = {}) {
    this.url = options.url || this.getDefaultUrl();
    this.onStateUpdate = options.onStateUpdate || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.socket = null;
    this.isConnected = false;
    this.reconnectTimeout = null;
    this.messageCount = 0;
    this.lastRateCheck = performance.now();
    this.hz = 0;

    this.connect();
  }

  getDefaultUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8000';
    return `${protocol}//${host}/ws`;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.onStatusChange(true);
        console.log('[SimSocket] Connected to backend at', this.url);
      };

      this.socket.onmessage = (event) => {
        this.messageCount++;
        const now = performance.now();
        if (now - this.lastRateCheck >= 1000) {
          this.hz = this.messageCount;
          this.messageCount = 0;
          this.lastRateCheck = now;
        }

        try {
          const data = JSON.parse(event.data);
          this.onStateUpdate(data, this.hz);
        } catch (e) {
          console.error('[SimSocket] Failed to parse payload:', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.onStatusChange(false);
        this.hz = 0;
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('[SimSocket] Error:', err);
        this.socket.close();
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 1500);
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  setMode(mode) {
    this.send({ action: 'set_mode', mode });
  }

  setSetpoint(setpoint) {
    this.send({ action: 'set_setpoint', setpoint: parseFloat(setpoint) });
  }

  setSimSpeed(speed) {
    this.send({ action: 'set_sim_speed', speed: parseFloat(speed) });
  }

  setDisturbances(disturbances) {
    this.send({ action: 'set_disturbances', ...disturbances });
  }

  loadScenario(scenario) {
    this.send({ action: 'load_scenario', scenario });
  }

  reset() {
    this.send({ action: 'reset' });
  }
}

