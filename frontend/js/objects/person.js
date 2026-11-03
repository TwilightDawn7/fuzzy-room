import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Stylized digital twin human occupant with dynamic thermal comfort aura
 * (ground glow ring that transitions blue -> green -> orange/red) and floating temperature badge.
 */
export class PersonObject {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.position = options.position || new THREE.Vector3(0.6, 0, 0.7);

    this.group = new THREE.Group();
    this.group.name = 'HumanOccupant';
    this.group.position.copy(this.position);

    this.auraMesh = null;
    this.auraRing = null;
    this.figureMesh = null;
    this.badgeElement = null;

    this.buildComfortAura();
    this.buildStylizedFigure();
    this.buildAnnotationBadge();

    this.scene.add(this.group);
  }

  buildComfortAura() {
    // 1. Soft glowing floor disc
    const discGeo = new THREE.CircleGeometry(0.8, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.auraMesh = new THREE.Mesh(discGeo, discMat);
    this.auraMesh.rotation.x = -Math.PI / 2;
    this.auraMesh.position.y = 0.005;
    this.group.add(this.auraMesh);

    // 2. High-tech outline perimeter ring
    const ringGeo = new THREE.RingGeometry(0.78, 0.82, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.auraRing = new THREE.Mesh(ringGeo, ringMat);
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.006;
    this.group.add(this.auraRing);
  }

  buildStylizedFigure() {
    const figureGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.35,
      metalness: 0.15,
    });

    // Ergonomic Chair Base & Seat
    const chairGroup = new THREE.Group();
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.48), chairMat);
    seat.position.y = 0.44;
    chairGroup.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.06), chairMat);
    back.position.set(0, 0.72, 0.22);
    chairGroup.add(back);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44), chairMat);
    stem.position.y = 0.22;
    chairGroup.add(stem);
    figureGroup.add(chairGroup);

    // Seated Figure: Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.52, 16), mat);
    torso.position.set(0, 0.76, 0.02);
    torso.castShadow = true;
    figureGroup.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 24), mat);
    head.position.set(0, 1.15, 0.02);
    head.castShadow = true;
    figureGroup.add(head);

    // Legs (seated 90 deg forward)
    const legGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.42, 12);
    const l1 = new THREE.Mesh(legGeo, mat);
    l1.position.set(-0.12, 0.21, -0.22);
    figureGroup.add(l1);

    const l2 = new THREE.Mesh(legGeo, mat);
    l2.position.set(0.12, 0.21, -0.22);
    figureGroup.add(l2);

    // Thighs
    const thighGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.38, 12);
    const t1 = new THREE.Mesh(thighGeo, mat);
    t1.rotation.x = Math.PI / 2;
    t1.position.set(-0.12, 0.46, -0.10);
    figureGroup.add(t1);

    const t2 = new THREE.Mesh(thighGeo, mat);
    t2.rotation.x = Math.PI / 2;
    t2.position.set(0.12, 0.46, -0.10);
    figureGroup.add(t2);

    this.figureMesh = figureGroup;
    this.group.add(figureGroup);
  }

  buildAnnotationBadge() {
    const div = document.createElement('div');
    div.className = 'annotation-tag';
    div.innerHTML = `<span class="tag-dot green"></span><span id="personTagText">Occupant: 24.0°C</span>`;

    const annotation = new CSS2DObject(div);
    annotation.position.set(0, 1.45, 0);
    this.group.add(annotation);
    this.badgeElement = div.querySelector('#personTagText');
    this.tagDotElement = div.querySelector('.tag-dot');
  }

  update(sensorData, setpoint = 24.0) {
    if (!sensorData) return;

    const temp = sensorData.temperature || 24.0;
    const diff = temp - setpoint;

    // Comfort color logic
    let targetColor = 0x10b981; // Emerald (Comfortable)
    let dotClass = 'green';
    let labelState = 'Comfortable';

    if (diff > 1.0) {
      targetColor = 0xfb923c; // Warm / Hot (Orange)
      dotClass = 'orange';
      labelState = 'Warm';
    } else if (diff < -1.0) {
      targetColor = 0x22d3ee; // Cold (Cyan)
      dotClass = 'cyan';
      labelState = 'Cool';
    }

    if (this.auraMesh && this.auraRing) {
      this.auraMesh.material.color.setHex(targetColor);
      this.auraRing.material.color.setHex(targetColor);
    }

    if (this.badgeElement) {
      this.badgeElement.innerText = `Occupant: ${temp.toFixed(1)}°C (${labelState})`;
    }
    if (this.tagDotElement) {
      this.tagDotElement.className = `tag-dot ${dotClass}`;
    }
  }
}

