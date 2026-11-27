import * as THREE from 'three';
import { attachGltfDriver, createSeatedDriver } from './driver';
import { KART_WHEEL_GEOMETRY } from '../simulation/kart-parameters';
import type { SessionSnapshot } from '../simulation/types';
import { cloneAssetSceneWithUniqueMaterials, type RendererAssets } from './assets';
import {
  ackermannSteeringAngles,
  LOWER_STEERING_COLUMN_AXIS_BACK,
  OTL_RIG_CONFIG,
  solveSteeringFourBar,
  UPPER_STEERING_COLUMN_AXIS_BACK,
} from './kinematics';

export { ackermannSteeringAngles };

/** Calibrated OTL Superleggero cockpit reference coordinates (sourced from Blender rig config). */
export const STEERING_WHEEL_HUB_X_METERS = OTL_RIG_CONFIG.steeringWheelHub.x;
export const STEERING_WHEEL_HUB_HEIGHT_METERS = OTL_RIG_CONFIG.steeringWheelHub.y;
export const STEERING_WHEEL_TILT_RAD = OTL_RIG_CONFIG.steeringWheelHub.tiltRad;
export const DASH_BINNACLE_X_METERS = OTL_RIG_CONFIG.dashBinnacle.x;
export const DASH_BINNACLE_HEIGHT_METERS = OTL_RIG_CONFIG.dashBinnacle.y;

/** Real go-kart kingpin & stub-axle spindle geometry (no rigid front cross-shaft). */
export const KINGPIN_HALF_TRACK_METERS = OTL_RIG_CONFIG.kingpinHalfTrackMeters;
export const SPINDLE_STUB_LENGTH_METERS =
  KART_WHEEL_GEOMETRY.frontTrackHalfMeters - KINGPIN_HALF_TRACK_METERS;

const FRONT_AXLE = KART_WHEEL_GEOMETRY.frontAxleMeters;
const REAR_AXLE = KART_WHEEL_GEOMETRY.rearAxleMeters;
const TIRE_RADIUS = KART_WHEEL_GEOMETRY.tireRadiusMeters;
const REAR_TRACK_HALF = KART_WHEEL_GEOMETRY.rearTrackHalfMeters;

const LOCAL_Z_UNIT = new THREE.Vector3(0, 0, 1);
const LOCAL_Z_SPIN = new THREE.Vector3(0, 0, 1);
const BRAKE_TARGET = new THREE.Vector3(...OTL_RIG_CONFIG.brakeMasterPistonTarget);
const THROTTLE_TARGET = new THREE.Vector3(...OTL_RIG_CONFIG.throttleSensorPivot);
const BRAKE_CLEVIS_LOCAL = new THREE.Vector3(...OTL_RIG_CONFIG.brakeClevisLocal);
const THROTTLE_CLEVIS_LOCAL = new THREE.Vector3(...OTL_RIG_CONFIG.throttleClevisLocal);
const BRAKE_PIVOT_POS = new THREE.Vector3(
  OTL_RIG_CONFIG.pedalPivot[0],
  OTL_RIG_CONFIG.pedalPivot[1],
  -OTL_RIG_CONFIG.pedalPivot[2],
);
const THROTTLE_PIVOT_POS = new THREE.Vector3(
  OTL_RIG_CONFIG.pedalPivot[0],
  OTL_RIG_CONFIG.pedalPivot[1],
  OTL_RIG_CONFIG.pedalPivot[2],
);

export interface KartRig {
  root: THREE.Group;
  update(snapshot: SessionSnapshot): void;
}

interface DashDisplayHandle {
  material: THREE.MeshBasicMaterial;
  update(speedKph: number): void;
}

function createDashDisplay(gltfUvConvention = false): DashDisplayHandle {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) {
    canvas.width = 256;
    canvas.height = 128;
  }
  const context = canvas ? canvas.getContext('2d') : null;
  const texture = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    if (gltfUvConvention) texture.flipY = false;
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff });
  let displayedSpeed = -1;

  function update(speedKph: number): void {
    const speed = Math.round(speedKph);
    if (speed === displayedSpeed || !context || !texture) return;
    displayedSpeed = speed;
    context.fillStyle = '#0e1d1e';
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = '#b7e6d7';
    context.font = 'bold 70px monospace';
    context.textAlign = 'center';
    context.fillText(String(speed).padStart(2, '0'), 100, 84);
    context.font = '18px monospace';
    context.fillText('KM/H', 198, 83);
    context.fillStyle = '#d3e52d';
    context.fillRect(20, 105, 214, 5);
    texture.needsUpdate = true;
  }

  return { material, update };
}

function createBeltTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#181a1c';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#33383d';
  for (let x = 0; x < 128; x += 16) {
    ctx.fillRect(x, 0, 7, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false;
  return tex;
}

function updateBrakeLedMaterial(
  ledMat: THREE.MeshStandardMaterial | null,
  kart: SessionSnapshot['kart'],
  elapsedSeconds: number,
): void {
  if (!ledMat) return;
  if (kart.driveDirection === 'Reverse') {
    const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 10);
    ledMat.color.setHex(0xd97706);
    ledMat.emissive.setHex(0xffa010);
    ledMat.emissiveIntensity = 0.8 + pulse * 2.2;
  } else if (kart.brakeInput > 0.05) {
    ledMat.color.setHex(0xdc2626);
    ledMat.emissive.setHex(0xff1810);
    ledMat.emissiveIntensity = 1.2 + kart.brakeInput * 2.4;
  } else {
    ledMat.color.setHex(0x6b0b0b);
    ledMat.emissive.setHex(0x550808);
    ledMat.emissiveIntensity = 0.35;
  }
}

function orientLinkBetween(
  linkNode: THREE.Object3D | undefined,
  start: THREE.Vector3,
  end: THREE.Vector3,
  tmpDir: THREE.Vector3,
): void {
  if (!linkNode) return;
  linkNode.position.copy(start).add(end).multiplyScalar(0.5);
  tmpDir.copy(end).sub(start);
  const len = tmpDir.length();
  if (len > 1e-6) {
    tmpDir.divideScalar(len);
    linkNode.quaternion.setFromUnitVectors(LOCAL_Z_UNIT, tmpDir);
  }
  linkNode.scale.set(1, 1, 1);
}

function upgradeGltfMaterials(
  visualRoot: THREE.Group,
  assets: RendererAssets,
  dashMaterial: THREE.MeshBasicMaterial,
  beltTexture: THREE.CanvasTexture | null,
): {
  brakeLedMat: THREE.MeshStandardMaterial | null;
  suitMat: THREE.Material;
  tireMeshes: THREE.Mesh[];
  bumperMeshes: THREE.Mesh[];
} {
  const upgraded = new Map<THREE.Material, THREE.Material>();
  let brakeLedMat: THREE.MeshStandardMaterial | null = null;
  let suitMat: THREE.Material | null = null;
  const tireMeshes: THREE.Mesh[] = [];
  const bumperMeshes: THREE.Mesh[] = [];

  const getGltfTex = (key: string): THREE.Texture | null => {
    const src = assets.textures[key];
    if (!src) return null;
    const copy = src.clone();
    copy.flipY = false;
    copy.needsUpdate = true;
    return copy;
  };

  visualRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = obj.receiveShadow = true;

    if (obj.name.endsWith('_Tire')) {
      tireMeshes.push(obj);
    } else if (
      obj.name.includes('Bumper_Main') ||
      obj.name.includes('Bumper_Upper') ||
      obj.name.includes('Bumper_Red_Strip') ||
      obj.name.includes('Side_Rub_Strip')
    ) {
      bumperMeshes.push(obj);
    }

    if (obj.name === 'Kart_Dash_Screen') {
      obj.material = dashMaterial;
      return;
    }

    if (obj.name === 'Kart_Drive_Belt' && beltTexture) {
      obj.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: beltTexture,
        roughness: 0.78,
        metalness: 0.05,
      });
      return;
    }

    const oldMat = obj.material;
    if (Array.isArray(oldMat) || !oldMat) return;

    let newMat = upgraded.get(oldMat);
    if (!newMat) {
      let resolved: THREE.Material = oldMat;
      const mName = oldMat.name;
      if (oldMat instanceof THREE.MeshStandardMaterial) {
        if (oldMat.map) oldMat.map.anisotropy = 4;
        if (oldMat.normalMap) oldMat.normalMap.anisotropy = 4;
        if (oldMat.roughnessMap) oldMat.roughnessMap.anisotropy = 4;

        const isClearcoat =
          mName === 'ApexBite_Livery' ||
          mName === 'K1_Crimson_Red' ||
          mName === 'K1_Livery_White' ||
          mName === 'Helmet_Pearl_White' ||
          mName === 'Helmet_Iridium_Visor';

        if (isClearcoat) {
          resolved = new THREE.MeshPhysicalMaterial({
            name: mName,
            color: oldMat.color.clone(),
            map: oldMat.map ?? (mName === 'ApexBite_Livery' ? getGltfTex('kart-livery-albedo') : null),
            normalMap: oldMat.normalMap,
            roughnessMap: oldMat.roughnessMap,
            roughness: oldMat.roughness,
            metalness: oldMat.metalness,
            clearcoat: 0.9,
            clearcoatRoughness: mName === 'Helmet_Iridium_Visor' ? 0.04 : 0.07,
          });
        } else {
          if (mName === 'Molded_Carbon') {
            if (!oldMat.map) oldMat.map = getGltfTex('kart-carbon-albedo');
            if (!oldMat.normalMap) oldMat.normalMap = getGltfTex('kart-carbon-normal');
            if (!oldMat.roughnessMap) oldMat.roughnessMap = getGltfTex('kart-carbon-roughness');
          } else if (mName === 'Tire_Indoor_Slick') {
            if (!oldMat.map) oldMat.map = getGltfTex('tire-albedo');
            if (!oldMat.normalMap) oldMat.normalMap = getGltfTex('tire-normal');
            if (!oldMat.roughnessMap) oldMat.roughnessMap = getGltfTex('tire-roughness');
          } else if (mName === 'Machined_Alloy' || mName === 'Chromoly_Steel') {
            if (!oldMat.roughnessMap) oldMat.roughnessMap = getGltfTex('metal-alloy-roughness');
          } else if (mName === 'Brake_Fluid_Reservoir') {
            oldMat.transparent = true;
            oldMat.opacity = 0.58;
            oldMat.depthWrite = false;
          }
          resolved = oldMat;
        }

        if (mName === 'Kart_Brake_LED_Lens' && resolved instanceof THREE.MeshStandardMaterial) {
          brakeLedMat = resolved;
        }
        if (mName === 'Driver_Suit_Navy') {
          suitMat = resolved;
        }
      }
      newMat = resolved;
      upgraded.set(oldMat, newMat);
    }

    obj.material = newMat;
  });

  return {
    brakeLedMat,
    suitMat: suitMat ?? new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.86 }),
    tireMeshes,
    bumperMeshes,
  };
}

