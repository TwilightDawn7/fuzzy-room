import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Modern wall-mounted split Air Conditioner unit with live 7-segment CanvasTexture display,
 * motorized tilting louvers, status LED, localized frost glow, and floating CSS2D leader badge.
 */
export class ACObject {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.position = options.position || new THREE.Vector3(-2.85, 2.2, 0);

    this.group = new THREE.Group();
    this.group.name = 'AirConditioner';
    this.group.position.copy(this.position);

    this.currentPower = 0.0;
    this.targetPower = 0.0;
    this.louverAngle = 0.0;

    this.displayCanvas = null;
    this.displayCtx = null;
    this.displayTexture = null;
    this.statusLed = null;
    this.frostGlow = null;
    this.louversGroup = new THREE.Group();
    this.badgeElement = null;

    this.initCanvasDisplay();
    this.buildBody();
    this.buildLouvers();
    this.buildStatusLed();
    this.buildFrostGlow();
    this.buildAnnotationBadge();

    this.scene.add(this.group);
  }

  initCanvasDisplay() {
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 256;
    this.displayCanvas.height = 128;
    this.displayCtx = this.displayCanvas.getContext('2d');

    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.renderDisplay(24.0, 28.0, 0.0);
  }

  renderDisplay(setpoint = 24.0, currentTemp = 28.0, power = 0.0) {
    const ctx = this.displayCtx;
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, 256, 128);

    // Glowing cyan frame
    ctx.strokeStyle = power > 5 ? 'rgba(34, 211, 238, 0.4)' : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);

    // 7-segment style digital typography
    ctx.font = 'bold 52px "JetBrains Mono", monospace';
    ctx.fillStyle = power > 5 ? '#22d3ee' : '#64748b';
    ctx.textAlign = 'center';
    ctx.shadowColor = power > 5 ? '#22d3ee' : 'transparent';
    ctx.shadowBlur = power > 5 ? 16 : 0;
    ctx.fillText(`${setpoint.toFixed(0)}°`, 128, 65);

    // Secondary sub-row
    ctx.shadowBlur = 0;
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`ROOM: ${currentTemp.toFixed(1)}°C | ${power.toFixed(0)}%`, 128, 105);

    this.displayTexture.needsUpdate = true;
  }

  buildBody() {
    const w = 1.25, h = 0.36, d = 0.28;

    // Main matte white chassis
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.1,
    });

    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Dark front display screen inset
    const screenGeo = new THREE.PlaneGeometry(0.38, 0.18);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.displayTexture,
      transparent: true,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0.28, 0.02, d / 2 + 0.002);
    this.group.add(screen);

    // Lower discharge grille cavity
    const cavityGeo = new THREE.BoxGeometry(w * 0.88, 0.08, 0.08);
    const cavityMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const cavity = new THREE.Mesh(cavityGeo, cavityMat);
    cavity.position.set(0, -h / 2 + 0.06, d / 2 - 0.03);
    this.group.add(cavity);
  }

  buildLouvers() {
    const louverW = 1.05;
    const louverD = 0.06;
    const louverH = 0.008;

    const louverMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
    });

    for (let i = 0; i < 2; i++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(louverW, louverH, louverD), louverMat);
      vane.position.set(0, 0, (i - 0.5) * 0.025);
      this.louversGroup.add(vane);
    }

    this.louversGroup.position.set(0, -0.36 / 2 + 0.06, 0.28 / 2);
    this.group.add(this.louversGroup);
  }

  buildStatusLed() {
    const ledGeo = new THREE.SphereGeometry(0.015, 16, 16);
    this.statusLed = new THREE.Mesh(
      ledGeo,
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.0,
      })
    );
    this.statusLed.position.set(-0.52, -0.1, 0.28 / 2 + 0.005);
    this.group.add(this.statusLed);
  }

  buildFrostGlow() {
    const glowGeo = new THREE.PlaneGeometry(1.0, 0.12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.frostGlow = new THREE.Mesh(glowGeo, glowMat);
    this.frostGlow.position.set(0, -0.15, 0.18);
    this.frostGlow.rotation.x = Math.PI / 4;
    this.group.add(this.frostGlow);
  }

  buildAnnotationBadge() {
    const div = document.createElement('div');
    div.className = 'annotation-tag';
    div.innerHTML = `<span class="tag-dot cyan"></span><span id="acTagText">AC 0% | 24°C</span>`;

    const annotation = new CSS2DObject(div);
    annotation.position.set(0, 0.35, 0);
    this.group.add(annotation);
    this.badgeElement = div.querySelector('#acTagText');
  }

  update(acData, sensorData, setpoint = 24.0) {
    if (!acData) return;

    this.targetPower = acData.current_power || 0.0;
    this.currentPower = THREE.MathUtils.lerp(this.currentPower, this.targetPower, 0.1);

    // Motorized louver tilt
    const targetLouverAngle = THREE.MathUtils.degToRad((this.currentPower / 100.0) * 45.0);
    this.louverAngle = THREE.MathUtils.lerp(this.louverAngle, targetLouverAngle, 0.08);
    this.louversGroup.rotation.x = this.louverAngle;

    // Status LED color
    if (this.statusLed) {
      if (this.currentPower > 65.0) {
        this.statusLed.material.color.setHex(0xef4444); // Red: heavy cooling
        this.statusLed.material.emissive.setHex(0xef4444);
      } else if (this.currentPower > 10.0) {
        this.statusLed.material.color.setHex(0x22d3ee); // Cyan: active cooling
        this.statusLed.material.emissive.setHex(0x22d3ee);
      } else {
        this.statusLed.material.color.setHex(0xfb923c); // Amber: standby
        this.statusLed.material.emissive.setHex(0xfb923c);
      }
    }

    // Frost glow intensity
    if (this.frostGlow) {
      const frostIntensity = THREE.MathUtils.smoothstep(this.currentPower, 50.0, 95.0) * 0.45;
      this.frostGlow.material.opacity = frostIntensity;
    }

    // Update canvas display
    const roomTemp = sensorData ? sensorData.temperature : 24.0;
    this.renderDisplay(setpoint, roomTemp, this.currentPower);

    // Update floating badge
    if (this.badgeElement) {
      this.badgeElement.innerText = `AC ${Math.round(this.currentPower)}% | Target ${setpoint.toFixed(1)}°C`;
    }
  }
}

