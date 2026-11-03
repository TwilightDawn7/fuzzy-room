import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 3D Mamdani Control Surface Visualizer:
 * Renders an interactive 3D mesh surface fetched from /fuzzy/surface with
 * color-mapped elevation, grid wireframe, axes labels, and a live marker
 * indicating the current operating point.
 */
export class ControlSurfaceViewer {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer;
    this.surfaceData = null;
    this.activeMode = 'fan'; // 'fan' | 'ac'

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.surfaceMesh = null;
    this.wireMesh = null;
    this.markerSphere = null;

    this.initThree();
    this.loadData();
  }

  initThree() {
    const width = this.container.clientWidth || 360;
    const height = this.container.clientHeight || 240;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(2.8, 2.4, 3.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.4, 0);

    // Soft lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0x22d3ee, 1.2);
    dir.position.set(3, 4, 2);
    this.scene.add(dir);

    // Live Operating Point Marker (glowing sphere)
    const markerGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.markerSphere = new THREE.Mesh(markerGeo, markerMat);
    this.markerSphere.visible = false;
    this.scene.add(this.markerSphere);

    // Base grid plate
    const gridHelper = new THREE.GridHelper(2.0, 10, 0x334155, 0x1e293b);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);

    this.animate();
  }

  async loadData() {
    try {
      const res = await fetch('/fuzzy/surface');
      if (res.ok) {
        this.surfaceData = await res.json();
        this.buildSurfaceMesh();
      }
    } catch (e) {
      console.warn('Could not load /fuzzy/surface:', e);
    }
  }

  setMode(mode) {
    this.activeMode = mode;
    this.buildSurfaceMesh();
  }

  buildSurfaceMesh() {
    if (!this.surfaceData) return;

    if (this.surfaceMesh) this.scene.remove(this.surfaceMesh);
    if (this.wireMesh) this.scene.remove(this.wireMesh);

    const { temperature_axis, humidity_axis, fan_surface, ac_surface } = this.surfaceData;
    const gridZ = this.activeMode === 'fan' ? fan_surface : ac_surface;

    const nx = temperature_axis.length; // 25
    const ny = humidity_axis.length;    // 25

    const geo = new THREE.PlaneGeometry(2.0, 2.0, nx - 1, ny - 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const vertIdx = i * ny + j;
        const outVal = gridZ[i][j]; // 0 to 100%
        const zHeight = (outVal / 100.0) * 0.9; // Scale height

        pos.setZ(vertIdx, zHeight);

        // Color gradient based on output level: cyan (low) -> green -> orange -> magenta (high)
        const frac = outVal / 100.0;
        const color = new THREE.Color();
        if (frac < 0.33) {
          color.lerpColors(new THREE.Color(0x22d3ee), new THREE.Color(0x10b981), frac / 0.33);
        } else if (frac < 0.66) {
          color.lerpColors(new THREE.Color(0x10b981), new THREE.Color(0xfb923c), (frac - 0.33) / 0.33);
        } else {
          color.lerpColors(new THREE.Color(0xfb923c), new THREE.Color(0xa78bfa), (frac - 0.66) / 0.34);
        }

        colors[vertIdx * 3] = color.r;
        colors[vertIdx * 3 + 1] = color.g;
        colors[vertIdx * 3 + 2] = color.b;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Rotate plane so Z becomes Y (height)
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    this.surfaceMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.surfaceMesh);

    // Subtle wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    this.wireMesh = new THREE.Mesh(geo, wireMat);
    this.scene.add(this.wireMesh);
  }

  updateLiveMarker(temp, humidity, setpoint = 24.0, outputVal = 50.0) {
    if (!this.markerSphere || !this.surfaceData) return;

    const { temperature_axis, humidity_axis } = this.surfaceData;
    const minT = temperature_axis[0];
    const maxT = temperature_axis[temperature_axis.length - 1];
    const minH = humidity_axis[0];
    const maxH = humidity_axis[humidity_axis.length - 1];

    const inputT = this.activeMode === 'fan' ? temp : (temp - setpoint);
    const clampedT = THREE.MathUtils.clamp(inputT, minT, maxT);
    const clampedH = THREE.MathUtils.clamp(humidity, minH, maxH);

    const normX = ((clampedT - minT) / (maxT - minT)) * 2.0 - 1.0;
    const normZ = ((clampedH - minH) / (maxH - minH)) * 2.0 - 1.0;
    const normY = (outputVal / 100.0) * 0.9;

    this.markerSphere.position.set(normX, normY + 0.05, normZ);
    this.markerSphere.visible = true;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }
}

