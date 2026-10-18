import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SessionSnapshot } from '../simulation/types';

// Metres, +X forward, +Z right. The bumper remains inside the solver's
// 0.45 m half-width; the front and rear axle centres retain a 1.06 m wheelbase.
const FRONT_AXLE = 0.54;
const REAR_AXLE = -0.52;
const TIRE_RADIUS = 0.145;
const FRONT_TRACK_HALF = 0.285;
const REAR_TRACK_HALF = 0.335;

export interface KartRig {
  root: THREE.Group;
  update(snapshot: SessionSnapshot): void;
}

function surfaceTexture(kind: 'rubber' | 'weave'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kind === 'rubber' ? '#b8b8b8' : '#505050';
  ctx.fillRect(0, 0, 128, 128);
  // Fixed seed keeps the material repeatable and avoids a downloaded asset.
  let seed = 7129;
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      seed = (seed * 16807) % 2147483647;
      const shade = kind === 'rubber' ? 130 + seed % 100 : 65 + ((x + y) % 8) * 12;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x, y, 2, kind === 'weave' ? 4 : 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'weave' ? 4 : 2, kind === 'weave' ? 4 : 1);
  return texture;
}

function decalTexture(label: string, sublabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#10151a';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#d6e72c';
  ctx.fillRect(0, 0, 18, 256);
  ctx.fillStyle = '#f4f5f2';
  ctx.font = 'italic 900 106px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, 268, 132);
  ctx.fillStyle = '#b4c0c9';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(sublabel, 268, 195);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A beveled moulding: plan profile in X/Z, extrusion upwards in Y. */
function moulding(
  profile: [number, number][], height: number, bevel = 0.012,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], -profile[0][1]);
  for (const [x, z] of profile.slice(1)) shape.lineTo(x, -z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2, bevelEnabled: true,
    bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

function tube(points: number[][], radius: number, closed = false): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed),
    Math.max(12, points.length * 5), radius, 7, closed,
  );
}

