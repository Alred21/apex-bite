import * as THREE from 'three';
import { CircuitData, SessionSnapshot, type GhostPose } from '../simulation/types';
import { createIndoorVenue, buildVenueBarriers } from './venue';
import { applyGraphicsQuality, GraphicsQuality, loadGraphicsQuality } from './graphics';
import { createKartRig } from './kart';
import { createTireMarkMaterial } from './materials';

function createTextSprite(label: string, bgColor = '#e11d48'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 67);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.95, 0.95, 1);
  return sprite;
}

function buildTrackRibbonMesh(circuit: CircuitData, material: THREE.MeshStandardMaterial): THREE.Mesh {
  const samples = circuit.samples;
  const n = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    positions.push(s.leftBarrier.x, 0.01, s.leftBarrier.z);
    positions.push(s.rightBarrier.x, 0.01, s.rightBarrier.z);
    uvs.push(s.leftBarrier.x / 2, s.leftBarrier.z / 2, s.rightBarrier.x / 2, s.rightBarrier.z / 2);

    if (i < n) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildStartFinishAndGridBoxes(circuit: CircuitData): THREE.Group {
  const group = new THREE.Group();
  const s0 = circuit.samples[0];
  const width = s0.widthMeters;

  // Checkered Start/Finish line
  const cols = 12;
  const rows = 2;
  const tileW = (width - 0.3) / cols;
  const tileL = 0.38;
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe7e4d9, roughness: 0.82 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x171a1b, roughness: 0.82 });
  const tileGeo = new THREE.PlaneGeometry(tileW, tileL);
  tileGeo.rotateX(-Math.PI / 2);

  const heading = Math.atan2(s0.tangent.z, s0.tangent.x);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lateral = (c - (cols - 1) * 0.5) * tileW;
      const forward = (r - 0.5) * tileL;
      const tile = new THREE.Mesh(tileGeo, (r + c) % 2 === 0 ? whiteMat : blackMat);
      tile.position.set(
        s0.center.x + s0.tangent.x * forward + s0.normal.x * lateral,
        0.022,
        s0.center.z + s0.tangent.z * forward + s0.normal.z * lateral,
      );
      tile.rotation.y = -heading + Math.PI / 2;
      group.add(tile);
    }
  }

  // 12 Starting Grid Boxes (2 columns of 6 behind the start/finish line)
  const n = circuit.samples.length;
  for (let row = 1; row <= 6; row++) {
    const sampleIdx = (n - row * 4) % n;
    const gs = circuit.samples[sampleIdx];
    const gHeading = Math.atan2(gs.tangent.z, gs.tangent.x);
    for (const laneSign of [-1, 1]) {
      const lateralOffset = laneSign * 1.15;
      const boxGroup = new THREE.Group();

      const frontBar = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.1),
        whiteMat,
      );
      frontBar.rotateX(-Math.PI / 2);
      frontBar.position.set(0, 0, -0.55);

      const leftBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.8),
        whiteMat,
      );
      leftBar.rotateX(-Math.PI / 2);
      leftBar.position.set(-0.5, 0, -0.2);

      const rightBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 0.8),
        whiteMat,
      );
      rightBar.rotateX(-Math.PI / 2);
      rightBar.position.set(0.5, 0, -0.2);

      boxGroup.add(frontBar, leftBar, rightBar);
      boxGroup.position.set(
        gs.center.x + gs.normal.x * lateralOffset,
        0.021,
        gs.center.z + gs.normal.z * lateralOffset,
      );
      boxGroup.rotation.y = -gHeading - Math.PI / 2;
      group.add(boxGroup);
    }
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

function buildGhostKartRig(tintColor: number) {
  // Each rig owns its materials. Reusing the same model construction keeps
  // geometry and driver updates in step without tinting the player's Kart.
  const rig = createKartRig();
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
  const venue = createIndoorVenue(renderer, scene, circuit);
  let graphicsQuality = loadGraphicsQuality();
  function setGraphicsQuality(quality: GraphicsQuality): void {
    graphicsQuality = quality;
    applyGraphicsQuality(renderer, venue.keyLight, quality);
  }
  setGraphicsQuality(graphicsQuality);
  scene.add(buildTrackRibbonMesh(circuit, venue.materials.pavement));
  scene.add(buildVenueBarriers(circuit, venue.materials));
  scene.add(buildStartFinishAndGridBoxes(circuit));

  const racingLineRibbon = buildRacingLineRibbon(initialSnapshot);
  scene.add(racingLineRibbon.mesh);

  // Numbered Turn markers (1–11)
  for (const turn of circuit.turns) {
    const sprite = createTextSprite(String(turn.number));
    sprite.position.set(turn.apexPoint.x, 1.75, turn.apexPoint.z);
    scene.add(sprite);
  }

  const kartRig = createKartRig();
  kartRig.root.traverse((object) => {
    if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  scene.add(kartRig.root);

  const trackRecordGhost = buildGhostKartRig(0xfacc15); // Gold executable Reference Lap Ghost
  const personalBestGhost = buildGhostKartRig(0x22c55e); // Emerald Personal Best Ghost
  scene.add(trackRecordGhost.root, personalBestGhost.root);

  // Dynamic rear-tire scrub / skid marks pool on the indoor floor
  const maxSkidMarks = 320;
  const skidPool: THREE.Mesh[] = [];
  const skidGeo = new THREE.PlaneGeometry(0.30, 0.12);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = createTireMarkMaterial();
  for (let i = 0; i < maxSkidMarks; i++) {
    const m = new THREE.Mesh(skidGeo, skidMat);
    m.visible = false;
    scene.add(m);
    skidPool.push(m);
  }
  let skidCursor = 0;
  let lastSkidTick = -10;

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

    // Emit rear-tire scrub/skid marks when sliding or experiencing heavy Axle Scrub
    if (
      (kart.axleScrub > 0.22 || kart.slipRatio > 0.28) &&
      kart.speedKph > 8 &&
      snapshot.tick - lastSkidTick >= 2
    ) {
      lastSkidTick = snapshot.tick;
      const cosH = Math.cos(kart.headingRad);
      const sinH = Math.sin(kart.headingRad);
      const rightX = -sinH;
      const rightZ = cosH;
      const rearAxleX = kart.position.x - cosH * 0.52;
      const rearAxleZ = kart.position.z - sinH * 0.52;

      for (const side of [-0.335, 0.335]) {
        const mark = skidPool[skidCursor % maxSkidMarks];
        skidCursor += 1;
        mark.position.set(
          rearAxleX + rightX * side,
          0.018,
          rearAxleZ + rightZ * side,
        );
        mark.rotation.y = -kart.headingRad;
        mark.visible = true;
      }
    }

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
      activeSkidMarks: skidPool.filter((mark) => mark.visible).length, skidCapacity: maxSkidMarks,
    }),
  };
}
