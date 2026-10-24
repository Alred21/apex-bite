import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SessionSnapshot } from '../simulation/types';

// A fitted seated suit, authored for this Kart rather than a standing humanoid
// squeezed into the bucket. Metres, +X forward, +Z right. No external assets.
const SIDES = 24;
const SLEEVE_RINGS = 17;
type Ring = [x: number, y: number, z: number, depth: number, width: number];
function tailoredSurface(rings: Ring[], sides = SIDES): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    const [x, y, z, depth, width] = rings[r];
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      positions.push(x + Math.cos(angle) * depth, y, z + Math.sin(angle) * width);
      uvs.push(j / sides, r / (rings.length - 1));
      if (r && j < sides) {
        const a = r * (sides + 1) + j, b = a - sides - 1;
        indices.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function shell(radiusX: number, radiusY: number, radiusZ: number): THREE.BufferGeometry {
  // Small glove/trim/vent details do not need the helmet's tessellation.
  const extent = Math.max(radiusX, radiusY, radiusZ);
  const geometry = new THREE.SphereGeometry(1, extent > 0.1 ? 32 : extent > 0.06 ? 24 : 16, extent > 0.1 ? 20 : extent > 0.06 ? 14 : 10);
  geometry.scale(radiusX, radiusY, radiusZ); return geometry;
}

function joinByMaterial(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone());
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const batch = batches.get(object.material) ?? []; batch.push(geometry); batches.set(object.material, batch);
  });
  group.clear();
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
}

/** One tiny two-link arm solve; no animation clips, character controller or rig framework. */
function elbowFor(shoulder: THREE.Vector3, wrist: THREE.Vector3, side: number): THREE.Vector3 {
  const axis = wrist.clone().sub(shoulder), distance = axis.length(); axis.normalize();
  const upper = 0.30, lower = 0.29;
  const along = Math.max(0, Math.min(distance, (upper * upper - lower * lower + distance * distance) / (2 * distance)));
  const bend = new THREE.Vector3(-0.1, -1, side * 0.7);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  return shoulder.clone().addScaledVector(axis, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
}

function sleeveGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SLEEVE_RINGS * (SIDES + 1) * 3), 3));
  const indices: number[] = [], uvs: number[] = [];
  for (let r = 0; r < SLEEVE_RINGS; r++) for (let j = 0; j <= SIDES; j++) uvs.push(j / SIDES, r / (SLEEVE_RINGS - 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  for (let r = 1; r < SLEEVE_RINGS; r++) for (let j = 0; j < SIDES; j++) {
    const a = r * (SIDES + 1) + j, b = a - SIDES - 1;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  geometry.setIndex(indices); return geometry;
}

function poseSleeve(geometry: THREE.BufferGeometry, shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3): void {
  const curve = new THREE.CatmullRomCurve3([shoulder, elbow, wrist]);
  const positions = geometry.getAttribute('position');
  for (let r = 0; r < SLEEVE_RINGS; r++) {
    const t = r / (SLEEVE_RINGS - 1), center = curve.getPoint(t), tangent = curve.getTangent(t);
    const side = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
    const normal = tangent.clone().cross(side).normalize();
    const radius = (t < 0.5 ? 0.057 - t * 0.020 : 0.047 - (t - 0.5) * 0.034)
      + 0.0025 * Math.sin(t * Math.PI * 12) * Math.exp(-Math.pow((t - 0.65) / 0.25, 2));
    for (let j = 0; j <= SIDES; j++) {
      const angle = j / SIDES * Math.PI * 2;
      const p = center.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius);
      positions.setXYZ(r * (SIDES + 1) + j, p.x, p.y, p.z);
    }
  }
  positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
}

function fabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const shade = 185 + ((x * 13 + y * 7) % 17) + ((x + y) % 3 === 0 ? 18 : 0);
    context.fillStyle = `rgb(${shade},${shade},${shade})`; context.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(6, 4);
  return texture;
}

