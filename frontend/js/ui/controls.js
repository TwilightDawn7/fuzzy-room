/**
 * UI Controls Manager: Binds HTML control elements to WebSocket commands.
 * Handles AUTO/MANUAL modes, setpoint, sim speed, disturbances, scenarios, and resets.
 */

export class ControlsManager {
  constructor(socketClient) {
    this.socket = socketClient;
    this.mode = 'AUTO';
    this.isDragging = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.btnAuto = document.getElementById('btnAuto');
    this.btnManual = document.getElementById('btnManual');
    this.manualControls = document.getElementById('manualControls');

    this.sliderSetpoint = document.getElementById('sliderSetpoint');
    this.valSetpoint = document.getElementById('valSetpoint');

    this.sliderSpeed = document.getElementById('sliderSpeed');
    this.valSpeed = document.getElementById('valSpeed');

    this.sliderOutsideTemp = document.getElementById('sliderOutsideTemp');
    this.valOutsideTemp = document.getElementById('valOutsideTemp');

    this.sliderPeople = document.getElementById('sliderPeople');
    this.valPeople = document.getElementById('valPeople');

    this.sliderManualFan = document.getElementById('sliderManualFan');
    this.valManualFan = document.getElementById('valManualFan');

    this.sliderManualAC = document.getElementById('sliderManualAC');
    this.valManualAC = document.getElementById('valManualAC');

    this.btnWindow = document.getElementById('btnWindow');
    this.btnSun = document.getElementById('btnSun');
    this.btnReset = document.getElementById('btnReset');

    this.scenarioBtns = document.querySelectorAll('.btn-scenario');
  }