function createGltfKartRig(assets: RendererAssets): KartRig {
  const root = new THREE.Group();
  root.name = 'Electric rental Kart';
  const visualRoot = new THREE.Group();
  visualRoot.name = 'Kart_Visual_Root';
  root.add(visualRoot);

  const gltfRoot = cloneAssetSceneWithUniqueMaterials(assets.kartGltf!.scene);
  visualRoot.add(gltfRoot);

  const dash = createDashDisplay(true);
  const beltTexture = createBeltTexture();
  const { brakeLedMat, suitMat, tireMeshes, bumperMeshes } = upgradeGltfMaterials(
    gltfRoot,
    assets,
    dash.material,
    beltTexture,
  );

  const steeringUpper = gltfRoot.getObjectByName('Kart_Steering_Upper');
  const steeringLower = gltfRoot.getObjectByName('Kart_Steering_Lower');
  const knuckleL = gltfRoot.getObjectByName('Kart_Knuckle_L');
  const knuckleR = gltfRoot.getObjectByName('Kart_Knuckle_R');
  const tieRodL = gltfRoot.getObjectByName('Kart_TieRod_L');
  const tieRodR = gltfRoot.getObjectByName('Kart_TieRod_R');
  const wheelFL = gltfRoot.getObjectByName('Kart_Wheel_FL');
  const wheelFR = gltfRoot.getObjectByName('Kart_Wheel_FR');
  const wheelRL = gltfRoot.getObjectByName('Kart_Wheel_RL');
  const wheelRR = gltfRoot.getObjectByName('Kart_Wheel_RR');
  const rearAxleSpin = gltfRoot.getObjectByName('Kart_Rear_Axle_Spin');
  const motorPinionSpin = gltfRoot.getObjectByName('Kart_Motor_Pinion_Spin');
  const pedalBrake = gltfRoot.getObjectByName('Kart_Pedal_Brake');
  const pedalThrottle = gltfRoot.getObjectByName('Kart_Pedal_Throttle');
  const brakePushrod = gltfRoot.getObjectByName('Kart_Brake_Pushrod');
  const throttleLink = gltfRoot.getObjectByName('Kart_Throttle_Link');
  const driverHead = gltfRoot.getObjectByName('Driver_Head');
  const gloveL = gltfRoot.getObjectByName('Driver_Glove_L');
  const gloveR = gltfRoot.getObjectByName('Driver_Glove_R');

  const driver = attachGltfDriver(visualRoot, driverHead, gloveL, gloveR, suitMat);

  let lastElapsed: number | undefined;
  let lastPosition: { x: number; z: number } | undefined;
  let lastSpeed = 0;
  let wheelAngle = 0;

  const tmpDir = new THREE.Vector3();
  const tmpClevis = new THREE.Vector3();
  const tmpPedalQuat = new THREE.Quaternion();
  const wheels = [wheelFL, wheelFR, wheelRL, wheelRR].filter(
    (w): w is THREE.Object3D => w !== undefined,
  );

  function update(snapshot: SessionSnapshot): void {
    const { kart, elapsedSeconds } = snapshot;
    root.position.set(kart.position.x, 0, kart.position.z);
    root.rotation.y = -kart.headingRad;

    // 1-piece steering column assembly (upper yoke + shaft + U-joint + lower shaft + Pitman arm)
    steeringUpper?.quaternion.setFromAxisAngle(
      UPPER_STEERING_COLUMN_AXIS_BACK,
      -kart.steeringWheelAngleRad,
    );
    steeringLower?.quaternion.setFromAxisAngle(
      LOWER_STEERING_COLUMN_AXIS_BACK,
      -kart.steeringWheelAngleRad,
    );

    // Exact rigid 4-bar linkage to tilted caster/KPI kingpin knuckles (ZERO tie-rod scale.z)
    const fourBar = solveSteeringFourBar(kart.steeringWheelAngleRad);
    knuckleL?.quaternion.copy(fourBar.left.knuckleQuat);
    knuckleR?.quaternion.copy(fourBar.right.knuckleQuat);
    orientLinkBetween(tieRodL, fourBar.left.tieRodStart, fourBar.left.tieRodEnd, tmpDir);
    orientLinkBetween(tieRodR, fourBar.right.tieRodStart, fourBar.right.tieRodEnd, tmpDir);

    // Pedals + coaxial brake pushrod + throttle TPS linkage
    if (pedalBrake) pedalBrake.rotation.z = -kart.brakeInput * 0.24;
    if (pedalThrottle) pedalThrottle.rotation.z = -kart.throttleInput * 0.24;

    tmpPedalQuat.setFromAxisAngle(LOCAL_Z_SPIN, -kart.brakeInput * 0.24);
    tmpClevis.copy(BRAKE_CLEVIS_LOCAL).applyQuaternion(tmpPedalQuat).add(BRAKE_PIVOT_POS);
    orientLinkBetween(brakePushrod, BRAKE_TARGET, tmpClevis, tmpDir);

    tmpPedalQuat.setFromAxisAngle(LOCAL_Z_SPIN, -kart.throttleInput * 0.24);
    tmpClevis.copy(THROTTLE_CLEVIS_LOCAL).applyQuaternion(tmpPedalQuat).add(THROTTLE_PIVOT_POS);
    orientLinkBetween(throttleLink, THROTTLE_TARGET, tmpClevis, tmpDir);

    // Wheel & rear powertrain spin
    const dt = lastElapsed === undefined ? 0 : elapsedSeconds - lastElapsed;
    const distance = lastPosition
      ? Math.hypot(kart.position.x - lastPosition.x, kart.position.z - lastPosition.z)
      : 0;
    if (dt > 0 && dt <= 0.25 && distance < Math.max(0.3, dt * 15)) {
      wheelAngle =
        (wheelAngle - ((lastSpeed + kart.speedMps) * 0.5 * dt) / TIRE_RADIUS) % (Math.PI * 2);
    }

    for (const w of wheels) {
      w.rotation.z = wheelAngle;
    }
    if (rearAxleSpin) rearAxleSpin.rotation.z = wheelAngle;
    if (motorPinionSpin) motorPinionSpin.rotation.z = wheelAngle * OTL_RIG_CONFIG.rearGearRatio;
    if (beltTexture) {
      beltTexture.offset.x = (wheelAngle * 0.45) % 1;
    }

    // Visual-only suspensionless chassis micro-vibration, tire sidewall flex, & Protex bumper flex
    const speedNorm = Math.min(1, Math.abs(kart.speedMps) / 12.5);
    const vibAmp = speedNorm * (0.0004 + kart.axleScrub * 0.0009);
    if (vibAmp > 1e-6) {
      visualRoot.position.y = Math.sin(elapsedSeconds * 58) * vibAmp;
      visualRoot.rotation.z = Math.cos(elapsedSeconds * 47) * vibAmp * 1.4;
    } else {
      visualRoot.position.y = 0;
      visualRoot.rotation.z = 0;
    }

    const latFlex = THREE.MathUtils.clamp(kart.lateralAccelMps2 / 14, -1, 1) * 0.014;
    const absFlex = Math.abs(latFlex);
    for (const tire of tireMeshes) {
      tire.scale.set(1 + absFlex * 0.4, 1 - absFlex * 0.6, 1 + absFlex);
    }

    const bumperCompress = kart.barrierContact ? 0.992 : 1.0;
    for (const bumper of bumperMeshes) {
      bumper.scale.set(bumperCompress, 1.0, bumperCompress);
    }

    updateBrakeLedMaterial(brakeLedMat, kart, elapsedSeconds);
    driver.update(snapshot);
    dash.update(kart.speedKph);

    lastElapsed = elapsedSeconds;
    lastSpeed = kart.speedMps;
    lastPosition = { ...kart.position };
  }

  return { root, update };
}

