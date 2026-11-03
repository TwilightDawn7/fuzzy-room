import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { SimSocket } from './socket.js';
import { RoomObject } from './objects/room.js';
import { FanObject } from './objects/fan.js';
import { ACObject } from './objects/ac.js';
import { PersonObject } from './objects/person.js';

// Phase 5 UI Imports
import { ControlsManager } from './ui/controls.js';
import { MembershipCanvas } from './ui/membershipCharts.js';
import { RulesTable } from './ui/rulesTable.js';
import { AggregationCanvas } from './ui/aggregationPlot.js';
import { TimeSeriesChart } from './ui/timeSeries.js';
import { ReasoningPipeline } from './ui/reasoningPipeline.js';

// Phase 6 Effects & Modals Imports
import { HeatmapEffect } from './effects/heatmap.js';
import { AirflowParticles } from './effects/airflow.js';
import { ControlSurfaceViewer } from './ui/controlSurface.js';
import { BenchmarkModal } from './ui/benchmarkModal.js';
import { PresentationTour } from './ui/presentationTour.js';

/**
 * Main application controller orchestrating 3D scene, live WebSocket stream,
 * Mamdani fuzzy reasoning panels, time series telemetry, and interactive inspection.
 */
class DigitalTwinApp {
  constructor() {
    this.webglContainer = document.getElementById('webgl-container');
    this.css2dContainer = document.getElementById('css2d-container');

    this.sceneMgr = null;
    this.socket = null;

    // 3D Objects
    this.room = null;
    this.fan = null;
    this.ac = null;
    this.person = null;

    // Phase 5 UI Managers
    this.controlsMgr = null;
    this.pipelineMgr = null;
    this.rulesTable = null;
    this.timeSeries = null;
    this.canvasInput1 = null;
    this.canvasInput2 = null;
    this.canvasAgg = null;

    // Phase 6 Effects & Modals Managers
    this.heatmap = null;
    this.airflow = null;
    this.surfaceViewer = null;
    this.benchmarkModal = null;
    this.tour = null;

    // Active Tab State ('fan' | 'ac')
    this.activeFISTab = 'fan';
    this.sysConfig = {
      universes: {
        temperature: [0, 50],
        humidity: [0, 100],
        temp_error: [-10, 15],
        fan_speed: [0, 100],
        ac_power: [0, 100]
      },
      membership_sets: {
        fan_temp: {
          Cold: ['trap', [0, 0, 10, 18]],
          Cool: ['tri', [12, 19, 26]],
          Warm: ['tri', [22, 28, 34]],
          Hot: ['trap', [30, 36, 50, 50]]
        },
        humidity: {
          Dry: ['trap', [0, 0, 25, 45]],
          Comfortable: ['tri', [30, 50, 70]],
          Humid: ['trap', [55, 75, 100, 100]]
        },
        fan_speed: {
          Off: ['trap', [0, 0, 5, 15]],
          Slow: ['tri', [10, 30, 50]],
          Medium: ['tri', [40, 60, 80]],
          Fast: ['trap', [70, 85, 100, 100]]
        },
        ac_temp_error: {
          Below: ['trap', [-10, -10, -3, 0]],
          OnTarget: ['tri', [-2, 0, 2]],
          Above: ['tri', [1, 4, 8]],
          WayAbove: ['trap', [6, 10, 15, 15]]
        },
        ac_power: {
          Off: ['trap', [0, 0, 5, 15]],
          Low: ['tri', [10, 30, 50]],
          Medium: ['tri', [40, 60, 80]],
          High: ['trap', [70, 85, 100, 100]]
        }
      }
    };

    // State cache
    this.latestState = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredObject = null;
    this.isDay = true;
    this.isPaused = false;

    this.init();
  }

