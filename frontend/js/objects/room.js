import * as THREE from 'three';

/**
 * Procedural 3D Architectural Room Environment.
 * Transparent physical walls, polished reflective floor, window with sunbeam,
 * door, ceiling light strips, and modern digital twin furniture.
 */
export class RoomObject {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.dims = options.dims || [6.0, 3.0, 5.0]; // Lx, Ly, Lz
    this.group = new THREE.Group();
    this.group.name = 'RoomGroup';

    this.sunbeam = null;
    this.windowMesh = null;
    this.wallMaterials = [];

    this.buildFloor();
    this.buildWalls();
    this.buildWindow();
    this.buildDoor();
    this.buildCeilingLighting();
    this.buildFurniture();

    this.scene.add(this.group);
  }

  buildFloor() {
    const [lx, , lz] = this.dims;

    // Polished dark concrete / reflective floor
    const floorGeo = new THREE.PlaneGeometry(lx, lz);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.25,
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Subtle modern grid overlay
    const grid = new THREE.GridHelper(Math.max(lx, lz), 12, 0x1e293b, 0x141e33);
    grid.position.y = 0.002;
    this.group.add(grid);

    // Dark baseboards
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const h = 0.08, w = 0.02;

    const b1 = new THREE.Mesh(new THREE.BoxGeometry(lx, h, w), baseMat);
    b1.position.set(0, h / 2, -lz / 2 + w / 2);
    this.group.add(b1);

    const b2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, lz), baseMat);
    b2.position.set(-lx / 2 + w / 2, h / 2, 0);
    this.group.add(b2);

    const b3 = new THREE.Mesh(new THREE.BoxGeometry(w, h, lz), baseMat);
    b3.position.set(lx / 2 - w / 2, h / 2, 0);
    this.group.add(b3);
  }

  buildWalls() {
    const [lx, ly, lz] = this.dims;

    // Architectural glass material with subtle tint
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      transmission: 0.85,
      ior: 1.45,
      thickness: 0.05,
      depthWrite: false,
    });
    this.wallMaterials.push(glassMat);

    // Back wall (-Z)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(lx, ly), glassMat);
    backWall.position.set(0, ly / 2, -lz / 2);
    this.group.add(backWall);

    // Left wall (-X)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(lz, ly), glassMat);
    leftWall.position.set(-lx / 2, ly / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.group.add(leftWall);

    // Right wall (+X) - holds the window
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(lz, ly), glassMat);
    rightWall.position.set(lx / 2, ly / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.group.add(rightWall);

    // Outline edge wireframes for high-tech digital twin appearance
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(lx, ly, lz));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.45,
    });
    const wireframe = new THREE.LineSegments(boxEdges, edgeMat);
    wireframe.position.y = ly / 2;
    this.group.add(wireframe);
  }

  buildWindow() {
    const [lx, ly, lz] = this.dims;
    const winW = 1.8, winH = 1.2;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.5,
      roughness: 0.2,
    });

    const windowGroup = new THREE.Group();
    windowGroup.position.set(lx / 2 - 0.01, ly / 2 + 0.1, 0);
    windowGroup.rotation.y = -Math.PI / 2;

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), frameMat);
    windowGroup.add(frame);

    // Glass pane
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(winW - 0.1, winH - 0.1),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        roughness: 0.05,
        transmission: 0.9,
      })
    );
    glass.position.z = 0.01;
    windowGroup.add(glass);
    this.windowMesh = windowGroup;
    this.group.add(windowGroup);

    // Volumetric sunlight shaft (additive blend)
    const beamGeo = new THREE.CylinderGeometry(0.8, 2.2, 4.0, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sunbeam = new THREE.Mesh(beamGeo, beamMat);
    this.sunbeam.position.set(lx / 2 - 1.8, ly / 2 - 0.5, 0);
    this.sunbeam.rotation.z = Math.PI / 3;
    this.sunbeam.visible = false; // toggled by sun_on
    this.group.add(this.sunbeam);
  }

  buildDoor() {
    const [lx, ly, lz] = this.dims;
    const doorW = 0.9, doorH = 2.1;

    const doorGroup = new THREE.Group();
    doorGroup.position.set(-lx / 2 + 0.01, doorH / 2, -lz / 4);
    doorGroup.rotation.y = Math.PI / 2;

    // Door Panel
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.3,
      roughness: 0.4,
    });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.04), panelMat);
    doorGroup.add(panel);

    // Handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 })
    );
    handle.position.set(doorW / 2 - 0.1, 0, 0.04);
    doorGroup.add(handle);

    this.group.add(doorGroup);
  }

  buildCeilingLighting() {
    const [lx, ly, lz] = this.dims;

    // Recessed LED light strips along ceiling
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x93c5fd,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });

    const s1 = new THREE.Mesh(new THREE.BoxGeometry(lx * 0.7, 0.02, 0.06), stripMat);
    s1.position.set(0, ly - 0.01, -lz * 0.25);
    this.group.add(s1);

    const s2 = new THREE.Mesh(new THREE.BoxGeometry(lx * 0.7, 0.02, 0.06), stripMat);
    s2.position.set(0, ly - 0.01, lz * 0.25);
    this.group.add(s2);
  }

  buildFurniture() {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.2 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.2, metalness: 0.8 });

    // 1. Workstation Desk
    const desk = new THREE.Group();
    desk.position.set(0.6, 0, 0.3);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.8), deskMat);
    top.position.y = 0.74;
    top.castShadow = true;
    top.receiveShadow = true;
    desk.add(top);

    // Desk Legs
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.74);
    const legOffsets = [
      [-0.72, 0.37, -0.34],
      [0.72, 0.37, -0.34],
      [-0.72, 0.37, 0.34],
      [0.72, 0.37, 0.34],
    ];
    legOffsets.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      desk.add(leg);
    });

    // Monitor on desk
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.34, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 })
    );
    monitor.position.set(0, 0.95, -0.15);
    monitor.castShadow = true;
    desk.add(monitor);

    // Glowing screen
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.51, 0.30),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    screen.position.set(0, 0.95, -0.134);
    desk.add(screen);

    this.group.add(desk);

    // 2. Stylized Lounge Sofa (Near Back Wall)
    const sofa = new THREE.Group();
    sofa.position.set(-1.4, 0, -1.8);

    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.8), sofaMat);
    seat.position.y = 0.22;
    seat.castShadow = true;
    sofa.add(seat);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.2), sofaMat);
    backrest.position.set(0, 0.55, -0.3);
    backrest.castShadow = true;
    sofa.add(backrest);

    this.group.add(sofa);

    // 3. Indoor Plant Pot
    const plant = new THREE.Group();
    plant.position.set(2.4, 0, -1.9);

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.12, 0.4, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
    );
    pot.position.y = 0.2;
    pot.castShadow = true;
    plant.add(pot);

    const foliage = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.28, 1),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6 })
    );
    foliage.position.y = 0.5;
    foliage.castShadow = true;
    plant.add(foliage);

    this.group.add(plant);
  }

  update(disturbances) {
    if (!disturbances) return;

    // Toggle sunbeam
    if (this.sunbeam) {
      this.sunbeam.visible = Boolean(disturbances.sun_on);
      if (disturbances.sun_on) {
        this.sunbeam.material.opacity = 0.08 + (disturbances.sun_intensity || 1.0) * 0.12;
      }
    }

    // Window open tilt
    if (this.windowMesh) {
      const targetAngle = disturbances.window_open ? -Math.PI / 2 + 0.35 : -Math.PI / 2;
      this.windowMesh.rotation.y = THREE.MathUtils.lerp(this.windowMesh.rotation.y, targetAngle, 0.1);
    }
  }
}

