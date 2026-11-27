import * as THREE from 'three';
import type { SessionSnapshot } from '../simulation/types';
import { OTL_RIG_CONFIG, solveTwoBoneIK } from './kinematics';

const SIDES = 16;
const SLEEVE_RINGS = 13;
const UPPER_ARM_LENGTH = 0.265;
const LOWER_ARM_LENGTH = 0.255;

function sleeveGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(SLEEVE_RINGS * (SIDES + 1) * 3), 3),
  );
  const indices: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < SLEEVE_RINGS; r++) {
    for (let j = 0; j <= SIDES; j++) {
      uvs.push(j / SIDES, r / (SLEEVE_RINGS - 1));
    }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  for (let r = 1; r < SLEEVE_RINGS; r++) {
    for (let j = 0; j < SIDES; j++) {
      const a = r * (SIDES + 1) + j;
      const b = a - SIDES - 1;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  geometry.setIndex(indices);
  return geometry;
}

function poseSleeve(
  geometry: THREE.BufferGeometry,
  shoulder: THREE.Vector3,
  elbow: THREE.Vector3,
  wrist: THREE.Vector3,
): void {
  const curve = new THREE.CatmullRomCurve3([shoulder, elbow, wrist]);
  const positions = geometry.getAttribute('position');
  const upRef = new THREE.Vector3(0, 0, 1);
  for (let r = 0; r < SLEEVE_RINGS; r++) {
    const t = r / (SLEEVE_RINGS - 1);
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const side = upRef.clone().cross(tangent).normalize();
    const normal = tangent.clone().cross(side).normalize();
    const radius =
      (t < 0.5 ? 0.050 - t * 0.016 : 0.042 - (t - 0.5) * 0.026) +
      0.002 * Math.sin(t * Math.PI * 10) * Math.exp(-Math.pow((t - 0.65) / 0.25, 2));
    for (let j = 0; j <= SIDES; j++) {
      const angle = (j / SIDES) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(side, Math.cos(angle) * radius)
        .addScaledVector(normal, Math.sin(angle) * radius);
      positions.setXYZ(r * (SIDES + 1) + j, p.x, p.y, p.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function fabricTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const shade = 185 + ((x * 13 + y * 7) % 17) + ((x + y) % 3 === 0 ? 18 : 0);
      context.fillStyle = `rgb(${shade},${shade},${shade})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4);
  return texture;
}

function createArmSleeveSystem(
  kartLocalRoot: THREE.Object3D,
  suitMaterial: THREE.Material,
  gloveLeft: THREE.Object3D,
  gloveRight: THREE.Object3D,
) {
  const arms = (
    [
      [-1, gloveLeft],
      [1, gloveRight],
    ] as const
  ).map(([side, glove]) => {
    const geometry = sleeveGeometry();
    const sleeveMesh = new THREE.Mesh(geometry, suitMaterial);
    sleeveMesh.name = side < 0 ? 'Left arm sleeve' : 'Right arm sleeve';
    sleeveMesh.castShadow = sleeveMesh.receiveShadow = true;
    kartLocalRoot.add(sleeveMesh);

    return {
      side,
      geometry,
      glove,
      shoulder: new THREE.Vector3(
        OTL_RIG_CONFIG.driverShoulder[0],
        OTL_RIG_CONFIG.driverShoulder[1],
        side * OTL_RIG_CONFIG.driverShoulder[2],
      ),
      pole: new THREE.Vector3(-0.06, -0.25, side * 0.96),
    };
  });

  const wristLocal = new THREE.Vector3(...OTL_RIG_CONFIG.gloveWristLocal);
  let lastSteering = Number.NaN;

  function updateArms(steeringWheelAngleRad: number): void {
    if (lastSteering === steeringWheelAngleRad) return;
    lastSteering = steeringWheelAngleRad;
    kartLocalRoot.updateWorldMatrix(true, true);
    for (const arm of arms) {
      const wristWorld = arm.glove.localToWorld(wristLocal.clone());
      const wrist = kartLocalRoot.worldToLocal(wristWorld);
      const ik = solveTwoBoneIK(
        arm.shoulder,
        wrist,
        UPPER_ARM_LENGTH,
        LOWER_ARM_LENGTH,
        arm.pole,
      );
      ik.mid.y = Math.max(ik.mid.y, 0.355);
      ik.mid.z = arm.side * Math.min(Math.abs(ik.mid.z), 0.185);
      poseSleeve(arm.geometry, arm.shoulder, ik.mid, ik.end);
    }
  }

  return updateArms;
}

/**
 * Wires the GLB-loaded Driver_Head, gloves, and dynamic 2-bone IK arm sleeves
 * onto the cloned Kart GLTF hierarchy.
 */
export function attachGltfDriver(
  kartVisualRoot: THREE.Object3D,
  headNode: THREE.Object3D | undefined,
  gloveLeft: THREE.Object3D | undefined,
  gloveRight: THREE.Object3D | undefined,
  suitMaterial: THREE.Material,
): { update(snapshot: SessionSnapshot): void } {
  const updateArms =
    gloveLeft && gloveRight
      ? createArmSleeveSystem(kartVisualRoot, suitMaterial, gloveLeft, gloveRight)
      : null;

  return {
    update(snapshot: SessionSnapshot) {
      if (headNode) headNode.visible = snapshot.camera.mode !== 'Helmet Cam';
      updateArms?.(snapshot.kart.steeringWheelAngleRad);
    },
  };
}

/**
 * Lightweight synchronous fallback driver rig used only when `createKartRig()`
 * is called without preloaded GLB assets (e.g. headless Node/Vitest tests).
 */
export function createSeatedDriver(root: THREE.Group, steeringWheel: THREE.Group) {
  const driver = new THREE.Group();
  driver.name = 'Seated helmeted driver';
  root.add(driver);

  const fabric = fabricTexture();
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x22303c,
    roughness: 0.9,
    bumpMap: fabric,
    bumpScale: 0.00018,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xe6e9e6,
    metalness: 0.06,
    roughness: 0.24,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x182634,
    metalness: 0.65,
    roughness: 0.14,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 4, 10), suitMat);
  torso.position.set(-0.27, 0.34, 0);
  torso.rotation.z = 0.52;
  driver.add(torso);

  const head = new THREE.Group();
  head.name = 'Helmet and neck';
  driver.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), helmetMat);
  helmet.position.set(-0.325, 0.703, 0);
  head.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.19), visorMat);
  visor.position.set(-0.22, 0.71, 0);
  head.add(visor);

  const gloves: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.45, 4, 8), suitMat);
    leg.position.set(0.12, 0.16, side * 0.11);
    leg.rotation.z = Math.PI / 2 - 0.12;
    driver.add(leg);

    const glove = new THREE.Group();
    glove.name = side < 0 ? 'Left hand grip' : 'Right hand grip';
    steeringWheel.add(glove);
    glove.position.set(
      OTL_RIG_CONFIG.gloveGripOffset[0],
      OTL_RIG_CONFIG.gloveGripOffset[1],
      side * OTL_RIG_CONFIG.gloveGripOffset[2],
    );
    const gloveMesh = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), visorMat);
    glove.add(gloveMesh);
    gloves.push(glove);
  }

  const updateArms = createArmSleeveSystem(root, suitMat, gloves[0], gloves[1]);

  function update(snapshot: SessionSnapshot) {
    head.visible = snapshot.camera.mode !== 'Helmet Cam';
    updateArms(snapshot.kart.steeringWheelAngleRad);
  }
  return { update };
}
