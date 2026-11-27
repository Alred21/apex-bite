import * as THREE from 'three';
import type { SessionSnapshot } from '../simulation/types';
import {
  computeDriverHeadYawRad,
  computeDriverTorsoLeanRad,
  OTL_RIG_CONFIG,
  solveDriverArmPose,
  solveDriverLegPose,
} from './kinematics';

export interface GltfDriverNodes {
  torso?: THREE.Object3D;
  neckPivot?: THREE.Object3D;
  head?: THREE.Object3D;
  upperArmL?: THREE.Object3D;
  upperArmR?: THREE.Object3D;
  forearmL?: THREE.Object3D;
  forearmR?: THREE.Object3D;
  gloveL?: THREE.Object3D;
  gloveR?: THREE.Object3D;
  thighL?: THREE.Object3D;
  thighR?: THREE.Object3D;
  shinL?: THREE.Object3D;
  shinR?: THREE.Object3D;
  bootL?: THREE.Object3D;
  bootR?: THREE.Object3D;
}

const tmpX = new THREE.Vector3();
const tmpY = new THREE.Vector3();
const tmpZ = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();

/**
 * Aligns a bone mesh authored along local `+Z` (with `+Y` facing `poleDir`)
 * cleanly from `start` to `end` without any scaling or tube kinking.
 */
function orientLimbSegment(
  node: THREE.Object3D | undefined,
  start: THREE.Vector3,
  end: THREE.Vector3,
  poleDir: THREE.Vector3,
): void {
  if (!node) return;
  node.position.copy(start);
  tmpZ.copy(end).sub(start);
  const len = tmpZ.length();
  if (len > 1e-6) {
    tmpZ.divideScalar(len);
  } else {
    tmpZ.set(0, 0, 1);
  }
  tmpX.copy(poleDir).cross(tmpZ);
  if (tmpX.lengthSq() < 1e-8) {
    tmpX.set(1, 0, 0);
  } else {
    tmpX.normalize();
  }
  tmpY.copy(tmpZ).cross(tmpX).normalize();
  tmpMat.makeBasis(tmpX, tmpY, tmpZ);
  node.quaternion.setFromRotationMatrix(tmpMat);
  node.scale.set(1, 1, 1);
}

/**
 * Wires the sculpted GLB driver hierarchy (lateral-G torso lean, look-to-apex
 * neck yaw, 2-bone IK arms locked to F1 wheel grips, and 2-bone IK legs/boots
 * tracking live brake & throttle pedals) onto the cloned Kart GLTF scene.
 */
export function attachGltfDriver(nodes: GltfDriverNodes): { update(snapshot: SessionSnapshot): void } {
  let lastSteer = Number.NaN;
  let lastWheel = Number.NaN;
  let lastLatAccel = Number.NaN;
  let lastBrake = Number.NaN;
  let lastThrottle = Number.NaN;

  return {
    update(snapshot: SessionSnapshot) {
      const { kart, camera } = snapshot;
      if (nodes.head) {
        nodes.head.visible = camera.mode !== 'Helmet Cam';
      }

      const torsoLeanRad = computeDriverTorsoLeanRad(kart.lateralAccelMps2);
      if (nodes.torso && lastLatAccel !== kart.lateralAccelMps2) {
        nodes.torso.rotation.x = torsoLeanRad;
      }

      if (nodes.neckPivot && lastSteer !== kart.steerAngleRad) {
        nodes.neckPivot.rotation.y = computeDriverHeadYawRad(kart.steerAngleRad);
        lastSteer = kart.steerAngleRad;
      }

      if (lastWheel !== kart.steeringWheelAngleRad || lastLatAccel !== kart.lateralAccelMps2) {
        const armL = solveDriverArmPose(-1, kart.steeringWheelAngleRad, torsoLeanRad);
        const armR = solveDriverArmPose(1, kart.steeringWheelAngleRad, torsoLeanRad);
        orientLimbSegment(nodes.upperArmL, armL.shoulder, armL.elbow, armL.pole);
        orientLimbSegment(nodes.forearmL, armL.elbow, armL.wrist, armL.pole);
        orientLimbSegment(nodes.upperArmR, armR.shoulder, armR.elbow, armR.pole);
        orientLimbSegment(nodes.forearmR, armR.elbow, armR.wrist, armR.pole);
        lastWheel = kart.steeringWheelAngleRad;
      }

      if (
        lastBrake !== kart.brakeInput ||
        lastThrottle !== kart.throttleInput ||
        lastLatAccel !== kart.lateralAccelMps2
      ) {
        const legL = solveDriverLegPose(-1, kart.brakeInput, torsoLeanRad);
        const legR = solveDriverLegPose(1, kart.throttleInput, torsoLeanRad);
        orientLimbSegment(nodes.thighL, legL.hip, legL.knee, legL.pole);
        orientLimbSegment(nodes.shinL, legL.knee, legL.ankle, legL.pole);
        if (nodes.bootL) {
          nodes.bootL.position.copy(legL.ankle);
          nodes.bootL.rotation.set(0, 0, legL.bootPitchRad);
        }
        orientLimbSegment(nodes.thighR, legR.hip, legR.knee, legR.pole);
        orientLimbSegment(nodes.shinR, legR.knee, legR.ankle, legR.pole);
        if (nodes.bootR) {
          nodes.bootR.position.copy(legR.ankle);
          nodes.bootR.rotation.set(0, 0, legR.bootPitchRad);
        }
        lastBrake = kart.brakeInput;
        lastThrottle = kart.throttleInput;
      }

      lastLatAccel = kart.lateralAccelMps2;
    },
  };
}

