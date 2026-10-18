import * as THREE from 'three';
import { CircuitData, SessionSnapshot } from '../simulation/types';
import { createIndoorVenue, buildVenueBarriers } from './venue';
import { applyGraphicsQuality, GraphicsQuality, loadGraphicsQuality } from './graphics';
import { createKartRig } from './kart';

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
  const halfWidth = 0.19;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const pt = points[i % n];
    const nx = -Math.sin(pt.headingRad);
    const nz = Math.cos(pt.headingRad);
    positions.push(
      pt.position.x - nx * halfWidth,
      0.025,
      pt.position.z - nz * halfWidth,
      pt.position.x + nx * halfWidth,
      0.025,
      pt.position.z + nz * halfWidth,
    );
    colors.push(0.13, 0.77, 0.37, 0.13, 0.77, 0.37);

    if (i < n) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colorAttr = new THREE.Float32BufferAttribute(colors, 3);
  geo.setAttribute('color', colorAttr);
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);

  function updateColors(snapshot: SessionSnapshot): void {
    mesh.visible = snapshot.racingLine.visible;
    if (!snapshot.racingLine.visible) return;

    const pts = snapshot.racingLine.points;
    const arr = colorAttr.array as Float32Array;
    for (let i = 0; i <= n; i++) {
      const cue = pts[i % n].liveCue;
      let r = 0.133;
      let g = 0.773;
      let b = 0.369;
      if (cue === 'Red') {
        r = 0.937;
        g = 0.267;
        b = 0.267;
      } else if (cue === 'Yellow') {
        r = 0.918;
        g = 0.702;
        b = 0.031;
      }
      const offset = i * 6;
      arr[offset] = r;
      arr[offset + 1] = g;
      arr[offset + 2] = b;
      arr[offset + 3] = r;
      arr[offset + 4] = g;
      arr[offset + 5] = b;
    }
    colorAttr.needsUpdate = true;
  }

  return { mesh, updateColors };
}

function buildGhostKartMesh(tintColor: number): THREE.Group {
  const ghostRoot = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: tintColor,
    transparent: true,
    opacity: 0.42,
    roughness: 0.25,
    emissive: tintColor,
    emissiveIntensity: 0.25,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.22, 0.92), mat);
  body.position.set(0, 0.18, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.74), mat);
  nose.position.set(0.65, 0.22, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.42), mat);
  seat.position.set(-0.18, 0.36, 0);

  const tireGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.18, 16);
  for (const [tx, tz] of [
    [-0.52, -0.58],
    [-0.52, 0.58],
    [0.54, -0.54],
    [0.54, 0.54],
  ]) {
    const tire = new THREE.Mesh(tireGeo, mat);
    tire.position.set(tx, 0.18, tz);
    ghostRoot.add(tire);
  }

  ghostRoot.add(body, nose, seat);
  ghostRoot.visible = false;
  return ghostRoot;
}

export interface CircuitRenderer {
  render(snapshot: SessionSnapshot): void;
  setGraphicsQuality(quality: GraphicsQuality): void;
  getGraphicsQuality(): GraphicsQuality;
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

  const trackRecordGhostMesh = buildGhostKartMesh(0xfacc15); // Gold 24.499s Track Record Ghost
  const personalBestGhostMesh = buildGhostKartMesh(0x22c55e); // Emerald Personal Best Ghost
  scene.add(trackRecordGhostMesh, personalBestGhostMesh);

  // Dynamic rear-tire scrub / skid marks pool on the indoor floor
  const maxSkidMarks = 320;
  const skidPool: THREE.Mesh[] = [];
  const skidGeo = new THREE.PlaneGeometry(0.28, 0.16);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x090b10,
    transparent: true,
    opacity: 0.48,
  });
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

  function render(snapshot: SessionSnapshot): void {
    const { kart, camera: camState, ghost } = snapshot;
    venue.keyLight.position.set(kart.position.x + 4, 14, kart.position.z + 7);
    venue.keyLight.target.position.set(kart.position.x, 0, kart.position.z);
    racingLineRibbon.updateColors(snapshot);

    kartRig.update(snapshot);

    if (ghost.trackRecordPose) {
      trackRecordGhostMesh.visible = true;
      trackRecordGhostMesh.position.set(
        ghost.trackRecordPose.position.x,
        0,
        ghost.trackRecordPose.position.z,
      );
      trackRecordGhostMesh.rotation.y = -ghost.trackRecordPose.headingRad;
    } else {
      trackRecordGhostMesh.visible = false;
    }

    if (ghost.personalBestPose) {
      personalBestGhostMesh.visible = true;
      personalBestGhostMesh.position.set(
        ghost.personalBestPose.position.x,
        0,
        ghost.personalBestPose.position.z,
      );
      personalBestGhostMesh.rotation.y = -ghost.personalBestPose.headingRad;
    } else {
      personalBestGhostMesh.visible = false;
    }

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

    camera.position.set(camState.position.x, camState.position.y, camState.position.z);
    camera.lookAt(camState.lookAt.x, camState.lookAt.y, camState.lookAt.z);

    renderer.render(scene, camera);
  }

  return { render, setGraphicsQuality, getGraphicsQuality: () => graphicsQuality };
}
