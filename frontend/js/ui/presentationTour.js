/**
 * Automated Presentation Mode & Cinematic Tour (Key P):
 * Walks through scenarios with smooth camera transitions and narrative caption banners.
 */
export class PresentationTour {
  constructor(app) {
    this.app = app;
    this.isActive = false;
    this.currentStep = 0;
    this.timer = null;

    this.steps = [
      {
        title: 'Welcome to Fuzzy-Room: 3D Digital Twin',
        desc: 'A full-stack physics room simulator controlled by a custom Mamdani Fuzzy Inference System written from scratch in NumPy.',
        preset: 'corner',
        scenario: null,
        duration: 5000,
      },
      {
        title: 'Scenario 1: Hot Afternoon (40°C, Solar Radiation)',
        desc: 'Outside temperature surges to 40°C with full sunlight. The AC ramps cooling to High, while the mutual coordination rule caps fan at 60% to avoid turbulence.',
        preset: 'front',
        scenario: 'hot_afternoon',
        duration: 8000,
      },
      {
        title: 'Scenario 2: Party Surge (8 Occupants)',
        desc: '8 people enter the room, generating 800W of sensible body heat and elevated moisture. AC dehumidification and ceiling fan mixing engage.',
        preset: 'top',
        scenario: 'party',
        duration: 8000,
      },
      {
        title: 'Scenario 3: Window Opened (Infiltration Disturbance)',
        desc: 'The window opens abruptly, inducing high convective infiltration from ambient air. The Fuzzy FIS smoothly compensates without oscillatory hunting.',
        preset: 'orbit',
        scenario: 'window_opened',
        duration: 8000,
      },
      {
        title: 'Mamdani Reasoning & Defuzzification',
        desc: 'Every 10 Hz step is fully visible: crisp inputs, fuzzified degrees, min T-norm rule firing, max aggregation, and centroid defuzzification.',
        preset: 'corner',
        scenario: null,
        duration: 7000,
      },
    ];

    this.createBannerElement();
    this.bindEvents();
  }

  createBannerElement() {
    this.banner = document.createElement('div');
    this.banner.className = 'glass-panel tour-banner';
    this.banner.style.display = 'none';
    this.banner.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div>
          <div style="font-size: 11px; font-weight: 700; color: var(--cyan-accent); text-transform: uppercase; margin-bottom: 2px;">
            🎬 PRESENTATION TOUR <span id="tourStepIndicator" style="color: var(--text-muted); font-size: 10px;">[1/5]</span>
          </div>
          <div id="tourTitle" style="font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px;"></div>
          <div id="tourDesc" style="font-size: 12px; color: var(--text-main); line-height: 1.4;"></div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="btnTourPrev" class="hud-btn" style="padding: 4px 8px;">◀</button>
          <button id="btnTourNext" class="hud-btn" style="padding: 4px 8px;">▶</button>
          <button id="btnTourExit" class="hud-btn" style="padding: 4px 8px; color: var(--red-accent);">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.banner);

    this.banner.querySelector('#btnTourNext').addEventListener('click', () => this.next());
    this.banner.querySelector('#btnTourPrev').addEventListener('click', () => this.prev());
    this.banner.querySelector('#btnTourExit').addEventListener('click', () => this.stop());
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toUpperCase() === 'P' && !e.target.matches('input, textarea')) {
        this.toggle();
      }
    });

    const btnTour = document.getElementById('btnStartTour');
    if (btnTour) {
      btnTour.addEventListener('click', () => this.toggle());
    }
  }

  toggle() {
    if (this.isActive) this.stop();
    else this.start();
  }

  start() {
    this.isActive = true;
    this.currentStep = 0;
    this.banner.style.display = 'block';
    this.runStep();
  }

  stop() {
    this.isActive = false;
    clearTimeout(this.timer);
    this.banner.style.display = 'none';
  }

  runStep() {
    if (!this.isActive) return;

    const s = this.steps[this.currentStep];
    const ind = this.banner.querySelector('#tourStepIndicator');
    const t = this.banner.querySelector('#tourTitle');
    const d = this.banner.querySelector('#tourDesc');

    if (ind) ind.textContent = `[${this.currentStep + 1}/${this.steps.length}]`;
    if (t) t.textContent = s.title;
    if (d) d.textContent = s.desc;

    // Apply camera preset
    if (s.preset && this.app.sceneMgr) {
      this.app.setCameraPreset(s.preset);
    }

    // Apply scenario if specified
    if (s.scenario && this.app.socket) {
      this.app.socket.loadScenario(s.scenario);
    }

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.next();
    }, s.duration);
  }

  next() {
    this.currentStep = (this.currentStep + 1) % this.steps.length;
    this.runStep();
  }

  prev() {
    this.currentStep = (this.currentStep - 1 + this.steps.length) % this.steps.length;
    this.runStep();
  }
}