function seatShell(): { geometry: THREE.BufferGeometry; rims: number[][][] } {
  // A hollow bucket, with raised thigh wings and a flared, reclined back.
  const rows = [
    [0.09, 0.19, 0.155, 0.065], [-0.12, 0.17, 0.145, 0.085],
    [-0.29, 0.21, 0.15, 0.075], [-0.35, 0.35, 0.16, 0.045],
    [-0.405, 0.53, 0.18, 0.035], [-0.425, 0.68, 0.185, 0.025],
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const rims: number[][][] = [[], []];
  const count = 16;
  for (let r = 0; r < rows.length; r++) {
    const [x, y, width, flare] = rows[r];
    for (let j = 0; j <= count; j++) {
      const t = j / count * 2 - 1;
      const edge = Math.pow(Math.abs(t), 3);
      const point = [x + (r > 2 ? edge * flare : 0), y + edge * flare, t * width];
      vertices.push(...point);
      uvs.push(j / count, r / (rows.length - 1));
      if (j === 0) rims[0].push(point);
      if (j === count) rims[1].push(point);
      if (r < rows.length - 1 && j < count) {
        const a = r * (count + 1) + j;
        indices.push(a, a + 1, a + count + 1, a + 1, a + count + 2, a + count + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, rims };
}

// Merge the static model by material: hardware detail does not require a draw
// call for every fastener. Steering and rolling assemblies remain independent.
function consolidate(group: THREE.Group): void {
  group.updateWorldMatrix(true, true);
  const localFromWorld = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone())
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(localFromWorld, object.matrixWorld));
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
  const red = new THREE.MeshStandardMaterial({ color: 0xb81322, roughness: 0.28, metalness: 0.12 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.52 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x171819, roughness: 0.88, bumpMap: rubberNoise, bumpScale: 0.0015, roughnessMap: rubberNoise });
  const steel = new THREE.MeshStandardMaterial({ color: 0x50565c, metalness: 0.88, roughness: 0.3 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xa1a8af, metalness: 0.9, roughness: 0.24 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.68, bumpMap: weave, bumpScale: 0.001, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd5e52a, roughness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86818, roughness: 0.5 });
  const decal = new THREE.MeshStandardMaterial({ map: decalTexture('APEX', 'ELECTRIC / 07'), roughness: 0.44 });
  const boltGeometry = new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Group = stationary): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Recessed floor, powder-coated frame and continuous energy-absorbing bumper.
  add(moulding([[-0.62, -0.28], [0.51, -0.26], [0.72, -0.16], [0.72, 0.16], [0.51, 0.26], [-0.62, 0.28]], 0.025, 0.005), carbon, 0, 0.065);
  const rail = [[-0.69, 0.11, -0.23], [-0.28, 0.11, -0.26], [0.38, 0.11, -0.22], [0.66, 0.11, -0.16]];
  add(tube(rail, 0.018), red);
  add(tube(rail.map(([x, y, z]) => [x, y, -z]), 0.018), red);
  const bumper = [[-0.76, 0.13, -0.32], [-0.65, 0.13, -0.419], [0.54, 0.13, -0.419], [0.8, 0.13, -0.28], [0.835, 0.13, 0], [0.8, 0.13, 0.28], [0.54, 0.13, 0.419], [-0.65, 0.13, 0.419], [-0.76, 0.13, 0.32]];
  // Round corners with bounded quadratic segments. A Catmull-Rom spline can
  // overshoot long straight edges and silently grow the collision envelope.
  const corners = bumper.map((p) => new THREE.Vector3(...p));
  const bumperCurve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < corners.length; i++) {
    const previous = corners[(i + corners.length - 1) % corners.length];
    const current = corners[i];
    const next = corners[(i + 1) % corners.length];
    const entry = current.clone().lerp(previous, Math.min(0.3, 0.09 / current.distanceTo(previous)));
    const exit = current.clone().lerp(next, Math.min(0.3, 0.09 / current.distanceTo(next)));
    const nextEntry = next.clone().lerp(current, Math.min(0.3, 0.09 / next.distanceTo(current)));
    bumperCurve.add(new THREE.QuadraticBezierCurve3(entry, current, exit));
    bumperCurve.add(new THREE.LineCurve3(exit, nextEntry));
  }
  add(new THREE.TubeGeometry(bumperCurve, 96, 0.021, 7, true), rubber);
  for (const x of [-0.61, 0.3, 0.69]) add(tube([[x, 0.11, -0.35], [x, 0.11, 0.35]], 0.012), steel);

  // Shaped side pods: tapered fronts, relieved wheel cut-outs, inset logos.
  for (const side of [-1, 1]) {
    const podProfile: [number, number][] = [[-0.47, -0.055], [0.22, -0.065], [0.4, -0.025], [0.35, 0.065], [-0.43, 0.065], [-0.51, 0.025]];
    add(moulding(podProfile.map(([x, z]) => [x, z * side]), 0.13), red, -0.04, 0.135, side * 0.305);
    add(tube([[-0.48, 0.17, side * 0.375], [-0.1, 0.16, side * 0.38], [0.3, 0.16, side * 0.365]], 0.009), black);
    const label = add(new THREE.PlaneGeometry(0.37, 0.085), decal, -0.08, 0.273, side * 0.302);
    label.rotation.x = -Math.PI / 2;
    for (const x of [-0.42, 0.23]) add(boltGeometry, alloy, x, 0.277, side * 0.32);
  }

  // Front impact fairing and sloped central number cowl; no box silhouette.
  add(moulding([[0.51, -0.25], [0.71, -0.29], [0.83, -0.18], [0.85, 0], [0.83, 0.18], [0.71, 0.29], [0.51, 0.25], [0.57, 0]], 0.12), red, 0, 0.16);
  const cowl = add(moulding([[-0.17, -0.115], [0.13, -0.145], [0.25, -0.1], [0.25, 0.1], [0.13, 0.145], [-0.17, 0.115]], 0.055), red, 0.35, 0.33);
  cowl.rotation.z = -0.34;
  const noseDecal = add(new THREE.PlaneGeometry(0.21, 0.12), decal, 0.4, 0.38);
  noseDecal.rotation.set(-Math.PI / 2, 0.34, -Math.PI / 2);
  for (const side of [-1, 1]) {
    add(tube([[0.16, 0.1, side * 0.16], [0.34, 0.19, side * 0.12], [0.46, 0.3, side * 0.1]], 0.013), steel);
    const pedal = add(moulding([[-0.03, -0.035], [0.04, -0.035], [0.04, 0.035], [-0.03, 0.035]], 0.012, 0.003), alloy, 0.42, 0.13, side * 0.15);
    pedal.rotation.z = 0.65;
  }

  const seat = seatShell();
  add(seat.geometry, carbon);
  for (const rim of seat.rims) add(tube(rim, 0.009), rubber);
  add(tube([seat.rims[0][5], [-0.425, 0.68, 0], seat.rims[1][5]], 0.009), rubber);
  // Seat fasteners and exposed triangulated supports.
  for (const side of [-1, 1]) {
    add(tube([[-0.55, 0.12, side * 0.18], [-0.42, 0.56, side * 0.15], [-0.15, 0.12, side * 0.2]], 0.011), steel);
    add(boltGeometry, alloy, -0.28, 0.23, side * 0.13);
  }

  // Rear live axle, ventilated brake disc and electric motor with cooling fins.
  const axle = add(new THREE.CylinderGeometry(0.018, 0.018, 0.77, 12), steel, REAR_AXLE, TIRE_RADIUS);
  axle.rotation.x = Math.PI / 2;
  const motor = add(new THREE.CylinderGeometry(0.08, 0.08, 0.19, 24), black, -0.57, 0.25, 0.13);
  motor.rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const fin = add(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 24), steel, -0.57, 0.25, 0.05 + i * 0.025);
    fin.rotation.x = Math.PI / 2;
  }
  const brake = add(new THREE.CylinderGeometry(0.095, 0.095, 0.009, 28), alloy, REAR_AXLE, TIRE_RADIUS, -0.2);
  brake.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const hole = add(new THREE.CircleGeometry(0.006, 6), black, REAR_AXLE + Math.sin(angle) * 0.073, TIRE_RADIUS + Math.cos(angle) * 0.073, -0.206);
    hole.rotation.y = Math.PI;
  }
  add(moulding([[-0.035, -0.018], [0.035, -0.018], [0.035, 0.018], [-0.035, 0.018]], 0.06, 0.005), red, -0.52, 0.2, -0.2);
  add(moulding([[-0.12, -0.12], [0.1, -0.12], [0.14, -0.08], [0.14, 0.08], [0.1, 0.12], [-0.12, 0.12]], 0.12), black, -0.57, 0.22, -0.01);
  for (let i = 0; i < 6; i++) add(tube([[-0.66 + i * 0.035, 0.347, -0.07], [-0.66 + i * 0.035, 0.347, 0.07]], 0.004), steel);
  add(tube([[-0.61, 0.32, 0.2], [-0.68, 0.37, 0.15], [-0.7, 0.34, -0.06], [-0.6, 0.3, -0.12]], 0.009), orange);
  add(tube([[-0.47, 0.23, -0.21], [-0.38, 0.19, -0.23], [0.1, 0.17, -0.2]], 0.005), black);

  const wheels: THREE.Group[] = [];
  const frontPivots: THREE.Group[] = [];
  const tireProfile = [
    [0.096, -0.071], [0.123, -0.069], [0.141, -0.052],
    [0.145, -0.031], [0.145, 0.031], [0.141, 0.052],
    [0.123, 0.069], [0.096, 0.071],
  ].map(([r, x]) => new THREE.Vector2(r, x));
  const tireGeometry = new THREE.LatheGeometry(tireProfile, 36);
  tireGeometry.rotateX(Math.PI / 2);
  for (const front of [false, true]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(front ? FRONT_AXLE : REAR_AXLE, TIRE_RADIUS, side * (front ? FRONT_TRACK_HALF : REAR_TRACK_HALF));
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
      // Inset face hardware makes rolling visible without painting tire stripes.
      for (let i = 0; i < 3; i++) {
        const angle = i / 3 * Math.PI * 2;
        const spoke = add(new THREE.CapsuleGeometry(0.009, 0.042, 3, 6), alloy, Math.sin(angle) * 0.048, Math.cos(angle) * 0.048, side * 0.069, roll);
        spoke.rotation.z = -angle;
        const bolt = add(boltGeometry, steel, Math.sin(angle) * 0.025, Math.cos(angle) * 0.025, side * 0.076, roll);
        bolt.rotation.x = Math.PI / 2;
      }
      const ring = add(new THREE.TorusGeometry(0.113, 0.0018, 4, 36), black, 0, 0, side * 0.069, roll);
      ring.rotation.z = 0.2;
      consolidate(roll);
    }
  }

  const steeringMount = new THREE.Group();
  steeringMount.position.set(0.24, 0.6, 0);
  steeringMount.rotation.z = 0.4;
  const steeringWheel = new THREE.Group();
  steeringMount.add(steeringWheel);
  root.add(steeringMount);
  add(tube([[0.24, 0.6, 0], [0.38, 0.22, 0]], 0.013), steel);
  const grip = add(new THREE.TorusGeometry(0.127, 0.017, 8, 40), rubber, 0, 0, 0, steeringWheel);
  grip.rotation.y = Math.PI / 2;
  for (const angle of [Math.PI / 2, Math.PI, Math.PI * 3 / 2]) {
    add(tube([[0, 0, 0], [0, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11]], 0.008), alloy, 0, 0, 0, steeringWheel);
  }
  const center = add(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 16), black, 0, 0, 0, steeringWheel);
  center.rotation.z = Math.PI / 2;
  const tape = add(new THREE.TorusGeometry(0.127, 0.018, 6, 6, 0.18), accent, 0, 0, 0, steeringWheel);
  tape.geometry.rotateZ(Math.PI / 2 - 0.09);
  tape.rotation.set(0, Math.PI / 2, 0);

  // A fixed digital instrument binnacle stays upright as the rim turns.
  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 256;
  dashCanvas.height = 128;
  const dashContext = dashCanvas.getContext('2d')!;
  const dashTexture = new THREE.CanvasTexture(dashCanvas);
  dashTexture.colorSpace = THREE.SRGBColorSpace;
  const dashMaterial = new THREE.MeshBasicMaterial({ map: dashTexture });
  const dashHousing = add(moulding([[-0.025, -0.073], [0.025, -0.073], [0.025, 0.073], [-0.025, 0.073]], 0.075, 0.007), black, 0.3, 0.625);
  dashHousing.rotation.z = 0.3;
  const dashScreen = add(new THREE.PlaneGeometry(0.126, 0.06), dashMaterial, 0.249, 0.653);
  dashScreen.rotation.set(0, -Math.PI / 2, 0.3, 'ZYX');

  consolidate(stationary);
  let lastElapsed: number | undefined;
  let lastPosition: { x: number; z: number } | undefined;
  let lastSpeed = 0;
  let wheelAngle = 0;
  let displayedSpeed = -1;
  function update(snapshot: SessionSnapshot): void {
    const { kart, elapsedSeconds } = snapshot;
    root.position.set(kart.position.x, 0, kart.position.z);
    root.rotation.y = -kart.headingRad;
    frontPivots.forEach((pivot) => { pivot.rotation.y = -kart.steerAngleRad; });
    steeringWheel.rotation.x = -kart.steeringWheelAngleRad;
    const dt = lastElapsed === undefined ? 0 : elapsedSeconds - lastElapsed;
    const distance = lastPosition ? Math.hypot(kart.position.x - lastPosition.x, kart.position.z - lastPosition.z) : 0;
    // Repeated snapshots cannot spin wheels; reset/mode teleports do not either.
    if (dt > 0 && dt <= 0.25 && distance < Math.max(0.3, dt * 15)) {
      wheelAngle = (wheelAngle - (lastSpeed + kart.speedMps) * 0.5 * dt / TIRE_RADIUS) % (Math.PI * 2);
    }
    wheels.forEach((wheel) => { wheel.rotation.z = wheelAngle; });
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
