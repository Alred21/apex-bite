import * as THREE from 'three';
import { createSeatedDriver } from './driver';
import { KART_WHEEL_GEOMETRY } from '../simulation/kart-parameters';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SessionSnapshot } from '../simulation/types';
import {
  STATIONARY_BATCHES,
  STEERINGWHEEL_BATCHES,
} from './otl-superleggero-meshes';
import { addBlenderBatches } from './blender-batches';

/** Calibrated OTL Superleggero cockpit reference coordinates. */
export const STEERING_WHEEL_HUB_X_METERS = 0.185;
export const STEERING_WHEEL_HUB_HEIGHT_METERS = 0.355;
export const STEERING_WHEEL_TILT_RAD = 0.35;
export const DASH_BINNACLE_X_METERS = 0.262;
export const DASH_BINNACLE_HEIGHT_METERS = 0.478;

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

function surfaceTexture(kind: 'rubber' | 'weave'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
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

function decalTexture(label: string, sublabel: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
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

function sidewallTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
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
  addBlenderBatches(STATIONARY_BATCHES, materials, stationary, 'red', true);

  // Livery number & K1 Speed / OTL Superleggero decal plates flush above flat sidepod & nose plateaus
  for (const side of [-1, 1]) {
    const label = add(new THREE.PlaneGeometry(0.24, 0.050), decal, -0.02, 0.292, side * 0.290);
    label.rotation.x = -Math.PI / 2;
  }
  const noseDecal = add(new THREE.PlaneGeometry(0.16, 0.080), decal, 0.585, 0.242, 0);
  noseDecal.rotation.set(-Math.PI / 2, 0.148, -Math.PI / 2);

  // Ventilated cross-slotted rear brake rotor + hub carrier mounted coaxially on the rear live axle (spins with wheelAngle)
  const rearBrakeDisc = new THREE.Group();
  rearBrakeDisc.name = 'Rear brake rotor';
  rearBrakeDisc.position.set(REAR_AXLE, TIRE_RADIUS, -0.215);
  root.add(rearBrakeDisc);
  const rotorRing = add(new THREE.CylinderGeometry(0.095, 0.095, 0.009, 28), alloy, 0, 0, 0, rearBrakeDisc);
  rotorRing.rotation.x = Math.PI / 2;
  const rotorBell = add(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 20), black, 0, 0, 0, rearBrakeDisc);
  rotorBell.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const slot = add(
      new THREE.BoxGeometry(0.006, 0.034, 0.011),
      black,
      Math.cos(ang) * 0.072,
      Math.sin(ang) * 0.072,
      0,
      rearBrakeDisc,
    );
    slot.rotation.z = ang + 0.35;
    const bobbin = add(
      boltGeometry,
      steel,
      Math.cos(ang) * 0.052,
      Math.sin(ang) * 0.052,
      0,
      rearBrakeDisc,
    );
    bobbin.rotation.x = Math.PI / 2;
  }
  consolidate(rearBrakeDisc);

  // Toothed synchronous rear drive pulley mounted coaxially on the right side of the rear live axle (spins with wheelAngle)
  const rearDrivePulley = new THREE.Group();
  rearDrivePulley.name = 'Rear drive pulley';
  rearDrivePulley.position.set(REAR_AXLE, TIRE_RADIUS, 0.210);
  root.add(rearDrivePulley);
  const pulleyCore = add(new THREE.CylinderGeometry(0.068, 0.068, 0.020, 24), alloy, 0, 0, 0, rearDrivePulley);
  pulleyCore.rotation.x = Math.PI / 2;
  for (const fz of [-0.011, 0.011]) {
    const flange = add(new THREE.CylinderGeometry(0.073, 0.073, 0.003, 24), black, 0, 0, fz, rearDrivePulley);
    flange.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const spokeBar = add(
      new THREE.BoxGeometry(0.010, 0.036, 0.022),
      black,
      Math.cos(ang) * 0.042,
      Math.sin(ang) * 0.042,
      0,
      rearDrivePulley,
    );
    spokeBar.rotation.z = ang;
  }
  consolidate(rearDrivePulley);

  // Articulated front steering knuckles, Pitman arm, and 3D kinematic tie-rod linkages
  const frontKnuckles: THREE.Group[] = [];
  const tieRods: { group: THREE.Group; side: -1 | 1; baseLength: number }[] = [];

  const pitmanPivot = new THREE.Group();
  pitmanPivot.name = 'Steering pitman arm';
  pitmanPivot.position.set(0.458, 0.192, 0);
  root.add(pitmanPivot);
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.022, 14), steel, 0, 0, 0, pitmanPivot);
  for (const side of [-1, 1] as const) {
    const ear = add(
      new THREE.BoxGeometry(0.016, 0.010, 0.042),
      alloy,
      -0.004,
      0,
      side * 0.019,
      pitmanPivot,
    );
    ear.rotation.y = -side * 0.18;
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 12), steel, -0.008, 0, side * 0.038, pitmanPivot);
  }
  consolidate(pitmanPivot);

  for (const side of [-1, 1] as const) {
    const knuckle = new THREE.Group();
    knuckle.name = side < 0 ? 'Left steering knuckle' : 'Right steering knuckle';
    knuckle.position.set(FRONT_AXLE, TIRE_RADIUS, side * 0.168);
    root.add(knuckle);
    frontKnuckles.push(knuckle);

    // Kingpin upright barrel coaxial with OTL_Kingpin_Bolt inside OTL_Kingpin_C_Yoke
    add(new THREE.CylinderGeometry(0.013, 0.013, 0.056, 14), alloy, 0, 0, 0, knuckle);
    // Forged knuckle steering arm rising rearward to outer Heim joint at (-0.068, +0.047, -side * 0.010)
    const arm = add(
      new THREE.CapsuleGeometry(0.007, 0.068, 4, 8),
      alloy,
      -0.034,
      0.035,
      -side * 0.005,
      knuckle,
    );
    arm.rotation.set(side * 0.14, 0, 1.24);
    add(
      new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 12),
      steel,
      -0.068,
      0.047,
      -side * 0.010,
      knuckle,
    );
    consolidate(knuckle);

    // Kinematic Tie Rod with turnbuckle shaft, jam nuts, and spherical Heim joints at both ends
    const baseLength = Math.hypot(0.472 - 0.450, 0.158 - 0.038);
    const tieRod = new THREE.Group();
    tieRod.name = side < 0 ? 'Left tie rod' : 'Right tie rod';
    root.add(tieRod);
    const shaft = add(
      new THREE.CylinderGeometry(0.0055, 0.0055, baseLength - 0.022, 8),
      alloy,
      0,
      0,
      0,
      tieRod,
    );
    shaft.rotation.x = Math.PI / 2;
    for (const endSign of [-1, 1] as const) {
      const nut = add(
        new THREE.CylinderGeometry(0.0078, 0.0078, 0.010, 6),
        red,
        0,
        0,
        endSign * (baseLength * 0.5 - 0.018),
        tieRod,
      );
      nut.rotation.x = Math.PI / 2;
      add(
        new THREE.CylinderGeometry(0.0105, 0.0105, 0.010, 14),
        steel,
        0,
        0,
        endSign * (baseLength * 0.5),
        tieRod,
      );
      add(
        new THREE.CylinderGeometry(0.0048, 0.0048, 0.022, 10),
        alloy,
        0,
        0,
        endSign * (baseLength * 0.5),
        tieRod,
      );
    }
    consolidate(tieRod);
    tieRods.push({ group: tieRod, side, baseLength });
  }

  // Articulated footwell pedals (Brake on left side = -1, Throttle on right side = +1)
  const pedalPivots: { group: THREE.Group; side: -1 | 1 }[] = [];
  for (const side of [-1, 1] as const) {
    const pedal = new THREE.Group();
    pedal.name = side < 0 ? 'Brake pedal' : 'Throttle pedal';
    pedal.position.set(0.428, 0.095, side * 0.075);
    root.add(pedal);
    const hinge = add(new THREE.CylinderGeometry(0.010, 0.010, 0.028, 12), steel, 0, 0, 0, pedal);
    hinge.rotation.x = Math.PI / 2;
    const arm = add(new THREE.CapsuleGeometry(0.006, 0.076, 4, 8), alloy, -0.003, 0.044, 0, pedal);
    arm.rotation.z = 0.08;
    add(new THREE.BoxGeometry(0.006, 0.068, 0.042), alloy, -0.007, 0.056, 0, pedal);
    add(
      new THREE.BoxGeometry(0.004, 0.028, 0.038),
      side < 0 ? red : accent,
      -0.010,
      0.072,
      0,
      pedal,
    );
    const pushrod = add(
      new THREE.CylinderGeometry(0.004, 0.004, 0.042, 8),
      steel,
      -0.024,
      0.018,
      side * 0.032,
      pedal,
    );
    pushrod.rotation.z = Math.PI / 2;
    consolidate(pedal);
    pedalPivots.push({ group: pedal, side });
  }

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
      if (front) {
        frontPivots.push(pivot);
        // Kingpin hub collar centered on the front wheel pivot so it stays joined to the kingpin axle at all steer angles
        const kingpinCollar = add(
          new THREE.CylinderGeometry(0.022, 0.022, 0.065, 16),
          steel,
          0,
          0,
          -side * 0.045,
          pivot,
        );
        kingpinCollar.rotation.x = Math.PI / 2;
      }
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
      // Inboard splined wheel hub carrier & outboard center spindle locknut + valve stem
      const innerCarrier = add(
        new THREE.CylinderGeometry(0.028, 0.032, 0.036, 16),
        alloy,
        0,
        0,
        -side * 0.068,
        roll,
      );
      innerCarrier.rotation.x = Math.PI / 2;
      const spindleNut = add(
        new THREE.CylinderGeometry(0.015, 0.015, 0.012, 6),
        steel,
        0,
        0,
        side * 0.073,
        roll,
      );
      spindleNut.rotation.x = Math.PI / 2;
      const hubCap = add(
        new THREE.CylinderGeometry(0.010, 0.010, 0.014, 12),
        red,
        0,
        0,
        side * 0.074,
        roll,
      );
      hubCap.rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.0025, 0.0025, 0.014, 8), steel, 0, -0.076, side * 0.064, roll);
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

  // Lowered F1-style steering wheel mount (calibrated to reclined driver & 0.75 m Helmet Cam)
  const steeringMount = new THREE.Group();
  steeringMount.position.set(STEERING_WHEEL_HUB_X_METERS, STEERING_WHEEL_HUB_HEIGHT_METERS, 0);
  steeringMount.rotation.z = STEERING_WHEEL_TILT_RAD;
  const steeringWheel = new THREE.Group();
  steeringMount.add(steeringWheel);
  root.add(steeringMount);
  addBlenderBatches(STEERINGWHEEL_BATCHES, materials, steeringWheel, 'red', true);

  // Fixed digital instrument binnacle flush on the Nassau tower brow
  const dashCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (dashCanvas) {
    dashCanvas.width = 256;
    dashCanvas.height = 128;
  }
  const dashContext = dashCanvas ? dashCanvas.getContext('2d')! : null;
  const dashTexture = dashCanvas ? new THREE.CanvasTexture(dashCanvas) : null;
  if (dashTexture) dashTexture.colorSpace = THREE.SRGBColorSpace;
  const dashMaterial = new THREE.MeshBasicMaterial({ map: dashTexture, color: 0x101f20 });
  const dashScreen = add(
    new THREE.PlaneGeometry(0.126, 0.06),
    dashMaterial,
    DASH_BINNACLE_X_METERS,
    DASH_BINNACLE_HEIGHT_METERS,
  );
  dashScreen.rotation.set(0, -Math.PI / 2, 0.22, 'ZYX');
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
    const steerYaw = -kart.steerAngleRad;
    frontPivots.forEach((pivot) => {
      pivot.rotation.y = steerYaw;
    });
    frontKnuckles.forEach((knuckle) => {
      knuckle.rotation.y = steerYaw;
    });
    pitmanPivot.rotation.y = steerYaw;
    const cs = Math.cos(steerYaw);
    const ss = Math.sin(steerYaw);
    for (const tr of tieRods) {
      const innerX = 0.458 + (-0.008 * cs + tr.side * 0.038 * ss);
      const innerZ = 0.008 * ss + tr.side * 0.038 * cs;
      const outerX = FRONT_AXLE + (-0.068 * cs - tr.side * 0.010 * ss);
      const outerZ = tr.side * 0.168 + 0.068 * ss - tr.side * 0.010 * cs;
      tr.group.position.set((innerX + outerX) * 0.5, 0.192, (innerZ + outerZ) * 0.5);
      tr.group.rotation.y = Math.atan2(outerX - innerX, outerZ - innerZ);
      tr.group.scale.z = Math.hypot(outerX - innerX, outerZ - innerZ) / tr.baseLength;
    }
    for (const p of pedalPivots) {
      const input = p.side < 0 ? kart.brakeInput : kart.throttleInput;
      p.group.rotation.z = -input * 0.24;
    }
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
    rearBrakeDisc.rotation.z = wheelAngle;
    rearDrivePulley.rotation.z = wheelAngle;
    lastElapsed = elapsedSeconds;
    lastSpeed = kart.speedMps;
    lastPosition = { ...kart.position };
    const speed = Math.round(kart.speedKph);
    if (speed !== displayedSpeed && dashContext && dashTexture) {
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
