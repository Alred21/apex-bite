import * as THREE from 'three';
import type { SessionSnapshot } from '../simulation/types';
import {
  DRIVERFIXED_BATCHES,
  DRIVERHEAD_BATCHES,
  GLOVELEFT_BATCHES,
  GLOVERIGHT_BATCHES,
  OTL_RIG_CONFIG,
} from './otl-superleggero-meshes';
import { addBlenderBatches } from './blender-batches';

// Reclined seated driver (~35° backrest angle, helmet crown y ≈ 0.82 m below the
// 0.86 m OTL Superleggero roll hoop), authored in Blender via tools/build-kart-model.py.
const SIDES = 20;
const SLEEVE_RINGS = 15;

/** Two-link arm solve from reclined shoulder to rotating F1 steering yoke grip. */
function elbowFor(shoulder: THREE.Vector3, wrist: THREE.Vector3, side: number): THREE.Vector3 {
  const axis = wrist.clone().sub(shoulder);
  const distance = axis.length();
  axis.normalize();
  const upper = 0.265;
  const lower = 0.255;
  const along = Math.max(
    0,
    Math.min(distance, (upper * upper - lower * lower + distance * distance) / (2 * distance)),
  );
  const bend = new THREE.Vector3(-0.06, -0.25, side * 0.96);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  const elbow = shoulder
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  elbow.y = Math.max(elbow.y, 0.355);
  elbow.z = side * Math.min(Math.abs(elbow.z), 0.185);
  return elbow;
}

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
  for (let r = 0; r < SLEEVE_RINGS; r++) {
    const t = r / (SLEEVE_RINGS - 1);
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const side = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
    const normal = tangent.clone().cross(side).normalize();
    const radius =
      (t < 0.5 ? 0.052 - t * 0.018 : 0.043 - (t - 0.5) * 0.030) +
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

export function createSeatedDriver(root: THREE.Group, steeringWheel: THREE.Group) {
  const driver = new THREE.Group();
  driver.name = 'Seated helmeted driver';
  root.add(driver);
  const fixed = new THREE.Group();
  driver.add(fixed);
  const head = new THREE.Group();
  head.name = 'Helmet and neck';
  driver.add(head);

  const fabric = fabricTexture();
  const materials: Record<string, THREE.Material> = {
    suit: new THREE.MeshStandardMaterial({
      color: 0x22303c,
      roughness: 0.9,
      bumpMap: fabric,
      bumpScale: 0.00018,
    }),
    panel: new THREE.MeshStandardMaterial({
      color: 0x566068,
      roughness: 0.88,
      bumpMap: fabric,
      bumpScale: 0.00012,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0xc91e24, roughness: 0.62 }),
    harness: new THREE.MeshStandardMaterial({ color: 0xc8151d, roughness: 0.68 }),
    alloy: new THREE.MeshStandardMaterial({ color: 0xa4acb4, metalness: 0.88, roughness: 0.24 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.68 }),
    glovePad: new THREE.MeshStandardMaterial({
      color: 0x343c43,
      roughness: 0.82,
      bumpMap: fabric,
      bumpScale: 0.00012,
    }),
    helmet: new THREE.MeshStandardMaterial({
      color: 0xe6e9e6,
      metalness: 0.06,
      roughness: 0.24,
    }),
    visor: new THREE.MeshStandardMaterial({
      color: 0x182634,
      metalness: 0.65,
      roughness: 0.14,
    }),
  };

  addBlenderBatches(DRIVERFIXED_BATCHES, materials, fixed, 'suit');
  addBlenderBatches(DRIVERHEAD_BATCHES, materials, head, 'suit');

  const arms = ([-1, 1] as const).map((side) => {
    const geometry = sleeveGeometry();
    const sleeveMesh = new THREE.Mesh(geometry, materials.suit);
    sleeveMesh.name = side < 0 ? 'Left arm sleeve' : 'Right arm sleeve';
    sleeveMesh.castShadow = sleeveMesh.receiveShadow = true;
    driver.add(sleeveMesh);

    const glove = new THREE.Group();
    glove.name = side < 0 ? 'Left hand grip' : 'Right hand grip';
    steeringWheel.add(glove);
    glove.position.set(
      OTL_RIG_CONFIG.gloveGripOffset[0],
      OTL_RIG_CONFIG.gloveGripOffset[1],
      side * OTL_RIG_CONFIG.gloveGripOffset[2],
    );
    addBlenderBatches(side < 0 ? GLOVELEFT_BATCHES : GLOVERIGHT_BATCHES, materials, glove, 'suit');

    return {
      side,
      geometry,
      glove,
      shoulder: new THREE.Vector3(
        OTL_RIG_CONFIG.driverShoulder[0],
        OTL_RIG_CONFIG.driverShoulder[1],
        side * OTL_RIG_CONFIG.driverShoulder[2],
      ),
    };
  });

  let lastSteering = Number.NaN;
  const wristLocal = new THREE.Vector3(...OTL_RIG_CONFIG.gloveWristLocal);
  function update(snapshot: SessionSnapshot) {
    head.visible = snapshot.camera.mode !== 'Helmet Cam';
    if (lastSteering === snapshot.kart.steeringWheelAngleRad) return;
    lastSteering = snapshot.kart.steeringWheelAngleRad;
    root.updateWorldMatrix(true, true);
    for (const arm of arms) {
      const wrist = root.worldToLocal(arm.glove.localToWorld(wristLocal.clone()));
      poseSleeve(arm.geometry, arm.shoulder, elbowFor(arm.shoulder, wrist, arm.side), wrist);
    }
  }
  return { update };
}