export function createSeatedDriver(root: THREE.Group, steeringWheel: THREE.Group) {
  const driver = new THREE.Group(); driver.name = 'Seated helmeted driver'; root.add(driver);
  const fixed = new THREE.Group(); driver.add(fixed);
  const head = new THREE.Group(); head.name = 'Helmet and neck'; driver.add(head);
  const fabric = fabricTexture();
  const suit = new THREE.MeshStandardMaterial({ color: 0x25333e, roughness: 0.94, bumpMap: fabric, bumpScale: 0.00018 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x59636a, roughness: 0.92, bumpMap: fabric, bumpScale: 0.00012 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xa3ac72, roughness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x161a1e, roughness: 0.7 });
  const glovePad = new THREE.MeshStandardMaterial({ color: 0x343c43, roughness: 0.82, bumpMap: fabric, bumpScale: 0.00012 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xdfe2dd, metalness: 0.04, roughness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x20303d, metalness: 0.5, roughness: 0.17 });
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  // Shaped pelvis, waist, rib cage and shoulder yoke form one continuous suit.
  const torsoProfile: Ring[] = [
    [-.225, .215, 0, .065, .105], [-.23, .255, 0, .082, .132], [-.25, .33, 0, .078, .133],
    [-.275, .39, 0, .080, .130], [-.29, .44, 0, .085, .132], [-.300, .50, 0, .091, .142],
    [-.31, .59, 0, .094, .160], [-.32, .68, 0, .089, .178], [-.32, .725, 0, .079, .18],
    [-.32, .76, 0, .062, .155], [-.33, .79, 0, .044, .095], [-.335, .803, 0, .040, .060],
  ];
  add(tailoredSurface(torsoProfile), suit, fixed);
  // Front bib, centre zip and narrow shoulder piping read as a fabric suit.
  const bib = new THREE.BufferGeometry(), bibVertices: number[] = [], bibIndices: number[] = [];
  const chest = torsoProfile.filter(ring => ring[1] >= .44 && ring[1] <= .725);
  for (let row = 0; row < chest.length; row++) {
    const [x, y, , depth, width] = chest[row];
    for (let j = 0; j <= 8; j++) {
      const lateral = (j / 8 * 2 - 1) * .30;
      bibVertices.push(x + depth * Math.sqrt(1 - lateral * lateral) + .003, y, lateral * width);
      if (row && j < 8) { const a = row * 9 + j, b = a - 9; bibIndices.push(a, b + 1, b, a, a + 1, b + 1); }
    }
  }
  bib.setAttribute('position', new THREE.Float32BufferAttribute(bibVertices, 3));
  bib.setIndex(bibIndices); bib.computeVertexNormals(); add(bib, panel, fixed);
  const zip = add(new THREE.CylinderGeometry(.003, .003, .27, 5), black, fixed, -.221, .58); zip.rotation.z = -.18;
  for (const side of [-1, 1]) {
    // Relaxed bent knees and boots reach the existing pedals, inside sidepods.
    const hip = new THREE.Vector3(-.20, .25, side * .085), knee = new THREE.Vector3(.12, .31, side * .14), ankle = new THREE.Vector3(.38, .145, side * .15);
    const leg = new THREE.CatmullRomCurve3([hip, knee, ankle]);
    const frames = leg.computeFrenetFrames(12, false), vertices: number[] = [], indices: number[] = [], uvs: number[] = [];
    for (let r = 0; r <= 12; r++) {
      const t = r / 12, p = leg.getPoint(t), radius = t < .5 ? .075 - t * .035 : .057 - (t - .5) * .04;
      for (let j = 0; j <= SIDES; j++) {
        const a = j / SIDES * Math.PI * 2, v = p.clone().addScaledVector(frames.normals[r], Math.cos(a) * radius).addScaledVector(frames.binormals[r], Math.sin(a) * radius * .9);
        vertices.push(v.x, v.y, v.z); uvs.push(j / SIDES, t); if (r && j < SIDES) { const n = r * (SIDES + 1) + j, b = n - SIDES - 1; indices.push(n, b, b + 1, n, b + 1, n + 1) }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); add(g, suit, fixed);
    const boot = add(shell(.09, .043, .045), black, fixed, .398, .145, side * .15); boot.rotation.z = .24;
    add(shell(.025, .017, .047), trim, fixed, .405, .174, side * .15);
    // Shoulder epaulette and knee abrasion panel follow the suit's silhouette.
    add(shell(.046, .005, .021), panel, fixed, -.31, .765, side * .137);
    add(shell(.074, .012, .055), black, fixed, .115, .358, side * .14);
  }
  add(new THREE.CylinderGeometry(.049, .053, .065, 24), black, head, -.34, .812);
  add(new THREE.CylinderGeometry(.056, .06, .025, 24), panel, head, -.337, .824);
  // One shaped full-face shell integrates the jaw and chin bar into the crown.
  // The eye camera still hides this complete assembly, as before.
  const helmetProfile: Ring[] = [
    [-.337, .848, 0, .062, .072], [-.325, .866, 0, .109, .099],
    [-.318, .892, 0, .142, .117], [-.319, .925, 0, .143, .125],
    [-.323, .958, 0, .137, .129], [-.328, .994, 0, .132, .129],
    [-.333, 1.035, 0, .121, .123], [-.339, 1.070, 0, .100, .105],
    [-.344, 1.098, 0, .071, .080], [-.347, 1.119, 0, .035, .041],
    [-.347, 1.126, 0, .002, .002],
  ];
  add(tailoredSurface(helmetProfile, 32), helmet, head);
  const helmetPoint = (y: number, angle: number, offset = 0.002) => {
    const next = Math.max(1, helmetProfile.findIndex(ring => ring[1] >= y));
    const a = helmetProfile[next - 1], b = helmetProfile[next], t = (y - a[1]) / (b[1] - a[1]);
    return new THREE.Vector3(THREE.MathUtils.lerp(a[0], b[0], t) + Math.cos(angle) * (THREE.MathUtils.lerp(a[3], b[3], t) + offset),
      y, Math.sin(angle) * (THREE.MathUtils.lerp(a[4], b[4], t) + offset));
  };
  const helmetPatch = (bottom: number, top: number, arc: number, material: THREE.Material) => {
    const positions: number[] = [], indices: number[] = [];
    for (let row = 0; row <= 4; row++) for (let j = 0; j <= 24; j++) {
      const p = helmetPoint(THREE.MathUtils.lerp(bottom, top, row / 4), -arc + j / 24 * arc * 2);
      positions.push(p.x, p.y, p.z);
      if (row && j < 24) { const n = row * 25 + j, b = n - 25; indices.push(n, b + 1, b, n, n + 1, b + 1); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, material, head);
  };
  helmetPatch(.964, 1.033, 1.18, visor);
  helmetPatch(.906, .925, .49, black);
  for (const y of [.961, 1.036]) {
    const points = Array.from({ length: 25 }, (_, j) => helmetPoint(y, -1.19 + j / 24 * 2.38, .003));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, .0025, 5, false), black, head);
  }
  const bottomSeal = Array.from({ length: 32 }, (_, j) => helmetPoint(.855, j / 32 * Math.PI * 2, .001));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bottomSeal, true), 32, .0025, 5, true), black, head);
  for (const side of [-1, 1]) {
    add(shell(.011, .013, .005), black, head, -.292, .994, side * .129);
    add(shell(.003, .003, .0015), visor, head, -.292, .994, side * .134);
    const vent = helmetPoint(1.071, side * .45, .003);
    add(shell(.005, .003, .014), black, head, vent.x, vent.y, vent.z);
  }
  joinByMaterial(fixed); joinByMaterial(head);
  const arms = [-1, 1].map(side => {
    const geometry = sleeveGeometry(); add(geometry, suit, driver);
    const glove = new THREE.Group(); glove.name = side < 0 ? 'Left hand grip' : 'Right hand grip'; steeringWheel.add(glove);
    glove.position.set(-.013, 0, side * .119);
    // A curved palm, curled fingers and thumb visibly clasp the rim.
    add(shell(.031, .043, .023), black, glove, -.008, 0, 0);
    add(shell(.008, .032, .021), glovePad, glove, -.034, .003, 0);
    for (let i = 0; i < 4; i++) {
      const y = -.024 + i * .016;
      const finger = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.012, y, side * .008), new THREE.Vector3(-.002, y, side * .020),
        new THREE.Vector3(.021, y, side * .019), new THREE.Vector3(.032, y, side * .003),
        new THREE.Vector3(.024, y, -side * .012),
      ]);
      add(new THREE.TubeGeometry(finger, 10, .0055, 6, false), black, glove);
    }
    const thumb = add(shell(.024, .011, .012), black, glove, -.003, -.029, -side * .02);
    thumb.rotation.x = side * .32;
    const cuff = add(new THREE.CylinderGeometry(.029, .03, .018, 24), glovePad, glove, -.041, 0, 0);
    cuff.rotation.z = Math.PI / 2;
    joinByMaterial(glove);
    return { side, geometry, glove, shoulder: new THREE.Vector3(-.31, .725, side * .167) };
  });
  let lastSteering = Number.NaN;
  function update(snapshot: SessionSnapshot) {
    head.visible = snapshot.camera.mode !== 'Helmet Cam';
    // Arm geometry depends only on steering. Paused frames and travel need no solve.
    if (lastSteering === snapshot.kart.steeringWheelAngleRad) return;
    lastSteering = snapshot.kart.steeringWheelAngleRad;
    root.updateWorldMatrix(true, true);
    for (const arm of arms) {
      const wrist = root.worldToLocal(arm.glove.localToWorld(new THREE.Vector3(-.035, 0, 0)));
      poseSleeve(arm.geometry, arm.shoulder, elbowFor(arm.shoulder, wrist, arm.side), wrist);
    }
  }
  return { update };
}
