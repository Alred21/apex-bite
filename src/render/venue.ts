import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CircuitData } from '../simulation/types';
import { createVenueMaterials } from './materials';
import { buildBarrierSegments, BARRIER_HALF_THICKNESS_METERS } from '../simulation/barrier-geometry';

type VenueMaterials = ReturnType<typeof createVenueMaterials>;

export function buildVenueBarriers(circuit: CircuitData, materials: VenueMaterials): THREE.Group {
  const group = new THREE.Group();
  const placements = buildBarrierSegments(circuit);
  const matrix = new THREE.Object3D();
  for (const red of [true, false]) {
    const matches = placements.filter((p) => p.red === red);
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(BARRIER_HALF_THICKNESS_METERS * 2, 0.48, 1), red ? materials.redBarrier : materials.whiteBarrier, matches.length);
    matches.forEach((p, i) => {
      matrix.position.set(p.center.x, 0.24, p.center.z); matrix.rotation.set(0, p.yaw, 0); matrix.scale.set(1, 1, p.length); matrix.updateMatrix();
      wall.setMatrixAt(i, matrix.matrix);
    });
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }
  const rubRail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.255, 0.07, 1), materials.rubber, placements.length);
  placements.forEach((p, i) => {
    matrix.position.set(p.center.x, 0.105, p.center.z); matrix.rotation.set(0, p.yaw, 0); matrix.scale.set(1, 1, p.length); matrix.updateMatrix();
    rubRail.setMatrixAt(i, matrix.matrix);
  });
  group.add(rubRail);
  return group;
}

export function createIndoorVenue(renderer: THREE.WebGLRenderer, scene: THREE.Scene, circuit: CircuitData): {
  materials: VenueMaterials;
  keyLight: THREE.DirectionalLight;
} {
  const materials = createVenueMaterials();
  scene.background = new THREE.Color(0x20252a);
  scene.fog = new THREE.Fog(0x252b30, 65, 155);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.06).texture;
  scene.environmentIntensity = 0.38;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe0efff, 0x505350, 1.5));
  const keyLight = new THREE.DirectionalLight(0xfff2db, 2.1);
  keyLight.position.set(10, 15, 3);
  keyLight.castShadow = true;
  Object.assign(keyLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 45 });
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 2;
  scene.add(keyLight, keyLight.target);

  const xs = circuit.samples.flatMap((s) => [s.leftBarrier.x, s.rightBarrier.x]);
  const zs = circuit.samples.flatMap((s) => [s.leftBarrier.z, s.rightBarrier.z]);
  const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8;
  const minZ = Math.min(...zs) - 8, maxZ = Math.max(...zs) + 8;
  const width = maxX - minX, depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), materials.pavement);
  hallFloor.rotation.x = -Math.PI / 2; hallFloor.position.set(centerX, -0.025, centerZ);
  const hallUv = hallFloor.geometry.getAttribute('uv');
  for (let i = 0; i < hallUv.count; i++) hallUv.setXY(i, hallUv.getX(i) * width / 2, hallUv.getY(i) * depth / 2);
  hallFloor.receiveShadow = true; scene.add(hallFloor);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width - 12, depth - 12), materials.infield);
  floor.rotation.x = -Math.PI / 2; floor.position.set(centerX, -0.008, centerZ);
  const uv = floor.geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (width - 12) / 2, uv.getY(i) * (depth - 12) / 2);
  floor.receiveShadow = true; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6065, roughness: 0.86 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.55, metalness: 0.7 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x292e31, roughness: 0.85 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xb91c24, roughness: 0.65 });
  const boxBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void {
    const transform = new THREE.Object3D();
    transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.updateMatrix();
    const batch = boxBatches.get(mat) ?? [];
    batch.push(transform.matrix.clone()); boxBatches.set(mat, batch);
  }
  box(width, 0.2, depth, centerX, 8.4, centerZ, ceilingMat);
  for (const z of [minZ, maxZ]) {
    box(width, 8.4, 0.2, centerX, 4.2, z, wallMat);
    box(width - 0.1, 0.65, 0.24, centerX, 1.6, z, stripeMat);
    box(width, 0.8, 0.28, centerX, 0.4, z, steelMat);
  }
  for (const x of [minX, maxX]) {
    box(0.2, 8.4, depth, x, 4.2, centerZ, wallMat);
    box(0.24, 0.65, depth, x, 1.6, centerZ, stripeMat);
    box(0.28, 0.8, depth, x, 0.4, centerZ, steelMat);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe1edff, emissiveIntensity: 3 });
  // Rafters and fixture housings establish human scale; no costly per-lamp shadows.
  for (let z = minZ + 3; z < maxZ; z += 7) {
    box(width, 0.24, 0.18, centerX, 7.8, z, steelMat);
    for (let x = minX + 5; x < maxX; x += 10) {
      box(2.4, 0.16, 0.65, x, 7.65, z, steelMat);
      box(2.15, 0.025, 0.48, x, 7.55, z, lampMat);
    }
  }
  // Cladding seams and supports remain outside the drivable Circuit envelope.
  for (let x = minX + 4; x < maxX; x += 6) {
    for (const z of [minZ + 0.15, maxZ - 0.15]) box(0.18, 8.2, 0.22, x, 4.1, z, steelMat);
  }
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 256;
  const context = signCanvas.getContext('2d')!;
  context.fillStyle = '#15191c'; context.fillRect(0, 0, 1024, 256);
  context.fillStyle = '#e33439'; context.fillRect(30, 40, 12, 176);
  context.font = 'italic bold 100px Arial'; context.fillStyle = '#f5f4ec'; context.fillText('APEX BITE', 70, 145);
  context.font = '26px Arial'; context.fillStyle = '#b3bec7'; context.fillText('ELECTRIC KART TRAINING · TORONTO CIRCUIT', 76, 198);
  const signMap = new THREE.CanvasTexture(signCanvas); signMap.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ map: signMap, roughness: 0.7, emissiveMap: signMap, emissive: 0xffffff, emissiveIntensity: 0.22 }));
  sign.position.set(centerX, 4.4, minZ + 0.2); scene.add(sign);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (const [material, transforms] of boxBatches) {
    const mesh = new THREE.InstancedMesh(unitBox, material, transforms.length);
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { materials, keyLight };
}