function makeBoneCapsule(length: number, radiusStart: number, radiusEnd: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, 8);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, length * 0.5);
  const mesh = new THREE.Mesh(geo, material);
  g.add(mesh);
  return g;
}

/**
 * Lightweight synchronous fallback driver rig used only when `createKartRig()`
 * is called without preloaded GLB assets (e.g. headless Node/Vitest tests).
 */
export function createSeatedDriver(root: THREE.Group, steeringWheel: THREE.Group) {
  const driver = new THREE.Group();
  driver.name = 'Seated helmeted driver';
  root.add(driver);

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.88 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xe6e9e6, metalness: 0.06, roughness: 0.24 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x182634, metalness: 0.65, roughness: 0.14 });

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(...OTL_RIG_CONFIG.driverHipPivot);
  driver.add(torsoPivot);

  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 4, 10), suitMat);
  torsoMesh.position.set(-0.05, 0.135, 0);
  torsoMesh.rotation.z = 0.52;
  torsoPivot.add(torsoMesh);

  const neckPivot = new THREE.Group();
  neckPivot.position.set(
    OTL_RIG_CONFIG.driverNeckPivot[0] - OTL_RIG_CONFIG.driverHipPivot[0],
    OTL_RIG_CONFIG.driverNeckPivot[1] - OTL_RIG_CONFIG.driverHipPivot[1],
    0,
  );
  torsoPivot.add(neckPivot);

  const head = new THREE.Group();
  head.name = 'Helmet and neck';
  neckPivot.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12), helmetMat);
  helmet.position.set(0.006, 0.12, 0);
  head.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.18), visorMat);
  visor.position.set(0.105, 0.122, 0);
  head.add(visor);

  const upperArmL = makeBoneCapsule(OTL_RIG_CONFIG.driverUpperArmLength, 0.04, 0.035, suitMat);
  const forearmL = makeBoneCapsule(OTL_RIG_CONFIG.driverForearmLength, 0.035, 0.026, suitMat);
  const upperArmR = makeBoneCapsule(OTL_RIG_CONFIG.driverUpperArmLength, 0.04, 0.035, suitMat);
  const forearmR = makeBoneCapsule(OTL_RIG_CONFIG.driverForearmLength, 0.035, 0.026, suitMat);
  const thighL = makeBoneCapsule(OTL_RIG_CONFIG.driverThighLength, 0.052, 0.042, suitMat);
  const shinL = makeBoneCapsule(OTL_RIG_CONFIG.driverShinLength, 0.04, 0.03, suitMat);
  const thighR = makeBoneCapsule(OTL_RIG_CONFIG.driverThighLength, 0.052, 0.042, suitMat);
  const shinR = makeBoneCapsule(OTL_RIG_CONFIG.driverShinLength, 0.04, 0.03, suitMat);

  const bootL = new THREE.Group();
  const bootR = new THREE.Group();
  for (const boot of [bootL, bootR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.052), visorMat);
    shoe.position.set(0.015, -0.015, 0);
    boot.add(shoe);
  }

  driver.add(upperArmL, forearmL, upperArmR, forearmR, thighL, shinL, thighR, shinR, bootL, bootR);

  for (const side of [-1, 1] as const) {
    const glove = new THREE.Group();
    glove.name = side < 0 ? 'Left hand grip' : 'Right hand grip';
    steeringWheel.add(glove);
    glove.position.set(
      OTL_RIG_CONFIG.gloveGripOffset[0],
      OTL_RIG_CONFIG.gloveGripOffset[1],
      side * OTL_RIG_CONFIG.gloveGripOffset[2],
    );
    glove.add(new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), visorMat));
  }

  return attachGltfDriver({
    torso: torsoPivot,
    neckPivot,
    head,
    upperArmL,
    upperArmR,
    forearmL,
    forearmR,
    thighL,
    thighR,
    shinL,
    shinR,
    bootL,
    bootR,
  });
}
