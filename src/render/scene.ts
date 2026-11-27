import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CircuitData, RacingLinePoint, SessionSnapshot, type GhostPose } from '../simulation/types';
import { createIndoorVenue } from './venue';
import { buildSeamlessProtexBarriers } from './barriers';
import { SkidRibbonSystem } from './skid-marks';
import { applyGraphicsQuality, GraphicsQuality, loadGraphicsQuality } from './graphics';
import { createKartRig } from './kart';
import type { RendererAssets } from './assets';

function nearestRacingLineDistance(
  px: number,
  pz: number,
  progress: number,
  points: ReadonlyArray<RacingLinePoint>,
): number {
  const count = points.length;
  if (count === 0) return Infinity;
  const centerIdx = Math.floor(((progress % 1) + 1) % 1 * count) % count;
  const halfWindow = count > 48 ? 24 : count;
  let bestDistSq = Infinity;
  const span = Math.min(count, halfWindow * 2 + 1);
  for (let offset = -halfWindow; offset < -halfWindow + span; offset++) {
    const idx = ((centerIdx + offset) % count + count) % count;
    const a = points[idx].position;
    const b = points[(idx + 1) % count].position;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-10 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / lenSq)) : 0;
    const cx = a.x + dx * t;
    const cz = a.z + dz * t;
    const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (dSq < bestDistSq) bestDistSq = dSq;
  }
  return Math.sqrt(bestDistSq);
}