  init() {
    // 1. Initialize Scene & Renderer
    this.sceneMgr = new SceneManager(this.webglContainer, this.css2dContainer);

    // 2. Build 3D Objects
    this.room = new RoomObject(this.sceneMgr.scene);
    this.fan = new FanObject(this.sceneMgr.scene, { position: new THREE.Vector3(0, 2.85, 0) });
    this.ac = new ACObject(this.sceneMgr.scene, { position: new THREE.Vector3(-2.85, 2.2, 0) });
    this.person = new PersonObject(this.sceneMgr.scene, { position: new THREE.Vector3(0.6, 0, 0.7) });

    // Phase 6 Volumetric Heatmap & Airflow Particles
    this.heatmap = new HeatmapEffect(this.sceneMgr.scene);
    this.airflow = new AirflowParticles(this.sceneMgr.scene);

    // 3. Initialize UI Components synchronously
    this.initUIComponents();
    this.initPhase6UI();
    this.initControls();
    this.initKeyboard();
    this.initRaycasting();

    // 4. Connect WebSocket
    this.socket = new SimSocket({
      onStateUpdate: (state, hz) => this.onTelemetry(state, hz),
      onStatusChange: (connected) => this.onConnectionChange(connected),
    });
    if (this.controlsMgr) {
      this.controlsMgr.socket = this.socket;
    }

    // 5. Start Animation Loop Immediately
    this.lastTime = performance.now();
    this.animate();

    // 6. Background fetch /config to refine parameters if needed
    this.fetchConfig();

    // 7. Check URL Hash for direct view (e.g. #surface, #benchmark, #explain)
    this.handleUrlHash();
  }

  handleUrlHash() {
    const hash = window.location.hash;
    if (hash === '#surface') {
      const surfaceBtn = document.getElementById('btnControlSurface');
      if (surfaceBtn) surfaceBtn.click();
    } else if (hash === '#benchmark') {
      const benchBtn = document.getElementById('btnBenchmark');
      if (benchBtn) benchBtn.click();
    } else if (hash === '#explain') {
      const explainBtn = document.getElementById('btnExplainDecision');
      if (explainBtn) explainBtn.click();
    }
  }

  async fetchConfig() {
    try {
      const res = await fetch('/config');
      if (res.ok) {
        this.sysConfig = await res.json();
      } else {
        const resFallback = await fetch('/api/config');
        if (resFallback.ok) this.sysConfig = await resFallback.json();
      }
    } catch (e) {
      console.warn('Could not fetch /config, using default parameters:', e);
      this.sysConfig = {
        universes: {
          temperature: [0, 50],
          humidity: [0, 100],
          temp_error: [-10, 15],
          fan_speed: [0, 100],
          ac_power: [0, 100]
        },
        membership_sets: {
          fan_temp: {
            Cold: ['trap', [0, 0, 10, 18]],
            Cool: ['tri', [12, 19, 26]],
            Warm: ['tri', [22, 28, 34]],
            Hot: ['trap', [30, 36, 50, 50]]
          },
          humidity: {
            Dry: ['trap', [0, 0, 25, 45]],
            Comfortable: ['tri', [30, 50, 70]],
            Humid: ['trap', [55, 75, 100, 100]]
          },
          fan_speed: {
            Off: ['trap', [0, 0, 5, 15]],
            Slow: ['tri', [10, 30, 50]],
            Medium: ['tri', [40, 60, 80]],
            Fast: ['trap', [70, 85, 100, 100]]
          },
          ac_temp_error: {
            Below: ['trap', [-10, -10, -3, 0]],
            OnTarget: ['tri', [-2, 0, 2]],
            Above: ['tri', [1, 4, 8]],
            WayAbove: ['trap', [6, 10, 15, 15]]
          },
          ac_power: {
            Off: ['trap', [0, 0, 5, 15]],
            Low: ['tri', [10, 30, 50]],
            Medium: ['tri', [40, 60, 80]],
            High: ['trap', [70, 85, 100, 100]]
          }
        }
      };
    }
  }

