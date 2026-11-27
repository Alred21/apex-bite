import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CircuitData, SessionSnapshot } from '../simulation/types';
import { createVenueMaterials, type VenueMaterials } from './materials';
import { cloneAssetSceneWithUniqueMaterials, type RendererAssets } from './assets';
import type { GraphicsQuality } from './graphics';
import {
  computeArenaLayout,
  deriveMarshalSignalState,
  deriveStartLightsState,
  formatScoreboardData,
  getVenueQualityVisibility,
  type ArenaLayout,
  type ScoreboardDisplayData,
  type WallBannerPlacement,
} from './arena-layout';

export interface IndoorVenue {
  materials: VenueMaterials;
  keyLight: THREE.DirectionalLight;
  applyQuality(quality: GraphicsQuality): void;
  update(snapshot: SessionSnapshot): void;
}

function makeTransformMatrix(
  x: number,
  y: number,
  z: number,
  rotY = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Matrix4 {
  const obj = new THREE.Object3D();
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  obj.scale.set(sx, sy, sz);
  obj.updateMatrix();
  return obj.matrix.clone();
}

function addBoxBatch(
  batches: Map<THREE.Material, THREE.Matrix4[]>,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY = 0,
): void {
  const list = batches.get(mat) ?? [];
  list.push(makeTransformMatrix(x, y, z, rotY, w, h, d));
  batches.set(mat, list);
}

function flushBoxBatches(
  batches: Map<THREE.Material, THREE.Matrix4[]>,
  target: THREE.Object3D,
  unitBox: THREE.BoxGeometry,
  receiveShadow = true,
): void {
  for (const [material, transforms] of batches) {
    if (transforms.length === 0) continue;
    const mesh = new THREE.InstancedMesh(unitBox, material, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      mesh.setMatrixAt(i, transforms[i]);
    }
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = false;
    mesh.instanceMatrix.needsUpdate = true;
    target.add(mesh);
  }
}

function addPropInstances(
  propRoot: THREE.Object3D,
  transforms: THREE.Matrix4[],
  target: THREE.Object3D,
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): void {
  if (transforms.length === 0) return;
  propRoot.updateWorldMatrix(true, true);
  const invRoot = new THREE.Matrix4().copy(propRoot.matrixWorld).invert();
  const childLocal = new THREE.Matrix4();
  const instanceMat = new THREE.Matrix4();

  propRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    childLocal.multiplyMatrices(invRoot, child.matrixWorld);
    const inst = new THREE.InstancedMesh(child.geometry, child.material, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      instanceMat.multiplyMatrices(transforms[i], childLocal);
      inst.setMatrixAt(i, instanceMat);
    }
    inst.castShadow = options.castShadow ?? false;
    inst.receiveShadow = options.receiveShadow ?? true;
    inst.instanceMatrix.needsUpdate = true;
    target.add(inst);
  });
}

function createWallCladdingMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4f565d';
  ctx.fillRect(0, 0, 256, 256);
  // Subtle vertical corrugated sheet ribbing
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(20, 24, 28, 0.28)';
    ctx.fillRect(x, 0, 4, 256);
    ctx.fillStyle = 'rgba(220, 230, 240, 0.10)';
    ctx.fillRect(x + 5, 0, 3, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 2);
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.72,
    metalness: 0.35,
  });
}

