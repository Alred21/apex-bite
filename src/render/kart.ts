import * as THREE from 'three';
import { createSeatedDriver } from './driver';
import { KART_WHEEL_GEOMETRY } from '../simulation/kart-parameters';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SessionSnapshot } from '../simulation/types';
import {
  STATIONARY_BATCHES,
  STEERINGWHEEL_BATCHES,
  type BlenderGroupBatches,
} from './otl-superleggero-meshes';

// Metres, +X forward, +Z right. The OTL Superleggero wraparound bumper remains
// inside the solver's 0.45 m half-width; front and rear axles retain 1.06 m wheelbase.
const FRONT_AXLE = KART_WHEEL_GEOMETRY.frontAxleMeters;
const REAR_AXLE = KART_WHEEL_GEOMETRY.rearAxleMeters;
const TIRE_RADIUS = KART_WHEEL_GEOMETRY.tireRadiusMeters;
const FRONT_TRACK_HALF = KART_WHEEL_GEOMETRY.frontTrackHalfMeters;
const REAR_TRACK_HALF = KART_WHEEL_GEOMETRY.rearTrackHalfMeters;

export interface KartRig {
  root: THREE.Group;
  update(snapshot: SessionSnapshot): void;
}

function surfaceTexture(kind: 'rubber' | 'weave'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = kind === 'rubber' ? 256 : 128;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kind === 'rubber' ? '#b8b8b8' : '#505050';
  ctx.fillRect(0, 0, size, size);
  let seed = 7129;
  const step = kind === 'rubber' ? 1 : 2;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      seed = (seed * 16807) % 2147483647;
      const shade = kind === 'rubber' ? 170 + (seed % 45) : 65 + ((x + y) % 8) * 12;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x, y, step, kind === 'weave' ? 4 : 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, kind === 'weave' ? 4 : 2);
  return texture;
}

function decalTexture(label: string, sublabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#10151a';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#c8141e';
  ctx.fillRect(0, 0, 26, 256);
  ctx.fillStyle = '#f4f5f2';
  ctx.font = 'italic 900 104px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, 272, 132);
  ctx.fillStyle = '#d6e72c';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(sublabel, 272, 196);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sidewallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.translate(128, 128);
  context.fillStyle = '#a5aaa4';
  context.font = 'bold 15px Arial';
  context.textAlign = 'center';
  for (const [text, offset] of [
    ['OTL CORSE', -0.26],
    ['INDOOR SLICK', Math.PI - 0.55],
  ] as const) {
    [...text].forEach((letter, index) => {
      context.save();
      context.rotate(offset + index * 0.11);
      context.fillText(letter, 0, -105);
      context.restore();
    });
  }
  context.strokeStyle = '#686e69';
  context.lineWidth = 2;
  for (const radius of [90, 118]) {
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBlenderBatches(
  batches: BlenderGroupBatches,
  materials: Record<string, THREE.Material>,
  parent: THREE.Group,
): void {
  for (const [matKey, batch] of Object.entries(batches)) {
    const material = materials[matKey] ?? materials.red;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    const uvCount = batch.positions.length / 3;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(uvCount * 2), 2));
    geometry.setIndex(batch.indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function consolidate(group: THREE.Group): void {
  group.updateWorldMatrix(true, true);
  const localFromWorld = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(localFromWorld, object.matrixWorld),
    );
    if (!geometry.getAttribute('uv')) {
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2),
      );
    }
    const geometries = batches.get(object.material) ?? [];
    geometries.push(geometry);
    batches.set(object.material, geometries);
  });
  group.clear();
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('Incompatible Kart surface geometry');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach((item) => item.dispose());
  }
}