  initUIComponents() {
    // 1. Controls Manager (Left Panel)
    this.controlsMgr = new ControlsManager(this.socket);

    // 2. Reasoning Flow Pipeline (Top HUD & Explain Modal)
    const pipelineElem = document.getElementById('reasoningPipeline');
    const modalElem = document.getElementById('explainModal');
    this.pipelineMgr = new ReasoningPipeline(pipelineElem, modalElem);

    // 3. Membership Canvases (Fuzzification)
    const cInput1 = document.getElementById('canvasInput1');
    const cInput2 = document.getElementById('canvasInput2');
    const cAgg = document.getElementById('canvasAggregation');

    const u = this.sysConfig?.universes || {};
    const sets = this.sysConfig?.membership_sets || {};

    this.canvasInput1 = new MembershipCanvas(cInput1, {
      name: 'Temperature',
      unit: '°C',
      universe: u.temperature || [0, 50],
      sets: sets.fan_temp || {},
    });

    this.canvasInput2 = new MembershipCanvas(cInput2, {
      name: 'Humidity',
      unit: '%',
      universe: u.humidity || [0, 100],
      sets: sets.humidity || {},
    });

    // 4. Mamdani Rule Table
    const rulesContainer = document.getElementById('rulesContainer');
    this.rulesTable = new RulesTable(rulesContainer);

    const chkFired = document.getElementById('chkFiredOnly');
    if (chkFired) {
      chkFired.addEventListener('change', (e) => {
        this.rulesTable.setFilter(e.target.checked);
      });
    }

    // 5. Output Aggregation Canvas
    this.canvasAgg = new AggregationCanvas(cAgg, {
      outputVar: 'fan_speed',
      unit: '%',
      universe: u.fan_speed || [0, 100],
      outputSets: sets.fan_speed || {},
    });

    // 6. Time Series Chart (Rolling 60s)
    const cTime = document.getElementById('canvasTimeSeries');
    this.timeSeries = new TimeSeriesChart(cTime, { maxPoints: 300 });

    // Time Series Legend Toggles
    document.querySelectorAll('.legend-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const chKey = pill.dataset.channel;
        this.timeSeries.toggleChannel(chKey);
        pill.classList.toggle('active');
      });
    });

    // 7. FIS Tab Switching (Fan vs AC)
    const tabFan = document.getElementById('tabFanFIS');
    const tabAC = document.getElementById('tabACFIS');

    if (tabFan && tabAC) {
      tabFan.addEventListener('click', () => {
        this.activeFISTab = 'fan';
        tabFan.classList.add('active');
        tabAC.classList.remove('active');
        this.switchFISTab('fan');
      });

      tabAC.addEventListener('click', () => {
        this.activeFISTab = 'ac';
        tabAC.classList.add('active');
        tabFan.classList.remove('active');
        this.switchFISTab('ac');
      });
    }

    // 8. Panel Collapse Buttons
    this.initCollapseButtons();
  }

  initPhase6UI() {
    // 1. Heatmap Toggle
    const btnHeatmap = document.getElementById('btnToggleHeatmap');
    if (btnHeatmap) {
      btnHeatmap.addEventListener('click', () => {
        const isVisible = this.heatmap.toggle();
        btnHeatmap.classList.toggle('effect-active', isVisible);
      });
    }

    // 2. Airflow Particles Toggle
    const btnAirflow = document.getElementById('btnToggleAirflow');
    if (btnAirflow) {
      btnAirflow.addEventListener('click', () => {
        const isVisible = this.airflow.toggle();
        btnAirflow.classList.toggle('effect-active', isVisible);
      });
    }

    // 3. Control Surface Modal
    const btnSurface = document.getElementById('btnControlSurface');
    const surfaceModal = document.getElementById('surfaceModal');
    const closeSurfaceBtn = document.getElementById('closeSurfaceModalBtn');
    const surfaceContainer = document.getElementById('surfaceViewerContainer');

    if (btnSurface && surfaceModal) {
      btnSurface.addEventListener('click', () => {
        surfaceModal.classList.add('visible');
        if (!this.surfaceViewer && surfaceContainer) {
          this.surfaceViewer = new ControlSurfaceViewer(surfaceContainer);
        } else if (this.surfaceViewer) {
          this.surfaceViewer.resize();
        }
      });
    }

    if (closeSurfaceBtn && surfaceModal) {
      closeSurfaceBtn.addEventListener('click', () => {
        surfaceModal.classList.remove('visible');
      });
    }

    const btnSurfFan = document.getElementById('btnSurfaceFan');
    const btnSurfAC = document.getElementById('btnSurfaceAC');
    if (btnSurfFan && btnSurfAC) {
      btnSurfFan.addEventListener('click', () => {
        btnSurfFan.classList.add('active');
        btnSurfAC.classList.remove('active');
        if (this.surfaceViewer) this.surfaceViewer.setMode('fan');
      });
      btnSurfAC.addEventListener('click', () => {
        btnSurfAC.classList.add('active');
        btnSurfFan.classList.remove('active');
        if (this.surfaceViewer) this.surfaceViewer.setMode('ac');
      });
    }

    // 4. Benchmark Comparison Modal
    const benchmarkModalElem = document.getElementById('benchmarkModal');
    const btnBenchmark = document.getElementById('btnBenchmark');
    this.benchmarkModal = new BenchmarkModal(benchmarkModalElem, btnBenchmark);

    // 5. Automated Presentation Tour (Key P)
    this.tour = new PresentationTour(this);
  }

  switchFISTab(tabKey) {
    const u = this.sysConfig?.universes || {};
    const sets = this.sysConfig?.membership_sets || {};

    const lblInput1Title = document.getElementById('lblInput1Title');
    const lblAggTitle = document.getElementById('lblAggTitle');

    if (tabKey === 'fan') {
      if (lblInput1Title) lblInput1Title.textContent = 'Input 1: Temperature';
      if (lblAggTitle) lblAggTitle.textContent = 'Output: Fan Speed (Steps 4-6)';

      this.canvasInput1.name = 'Temperature';
      this.canvasInput1.unit = '°C';
      this.canvasInput1.universe = u.temperature || [0, 50];
      this.canvasInput1.sets = sets.fan_temp || {};

      this.canvasAgg.outputVar = 'fan_speed';
      this.canvasAgg.universe = u.fan_speed || [0, 100];
      this.canvasAgg.outputSets = sets.fan_speed || {};
    } else {
      if (lblInput1Title) lblInput1Title.textContent = 'Input 1: Temp Error (T - Setpoint)';
      if (lblAggTitle) lblAggTitle.textContent = 'Output: AC Cooling Power (Steps 4-6)';

      this.canvasInput1.name = 'Temp Error';
      this.canvasInput1.unit = '°C';
      this.canvasInput1.universe = u.temp_error || [-10, 15];
      this.canvasInput1.sets = sets.ac_temp_error || {};

      this.canvasAgg.outputVar = 'cooling_power';
      this.canvasAgg.universe = u.ac_power || [0, 100];
      this.canvasAgg.outputSets = sets.ac_power || {};
    }

    // Force canvas resize/redraw
    this.canvasInput1.setupCanvasDPI();
    this.canvasAgg.setupCanvasDPI();

    // Trigger update with latest cached state
    if (this.latestState) {
      this.updateFuzzyPanels(this.latestState);
    }
  }

  initCollapseButtons() {
    const toggleCollapse = (btnId, panelId) => {
      const btn = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      if (btn && panel) {
        btn.addEventListener('click', () => {
          const isCollapsed = panel.classList.toggle('collapsed');
          btn.textContent = isCollapsed ? '+' : '−';
          btn.title = isCollapsed ? 'Expand Panel' : 'Collapse Panel';
        });
      }
    };

    toggleCollapse('btnCollapseLeft', 'leftControlsPanel');
    toggleCollapse('btnCollapseRight', 'fuzzyPanel');
    toggleCollapse('btnCollapseBottom', 'telemetryPanel');
  }

  onTelemetry(state, hz) {
    this.latestState = state;

    // 1. Update 3D Objects with live physics
    if (this.fan && state.fan) {
      this.fan.update(state.fan, 0.016);
    }
    if (this.ac && state.ac) {
      this.ac.update(state.ac, state.sensor, state.setpoint || 24.0);
    }
    if (this.person && state.sensor) {
      this.person.update(state.sensor, state.setpoint || 24.0);
    }
    if (this.room && state.disturbances) {
      this.room.update(state.disturbances);
    }

    // 2. Update Top Status Bar
    const fpsElem = document.getElementById('fpsValue');
    if (fpsElem) fpsElem.innerText = `${this.sceneMgr.fps} FPS | ${hz} Hz`;

    // 3. Update Left Controls Manager & Telemetry Badges
    if (this.controlsMgr) {
      this.controlsMgr.updateFromTelemetry(state);
    }

    const meanTemp = document.getElementById('lblRoomMeanTemp');
    const meanHum = document.getElementById('lblRoomMeanHumidity');
    const totPow = document.getElementById('lblTotalPower');
    const comfRatio = document.getElementById('lblComfortRatio');

    if (meanTemp && state.room_summary) meanTemp.textContent = `${state.room_summary.mean_temp.toFixed(1)} °C`;
    if (meanHum && state.room_summary) meanHum.textContent = `${state.room_summary.mean_humidity.toFixed(0)} %`;
    if (totPow) totPow.textContent = `${Math.round(state.total_power_watts || 0)} W`;
    if (comfRatio) comfRatio.textContent = `${state.comfort_percentage ? state.comfort_percentage.toFixed(0) : 100} %`;

    // 4. Update Reasoning Pipeline (Top Strip & Explanation Modal)
    if (this.pipelineMgr) {
      this.pipelineMgr.update(state);
    }

    // 5. Update Right Fuzzy Panels (Academic Core)
    this.updateFuzzyPanels(state);

    // 6. Update Bottom Rolling Time Series Chart & KPIs
    if (this.timeSeries && state.sensor && state.fan && state.ac) {
      const fanVal = state.fan.current_speed !== undefined ? state.fan.current_speed : (state.fan.speed_percent || 0);
      const acVal = state.ac.current_power !== undefined ? state.ac.current_power : (state.ac.power_percent || 0);

      this.timeSeries.pushData({
        time: state.sim_time,
        temp: state.sensor.temperature,
        setpoint: state.setpoint,
        humidity: state.sensor.humidity,
        fan: fanVal,
        ac: acVal,
      });

      const kpiComf = document.getElementById('kpiComfort');
      const kpiPow = document.getElementById('kpiPower');
      const kpiE = document.getElementById('kpiEnergy');

      if (kpiComf) kpiComf.textContent = `${state.comfort_percentage ? state.comfort_percentage.toFixed(1) : 100}%`;
      if (kpiPow) kpiPow.textContent = `${Math.round(state.total_power_watts || 0)} W`;
      if (kpiE) kpiE.textContent = `${state.energy_kwh ? state.energy_kwh.toFixed(3) : '0.000'} kWh`;
    }

    // 7. Update Active Inspector Modal if open
    this.updateInspectorModal();

    // 8. Update Phase 6 Volumetric Heatmap, Airflow & Surface Viewer
    if (this.heatmap && state.room_grid) {
      this.heatmap.update(state.room_grid);
    }
    if (this.airflow) {
      this.airflow.update(state.fan, state.ac, 0.016);
    }
    if (this.surfaceViewer && state.sensor && state.fuzzy) {
      const isFanTab = this.activeFISTab === 'fan';
      const activePayload = isFanTab ? (state.fuzzy.fan || state.fuzzy.fan_payload) : (state.fuzzy.ac || state.fuzzy.ac_payload);
      if (activePayload) {
        this.surfaceViewer.updateLiveMarker(
          state.sensor.temperature,
          state.sensor.humidity,
          state.setpoint || 24.0,
          activePayload.output || 50.0
        );
      }
    }
    if (this.benchmarkModal) {
      this.benchmarkModal.update(state);
    }
  }

  updateFuzzyPanels(state) {
    if (!state.fuzzy || !this.canvasInput1 || !this.rulesTable || !this.canvasAgg) return;

    const fuzzy = state.fuzzy;
    const isFanTab = this.activeFISTab === 'fan';
    const activePayload = isFanTab ? (fuzzy.fan || fuzzy.fan_payload) : (fuzzy.ac || fuzzy.ac_payload);
    if (!activePayload) return;

    const sets = this.sysConfig?.membership_sets || {};

    // 1. Inputs & Fuzzification
    const valInput1 = document.getElementById('valInput1');
    const valInput2 = document.getElementById('valInput2');
    const badgesInput1 = document.getElementById('badgesInput1');
    const badgesInput2 = document.getElementById('badgesInput2');

    if (isFanTab) {
      const tempVal = activePayload.inputs?.temperature ?? 0;
      const humVal = activePayload.inputs?.humidity ?? 0;
      const tempMemberships = activePayload.memberships?.temperature || {};
      const humMemberships = activePayload.memberships?.humidity || {};

      if (valInput1) valInput1.textContent = `${tempVal.toFixed(1)} °C`;
      if (valInput2) valInput2.textContent = `${humVal.toFixed(1)} %`;

      this.canvasInput1.update(tempVal, tempMemberships);
      this.canvasInput2.update(humVal, humMemberships);

      this.renderDegreeBadges(badgesInput1, tempMemberships);
      this.renderDegreeBadges(badgesInput2, humMemberships);
    } else {
      const errVal = activePayload.inputs?.temp_error ?? 0;
      const humVal = activePayload.inputs?.humidity ?? 0;
      const errMemberships = activePayload.memberships?.temp_error || {};
      const humMemberships = activePayload.memberships?.humidity || {};

      if (valInput1) valInput1.textContent = `${errVal > 0 ? '+' : ''}${errVal.toFixed(1)} °C`;
      if (valInput2) valInput2.textContent = `${humVal.toFixed(1)} %`;

      this.canvasInput1.update(errVal, errMemberships);
      this.canvasInput2.update(humVal, humMemberships);

      this.renderDegreeBadges(badgesInput1, errMemberships);
      this.renderDegreeBadges(badgesInput2, humMemberships);
    }

    // 2. Rules Evaluation Table
    if (this.rulesTable) {
      this.rulesTable.update(activePayload.rules, isFanTab);
    }

    // 3. Aggregation & Defuzzification
    const outSets = isFanTab ? sets.fan_speed : sets.ac_power;
    if (this.canvasAgg) {
      this.canvasAgg.update(activePayload, outSets);
    }

    const valCrisp = document.getElementById('valCrispOutput');
    const lblCentroid = document.getElementById('lblValCentroid');
    const lblBisector = document.getElementById('lblValBisector');
    const lblMOM = document.getElementById('lblValMOM');

    const capNotice = activePayload.coordination_applied ? ' [⚡ CAPPED 60%]' : '';
    if (valCrisp) valCrisp.textContent = `Output: ${activePayload.output}%${capNotice}`;
    if (lblCentroid) lblCentroid.textContent = `${activePayload.centroid_x !== undefined ? activePayload.centroid_x : '--'}%`;
    if (lblBisector) lblBisector.textContent = `${activePayload.bisector_x !== undefined ? activePayload.bisector_x : '--'}%`;
    if (lblMOM) lblMOM.textContent = `${activePayload.mom_x !== undefined ? activePayload.mom_x : '--'}%`;
  }

  renderDegreeBadges(container, memberships) {
    if (!container) return;
    let html = '';
    Object.entries(memberships).forEach(([term, deg]) => {
      const activeClass = deg > 0.005 ? 'active' : '';
      html += `<span class="deg-chip ${activeClass}">${term}: <strong>${deg.toFixed(2)}</strong></span>`;
    });
    container.innerHTML = html;
  }

  onConnectionChange(connected) {
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    if (dot && txt) {
      dot.className = `dot ${connected ? '' : 'offline'}`;
      txt.innerText = connected ? '10 Hz' : 'OFFLINE';
    }
  }

  initControls() {
    // Camera Presets
    document.querySelectorAll('.camera-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        this.setCameraPreset(preset);
      });
    });

    // Day / Night Toggle
    const btnDayNight = document.getElementById('btnDayNight');
    if (btnDayNight) {
      btnDayNight.addEventListener('click', () => {
        this.isDay = !this.isDay;
        this.sceneMgr.setDayNight(this.isDay);
        btnDayNight.innerText = this.isDay ? '☀️ Day' : '🌙 Night';
      });
    }

    // Quality Toggle
    const selectQuality = document.getElementById('selectQuality');
    if (selectQuality) {
      selectQuality.addEventListener('change', (e) => {
        this.sceneMgr.setQuality(e.target.value);
      });
    }

    // Modal Close Button
    const btnCloseModal = document.getElementById('closeModalBtn');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        this.hideInspectorModal();
      });
    }
  }

  setCameraPreset(preset) {
    document.querySelectorAll('.camera-btn').forEach((b) => b.classList.remove('active'));
    const targetBtn = document.querySelector(`.camera-btn[data-preset="${preset}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    this.sceneMgr.setPreset(preset);
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toUpperCase();
      if (key === '1') this.setCameraPreset('corner');
      if (key === '2') this.setCameraPreset('top');
      if (key === '3') this.setCameraPreset('front');
      if (key === '4') this.setCameraPreset('orbit');
      if (key === 'R') this.socket.reset();
      if (key === ' ') {
        e.preventDefault();
        this.isPaused = !this.isPaused;
        this.socket.setSimSpeed(this.isPaused ? 0.01 : 1.0);
      }
      if (key === 'ESCAPE') this.hideInspectorModal();
    });
  }

  initRaycasting() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('click', (e) => {
      // Don't trigger if clicked on HUD or interactive elements
      if (e.target.closest('.interactive') || e.target.closest('.annotation-tag') || e.target.closest('canvas')) return;

      this.raycaster.setFromCamera(this.mouse, this.sceneMgr.camera);
      const interactables = [
        { obj: this.fan.group, type: 'fan', title: 'Ceiling Fan' },
        { obj: this.ac.group, type: 'ac', title: 'Split Air Conditioner' },
        { obj: this.person.group, type: 'person', title: 'Human Occupant' },
        { obj: this.room.windowMesh, type: 'window', title: 'Window & Sunbeam' },
      ];

      for (const item of interactables) {
        if (!item.obj) continue;
        const hits = this.raycaster.intersectObjects(item.obj.children, true);
        if (hits.length > 0) {
          this.showInspectorModal(item.type, item.title);
          return;
        }
      }
    });
  }

  showInspectorModal(type, title) {
    this.inspectedType = type;
    const modal = document.getElementById('inspectorModal');
    const titleElem = document.getElementById('inspectorTitle');
    if (titleElem) titleElem.innerText = title;
    if (modal) modal.classList.add('visible');
    this.updateInspectorModal();
  }

  hideInspectorModal() {
    this.inspectedType = null;
    const modal = document.getElementById('inspectorModal');
    if (modal) modal.classList.remove('visible');
  }

  updateInspectorModal() {
    if (!this.inspectedType || !this.latestState) return;

    const statsElem = document.getElementById('inspectorStats');
    if (!statsElem) return;

    let rowsHtml = '';
    const s = this.latestState;

    if (this.inspectedType === 'fan' && s.fan) {
      rowsHtml = `
        <div class="info-stat-row"><span class="info-stat-label">Speed</span><span class="info-stat-val">${s.fan.speed_percent.toFixed(1)}%</span></div>
        <div class="info-stat-row"><span class="info-stat-label">RPM</span><span class="info-stat-val">${Math.round(s.fan.rpm || 0)} RPM</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Power</span><span class="info-stat-val">${s.fan.current_power_watts.toFixed(1)} W</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Energy</span><span class="info-stat-val">${s.fan.energy_watt_hours.toFixed(2)} Wh</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Control</span><span class="info-stat-val">${s.mode}</span></div>
      `;
    } else if (this.inspectedType === 'ac' && s.ac) {
      rowsHtml = `
        <div class="info-stat-row"><span class="info-stat-label">Cooling Power</span><span class="info-stat-val">${s.ac.power_percent.toFixed(1)}%</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Thermal Cooling</span><span class="info-stat-val">${(s.ac.cooling_effect_kw || 0).toFixed(2)} kW</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Power Draw</span><span class="info-stat-val">${s.ac.current_power_watts.toFixed(1)} W</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Energy</span><span class="info-stat-val">${s.ac.energy_watt_hours.toFixed(2)} Wh</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Louver Angle</span><span class="info-stat-val">${Math.round(s.ac.louver_angle || 0)}°</span></div>
      `;
    } else if (this.inspectedType === 'person' && s.sensor) {
      rowsHtml = `
        <div class="info-stat-row"><span class="info-stat-label">Temperature</span><span class="info-stat-val">${s.sensor.temperature.toFixed(2)} °C</span></div>
        <div class="info-stat-label"><span class="info-stat-label">Humidity</span><span class="info-stat-val">${s.sensor.humidity.toFixed(1)} %</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Target Setpoint</span><span class="info-stat-val">${s.setpoint.toFixed(1)} °C</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Thermal Sensation</span><span class="info-stat-val">${Math.abs(s.sensor.temperature - s.setpoint) < 1.0 ? 'Comfortable (Neutral)' : (s.sensor.temperature > s.setpoint ? 'Warm / Hot' : 'Cool / Chilly')}</span></div>
      `;
    } else if (this.inspectedType === 'window' && s.disturbances) {
      rowsHtml = `
        <div class="info-stat-row"><span class="info-stat-label">Window State</span><span class="info-stat-val">${s.disturbances.window_open ? 'OPEN' : 'CLOSED'}</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Outside Air Temp</span><span class="info-stat-val">${s.disturbances.outside_temp.toFixed(1)} °C</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Outside Humidity</span><span class="info-stat-val">${s.disturbances.outside_humidity.toFixed(1)} %</span></div>
        <div class="info-stat-row"><span class="info-stat-label">Solar Radiation</span><span class="info-stat-val">${s.disturbances.sun_on ? `${Math.round(s.disturbances.sun_intensity * 800)} W/m²` : '0 W/m² (Night)'}</span></div>
      `;
    }

    statsElem.innerHTML = rowsHtml;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Advance 3D rendering and camera lerp
    this.sceneMgr.update(delta);
  }
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DigitalTwinApp();
});