function createPitApronMesh(layout: ArenaLayout): THREE.Mesh {
  const { pitBay } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark sealed epoxy pit apron
  ctx.fillStyle = '#1f262d';
  ctx.fillRect(0, 0, 1024, 512);

  // Pit lane yellow/white edge safety striping along track-facing side (top edge of canvas)
  ctx.fillStyle = '#eab308';
  ctx.fillRect(16, 14, 992, 16);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(16, 36, 992, 6);

  // Outer perimeter safety border
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, 992, 480);

  // 3 Staging Stalls along the length (X axis)
  const stallCount = 3;
  const marginX = 92;
  const usableW = 1024 - marginX * 2;
  const stallW = usableW / stallCount;
  for (let i = 0; i < stallCount; i++) {
    const sx = marginX + i * stallW;
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.82)';
    ctx.lineWidth = 6;
    ctx.strokeRect(sx + 18, 92, stallW - 36, 286);

    // Crimson entry chevron & stall number
    ctx.fillStyle = 'rgba(196, 26, 36, 0.85)';
    ctx.fillRect(sx + 24, 98, stallW - 48, 22);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${i + 1}`, sx + stallW * 0.5, 325);
  }

  ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OTL STAGING & CHARGING BAY', 512, 444);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.62,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const geo = new THREE.PlaneGeometry(pitBay.lengthMeters, pitBay.widthMeters);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'PitBayApron';
  mesh.position.set(pitBay.apronCenter.x, -0.002, pitBay.apronCenter.z);
  mesh.rotation.y = pitBay.yawRad;
  mesh.receiveShadow = true;
  return mesh;
}

function createWallBannerMesh(banner: WallBannerPlacement): THREE.Group {
  const group = new THREE.Group();
  group.name = banner.id;
  group.position.set(banner.x, banner.y, banner.z);
  group.rotation.y = banner.rotY;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14181c';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#e33439';
  ctx.fillRect(28, 36, 14, 184);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'italic bold 102px Arial, sans-serif';
  ctx.fillText('APEX BITE', 70, 146);
  ctx.fillStyle = '#b6c2cc';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(banner.subtitle, 74, 200);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(banner.width, banner.height),
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.55,
      emissiveMap: map,
      emissive: 0xffffff,
      emissiveIntensity: 0.34,
    }),
  );
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(banner.width + 0.24, banner.height + 0.24, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: 0.5, metalness: 0.7 }),
  );
  frame.position.z = -0.05;
  group.add(frame, face);
  return group;
}

function createScoreboardController(targetMesh: THREE.Mesh): {
  update(data: ScoreboardDisplayData): void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.flipY = false;

  targetMesh.material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.78,
    roughness: 0.25,
    metalness: 0.05,
    toneMapped: true,
  });

  let lastKey = '';

  function update(data: ScoreboardDisplayData): void {
    const key = `${data.statusLabel}|${data.lapLine}|${data.currentTime}|${data.lastTime}|${data.pbTime}|${data.refTime}`;
    if (key === lastKey) return;
    lastKey = key;

    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, 1024, 192);

    // Top crimson & status accent strip
    ctx.fillStyle = data.isClean ? '#22c55e' : '#f59e0b';
    ctx.fillRect(14, 14, 12, 164);

    // Left block: Status & Lap
    ctx.fillStyle = data.isClean ? '#86efac' : '#fcd34d';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(data.statusLabel, 42, 54);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 62px monospace';
    ctx.fillText(data.lapLine, 42, 136);

    // Vertical dividers
    ctx.fillStyle = '#24303c';
    for (const x of [395, 605, 815]) {
      ctx.fillRect(x, 22, 3, 148);
    }

    const columns: Array<{ x: number; label: string; value: string; color: string }> = [
      { x: 500, label: 'CURRENT', value: data.currentTime, color: '#f8fafc' },
      { x: 710, label: 'LAST', value: data.lastTime, color: '#cbd5e1' },
      { x: 916, label: 'PB / REF', value: `${data.pbTime}`, color: '#4ade80' },
    ];

    ctx.textAlign = 'center';
    for (const col of columns) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(col.label, col.x, 52);

      ctx.fillStyle = col.color;
      ctx.font = 'bold 54px monospace';
      ctx.fillText(col.value, col.x, 122);
    }

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`REF ${data.refTime}`, 916, 166);

    texture.needsUpdate = true;
  }

  return { update };
}

function buildFallbackGantry(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Arena_Gantry_Truss';
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x22272c, roughness: 0.48, metalness: 0.78 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xb91c24, roughness: 0.36 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.6 });
  const halfSpan = layout.gantry.spanMeters * 0.5;

  for (const sz of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.36, 4.45, 0.36), steelMat);
    col.position.set(0, 2.225, sz * halfSpan);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.42), redMat);
    sleeve.position.set(0, 0.50, sz * halfSpan);
    group.add(col, sleeve);
  }

  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.85, layout.gantry.spanMeters + 0.6),
    steelMat,
  );
  beam.position.set(0, layout.gantry.beamBottomY + 0.425, 0);
  group.add(beam);

  const treeBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 1.75), housingMat);
  treeBox.position.set(-0.34, layout.gantry.lightTreeBottomY + 0.12, 0);
  group.add(treeBox);

  for (let i = 0; i < 5; i++) {
    const podGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 14);
    podGeo.rotateZ(Math.PI / 2);
    const pod = new THREE.Mesh(
      podGeo,
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, emissive: 0xef4444, emissiveIntensity: 1.5 }),
    );
    pod.name = `Gantry_Light_Pod_${i}`;
    pod.position.set(-0.44, layout.gantry.lightTreeBottomY + 0.12, (i - 2) * 0.32);
    group.add(pod);
  }

  const sbGeo = new THREE.PlaneGeometry(3.9, 0.64);
  sbGeo.rotateY(-Math.PI / 2);
  const uv = sbGeo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - uv.getY(i));
  const sb = new THREE.Mesh(sbGeo, housingMat);
  sb.name = 'Gantry_Scoreboard_Screen';
  sb.position.set(-0.35, layout.gantry.scoreboardBottomY + 0.60, 0);
  group.add(sb);

  return group;
}

function buildFallbackMarshalPanel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Arena_Marshal_Panel';
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.36, metalness: 0.8 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.72, 10), postMat);
  post.position.y = 0.86;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.50, 0.50), housingMat);
  housing.position.set(-0.06, 1.72, 0);
  const faceGeo = new THREE.PlaneGeometry(0.42, 0.42);
  faceGeo.rotateY(-Math.PI / 2);
  const face = new THREE.Mesh(
    faceGeo,
    new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x22c55e, emissiveIntensity: 1.6 }),
  );
  face.name = 'Marshal_LED_Face';
  face.position.set(-0.12, 1.72, 0);
  group.add(post, housing, face);
  return group;
}

/**
 * Builds the K1-style indoor karting arena architecture, start/finish truss gantry,
 * pit/staging bay, spectator mezzanine, tire stacks, high-bay lighting, and live corner marshal panels.
 */
export function createIndoorVenue(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  circuit: CircuitData,
  assets?: RendererAssets,
): IndoorVenue {
  const materials = createVenueMaterials(assets);
  const layout = computeArenaLayout(circuit);
  const { bounds } = layout;

  scene.background = new THREE.Color(0x20252a);
  scene.fog = new THREE.Fog(0x252b30, 65, 165);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.06).texture;
  scene.environmentIntensity = 0.38;
  environment.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe0efff, 0x505350, 1.5));
  const keyLight = new THREE.DirectionalLight(0xfff2db, 2.1);
  keyLight.position.set(10, 15, 3);
  keyLight.castShadow = true;
  Object.assign(keyLight.shadow.camera, {
    left: -10,
    right: 10,
    top: 10,
    bottom: -10,
    near: 0.5,
    far: 45,
  });
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 2;
  scene.add(keyLight, keyLight.target);

  // 1. Sealed concrete hall floor & blue epoxy infield
  const hallFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.width, bounds.depth),
    materials.pavement,
  );
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(bounds.centerX, -0.025, bounds.centerZ);
  const hallUv = hallFloor.geometry.getAttribute('uv');
  for (let i = 0; i < hallUv.count; i++) {
    hallUv.setXY(i, (hallUv.getX(i) * bounds.width) / 2, (hallUv.getY(i) * bounds.depth) / 2);
  }
  hallFloor.receiveShadow = true;
  scene.add(hallFloor);

  const infield = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.width - 8, bounds.depth - 8),
    materials.infield,
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.set(bounds.centerX, -0.008, bounds.centerZ);
  const infieldUv = infield.geometry.getAttribute('uv');
  for (let i = 0; i < infieldUv.count; i++) {
    infieldUv.setXY(
      i,
      (infieldUv.getX(i) * (bounds.width - 8)) / 2,
      (infieldUv.getY(i) * (bounds.depth - 8)) / 2,
    );
  }
  infield.receiveShadow = true;
  scene.add(infield);

  // 2. Industrial Hall Enclosure (corrugated walls, red/white safety striping, structural columns, Warren roof trusses)
  const shellGroup = new THREE.Group();
  shellGroup.name = 'ArenaShell';
  scene.add(shellGroup);

  const wallMat = createWallCladdingMaterial();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x262b2e, roughness: 0.52, metalness: 0.72 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x252a2e, roughness: 0.86 });
  const redStripeMat = new THREE.MeshStandardMaterial({ color: 0xb91c24, roughness: 0.6 });
  const whiteStripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e4dc, roughness: 0.58 });
  const yellowSafetyMat = new THREE.MeshStandardMaterial({ color: 0xd99b08, roughness: 0.48 });

  const shellBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // Ceiling deck
  addBoxBatch(
    shellBatches,
    ceilingMat,
    bounds.width,
    0.2,
    bounds.depth,
    bounds.centerX,
    bounds.ceilingY,
    bounds.centerZ,
  );

  // North & South walls + red/white safety striping + plinth
  for (const z of [bounds.minZ, bounds.maxZ]) {
    const sign = z === bounds.minZ ? 1 : -1;
    addBoxBatch(shellBatches, wallMat, bounds.width, bounds.ceilingY, 0.2, bounds.centerX, bounds.ceilingY * 0.5, z);
    addBoxBatch(shellBatches, redStripeMat, bounds.width - 0.1, 0.58, 0.24, bounds.centerX, 1.60, z);
    addBoxBatch(shellBatches, whiteStripeMat, bounds.width - 0.1, 0.12, 0.25, bounds.centerX, 1.95, z);
    addBoxBatch(shellBatches, whiteStripeMat, bounds.width - 0.1, 0.12, 0.25, bounds.centerX, 1.25, z);
    addBoxBatch(shellBatches, steelMat, bounds.width, 0.82, 0.28, bounds.centerX, 0.41, z);
    for (let x = bounds.minX + 5; x < bounds.maxX - 2; x += 8) {
      addBoxBatch(shellBatches, steelMat, 0.22, bounds.ceilingY - 0.2, 0.26, x, (bounds.ceilingY - 0.2) * 0.5, z + sign * 0.14);
    }
  }

  // West & East walls + red/white safety striping + plinth
  for (const x of [bounds.minX, bounds.maxX]) {
    const sign = x === bounds.minX ? 1 : -1;
    addBoxBatch(shellBatches, wallMat, 0.2, bounds.ceilingY, bounds.depth, x, bounds.ceilingY * 0.5, bounds.centerZ);
    addBoxBatch(shellBatches, redStripeMat, 0.24, 0.58, bounds.depth - 0.1, x, 1.60, bounds.centerZ);
    addBoxBatch(shellBatches, whiteStripeMat, 0.25, 0.12, bounds.depth - 0.1, x, 1.95, bounds.centerZ);
    addBoxBatch(shellBatches, whiteStripeMat, 0.25, 0.12, bounds.depth - 0.1, x, 1.25, bounds.centerZ);
    addBoxBatch(shellBatches, steelMat, 0.28, 0.82, bounds.depth, x, 0.41, bounds.centerZ);
    for (let z = bounds.minZ + 5; z < bounds.maxZ - 2; z += 8) {
      addBoxBatch(shellBatches, steelMat, 0.26, bounds.ceilingY - 0.2, 0.22, x + sign * 0.14, (bounds.ceilingY - 0.2) * 0.5, z);
    }
  }

  // Exposed overhead Warren steel roof trusses (y ~ 7.6..8.2 m)
  for (const z of layout.trussZs) {
    addBoxBatch(shellBatches, steelMat, bounds.width - 0.4, 0.14, 0.16, bounds.centerX, 8.15, z);
    addBoxBatch(shellBatches, steelMat, bounds.width - 0.4, 0.14, 0.16, bounds.centerX, 7.60, z);
    for (let x = bounds.minX + 3.5; x < bounds.maxX - 2.0; x += 6.5) {
      addBoxBatch(shellBatches, steelMat, 0.10, 0.55, 0.12, x, 7.875, z);
    }
  }

  flushBoxBatches(shellBatches, shellGroup, unitBox, true);

  // Illuminated APEX BITE wall banners
  for (const banner of layout.banners) {
    shellGroup.add(createWallBannerMesh(banner));
  }

  // High-bay LED fixtures (kept active across all quality tiers for indoor lighting)
  const propsScene = assets?.venuePropsGltf?.scene ?? null;
  const highBayProto = propsScene?.getObjectByName('Arena_HighBay_Lamp') ?? null;
  if (highBayProto) {
    const lampTransforms = layout.highBayLamps.map((l) => makeTransformMatrix(l.x, l.y, l.z));
    addPropInstances(highBayProto, lampTransforms, shellGroup, {
      castShadow: false,
      receiveShadow: false,
    });
  } else {
    const lampBatches = new Map<THREE.Material, THREE.Matrix4[]>();
    const lampDiffMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe1edff,
      emissiveIntensity: 3.0,
    });
    for (const l of layout.highBayLamps) {
      addBoxBatch(lampBatches, steelMat, 2.25, 0.12, 0.62, l.x, l.y + 0.05, l.z);
      addBoxBatch(lampBatches, lampDiffMat, 2.10, 0.025, 0.50, l.x, l.y - 0.01, l.z);
    }
    flushBoxBatches(lampBatches, shellGroup, unitBox, false);
  }

  // 3. Start/Finish Truss Gantry + Live 5-Pod Start-Light Tree + Digital Scoreboard
  const gantryGroup = new THREE.Group();
  gantryGroup.name = 'StartFinishGantryGroup';
  scene.add(gantryGroup);

  const gantryProto = propsScene?.getObjectByName('Arena_Gantry_Truss') ?? null;
  const gantryInstance = gantryProto
    ? cloneAssetSceneWithUniqueMaterials(gantryProto)
    : buildFallbackGantry(layout);
  gantryInstance.position.set(layout.gantry.center.x, 0, layout.gantry.center.z);
  gantryInstance.rotation.y = layout.gantry.yawRad;
  gantryInstance.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = true;
    }
  });
  gantryGroup.add(gantryInstance);

  const startLightPodMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const podObj = gantryInstance.getObjectByName(`Gantry_Light_Pod_${i}`);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    if (podObj instanceof THREE.Mesh) {
      podObj.material = podMat;
    }
    startLightPodMats.push(podMat);
  }

  const scoreboardObj = gantryInstance.getObjectByName('Gantry_Scoreboard_Screen');
  const scoreboardController =
    scoreboardObj instanceof THREE.Mesh ? createScoreboardController(scoreboardObj) : null;

  // 4. Pit & Staging Bay (markings + barrier gate + charging stanchions + parked driverless Karts)
  const pitBayGroup = new THREE.Group();
  pitBayGroup.name = 'PitAndStagingBay';
  scene.add(pitBayGroup);
  pitBayGroup.add(createPitApronMesh(layout));

  const pitGateBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  for (const post of layout.pitBay.gatePosts) {
    addBoxBatch(pitGateBatches, steelMat, 0.16, 0.95, 0.16, post.x, 0.475, post.z, post.yawRad);
    addBoxBatch(pitGateBatches, yellowSafetyMat, 0.18, 0.16, 0.18, post.x, 0.86, post.z, post.yawRad);
  }
  if (layout.pitBay.gatePosts.length >= 2) {
    const p0 = layout.pitBay.gatePosts[0];
    const p1 = layout.pitBay.gatePosts[1];
    const midX = (p0.x + p1.x) * 0.5;
    const midZ = (p0.z + p1.z) * 0.5;
    const gateSpan = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    addBoxBatch(
      pitGateBatches,
      redStripeMat,
      gateSpan * 0.42,
      0.08,
      0.06,
      midX,
      0.78,
      midZ,
      layout.pitBay.yawRad,
    );
  }
  flushBoxBatches(pitGateBatches, pitBayGroup, unitBox, true);

  const chargerProto = propsScene?.getObjectByName('Arena_Pit_Charging_Stanchion') ?? null;
  if (chargerProto) {
    const chargerTransforms = layout.pitBay.chargingStanchions.map((c) =>
      makeTransformMatrix(c.x, 0, c.z, c.yawRad),
    );
    addPropInstances(chargerProto, chargerTransforms, pitBayGroup, {
      castShadow: false,
      receiveShadow: true,
    });
  } else {
    const chargerBatches = new Map<THREE.Material, THREE.Matrix4[]>();
    for (const c of layout.pitBay.chargingStanchions) {
      addBoxBatch(chargerBatches, steelMat, 0.22, 1.24, 0.24, c.x, 0.62, c.z, c.yawRad);
    }
    flushBoxBatches(chargerBatches, pitBayGroup, unitBox, true);
  }

  // Parked driverless OTL Superleggero static clones (hidden in Performance tier)
  const parkedKartsGroup = new THREE.Group();
  parkedKartsGroup.name = 'PitParkedKarts';
  pitBayGroup.add(parkedKartsGroup);

  if (assets?.kartGltf) {
    for (const parked of layout.pitBay.parkedKarts) {
      const kartClone = cloneAssetSceneWithUniqueMaterials(assets.kartGltf.scene);
      kartClone.name = parked.id;
      kartClone.traverse((obj) => {
        if (obj.name.startsWith('Driver_')) {
          obj.visible = false;
        }
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
      kartClone.position.set(parked.x, 0, parked.z);
      kartClone.rotation.y = parked.yawRad;
      kartClone.updateMatrix();
      kartClone.matrixAutoUpdate = false;
      parkedKartsGroup.add(kartClone);
    }
  } else {
    const parkedFallbackBatches = new Map<THREE.Material, THREE.Matrix4[]>();
    for (const parked of layout.pitBay.parkedKarts) {
      addBoxBatch(parkedFallbackBatches, redStripeMat, 1.38, 0.24, 0.72, parked.x, 0.16, parked.z, parked.yawRad);
    }
    flushBoxBatches(parkedFallbackBatches, parkedKartsGroup, unitBox, false);
  }

  // 5. Spectator Viewing Mezzanine (structural shell columns + decorative balustrade/benches)
  const mezzanineGroup = new THREE.Group();
  mezzanineGroup.name = 'SpectatorMezzanine';
  scene.add(mezzanineGroup);

  const mezzCoreBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  const { mezzanine } = layout;
  for (const col of mezzanine.columns) {
    addBoxBatch(mezzCoreBatches, steelMat, 0.28, mezzanine.deckY, 0.28, col.x, mezzanine.deckY * 0.5, col.z);
  }
  addBoxBatch(
    mezzCoreBatches,
    steelMat,
    mezzanine.widthMeters,
    0.26,
    mezzanine.depthMeters,
    mezzanine.deckCenter.x,
    mezzanine.deckY,
    mezzanine.deckCenter.z,
  );
  flushBoxBatches(mezzCoreBatches, mezzanineGroup, unitBox, true);

  const mezzanineDetailsGroup = new THREE.Group();
  mezzanineDetailsGroup.name = 'SpectatorMezzanineDetails';
  mezzanineGroup.add(mezzanineDetailsGroup);

  const mezzDetailBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  const frontEdgeZ = mezzanine.deckCenter.z + mezzanine.depthMeters * 0.5 - 0.08;
  // Crimson fascia trim & top stainless handrail
  addBoxBatch(
    mezzDetailBatches,
    redStripeMat,
    mezzanine.widthMeters + 0.06,
    0.22,
    0.08,
    mezzanine.deckCenter.x,
    mezzanine.deckY + 0.04,
    frontEdgeZ + 0.06,
  );
  addBoxBatch(
    mezzDetailBatches,
    materials.galvanizedSteel,
    mezzanine.widthMeters,
    0.05,
    0.07,
    mezzanine.deckCenter.x,
    mezzanine.deckY + mezzanine.railingHeightY,
    frontEdgeZ,
  );
  // Balustrade stanchion posts & spectator benches
  for (let bx = -19; bx <= 23; bx += 3.5) {
    addBoxBatch(
      mezzDetailBatches,
      materials.galvanizedSteel,
      0.06,
      mezzanine.railingHeightY,
      0.06,
      bx,
      mezzanine.deckY + mezzanine.railingHeightY * 0.5,
      frontEdgeZ,
    );
  }
  for (let bx = -16; bx <= 20; bx += 6) {
    addBoxBatch(
      mezzDetailBatches,
      steelMat,
      3.4,
      0.42,
      0.55,
      bx,
      mezzanine.deckY + 0.34,
      mezzanine.deckCenter.z - 0.8,
    );
  }
  flushBoxBatches(mezzDetailBatches, mezzanineDetailsGroup, unitBox, false);

  // Safety-glass balustrade panel along mezzanine front edge
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8dcff,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const glassPanel = new THREE.Mesh(
    new THREE.BoxGeometry(mezzanine.widthMeters - 0.2, mezzanine.railingHeightY - 0.16, 0.025),
    glassMat,
  );
  glassPanel.position.set(
    mezzanine.deckCenter.x,
    mezzanine.deckY + 0.13 + (mezzanine.railingHeightY - 0.16) * 0.5,
    frontEdgeZ,
  );
  mezzanineDetailsGroup.add(glassPanel);

  // 6. Galvanized Circular HVAC Ducts (decorative, hidden in Performance)
  const hvacGroup = new THREE.Group();
  hvacGroup.name = 'ArenaHvacDucts';
  scene.add(hvacGroup);

  for (const duct of layout.hvacRuns) {
    const length = Math.abs(duct.zEnd - duct.zStart);
    const cylGeo = new THREE.CylinderGeometry(duct.radius, duct.radius, length, 16);
    cylGeo.rotateX(Math.PI / 2);
    const ductMesh = new THREE.Mesh(cylGeo, materials.galvanizedSteel);
    ductMesh.position.set(duct.x, duct.y, (duct.zStart + duct.zEnd) * 0.5);
    ductMesh.castShadow = false;
    ductMesh.receiveShadow = false;
    hvacGroup.add(ductMesh);
  }

  // 7. Rubber Tire Stacks behind outer corners (T1, T4, T8, T11; decorative, hidden in Performance)
  const tireStacksGroup = new THREE.Group();
  tireStacksGroup.name = 'CornerTireStacks';
  scene.add(tireStacksGroup);

  const tireProto = propsScene?.getObjectByName('Arena_Tire_Stack') ?? null;
  if (tireProto) {
    const tireTransforms = layout.tireStacks.map((t) =>
      makeTransformMatrix(t.x, 0, t.z, t.yawRad),
    );
    addPropInstances(tireProto, tireTransforms, tireStacksGroup, {
      castShadow: false,
      receiveShadow: true,
    });
  } else {
    const tireFallbackBatches = new Map<THREE.Material, THREE.Matrix4[]>();
    for (const t of layout.tireStacks) {
      addBoxBatch(tireFallbackBatches, materials.rubber, 0.54, 0.52, 0.54, t.x, 0.26, t.z, t.yawRad);
    }
    flushBoxBatches(tireFallbackBatches, tireStacksGroup, unitBox, true);
  }

  // 8. Flush Infield Floor Drainage Grates (decorative, hidden in Performance)
  const drainGratesGroup = new THREE.Group();
  drainGratesGroup.name = 'InfieldDrainGrates';
  scene.add(drainGratesGroup);

  const drainProto = propsScene?.getObjectByName('Arena_Drain_Grate') ?? null;
  if (drainProto) {
    const drainTransforms = layout.drainGrates.map((g) =>
      makeTransformMatrix(g.x, -0.006, g.z, g.yawRad),
    );
    addPropInstances(drainProto, drainTransforms, drainGratesGroup, {
      castShadow: false,
      receiveShadow: true,
    });
  } else {
    const drainFallbackBatches = new Map<THREE.Material, THREE.Matrix4[]>();
    for (const g of layout.drainGrates) {
      addBoxBatch(drainFallbackBatches, materials.galvanizedSteel, g.halfWidth * 2, 0.01, g.halfDepth * 2, g.x, -0.004, g.z, g.yawRad);
    }
    flushBoxBatches(drainFallbackBatches, drainGratesGroup, unitBox, true);
  }

  // 9. Live LED Corner Marshal Panels outside T1, T3, T8, T10
  const marshalGroup = new THREE.Group();
  marshalGroup.name = 'CornerMarshalPanels';
  scene.add(marshalGroup);

  const marshalLedMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    emissive: 0x22c55e,
    emissiveIntensity: 1.55,
    roughness: 0.22,
  });

  const marshalProto = propsScene?.getObjectByName('Arena_Marshal_Panel') ?? null;
  for (const panel of layout.marshalPanels) {
    const instance = marshalProto
      ? cloneAssetSceneWithUniqueMaterials(marshalProto)
      : buildFallbackMarshalPanel();
    instance.name = `Marshal_Panel_T${panel.turnNumber}`;
    instance.position.set(panel.x, 0, panel.z);
    instance.rotation.y = panel.yawRad;
    instance.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = false;
      obj.receiveShadow = true;
      if (obj.name === 'Marshal_LED_Face') {
        obj.material = marshalLedMat;
      }
    });
    marshalGroup.add(instance);
  }

  // Live update state tracking
  let prevIsClean = true;
  let dirtyCueUntilSeconds = -1;

  function applyQuality(quality: GraphicsQuality): void {
    const vis = getVenueQualityVisibility(quality);
    gantryGroup.visible = vis.showGantry;
    marshalGroup.visible = vis.showMarshalPanels;
    parkedKartsGroup.visible = vis.showParkedKarts;
    hvacGroup.visible = vis.showHvacDucts;
    tireStacksGroup.visible = vis.showTireStacks;
    mezzanineDetailsGroup.visible = vis.showMezzanineDetails;
    drainGratesGroup.visible = vis.showDrainGrates;
  }

  function update(snapshot: SessionSnapshot): void {
    const t = snapshot.elapsedSeconds;

    if (snapshot.timeTrial.status === 'Flying Start') {
      dirtyCueUntilSeconds = -1;
      prevIsClean = true;
    } else {
      if (prevIsClean && !snapshot.lap.isClean) {
        dirtyCueUntilSeconds = t + 2.5;
      }
      prevIsClean = snapshot.lap.isClean;
    }

    const dirtyCueActive = t < dirtyCueUntilSeconds;
    const lightsState = deriveStartLightsState(snapshot, dirtyCueActive);
    for (let i = 0; i < startLightPodMats.length; i++) {
      const podSpec = lightsState.pods[i];
      const mat = startLightPodMats[i];
      if (!podSpec || !mat) continue;
      mat.color.setHex(podSpec.colorHex);
      mat.emissive.setHex(podSpec.emissiveHex);
      mat.emissiveIntensity = podSpec.intensity;
    }

    if (scoreboardController) {
      scoreboardController.update(formatScoreboardData(snapshot));
    }

    const marshalState = deriveMarshalSignalState(snapshot);
    if (marshalState === 'RedPulse') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 10.0);
      marshalLedMat.color.setHex(0xdc2626);
      marshalLedMat.emissive.setHex(0xff2020);
      marshalLedMat.emissiveIntensity = 0.9 + pulse * 1.9;
    } else if (marshalState === 'YellowFlash') {
      const flashOn = Math.sin(t * 14.0) > 0;
      marshalLedMat.color.setHex(0xeab308);
      marshalLedMat.emissive.setHex(0xfacc15);
      marshalLedMat.emissiveIntensity = flashOn ? 2.5 : 0.25;
    } else {
      marshalLedMat.color.setHex(0x16a34a);
      marshalLedMat.emissive.setHex(0x22c55e);
      marshalLedMat.emissiveIntensity = 1.55;
    }
  }

  return {
    materials,
    keyLight,
    applyQuality,
    update,
  };
}