export function createKartRig(): KartRig {
  const root = new THREE.Group();
  root.name = 'Electric rental Kart';
  const stationary = new THREE.Group();
  root.add(stationary);

  const rubberNoise = surfaceTexture('rubber');
  const weave = surfaceTexture('weave');
  const red = new THREE.MeshStandardMaterial({ color: 0xb8101c, roughness: 0.34, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.50 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeff2, roughness: 0.32, metalness: 0.02 });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x171819,
    roughness: 0.88,
    bumpMap: rubberNoise,
    bumpScale: 0.00015,
    roughnessMap: rubberNoise,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x50565c, metalness: 0.88, roughness: 0.3 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xa1a8af, metalness: 0.9, roughness: 0.24 });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x24282c,
    roughness: 0.68,
    bumpMap: weave,
    bumpScale: 0.001,
    side: THREE.DoubleSide,
  });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd5e52a, roughness: 0.38 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86818, roughness: 0.5 });
  const decal = new THREE.MeshStandardMaterial({
    map: decalTexture('K1 / 07', 'OTL SUPERLEGGERO'),
    roughness: 0.42,
  });
  const sidewall = new THREE.MeshStandardMaterial({
    map: sidewallTexture(),
    transparent: true,
    alphaTest: 0.05,
    roughness: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const boltGeometry = new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6);

  const materials: Record<string, THREE.Material> = {
    red,
    black,
    white,
    rubber,
    steel,
    alloy,
    carbon,
    accent,
    orange,
  };

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Group = stationary,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Load Blender-authored OTL Superleggero stationary bodywork, wraparound Protex bumper,
  // sculpted sidepods, nose cone, floor pan, reclined bucket seat, roll hoop, and rear shroud.
  addBlenderBatches(STATIONARY_BATCHES, materials, stationary);

  // Livery number & K1 Speed / OTL Superleggero decal plates on sidepods and nose cone
  for (const side of [-1, 1]) {
    const label = add(new THREE.PlaneGeometry(0.28, 0.058), decal, -0.14, 0.30, side * 0.312);
    label.rotation.x = -Math.PI / 2;
  }
  const noseDecal = add(new THREE.PlaneGeometry(0.20, 0.11), decal, 0.62, 0.286, 0);
  noseDecal.rotation.set(-Math.PI / 2, 0.12, -Math.PI / 2);

  // Ventilated rear brake rotor & caliper hardware visible beside the rear powertrain shroud
  const brake = add(new THREE.CylinderGeometry(0.095, 0.095, 0.009, 28), alloy, REAR_AXLE, TIRE_RADIUS, -0.205);
  brake.rotation.x = Math.PI / 2;

  // Articulated 4-wheel indoor slick assemblies
  const wheels: THREE.Group[] = [];
  const frontPivots: THREE.Group[] = [];
  const tireProfile = [
    [0.096, -0.071],
    [0.123, -0.069],
    [0.141, -0.052],
    [0.145, -0.031],
    [0.145, 0.031],
    [0.141, 0.052],
    [0.123, 0.069],
    [0.096, 0.071],
  ].map(([r, x]) => new THREE.Vector2(r, x));
  const tireGeometry = new THREE.LatheGeometry(tireProfile, 48);
  tireGeometry.rotateX(Math.PI / 2);

  for (const front of [false, true]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(
        front ? FRONT_AXLE : REAR_AXLE,
        TIRE_RADIUS,
        side * (front ? FRONT_TRACK_HALF : REAR_TRACK_HALF),
      );
      root.add(pivot);
      if (front) frontPivots.push(pivot);
      const roll = new THREE.Group();
      pivot.add(roll);
      wheels.push(roll);
      add(tireGeometry, rubber, 0, 0, 0, roll);
      const rim = add(new THREE.CylinderGeometry(0.092, 0.092, 0.13, 24), alloy, 0, 0, 0, roll);
      rim.rotation.x = Math.PI / 2;
      const well = add(new THREE.CylinderGeometry(0.073, 0.073, 0.133, 24), black, 0, 0, 0, roll);
      well.rotation.x = Math.PI / 2;
      const hub = add(new THREE.CylinderGeometry(0.035, 0.035, 0.141, 16), alloy, 0, 0, 0, roll);
      hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const spoke = add(
          new THREE.CapsuleGeometry(0.009, 0.042, 3, 6),
          alloy,
          Math.sin(angle) * 0.048,
          Math.cos(angle) * 0.048,
          side * 0.069,
          roll,
        );
        spoke.rotation.z = -angle;
        const bolt = add(
          boltGeometry,
          steel,
          Math.sin(angle) * 0.025,
          Math.cos(angle) * 0.025,
          side * 0.076,
          roll,
        );
        bolt.rotation.x = Math.PI / 2;
      }
      const marking = add(new THREE.PlaneGeometry(0.28, 0.28), sidewall, 0, 0, side * 0.0715, roll);
      if (side < 0) marking.rotation.y = Math.PI;
      consolidate(roll);
    }
  }

  // Lowered F1-style steering wheel mount (y = 0.36 m to match reclined driver & 0.75 m Helmet Cam)
  const steeringMount = new THREE.Group();
  steeringMount.position.set(0.21, 0.36, 0);
  steeringMount.rotation.z = 0.4;
  const steeringWheel = new THREE.Group();
  steeringMount.add(steeringWheel);
  root.add(steeringMount);
  addBlenderBatches(STEERINGWHEEL_BATCHES, materials, steeringWheel);

  // Fixed digital instrument binnacle (y = 0.483 m to stay centered in Helmet Cam)
  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 256;
  dashCanvas.height = 128;
  const dashContext = dashCanvas.getContext('2d')!;
  const dashTexture = new THREE.CanvasTexture(dashCanvas);
  dashTexture.colorSpace = THREE.SRGBColorSpace;
  const dashMaterial = new THREE.MeshBasicMaterial({ map: dashTexture });
  const dashScreen = add(new THREE.PlaneGeometry(0.126, 0.06), dashMaterial, 0.249, 0.483);
  dashScreen.rotation.set(0, -Math.PI / 2, 0.3, 'ZYX');
  const dashControls = new THREE.Group();
  dashControls.position.copy(dashScreen.position);
  dashControls.rotation.copy(dashScreen.rotation);
  stationary.add(dashControls);
  for (const x of [-0.068, 0.068]) {
    for (const y of [-0.025, 0.025]) {
      const screw = add(
        new THREE.CylinderGeometry(0.0015, 0.0015, 0.001, 6),
        steel,
        x,
        y,
        0.001,
        dashControls,
      );
      screw.rotation.x = Math.PI / 2;
    }
  }
  for (const [x, color] of [
    [-0.068, 0x287dcc],
    [0.068, 0xd7b82a],
  ] as const) {
    const button = add(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.58 }),
      x,
      0,
      0.002,
      dashControls,
    );
    button.rotation.x = Math.PI / 2;
  }

  consolidate(stationary);
  const driver = createSeatedDriver(root, steeringWheel);

  let lastElapsed: number | undefined;
  let lastPosition: { x: number; z: number } | undefined;
  let lastSpeed = 0;
  let wheelAngle = 0;
  let displayedSpeed = -1;

  function update(snapshot: SessionSnapshot): void {
    const { kart, elapsedSeconds } = snapshot;
    root.position.set(kart.position.x, 0, kart.position.z);
    root.rotation.y = -kart.headingRad;
    frontPivots.forEach((pivot) => {
      pivot.rotation.y = -kart.steerAngleRad;
    });
    steeringWheel.rotation.x = kart.steeringWheelAngleRad;
    driver.update(snapshot);
    const dt = lastElapsed === undefined ? 0 : elapsedSeconds - lastElapsed;
    const distance = lastPosition
      ? Math.hypot(kart.position.x - lastPosition.x, kart.position.z - lastPosition.z)
      : 0;
    if (dt > 0 && dt <= 0.25 && distance < Math.max(0.3, dt * 15)) {
      wheelAngle = (wheelAngle - ((lastSpeed + kart.speedMps) * 0.5 * dt) / TIRE_RADIUS) % (Math.PI * 2);
    }
    wheels.forEach((wheel) => {
      wheel.rotation.z = wheelAngle;
    });
    lastElapsed = elapsedSeconds;
    lastSpeed = kart.speedMps;
    lastPosition = { ...kart.position };
    const speed = Math.round(kart.speedKph);
    if (speed !== displayedSpeed) {
      displayedSpeed = speed;
      dashContext.fillStyle = '#101f20';
      dashContext.fillRect(0, 0, 256, 128);
      dashContext.fillStyle = '#b7e6d7';
      dashContext.font = 'bold 70px monospace';
      dashContext.textAlign = 'center';
      dashContext.fillText(String(speed).padStart(2, '0'), 100, 84);
      dashContext.font = '18px monospace';
      dashContext.fillText('KM/H', 198, 83);
      dashContext.fillStyle = '#d3e52d';
      dashContext.fillRect(20, 105, 214, 5);
      dashTexture.needsUpdate = true;
    }
  }
  return { root, update };
}