  bindEvents() {
    // Mode Switching
    if (this.btnAuto && this.btnManual) {
      this.btnAuto.addEventListener('click', () => this.setMode('AUTO'));
      this.btnManual.addEventListener('click', () => this.setMode('MANUAL'));
    }

    // Setpoint Slider
    if (this.sliderSetpoint) {
      this.sliderSetpoint.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valSetpoint) this.valSetpoint.textContent = `${val.toFixed(1)} °C`;
      });
      this.sliderSetpoint.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        this.socket.send({ action: 'set_setpoint', setpoint: val });
      });
    }

    // Simulation Speed Slider
    if (this.sliderSpeed) {
      this.sliderSpeed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valSpeed) this.valSpeed.textContent = `${val.toFixed(1)}x`;
      });
      this.sliderSpeed.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        this.socket.send({ action: 'set_sim_speed', speed: val });
      });
    }

    // Outside Temperature Slider
    if (this.sliderOutsideTemp) {
      this.sliderOutsideTemp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valOutsideTemp) this.valOutsideTemp.textContent = `${val.toFixed(1)} °C`;
      });
      this.sliderOutsideTemp.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        this.socket.send({ action: 'set_disturbances', outside_temp: val });
      });
    }

    // People Count Slider
    if (this.sliderPeople) {
      this.sliderPeople.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.valPeople) this.valPeople.textContent = `${val}`;
      });
      this.sliderPeople.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        this.socket.send({ action: 'set_disturbances', num_people: val });
      });
    }

    // Manual Fan Override Slider
    if (this.sliderManualFan) {
      this.sliderManualFan.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valManualFan) this.valManualFan.textContent = `${Math.round(val)}%`;
        if (this.mode === 'MANUAL') {
          this.socket.send({ action: 'set_manual', fan_speed: val });
        }
      });
    }

    // Manual AC Override Slider
    if (this.sliderManualAC) {
      this.sliderManualAC.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valManualAC) this.valManualAC.textContent = `${Math.round(val)}%`;
        if (this.mode === 'MANUAL') {
          this.socket.send({ action: 'set_manual', ac_power: val });
        }
      });
    }

    // Window Toggle
    if (this.btnWindow) {
      this.btnWindow.addEventListener('click', () => {
        const isCurrentlyOpen = this.btnWindow.classList.contains('active');
        const newState = !isCurrentlyOpen;
        this.socket.send({ action: 'set_disturbances', window_open: newState });
        this.updateWindowButton(newState);
      });
    }

    // Sun Toggle
    if (this.btnSun) {
      this.btnSun.addEventListener('click', () => {
        const isCurrentlyOn = this.btnSun.classList.contains('active');
        const newState = !isCurrentlyOn;
        this.socket.send({ action: 'set_disturbances', sun_on: newState, sun_intensity: newState ? 1.0 : 0.0 });
        this.updateSunButton(newState);
      });
    }

    // Reset Simulation
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        this.socket.send({ action: 'reset' });
      });
    }

    // Scenarios
    this.scenarioBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenario = btn.dataset.scenario;
        this.socket.send({ action: 'load_scenario', scenario: scenario });
        this.highlightScenario(btn);
      });
    });

    // Track dragging to avoid fighting WebSocket telemetry updates
    const sliders = [this.sliderSetpoint, this.sliderSpeed, this.sliderOutsideTemp, this.sliderPeople, this.sliderManualFan, this.sliderManualAC];
    sliders.forEach((s) => {
      if (s) {
        s.addEventListener('mousedown', () => { this.isDragging = true; });
        s.addEventListener('mouseup', () => { this.isDragging = false; });
        s.addEventListener('touchstart', () => { this.isDragging = true; });
        s.addEventListener('touchend', () => { this.isDragging = false; });
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.socket.send({ action: 'set_mode', mode: mode });

    if (mode === 'AUTO') {
      this.btnAuto?.classList.add('active');
      this.btnManual?.classList.remove('active');
      if (this.manualControls) this.manualControls.style.display = 'none';
    } else {
      this.btnManual?.classList.add('active');
      this.btnAuto?.classList.remove('active');
      if (this.manualControls) this.manualControls.style.display = 'block';
    }
  }

  updateWindowButton(isOpen) {
    if (!this.btnWindow) return;
    if (isOpen) {
      this.btnWindow.classList.add('active');
      this.btnWindow.textContent = '🪟 Window: OPEN';
      this.btnWindow.style.borderColor = 'var(--cyan-accent)';
      this.btnWindow.style.color = 'var(--cyan-accent)';
    } else {
      this.btnWindow.classList.remove('active');
      this.btnWindow.textContent = '🪟 Window: Closed';
      this.btnWindow.style.borderColor = '';
      this.btnWindow.style.color = '';
    }
  }

  updateSunButton(isOn) {
    if (!this.btnSun) return;
    if (isOn) {
      this.btnSun.classList.add('active');
      this.btnSun.textContent = '☀️ Sun: ON';
      this.btnSun.style.borderColor = 'var(--orange-accent)';
      this.btnSun.style.color = 'var(--orange-accent)';
    } else {
      this.btnSun.classList.remove('active');
      this.btnSun.textContent = '☀️ Sun: OFF';
      this.btnSun.style.borderColor = '';
      this.btnSun.style.color = '';
    }
  }

  highlightScenario(activeBtn) {
    this.scenarioBtns.forEach((b) => b.classList.remove('active'));
    activeBtn.classList.add('active');
    setTimeout(() => activeBtn.classList.remove('active'), 2500);
  }

  /**
   * Sync telemetry updates to UI without interrupting user interactions.
   */
  updateFromTelemetry(payload) {
    if (!payload) return;

    // Sync mode
    if (payload.mode && payload.mode !== this.mode) {
      this.mode = payload.mode;
      if (this.mode === 'AUTO') {
        this.btnAuto?.classList.add('active');
        this.btnManual?.classList.remove('active');
        if (this.manualControls) this.manualControls.style.display = 'none';
      } else {
        this.btnManual?.classList.add('active');
        this.btnAuto?.classList.remove('active');
        if (this.manualControls) this.manualControls.style.display = 'block';
      }
    }

    if (!this.isDragging) {
      if (payload.setpoint !== undefined && this.sliderSetpoint && document.activeElement !== this.sliderSetpoint) {
        this.sliderSetpoint.value = payload.setpoint;
        if (this.valSetpoint) this.valSetpoint.textContent = `${payload.setpoint.toFixed(1)} °C`;
      }

      if (payload.sim_speed !== undefined && this.sliderSpeed && document.activeElement !== this.sliderSpeed) {
        this.sliderSpeed.value = payload.sim_speed;
        if (this.valSpeed) this.valSpeed.textContent = `${payload.sim_speed.toFixed(1)}x`;
      }

      if (payload.disturbances) {
        const d = payload.disturbances;
        if (d.outside_temp !== undefined && this.sliderOutsideTemp && document.activeElement !== this.sliderOutsideTemp) {
          this.sliderOutsideTemp.value = d.outside_temp;
          if (this.valOutsideTemp) this.valOutsideTemp.textContent = `${d.outside_temp.toFixed(1)} °C`;
        }

        if (d.num_people !== undefined && this.sliderPeople && document.activeElement !== this.sliderPeople) {
          this.sliderPeople.value = d.num_people;
          if (this.valPeople) this.valPeople.textContent = `${d.num_people}`;
        }

        if (d.window_open !== undefined) {
          this.updateWindowButton(d.window_open);
        }

        if (d.sun_on !== undefined) {
          this.updateSunButton(d.sun_on);
        }
      }
    }
  }
}