export function buildTrackRibbonMesh(
  circuit: CircuitData,
  material: THREE.Material,
  racingLinePoints: ReadonlyArray<RacingLinePoint> = [],
): THREE.Mesh {
  const samples = circuit.samples;
  const n = samples.length;
  const crossCols = 18;
  const stride = crossCols + 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const trackSurface: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const distMeters = i === n ? circuit.totalLengthMeters : s.distanceMeters;
    const cornerWeight = 0.68 + 0.32 * Math.min(1, Math.abs(s.curvature) * 5.0);

    for (let c = 0; c <= crossCols; c++) {
      const u = c / crossCols;
      const x = s.leftBarrier.x + (s.rightBarrier.x - s.leftBarrier.x) * u;
      const z = s.leftBarrier.z + (s.rightBarrier.z - s.leftBarrier.z) * u;
      positions.push(x, 0.01, z);
      normals.push(0, 1, 0);
      uvs.push(x / 2, z / 2);

      let groove = 0;
      if (racingLinePoints.length > 0) {
        const dLine = nearestRacingLineDistance(x, z, s.progress, racingLinePoints);
        groove = Math.exp(-0.5 * (dLine / 0.62) * (dLine / 0.62)) * cornerWeight;
      }
      const edgeMeters = Math.min(u, 1 - u) * s.widthMeters;
      trackSurface.push(groove, edgeMeters, distMeters);
    }

    if (i < n) {
      const rowA = i * stride;
      const rowB = (i + 1) * stride;
      for (let c = 0; c < crossCols; c++) {
        indices.push(rowA + c, rowA + c + 1, rowB + c);
        indices.push(rowA + c + 1, rowB + c + 1, rowB + c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aTrackSurface', new THREE.Float32BufferAttribute(trackSurface, 3));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'TrackSurfaceRibbon';
  mesh.receiveShadow = true;
  return mesh;
}

function buildStartFinishAndGridBoxes(circuit: CircuitData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StartFinishAndGrid';
  const s0 = circuit.samples[0];
  const width = s0.widthMeters;

  // Deterministic PRNG for weathered paint flecks and tire-scuff streaks
  let seed = 42054;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Weathered checkered Start/Finish line (single textured quad)
  const cols = 12;
  const rows = 2;
  const sfWidth = width - 0.36;
  const sfLength = 0.80;
  const sfCanvas = document.createElement('canvas');
  sfCanvas.width = 1024;
  sfCanvas.height = 192;
  const sfCtx = sfCanvas.getContext('2d')!;
  const cellW = sfCanvas.width / cols;
  const cellH = sfCanvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sfCtx.fillStyle = (r + c) % 2 === 0 ? '#e3e0d3' : '#181b1d';
      sfCtx.fillRect(c * cellW, r * cellH, cellW + 1, cellH + 1);
    }
  }
  // Subtle rubber tire streaks & concrete wear speckles over checkers
  for (let i = 0; i < 420; i++) {
    sfCtx.fillStyle = rand() > 0.45 ? `rgba(55,58,60,${0.08 + rand() * 0.22})` : `rgba(22,24,26,${0.06 + rand() * 0.16})`;
    sfCtx.fillRect(rand() * sfCanvas.width, rand() * sfCanvas.height, 2 + rand() * 14, 1 + rand() * 12);
  }
  const sfTex = new THREE.CanvasTexture(sfCanvas);
  sfTex.colorSpace = THREE.SRGBColorSpace;
  sfTex.anisotropy = 4;
  const sfMat = new THREE.MeshStandardMaterial({
    map: sfTex,
    roughness: 0.78,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sfGeo = new THREE.PlaneGeometry(sfWidth, sfLength);
  sfGeo.rotateX(-Math.PI / 2);
  const sfMesh = new THREE.Mesh(sfGeo, sfMat);
  const heading = Math.atan2(s0.tangent.z, s0.tangent.x);
  sfMesh.position.set(s0.center.x, 0.015, s0.center.z);
  sfMesh.rotation.y = -heading + Math.PI / 2;
  sfMesh.receiveShadow = true;
  group.add(sfMesh);

  // 12 Numbered Starting Grid Boxes (2 columns x 6 rows behind start/finish) merged into 1 draw call
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = 512;
  atlasCanvas.height = 512;
  const ctx = atlasCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);
  const atlasCols = 4;
  const atlasRows = 3;
  const boxW = 512 / atlasCols;
  const boxH = 512 / atlasRows;

  for (let idx = 0; idx < 12; idx++) {
    const col = idx % atlasCols;
    const row = Math.floor(idx / atlasCols);
    const ox = col * boxW;
    const oy = row * boxH;

    // Weathered white U-shaped grid slot + grid position number (01..12)
    ctx.strokeStyle = 'rgba(232, 229, 217, 0.9)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(ox + 16, oy + boxH * 0.74);
    ctx.lineTo(ox + 16, oy + 16);
    ctx.lineTo(ox + boxW - 16, oy + 16);
    ctx.lineTo(ox + boxW - 16, oy + boxH * 0.74);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232, 229, 217, 0.86)';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx + 1).padStart(2, '0'), ox + boxW * 0.5, oy + boxH * 0.52);

    // Subtle scuff wear specks across painted lines
    for (let s = 0; s < 35; s++) {
      ctx.clearRect(
        ox + 10 + rand() * (boxW - 20),
        oy + 10 + rand() * (boxH - 20),
        2 + rand() * 5,
        2 + rand() * 5,
      );
    }
  }

  const gridTex = new THREE.CanvasTexture(atlasCanvas);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = 4;
  const gridMat = new THREE.MeshStandardMaterial({
    map: gridTex,
    transparent: true,
    alphaTest: 0.08,
    roughness: 0.78,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const gridGeos: THREE.BufferGeometry[] = [];
  const n = circuit.samples.length;
  for (let row = 0; row < 6; row++) {
    const sampleIdx = (n - (row + 1) * 4) % n;
    const gs = circuit.samples[sampleIdx];
    const gHeading = Math.atan2(gs.tangent.z, gs.tangent.x);
    for (let laneIdx = 0; laneIdx < 2; laneIdx++) {
      const gridNumberIdx = row * 2 + laneIdx;
      const laneSign = laneIdx === 0 ? -1 : 1;
      const lateralOffset = laneSign * 1.15;

      const plane = new THREE.PlaneGeometry(1.18, 1.05);
      plane.rotateX(-Math.PI / 2);
      plane.rotateY(-gHeading - Math.PI / 2);
      plane.translate(
        gs.center.x + gs.normal.x * lateralOffset,
        0.015,
        gs.center.z + gs.normal.z * lateralOffset,
      );

      // Map UVs to cell (col, row) in the 4x3 atlas (flip Y for canvas top-down vs WebGL UV bottom-up)
      const atlasCol = gridNumberIdx % atlasCols;
      const atlasRow = Math.floor(gridNumberIdx / atlasCols);
      const u0 = atlasCol / atlasCols;
      const u1 = (atlasCol + 1) / atlasCols;
      const v1 = 1 - atlasRow / atlasRows;
      const v0 = 1 - (atlasRow + 1) / atlasRows;
      const uv = plane.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
      }
      gridGeos.push(plane);
    }
  }

  const mergedGridGeo = mergeGeometries(gridGeos, false);
  for (const g of gridGeos) g.dispose();
  if (mergedGridGeo) {
    const gridMesh = new THREE.Mesh(mergedGridGeo, gridMat);
    gridMesh.name = 'StartingGridBoxes';
    gridMesh.receiveShadow = true;
    group.add(gridMesh);
  }

  return group;
}

function buildRacingLineRibbon(initialSnapshot: SessionSnapshot): {
  mesh: THREE.Mesh;
  updateColors: (snapshot: SessionSnapshot) => void;
} {
  const points = initialSnapshot.racingLine.points;
  const n = points.length;
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  let distanceMeters = 0;
  for (let i = 0; i <= n; i++) {
    const point = points[i % n];
    if (i) distanceMeters += Math.hypot(point.position.x - points[(i - 1) % n].position.x, point.position.z - points[(i - 1) % n].position.z);
    const nx = -Math.sin(point.headingRad), nz = Math.cos(point.headingRad);
    positions.push(point.position.x - nx * 0.17, 0.025, point.position.z - nz * 0.17,
      point.position.x + nx * 0.17, 0.025, point.position.z + nz * 0.17);
    colors.push(0, 1, 0, 1, 0, 1, 0, 1);
    uvs.push(0, distanceMeters / 1.6, 1, distanceMeters / 1.6);
    if (i < n) { const base = i * 2; indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); }
  }
  // One small, repeatable mask: chevrons point forward along actual path length.
  // Alpha gaps expose pavement; speed changes affect vertex colors only.
  const width = 64, height = 128, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const across = Math.abs((x + 0.5) / width * 2 - 1);
    const centre = 0.28 + 0.35 * (1 - across);
    const edge = Math.abs((y + 0.5) / height - centre);
    const alpha = Math.max(0, Math.min(1, (0.10 - edge) / 0.018)) * Math.min(1, (1 - across) / 0.08);
    const offset = (y * width + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round(alpha * 255);
  }
  const mask = new THREE.DataTexture(pixels, width, height);
  mask.wrapT = THREE.RepeatWrapping;
  mask.magFilter = mask.minFilter = THREE.LinearFilter;
  mask.needsUpdate = true;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const colorAttribute = new THREE.Float32BufferAttribute(colors, 4);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ map: mask, vertexColors: true, transparent: true,
    opacity: 0.55, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  const palette = { Green: new THREE.Color(0x2fdf77), Yellow: new THREE.Color(0xf3bf3f), Red: new THREE.Color(0xf04c46) };
  function updateColors(snapshot: SessionSnapshot): void {
    mesh.visible = snapshot.racingLine.visible;
    if (!mesh.visible) return;
    const array = colorAttribute.array as Float32Array;
    for (let i = 0; i <= n; i++) {
      const point = snapshot.racingLine.points[i % n], color = palette[point.liveCue];
      const alpha = point.displayed ? 1 : 0;
      const offset = i * 8;
      array[offset] = array[offset + 4] = color.r;
      array[offset + 1] = array[offset + 5] = color.g;
      array[offset + 2] = array[offset + 6] = color.b;
      array[offset + 3] = array[offset + 7] = alpha;
    }
    colorAttribute.needsUpdate = true;
  }
  return { mesh, updateColors };
}

function buildGhostKartRig(tintColor: number, assets?: RendererAssets) {
  // Each rig owns its materials. Reusing the same model construction keeps
  // geometry and driver updates in step without tinting the player's Kart.
  const rig = createKartRig(assets);
  const tint = new THREE.Color(tintColor);
  const materials = new Map<THREE.Material, number>();
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = object.receiveShadow = false;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (materials.has(material)) continue;
      materials.set(material, material.opacity);
      material.transparent = true;
      material.depthWrite = false;
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
        material.color.lerp(tint, 0.78);
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(tint);
        material.emissiveIntensity = 0.15;
      }
    }
  });
  rig.root.visible = false;
  return { ...rig, materials };
}

