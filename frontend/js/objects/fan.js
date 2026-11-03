import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * High-fidelity procedural ceiling fan with rotational inertia,
 * pitched blades, high-speed motion blur disc, and floating annotation badge.
 */
export class FanObject {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.position = options.position || new THREE.Vector3(0, 2.85, 0);

    this.group = new THREE.Group();
    this.group.name = 'CeilingFan';
    this.group.position.copy(this.position);

    this.currentSpeed = 0.0; // 0 - 100%
    this.targetSpeed = 0.0;
    this.angle = 0.0;
    this.wobblePhase = 0.0;

    this.rotorGroup = new THREE.Group();
    this.motionBlurDisc = null;
    this.badgeElement = null;

    this.buildMount();
    this.buildMotor();
    this.buildBlades();
    this.buildMotionBlurDisc();
    this.buildAnnotationBadge();

    this.group.add(this.rotorGroup);
    this.scene.add(this.group);
  }

  buildMount() {
    // Ceiling downrod
    const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.28, 16);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.2,
    });
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.y = 0.14;
    rod.castShadow = true;
    this.group.add(rod);

    // Ceiling canopy cap
    const capGeo = new THREE.CylinderGeometry(0.08, 0.04, 0.05, 16);
    const cap = new THREE.Mesh(capGeo, rodMat);
    cap.position.y = 0.26;
    this.group.add(cap);
  }

  buildMotor() {
    // Brushed metallic motor housing
    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.25,
    });

    const motorGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.12, 32);
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.y = 0.0;
    motor.castShadow = true;
    this.group.add(motor);

    // Integrated LED light ring
    const lightGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.04, 32);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.y = -0.06;
    this.group.add(light);
  }

  buildBlades() {
    const numBlades = 4;
    const bladeLength = 0.85;
    const bladeWidth = 0.14;

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.4,
      roughness: 0.3,
    });

    for (let i = 0; i < numBlades; i++) {
      const bladeArm = new THREE.Group();
      const bladeAngle = (i / numBlades) * Math.PI * 2;
      bladeArm.rotation.y = bladeAngle;

      // Extruded curved blade
      const shape = new THREE.Shape();
      shape.moveTo(0, -bladeWidth / 2);
      shape.lineTo(bladeLength * 0.8, -bladeWidth / 2);
      shape.quadraticCurveTo(bladeLength, 0, bladeLength * 0.8, bladeWidth / 2);
      shape.lineTo(0, bladeWidth / 2);
      shape.closePath();

      const extrudeSettings = { depth: 0.012, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.005, bevelThickness: 0.005 };
      const bladeGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
      bladeMesh.rotation.x = Math.PI / 2;
      bladeMesh.rotation.y = THREE.MathUtils.degToRad(12); // Aerodynamic pitch angle
      bladeMesh.position.set(0.12, -0.02, 0);
      bladeMesh.castShadow = true;

      bladeArm.add(bladeMesh);
      this.rotorGroup.add(bladeArm);
    }
  }

  buildMotionBlurDisc() {
    // Semi-transparent motion blur disc visible at high RPM
    const discGeo = new THREE.CircleGeometry(0.95, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.motionBlurDisc = new THREE.Mesh(discGeo, discMat);
    this.motionBlurDisc.rotation.x = Math.PI / 2;
    this.motionBlurDisc.position.y = -0.02;
    this.group.add(this.motionBlurDisc);
  }

  buildAnnotationBadge() {
    const div = document.createElement('div');
    div.className = 'annotation-tag';
    div.innerHTML = `<span class="tag-dot violet"></span><span id="fanTagText">Fan 0%</span>`;

    const annotation = new CSS2DObject(div);
    annotation.position.set(0.4, -0.15, 0);
    this.group.add(annotation);
    this.badgeElement = div.querySelector('#fanTagText');
  }

  update(fanData, deltaSec = 0.016) {
    if (!fanData) return;

    this.targetSpeed = fanData.current_speed || 0.0;

    // Smooth inertia lerp
    this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.targetSpeed, 0.08);

    // Angular velocity: 0 to 18 rad/s (approx 170 RPM)
    const angularSpeed = (this.currentSpeed / 100.0) * 18.0;
    this.angle += angularSpeed * deltaSec;
    this.rotorGroup.rotation.y = this.angle;

    // Physical high-speed micro-wobble
    if (this.currentSpeed > 60.0) {
      this.wobblePhase += 12.0 * deltaSec;
      const wobble = Math.sin(this.wobblePhase) * 0.005 * (this.currentSpeed / 100.0);
      this.rotorGroup.rotation.z = wobble;
    } else {
      this.rotorGroup.rotation.z = 0;
    }

    // Motion blur cross-fade
    if (this.motionBlurDisc) {
      const blurOpacity = THREE.MathUtils.smoothstep(this.currentSpeed, 50.0, 95.0) * 0.35;
      this.motionBlurDisc.material.opacity = blurOpacity;
    }

    // Update floating badge
    if (this.badgeElement) {
      this.badgeElement.innerText = `Fan ${Math.round(this.currentSpeed)}% (${Math.round(fanData.rpm || 0)} RPM)`;
    }
  }
}

