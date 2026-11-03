import * as THREE from 'three';

/**
 * Volumetric 3D Temperature Heatmap:
 * Visualizes the 12x6x10 thermal grid from the physics engine using
 * multi-planar horizontal/vertical slices and an instanced voxel cloud.
 */
export class HeatmapEffect {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.roomDims = options.roomDims || [6.0, 3.0, 5.0]; // [dx, dy, dz]
    this.gridShape = options.gridShape || [12, 6, 10];   // [nx, ny, nz]

    this.group = new THREE.Group();
    this.group.name = 'TemperatureHeatmap';
    this.scene.add(this.group);

    this.visible = true;
    this.opacity = 0.55;
    this.mode = 'slices'; // 'slices' | 'voxels'

    this.slices = [];
    this.voxelMesh = null;
    this.voxelDummy = new THREE.Object3D();

    this.initSlices();
    this.initVoxels();

    this.group.visible = this.visible;
  }

  initSlices() {
    const [dimX, dimY, dimZ] = this.roomDims;
    const [nx, ny, nz] = this.gridShape;

    // 3 Horizontal Slices at different heights (Occupant height, Mid-room, High AC level)
    const yHeights = [0.75, 1.5, 2.25];

    yHeights.forEach((h, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = nx * 8; // Interpolated resolution
      canvas.height = nz * 8;
      const ctx = canvas.getContext('2d');

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: this.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const geo = new THREE.PlaneGeometry(dimX, dimZ);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, h, 0);

      this.group.add(mesh);
      this.slices.push({ mesh, canvas, ctx, texture, yIndex: Math.floor((h / dimY) * ny) });
    });
  }

  initVoxels() {
    const [dimX, dimY, dimZ] = this.roomDims;
    const [nx, ny, nz] = this.gridShape;
    const totalVoxels = nx * ny * nz;

    const cellW = (dimX / nx) * 0.75;
    const cellH = (dimY / ny) * 0.75;
    const cellD = (dimZ / nz) * 0.75;

    const geo = new THREE.BoxGeometry(cellW, cellH, cellD);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: this.opacity * 0.7,
      depthWrite: false,
    });

    this.voxelMesh = new THREE.InstancedMesh(geo, mat, totalVoxels);
    this.voxelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.voxelMesh.visible = false; // Hidden in slice mode
    this.group.add(this.voxelMesh);

    // Position each instance once
    const dx = dimX / nx;
    const dy = dimY / ny;
    const dz = dimZ / nz;

    let idx = 0;
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
          const px = -dimX / 2 + (x + 0.5) * dx;
          const py = (y + 0.5) * dy;
          const pz = -dimZ / 2 + (z + 0.5) * dz;

          this.voxelDummy.position.set(px, py, pz);
          this.voxelDummy.updateMatrix();
          this.voxelMesh.setMatrixAt(idx, this.voxelDummy.matrix);
          idx++;
        }
      }
    }
    this.voxelMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Color mapping function:
   * <= 18°C: Deep Blue
   * 21°C: Cyan
   * 24°C: Emerald Green (Comfort)
   * 27°C: Amber / Yellow
   * >= 32°C: Red
   */
  tempToColor(t) {
    if (t <= 18.0) return { r: 30, g: 64, b: 175 }; // #1e40af
    if (t <= 21.0) {
      const frac = (t - 18.0) / 3.0;
      return {
        r: Math.round(30 + frac * (6 - 30)),
        g: Math.round(64 + frac * (182 - 64)),
        b: Math.round(175 + frac * (212 - 175)),
      };
    }
    if (t <= 24.0) {
      const frac = (t - 21.0) / 3.0;
      return {
        r: Math.round(6 + frac * (16 - 6)),
        g: Math.round(182 + frac * (185 - 182)),
        b: Math.round(212 + frac * (129 - 212)),
      };
    }
    if (t <= 28.0) {
      const frac = (t - 24.0) / 4.0;
      return {
        r: Math.round(16 + frac * (245 - 16)),
        g: Math.round(185 + frac * (158 - 185)),
        b: Math.round(129 + frac * (11 - 129)),
      };
    }
    const frac = Math.min(1.0, (t - 28.0) / 6.0);
    return {
      r: Math.round(245 + frac * (239 - 245)),
      g: Math.round(158 + frac * (68 - 158)),
      b: Math.round(11 + frac * (68 - 11)),
    };
  }

  tempToThreeColor(t) {
    const c = this.tempToColor(t);
    return new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  }

  update(roomGrid) {
    if (!this.visible || !roomGrid || !roomGrid.temperature) return;

    const temps = roomGrid.temperature;
    const [nx, ny, nz] = this.gridShape;

    if (this.mode === 'slices') {
      // Update Slice Canvases
      this.slices.forEach((slice) => {
        const { ctx, canvas, texture, yIndex } = slice;
        const imgData = ctx.createImageData(canvas.width, canvas.height);
        const data = imgData.data;

        const cw = canvas.width;
        const ch = canvas.height;

        for (let py = 0; py < ch; py++) {
          const zFrac = py / (ch - 1);
          const gz = zFrac * (nz - 1);
          const z0 = Math.floor(gz);
          const z1 = Math.min(nz - 1, z0 + 1);
          const zInterp = gz - z0;

          for (let px = 0; px < cw; px++) {
            const xFrac = px / (cw - 1);
            const gx = xFrac * (nx - 1);
            const x0 = Math.floor(gx);
            const x1 = Math.min(nx - 1, x0 + 1);
            const xInterp = gx - x0;

            // Bilinear interpolation
            const t00 = temps[(x0 * ny + yIndex) * nz + z0] || 24;
            const t10 = temps[(x1 * ny + yIndex) * nz + z0] || 24;
            const t01 = temps[(x0 * ny + yIndex) * nz + z1] || 24;
            const t11 = temps[(x1 * ny + yIndex) * nz + z1] || 24;

            const tTop = t00 + xInterp * (t10 - t00);
            const tBot = t01 + xInterp * (t11 - t01);
            const tInterp = tTop + zInterp * (tBot - tTop);

            const rgb = this.tempToColor(tInterp);
            const pIdx = (py * cw + px) * 4;
            data[pIdx] = rgb.r;
            data[pIdx + 1] = rgb.g;
            data[pIdx + 2] = rgb.b;
            data[pIdx + 3] = 230;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        texture.needsUpdate = true;
      });
    } else {
      // Update Voxel Cloud Colors
      let idx = 0;
      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          for (let z = 0; z < nz; z++) {
            const t = temps[(x * ny + y) * nz + z] || 24;
            const col = this.tempToThreeColor(t);
            this.voxelMesh.setColorAt(idx, col);
            idx++;
          }
        }
      }
      if (this.voxelMesh.instanceColor) {
        this.voxelMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  toggle() {
    this.visible = !this.visible;
    this.group.visible = this.visible;
    return this.visible;
  }

  setMode(mode) {
    this.mode = mode;
    const isSlices = mode === 'slices';
    this.slices.forEach(s => { s.mesh.visible = isSlices; });
    if (this.voxelMesh) this.voxelMesh.visible = !isSlices;
  }

  setOpacity(val) {
    this.opacity = THREE.MathUtils.clamp(val, 0.05, 1.0);
    this.slices.forEach(s => { s.mesh.material.opacity = this.opacity; });
    if (this.voxelMesh) this.voxelMesh.material.opacity = this.opacity * 0.7;
  }
}