/**
 * Lightweight synchronous fallback rig used when `createKartRig()` is called
 * without preloaded GLB assets (e.g. headless Node/Vitest tests).
 */
function createFallbackKartRig(): KartRig {
  const root = new THREE.Group();
  root.name = 'Electric rental Kart';
  const stationary = new THREE.Group();
  root.add(stationary);

  const red = new THREE.MeshStandardMaterial({ color: 0xb8101c, roughness: 0.34 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171819, roughness: 0.88 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xa1a8af, metalness: 0.9, roughness: 0.24 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd5e52a, roughness: 0.38 });
  const brakeLedMat = new THREE.MeshStandardMaterial({
    color: 0x6b0b0b,
    emissive: 0x550808,
    emissiveIntensity: 0.35,
  });

  // Envelope-accurate chassis + wraparound Protex bumper + roll hoop (peak y = 0.862 m)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.02, 0.36), black);
  floor.position.set(0.02, 0.072, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.20), red);
  nose.position.set(0.56, 0.21, 0);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.48), rubber);
  frontBumper.position.set(0.83, 0.122, 0);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.68), rubber);
  rearBumper.position.set(-0.75, 0.135, 0);
  const rollHoop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.24), black);
  rollHoop.position.set(-0.485, 0.552, 0); // top at 0.862 m
  const brakeLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.024, 0.072), brakeLedMat);
  brakeLed.name = 'Kart_Brake_LED';
  brakeLed.position.set(-0.506, 0.71, 0);
  stationary.add(floor, nose, frontBumper, rearBumper, rollHoop, brakeLed);

  for (const side of [-1, 1] as const) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.13), red);
    pod.position.set(-0.01, 0.21, side * 0.295);
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.035), rubber);
    sideRail.position.set(-0.02, 0.118, side * 0.415);
    stationary.add(pod, sideRail);
  }

  // Steering column + F1 wheel
  const steeringMount = new THREE.Group();
  steeringMount.position.set(STEERING_WHEEL_HUB_X_METERS, STEERING_WHEEL_HUB_HEIGHT_METERS, 0);
  steeringMount.rotation.z = STEERING_WHEEL_TILT_RAD;
  const steeringWheel = new THREE.Group();
  steeringMount.add(steeringWheel);
  root.add(steeringMount);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.013, 8, 20), rubber);
  rim.rotation.y = Math.PI / 2;
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.035), accent);
  marker.position.set(0, 0.088, 0);
  steeringWheel.add(rim, marker);

  // Dash binnacle
  const dash = createDashDisplay(false);
  const dashScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.116, 0.052), dash.material);
  dashScreen.position.set(DASH_BINNACLE_X_METERS, DASH_BINNACLE_HEIGHT_METERS, 0);
  dashScreen.rotation.set(0, -Math.PI / 2, 0.22, 'ZYX');
  stationary.add(dashScreen);

  // Tilted kingpin knuckles, rigid tie rods, staggered wheels
  const knuckleL = new THREE.Group();
  knuckleL.position.set(FRONT_AXLE, TIRE_RADIUS, -KINGPIN_HALF_TRACK_METERS);
  const knuckleR = new THREE.Group();
  knuckleR.position.set(FRONT_AXLE, TIRE_RADIUS, KINGPIN_HALF_TRACK_METERS);
  root.add(knuckleL, knuckleR);

  const restFourBar = solveSteeringFourBar(0);
  const makeTieRod = (rodLength: number) => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, rodLength, 8), alloy);
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    root.add(g);
    return g;
  };
  const tieRodL = makeTieRod(restFourBar.left.rodLength);
  const tieRodR = makeTieRod(restFourBar.right.rodLength);

  const frontGeo = new THREE.CylinderGeometry(
    TIRE_RADIUS,
    TIRE_RADIUS,
    OTL_RIG_CONFIG.frontTireHalfWidthMeters * 2,
    24,
  );
  frontGeo.rotateX(Math.PI / 2);
  const rearGeo = new THREE.CylinderGeometry(
    TIRE_RADIUS,
    TIRE_RADIUS,
    OTL_RIG_CONFIG.rearTireHalfWidthMeters * 2,
    24,
  );
  rearGeo.rotateX(Math.PI / 2);

  const wheels: THREE.Mesh[] = [];
  for (const [parent, zPos, geo] of [
    [knuckleL, -SPINDLE_STUB_LENGTH_METERS, frontGeo],
    [knuckleR, SPINDLE_STUB_LENGTH_METERS, frontGeo],
    [root, -REAR_TRACK_HALF, rearGeo],
    [root, REAR_TRACK_HALF, rearGeo],
  ] as const) {
    const w = new THREE.Mesh(geo, rubber);
    w.position.set(parent === root ? REAR_AXLE : 0, parent === root ? TIRE_RADIUS : 0, zPos);
    parent.add(w);
    wheels.push(w);
  }

  const pedalBrake = new THREE.Group();
  pedalBrake.position.copy(BRAKE_PIVOT_POS);
  const pedalThrottle = new THREE.Group();
  pedalThrottle.position.copy(THROTTLE_PIVOT_POS);
  root.add(pedalBrake, pedalThrottle);

  const driver = createSeatedDriver(root, steeringWheel);
  const tmpDir = new THREE.Vector3();
  let lastElapsed: number | undefined;
  let lastSpeed = 0;
  let wheelAngle = 0;

  function update(snapshot: SessionSnapshot): void {
    const { kart, elapsedSeconds } = snapshot;
    root.position.set(kart.position.x, 0, kart.position.z);
    root.rotation.y = -kart.headingRad;

    const fourBar = solveSteeringFourBar(kart.steeringWheelAngleRad);
    knuckleL.quaternion.copy(fourBar.left.knuckleQuat);
    knuckleR.quaternion.copy(fourBar.right.knuckleQuat);
    orientLinkBetween(tieRodL, fourBar.left.tieRodStart, fourBar.left.tieRodEnd, tmpDir);
    orientLinkBetween(tieRodR, fourBar.right.tieRodStart, fourBar.right.tieRodEnd, tmpDir);

    steeringWheel.rotation.x = kart.steeringWheelAngleRad;
    pedalBrake.rotation.z = -kart.brakeInput * 0.24;
    pedalThrottle.rotation.z = -kart.throttleInput * 0.24;

    const dt = lastElapsed === undefined ? 0 : elapsedSeconds - lastElapsed;
    if (dt > 0 && dt <= 0.25) {
      wheelAngle =
        (wheelAngle - ((lastSpeed + kart.speedMps) * 0.5 * dt) / TIRE_RADIUS) % (Math.PI * 2);
    }
    for (const w of wheels) w.rotation.z = wheelAngle;

    updateBrakeLedMaterial(brakeLedMat, kart, elapsedSeconds);
    driver.update(snapshot);
    dash.update(kart.speedKph);

    lastElapsed = elapsedSeconds;
    lastSpeed = kart.speedMps;
  }

  return { root, update };
}

export function createKartRig(assets?: RendererAssets): KartRig {
  if (assets?.kartGltf) {
    return createGltfKartRig(assets);
  }
  return createFallbackKartRig();
}
