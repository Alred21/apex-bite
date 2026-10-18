import * as THREE from 'three';
import { CircuitData, SessionSnapshot } from '../simulation/types';

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
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 2.2, 1);
  return sprite;
}

function buildTrackRibbonMesh(circuit: CircuitData): THREE.Mesh {
  const samples = circuit.samples;
  const n = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    positions.push(s.leftBarrier.x, 0.01, s.leftBarrier.z);
    positions.push(s.rightBarrier.x, 0.01, s.rightBarrier.z);
    const v = (i / n) * 40;
    uvs.push(0, v, 1, v);

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

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2b3038,
    roughness: 0.55,
    metalness: 0.12,
  });
  return new THREE.Mesh(geo, mat);
}

function buildBarrierWallMesh(circuit: CircuitData, side: 'left' | 'right'): THREE.Group {
  const group = new THREE.Group();
  const samples = circuit.samples;
  const n = samples.length;
  const wallHeight = 0.48;
  const wallThickness = 0.24;

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.35,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
  });

  const segGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 1.0);

  for (let i = 0; i < n; i += 2) {
    const a = samples[i];
    const b = samples[(i + 2) % n];
    const pa = side === 'left' ? a.leftBarrier : a.rightBarrier;
    const pb = side === 'left' ? b.leftBarrier : b.rightBarrier;

    const midX = (pa.x + pb.x) * 0.5;
    const midZ = (pa.z + pb.z) * 0.5;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const segLen = Math.max(0.2, Math.hypot(dx, dz));
    const yaw = Math.atan2(dx, dz);

    const mesh = new THREE.Mesh(segGeo, Math.floor(i / 4) % 2 === 0 ? redMat : whiteMat);
    mesh.scale.set(1, 1, segLen * 1.04);
    mesh.position.set(midX, wallHeight * 0.5, midZ);
    mesh.rotation.y = yaw;
    group.add(mesh);
  }

  return group;
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
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
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

function buildKartMesh(): {
  root: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
} {
  const root = new THREE.Group();

  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.3,
    metalness: 0.25,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.6,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111113,
    roughness: 0.85,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.25,
  });

  // Main floorpan + electric battery pod
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 0.92), darkMat);
  floor.position.set(0, 0.14, 0);
  root.add(floor);

  // Side pods
  const leftPod = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.22), chassisMat);
  leftPod.position.set(-0.05, 0.22, -0.48);
  const rightPod = leftPod.clone();
  rightPod.position.z = 0.48;
  root.add(leftPod, rightPod);

  // Front nose cone & fairing
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.76), chassisMat);
  nose.position.set(0.66, 0.23, 0);
  root.add(nose);

  const numberPanel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.42), accentMat);
  numberPanel.position.set(0.45, 0.36, 0);
  numberPanel.rotation.z = 0.35;
  root.add(numberPanel);

  // Bucket seat & rear electric motor housing
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.44), darkMat);
  seat.position.set(-0.18, 0.38, 0);
  seat.rotation.z = -0.22;
  root.add(seat);

  const motorPod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.56), accentMat);
  motorPod.position.set(-0.56, 0.28, 0);
  root.add(motorPod);

  // Solid rear live axle bar
  const rearAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.26, 12),
    darkMat,
  );
  rearAxle.position.set(-0.52, 0.18, 0);
  root.add(rearAxle);

  // 4 Exposed Kart Tires (along +x forward, +z right)
  const tireGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.18, 20);

  const rearLeftTire = new THREE.Mesh(tireGeo, tireMat);
  rearLeftTire.position.set(-0.52, 0.18, -0.58);
  const rearRightTire = new THREE.Mesh(tireGeo, tireMat);
  rearRightTire.position.set(-0.52, 0.18, 0.58);
  root.add(rearLeftTire, rearRightTire);

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(0.54, 0.17, -0.54);
  const frontLeftTire = new THREE.Mesh(tireGeo, tireMat);
  frontLeftPivot.add(frontLeftTire);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(0.54, 0.17, 0.54);
  const frontRightTire = new THREE.Mesh(tireGeo, tireMat);
  frontRightPivot.add(frontRightTire);

  root.add(frontLeftPivot, frontRightPivot);

  return { root, frontLeftPivot, frontRightPivot };
}

export interface CircuitRenderer {
  render(snapshot: SessionSnapshot): void;
}

export function createCircuitRenderer(
  canvas: HTMLCanvasElement,
  initialSnapshot: SessionSnapshot,
): CircuitRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);

  const camera = new THREE.PerspectiveCamera(
    64,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );

  // Indoor arena lighting
  scene.add(new THREE.AmbientLight(0xdbeafe, 0.85));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(20, 45, 15);
  scene.add(keyLight);

  // Base K1 Speed Toronto light-blue infield floor + dark outer hall floor
  const hallFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 }),
  );
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.y = -0.02;
  scene.add(hallFloor);

  const infieldFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(115, 90),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.45 }),
  );
  infieldFloor.rotation.x = -Math.PI / 2;
  infieldFloor.position.set(4, -0.005, -4);
  scene.add(infieldFloor);

  // Track asphalt ribbon, barriers, start/finish & grid boxes
  const circuit = initialSnapshot.circuit;
  scene.add(buildTrackRibbonMesh(circuit));
  scene.add(buildBarrierWallMesh(circuit, 'left'));
  scene.add(buildBarrierWallMesh(circuit, 'right'));
  scene.add(buildStartFinishAndGridBoxes(circuit));

  // Numbered Turn markers (1–11)
  for (const turn of circuit.turns) {
    const sprite = createTextSprite(String(turn.number));
    sprite.position.set(turn.apexPoint.x, 1.75, turn.apexPoint.z);
    scene.add(sprite);
  }

  const kartRig = buildKartMesh();
  scene.add(kartRig.root);

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
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function render(snapshot: SessionSnapshot): void {
    const { kart, camera: camState } = snapshot;
    kartRig.root.position.set(kart.position.x, 0, kart.position.z);
    // In Three.js, rotating around +Y by -headingRad aligns +X local axis with (cos(heading), sin(heading))
    kartRig.root.rotation.y = -kart.headingRad;

    kartRig.frontLeftPivot.rotation.y = -kart.steerAngleRad;
    kartRig.frontRightPivot.rotation.y = -kart.steerAngleRad;

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

      for (const side of [-0.58, 0.58]) {
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

  return { render };
}
