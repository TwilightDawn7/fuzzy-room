import * as THREE from 'three';

/**
 * GPU Particle System for Airflow Visualization:
 * 1. AC Directional Cold Jet: Stream of cyan/frost particles flowing from the AC outlet
 *    across the room (+X) and descending gently due to negative thermal buoyancy.
 * 2. Ceiling Fan Swirl Vortex: Downward helical spiral of circulating particles beneath
 *    the fan blades that disperse outward along the room floor.
 */
export class AirflowParticles {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'AirflowParticles';
    this.scene.add(this.group);

    this.visible = true;

    // AC Jet Particles
    this.acMaxParticles = 400;
    this.acParticles = null;
    this.acPositions = null;
    this.acVelocities = null;
    this.acLifetimes = null;

    // Fan Swirl Particles
    this.fanMaxParticles = 450;
    this.fanParticles = null;
    this.fanPositions = null;
    this.fanVelocities = null;
    this.fanLifetimes = null;

    this.initACJet();
    this.initFanSwirl();

    this.group.visible = this.visible;
  }

  createSoftParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(34, 211, 238, 0.8)');
    grad.addColorStop(0.7, 'rgba(34, 211, 238, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  initACJet() {
    const count = this.acMaxParticles;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const alpha = new Float32Array(count);

    this.acPositions = pos;
    this.acVelocities = [];
    this.acLifetimes = [];

    // AC position is roughly at (-2.85, 2.05, 0)
    for (let i = 0; i < count; i++) {
      this.resetACParticle(i, true);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x22d3ee,
      size: 0.14,
      map: this.createSoftParticleTexture(),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.acParticles = new THREE.Points(geo, mat);
    this.group.add(this.acParticles);
  }

  resetACParticle(i, randomizeAge = false) {
    const originX = -2.75;
    const originY = 2.05;
    const originZ = 0.0;

    const idx = i * 3;
    this.acPositions[idx] = originX + (Math.random() - 0.5) * 0.1;
    this.acPositions[idx + 1] = originY + (Math.random() - 0.5) * 0.15;
    this.acPositions[idx + 2] = originZ + (Math.random() - 0.5) * 0.6;

    // Velocity heading in +X with slight spreading in Z and downward drift in Y
    const vx = 1.2 + Math.random() * 1.5;
    const vy = -0.15 - Math.random() * 0.25;
    const vz = (Math.random() - 0.5) * 0.4;

    this.acVelocities[i] = { vx, vy, vz };
    const maxLife = 1.8 + Math.random() * 1.2;
    const life = randomizeAge ? Math.random() * maxLife : 0;
    this.acLifetimes[i] = { life, maxLife };
  }

  initFanSwirl() {
    const count = this.fanMaxParticles;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    this.fanPositions = pos;
    this.fanVelocities = [];
    this.fanLifetimes = [];

    for (let i = 0; i < count; i++) {
      this.resetFanParticle(i, true);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xa78bfa,
      size: 0.12,
      map: this.createSoftParticleTexture(),
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.fanParticles = new THREE.Points(geo, mat);
    this.group.add(this.fanParticles);
  }

  resetFanParticle(i, randomizeAge = false) {
    // Disc area under fan blades: (0, 2.7, 0)
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.85;

    const idx = i * 3;
    this.fanPositions[idx] = Math.cos(angle) * r;
    this.fanPositions[idx + 1] = 2.65 - Math.random() * 0.1;
    this.fanPositions[idx + 2] = Math.sin(angle) * r;

    this.fanVelocities[i] = {
      angle,
      r,
      omega: 3.0 + Math.random() * 2.0, // Tangential swirl
      vy: -1.2 - Math.random() * 0.8,   // Downward downdraft
      radialSpeed: 0.2 + Math.random() * 0.3,
    };

    const maxLife = 2.0 + Math.random() * 1.0;
    const life = randomizeAge ? Math.random() * maxLife : 0;
    this.fanLifetimes[i] = { life, maxLife };
  }

  update(fanState, acState, deltaSec = 0.016) {
    if (!this.visible) return;

    const fanSpeed = fanState ? (fanState.current_speed || 0.0) : 0.0;
    const acPower = acState ? (acState.current_power || 0.0) : 0.0;

    const dt = Math.min(deltaSec, 0.05);

    // 1. Update AC Cold-Air Jet
    if (this.acParticles && this.acPositions) {
      const acFactor = Math.max(0.0, (acPower - 5.0) / 95.0); // Zero below standby cutoff
      this.acParticles.material.opacity = acFactor * 0.8;

      if (acFactor > 0.02) {
        for (let i = 0; i < this.acMaxParticles; i++) {
          const lt = this.acLifetimes[i];
          lt.life += dt;

          if (lt.life >= lt.maxLife) {
            this.resetACParticle(i, false);
            continue;
          }

          const idx = i * 3;
          const v = this.acVelocities[i];
          const speedMul = 0.5 + acFactor * 1.2;

          this.acPositions[idx] += v.vx * speedMul * dt;
          this.acPositions[idx + 1] += v.vy * dt - 0.2 * dt; // Cold air density sink
          this.acPositions[idx + 2] += v.vz * dt;

          // Wall and floor boundaries
          if (this.acPositions[idx] > 2.85 || this.acPositions[idx + 1] < 0.05) {
            this.resetACParticle(i, false);
          }
        }
        this.acParticles.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 2. Update Fan Swirl Vortex
    if (this.fanParticles && this.fanPositions) {
      const fanFactor = Math.max(0.0, (fanSpeed - 5.0) / 95.0);
      this.fanParticles.material.opacity = fanFactor * 0.7;

      if (fanFactor > 0.02) {
        for (let i = 0; i < this.fanMaxParticles; i++) {
          const lt = this.fanLifetimes[i];
          lt.life += dt;

          if (lt.life >= lt.maxLife) {
            this.resetFanParticle(i, false);
            continue;
          }

          const idx = i * 3;
          const v = this.fanVelocities[i];
          const speedMul = 0.4 + fanFactor * 1.3;

          v.angle += v.omega * speedMul * dt;
          this.fanPositions[idx + 1] += v.vy * speedMul * dt;

          // Radial expansion as particles reach the floor
          if (this.fanPositions[idx + 1] < 0.6) {
            v.r += v.radialSpeed * 2.0 * dt;
          } else {
            v.r += v.radialSpeed * 0.5 * dt;
          }

          this.fanPositions[idx] = Math.cos(v.angle) * v.r;
          this.fanPositions[idx + 2] = Math.sin(v.angle) * v.r;

          if (this.fanPositions[idx + 1] < 0.04 || v.r > 2.8) {
            this.resetFanParticle(i, false);
          }
        }
        this.fanParticles.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  toggle() {
    this.visible = !this.visible;
    this.group.visible = this.visible;
    return this.visible;
  }
}