export interface CircuitRenderer {
  render(snapshot: SessionSnapshot): void;
  setGraphicsQuality(quality: GraphicsQuality): void;
  getGraphicsQuality(): GraphicsQuality;
  /** Read-only production counters for repeatable performance QA. */
  getDiagnostics(): { calls: number; triangles: number; geometries: number; textures: number; programs: number; activeSkidMarks: number; skidCapacity: number };
}

export function createCircuitRenderer(
  canvas: HTMLCanvasElement,
  initialSnapshot: SessionSnapshot,
  assets?: RendererAssets,
): CircuitRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);

  const camera = new THREE.PerspectiveCamera(
    64,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );

  const circuit = initialSnapshot.circuit;
  const venue = createIndoorVenue(renderer, scene, circuit, assets);
  let graphicsQuality = loadGraphicsQuality();
  function setGraphicsQuality(quality: GraphicsQuality): void {
    graphicsQuality = quality;
    applyGraphicsQuality(renderer, venue.keyLight, quality);
  }
  setGraphicsQuality(graphicsQuality);
  scene.add(
    buildTrackRibbonMesh(
      circuit,
      venue.materials.trackSurface,
      initialSnapshot.racingLine.points,
    ),
  );
  scene.add(buildSeamlessProtexBarriers(circuit, venue.materials));
  scene.add(buildStartFinishAndGridBoxes(circuit));

  const racingLineRibbon = buildRacingLineRibbon(initialSnapshot);
  scene.add(racingLineRibbon.mesh);

  const kartRig = createKartRig(assets);
  kartRig.root.traverse((object) => {
    if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  scene.add(kartRig.root);

  const trackRecordGhost = buildGhostKartRig(0xfacc15, assets); // Gold executable Reference Lap Ghost
  const personalBestGhost = buildGhostKartRig(0x22c55e, assets); // Emerald Personal Best Ghost
  scene.add(trackRecordGhost.root, personalBestGhost.root);

  const skidSystem = new SkidRibbonSystem(400);
  scene.add(skidSystem.mesh);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyGraphicsQuality(renderer, venue.keyLight, graphicsQuality);
  });

  function updateGhost(rig: ReturnType<typeof buildGhostKartRig>, pose: GhostPose | null, snapshot: SessionSnapshot): void {
    if (!pose) { rig.root.visible = false; return; }
    rig.update({
      ...snapshot,
      kart: { ...snapshot.kart, position: pose.position, headingRad: pose.headingRad,
        speedKph: pose.speedKph, speedMps: pose.speedKph / 3.6,
        steerAngleRad: pose.steerAngleRad, steeringWheelAngleRad: pose.steeringWheelAngleRad },
      // A ghost is always viewed from outside, including in the player's Helmet Cam.
      camera: { ...snapshot.camera, mode: 'Chase Cam' },
    });
    // The combined Kart/Ghost footprint fits inside 2.2 m at any heading.
    // Keep intersecting geometry invisible, then restore it over 1.3 m of clearance.
    // Smoothstep has flat endpoints; tiny boundary motion cannot produce a pop.
    const distance = Math.hypot(pose.position.x - snapshot.kart.position.x, pose.position.z - snapshot.kart.position.z);
    const separation = THREE.MathUtils.clamp((distance - 2.2) / 1.3, 0, 1);
    const opacity = 0.42 * separation * separation * (3 - 2 * separation);
    for (const [material, baseOpacity] of rig.materials) material.opacity = baseOpacity * opacity;
    rig.root.visible = separation > 0;
  }

  function render(snapshot: SessionSnapshot): void {
    const { kart, camera: camState, ghost } = snapshot;
    venue.keyLight.position.set(kart.position.x + 4, 14, kart.position.z + 7);
    venue.keyLight.target.position.set(kart.position.x, 0, kart.position.z);
    racingLineRibbon.updateColors(snapshot);

    kartRig.update(snapshot);

    updateGhost(trackRecordGhost, ghost.trackRecordPose, snapshot);
    updateGhost(personalBestGhost, ghost.personalBestPose, snapshot);

    skidSystem.update(snapshot);

    if (camera.fov !== camState.settings.fieldOfViewDegrees) {
      camera.fov = camState.settings.fieldOfViewDegrees;
      camera.updateProjectionMatrix();
    }
    camera.up.set(0, 1, 0);
    camera.position.set(camState.position.x, camState.position.y, camState.position.z);
    camera.lookAt(camState.lookAt.x, camState.lookAt.y, camState.lookAt.z);
    camera.rotateZ(camState.rollRad);

    renderer.render(scene, camera);
  }

  return {
    render, setGraphicsQuality, getGraphicsQuality: () => graphicsQuality,
    getDiagnostics: () => ({
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      activeSkidMarks: skidSystem.getActiveSegmentCount(), skidCapacity: skidSystem.capacity,
    }),
  };
}
