import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Master Three.js Scene, Camera, Lighting, Post-Processing,
 * and CSS2DRenderer setup for the 3D Digital Twin.
 */
export class SceneManager {
  constructor(webglContainer, css2dContainer) {
    this.container = webglContainer;
    this.css2dContainer = css2dContainer;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Camera presets
    this.presets = {
      corner: { pos: new THREE.Vector3(5.8, 4.2, 5.8), target: new THREE.Vector3(0, 1.1, 0) },
      top: { pos: new THREE.Vector3(0.01, 7.5, 0.01), target: new THREE.Vector3(0, 0, 0) },
      front: { pos: new THREE.Vector3(0, 1.8, 6.2), target: new THREE.Vector3(0, 1.2, 0) },
      orbit: { pos: new THREE.Vector3(5.2, 3.0, 5.2), target: new THREE.Vector3(0, 1.0, 0) },
    };

    this.activePreset = 'corner';
    this.isCinematic = false;
    this.cinematicAngle = 0.0;

    // Quality setting: 'high', 'medium', 'low'
    this.quality = 'high';
    this.fpsHistory = [];
    this.fps = 60;
    this.lastFrameTime = performance.now();

    this.initCore();
    this.initLighting();
    this.initPostProcessing();
    this.initEvents();
  }

  initCore() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 100);
    const initialPreset = this.presets.corner;
    // Start higher for intro fly-in animation
    this.camera.position.set(initialPreset.pos.x * 1.6, initialPreset.pos.y * 1.8, initialPreset.pos.z * 1.6);

    this.camTargetPos = initialPreset.pos.clone();
    this.camLookTarget = initialPreset.target.clone();
    this.currentLookAt = initialPreset.target.clone();

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. CSS2D Renderer (floating HTML annotations)
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.width, this.height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.css2dContainer.appendChild(this.labelRenderer.domElement);

    // 5. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent camera going below floor
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 14.0;
    this.controls.target.copy(this.camLookTarget);

    // 6. Environment Map (Realistic metallic reflections without HDR files)
    const pmremGen = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGen.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGen.dispose();
  }

  initLighting() {
    // 1. Soft cool ambient light
    this.ambientLight = new THREE.AmbientLight(0x1e293b, 1.2);
    this.scene.add(this.ambientLight);

    // 2. Warm Sun Light (Directional casting soft shadows through window)
    this.sunLight = new THREE.DirectionalLight(0xfef08a, 2.2);
    this.sunLight.position.set(5.5, 4.0, 1.5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 16;
    this.sunLight.shadow.camera.left = -4;
    this.sunLight.shadow.camera.right = 4;
    this.sunLight.shadow.camera.top = 4;
    this.sunLight.shadow.camera.bottom = -4;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 3. Soft interior fill light
    this.fillLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    this.fillLight.position.set(-3.5, 3.0, -2.5);
    this.scene.add(this.fillLight);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Subtle bloom for glowing LEDs, frost, displays, sunbeam
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.32,  // strength
      0.45,  // radius
      0.82   // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  setPreset(name) {
    if (!this.presets[name]) return;
    this.activePreset = name;
    this.isCinematic = (name === 'orbit');

    const p = this.presets[name];
    this.camTargetPos.copy(p.pos);
    this.camLookTarget.copy(p.target);
  }

  setDayNight(isDay) {
    if (isDay) {
      this.sunLight.color.setHex(0xfef08a);
      this.sunLight.intensity = 2.2;
      this.ambientLight.color.setHex(0x1e293b);
      this.ambientLight.intensity = 1.2;
      this.scene.background = new THREE.Color(0x0a0e17);
    } else {
      this.sunLight.color.setHex(0x38bdf8);
      this.sunLight.intensity = 0.5;
      this.ambientLight.color.setHex(0x050811);
      this.ambientLight.intensity = 0.6;
      this.scene.background = new THREE.Color(0x03050a);
    }
  }

  setQuality(q) {
    this.quality = q;
    if (q === 'low') {
      this.bloomPass.enabled = false;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    } else if (q === 'medium') {
      this.bloomPass.enabled = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(1.25);
    } else {
      this.bloomPass.enabled = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
    this.labelRenderer.setSize(this.width, this.height);
    this.composer.setSize(this.width, this.height);
  }

  initEvents() {
    window.addEventListener('resize', () => this.onResize());
  }

  update(deltaSec = 0.016) {
    // Measure FPS
    const now = performance.now();
    const frameMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (frameMs > 0) {
      const instantFps = 1000 / frameMs;
      this.fpsHistory.push(instantFps);
      if (this.fpsHistory.length > 30) this.fpsHistory.shift();
      this.fps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);

      // Auto quality downgrade guardrail if sustained FPS < 28
      if (this.fps < 28 && this.quality === 'high' && this.fpsHistory.length >= 30) {
        console.warn('Auto downgrading graphics quality to Medium to preserve 30+ FPS');
        this.setQuality('medium');
      }
    }

    // Camera preset easing
    if (this.isCinematic) {
      this.cinematicAngle += 0.2 * deltaSec;
      const r = 6.2;
      this.camera.position.x = Math.sin(this.cinematicAngle) * r;
      this.camera.position.z = Math.cos(this.cinematicAngle) * r;
      this.camera.position.y = 3.2;
      this.controls.target.set(0, 1.0, 0);
    } else {
      // Smooth lerp towards target preset
      this.camera.position.lerp(this.camTargetPos, 0.06);
      this.controls.target.lerp(this.camLookTarget, 0.06);
    }

    this.controls.update();

    // Render 3D and 2D overlay
    if (this.quality === 'low') {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
    this.labelRenderer.render(this.scene, this.camera);
  }
}

