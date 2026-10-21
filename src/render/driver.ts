import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SessionSnapshot } from '../simulation/types';

// A fitted seated suit, authored for this Kart rather than a standing humanoid
// squeezed into the bucket. Metres, +X forward, +Z right. No external assets.
const SIDES = 12;
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
  const geometry = new THREE.SphereGeometry(1, extent > 0.1 ? 20 : extent > 0.06 ? 16 : 12, extent > 0.1 ? 12 : extent > 0.06 ? 8 : 6);
  geometry.scale(radiusX, radiusY, radiusZ); return geometry;
}

function joinByMaterial(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone());
    geometry.deleteAttribute('uv');
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
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * (SIDES + 1) * 3), 3));
  const indices: number[] = [];
  for (let r = 1; r < 9; r++) for (let j = 0; j < SIDES; j++) {
    const a = r * (SIDES + 1) + j, b = a - SIDES - 1;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  geometry.setIndex(indices); return geometry;
}

function poseSleeve(geometry: THREE.BufferGeometry, shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3): void {
  const curve = new THREE.CatmullRomCurve3([shoulder, elbow, wrist]);
  const positions = geometry.getAttribute('position');
  for (let r = 0; r < 9; r++) {
    const t = r / 8, center = curve.getPoint(t), tangent = curve.getTangent(t);
    const side = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
    const normal = tangent.clone().cross(side).normalize();
    const radius = t < 0.5 ? 0.061 - t * 0.024 : 0.049 - (t - 0.5) * 0.038;
    for (let j = 0; j <= SIDES; j++) {
      const angle = j / SIDES * Math.PI * 2;
      const p = center.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius);
      positions.setXYZ(r * (SIDES + 1) + j, p.x, p.y, p.z);
    }
  }
  positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
}

export function createSeatedDriver(root: THREE.Group, steeringWheel: THREE.Group) {
  const driver = new THREE.Group(); driver.name = 'Seated helmeted driver'; root.add(driver);
  const fixed = new THREE.Group(); driver.add(fixed);
  const head = new THREE.Group(); head.name = 'Helmet and neck'; driver.add(head);
  const suit = new THREE.MeshStandardMaterial({ color: 0x293f50, roughness: 0.87 });
  const panel = new THREE.MeshStandardMaterial({ color: 0xd8e1de, roughness: 0.76 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc7db36, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x121a20, roughness: 0.73 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xe9ece4, metalness: 0.18, roughness: 0.27 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x182f40, metalness: 0.62, roughness: 0.18 });
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  // Shaped pelvis, waist, rib cage and shoulder yoke form one continuous suit.
  add(tailoredSurface([
    [-.225, .215, 0, .065, .105], [-.23, .255, 0, .085, .135], [-.25, .33, 0, .079, .137],
    [-.29, .43, 0, .082, .132], [-.305, .56, 0, .092, .15], [-.32, .68, 0, .09, .18],
    [-.32, .74, 0, .07, .177], [-.32, .79, 0, .045, .10], [-.32, .8, 0, .04, .065],
  ]), suit, fixed);
  // Front bib, centre zip and narrow shoulder piping read as a fabric suit.
  const bib = new THREE.BufferGeometry(), bibVertices: number[] = [], bibIndices: number[] = [];
  const chest: Ring[] = [[-.29, .43, 0, .082, .132], [-.305, .56, 0, .092, .15], [-.32, .68, 0, .09, .18], [-.32, .74, 0, .07, .177]];
  for (let row = 0; row < chest.length; row++) {
    const [x, y, , depth, width] = chest[row];
    for (let j = 0; j <= 8; j++) {
      const lateral = (j / 8 * 2 - 1) * .48;
      bibVertices.push(x + depth * Math.sqrt(1 - lateral * lateral) + .002, y, lateral * width);
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
    const frames = leg.computeFrenetFrames(12, false), vertices: number[] = [], indices: number[] = [];
    for (let r = 0; r <= 12; r++) {
      const t = r / 12, p = leg.getPoint(t), radius = t < .5 ? .075 - t * .035 : .057 - (t - .5) * .04;
      for (let j = 0; j <= SIDES; j++) {
        const a = j / SIDES * Math.PI * 2, v = p.clone().addScaledVector(frames.normals[r], Math.cos(a) * radius).addScaledVector(frames.binormals[r], Math.sin(a) * radius * .9);
        vertices.push(v.x, v.y, v.z); if (r && j < SIDES) { const n = r * (SIDES + 1) + j, b = n - SIDES - 1; indices.push(n, b, b + 1, n, b + 1, n + 1) }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); add(g, suit, fixed);
    const boot = add(shell(.09, .043, .045), black, fixed, .398, .145, side * .15); boot.rotation.z = .24;
    add(shell(.025, .017, .047), trim, fixed, .405, .174, side * .15);
    // Shoulder epaulette and knee abrasion panel follow the suit's silhouette.
    add(shell(.046, .005, .021), panel, fixed, -.31, .765, side * .137);
    add(shell(.074, .012, .055), black, fixed, .115, .358, side * .14);
  }
  add(new THREE.CylinderGeometry(.049, .053, .065, 16), black, head, -.34, .812);
  // Helmet shell has an opening represented by the inset wraparound visor,
  // chin bar, seal and vents; no visible face geometry is needed in a rental helmet.
  add(shell(.13, .15, .127), helmet, head, -.326, .973);
  const visorShape = new THREE.BufferGeometry(), v: number[] = [], ix: number[] = [];
  for (let row = 0; row < 4; row++)for (let j = 0; j <= 20; j++) {
    const a = -1.12 + j / 20 * 2.24, y = .958 + row / 3 * .072;
    const radial = Math.sqrt(1 - Math.pow((y - .973) / .15, 2));
    v.push(-.326 + Math.cos(a) * .132 * radial, y, Math.sin(a) * .129 * radial);
    if (row && j < 20) { const n = row * 21 + j, b = n - 21; ix.push(n, b + 1, b, n, n + 1, b + 1) }
  }
  visorShape.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); visorShape.setIndex(ix); visorShape.computeVertexNormals(); add(visorShape, visor, head);
  for (const y of [.953, 1.033]) {
    const points = Array.from({ length: 13 }, (_, j) => { const a = -1.13 + j / 12 * 2.26, radial = Math.sqrt(1 - Math.pow((y - .973) / .15, 2)); return new THREE.Vector3(-.326 + Math.cos(a) * .132 * radial, y, Math.sin(a) * .129 * radial) });
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, .004, 4, false), black, head);
  }
  const chin = add(shell(.035, .028, .078), helmet, head, -.201, .92); chin.rotation.z = -.16;
  for (const side of [-1, 1]) {
    add(shell(.015, .017, .008), black, head, -.278, .986, side * .117);
    const vent = add(shell(.006, .006, .024), black, head, -.195, .923, side * .036); vent.rotation.x = side * .4;
  }
  joinByMaterial(fixed); joinByMaterial(head);
  const arms = [-1, 1].map(side => {
    const geometry = sleeveGeometry(); add(geometry, suit, driver);
    const glove = new THREE.Group(); glove.name = side < 0 ? 'Left hand grip' : 'Right hand grip'; steeringWheel.add(glove);
    glove.position.set(-.013, 0, side * .119);
    // A curved palm, curled fingers and thumb visibly clasp the rim.
    add(shell(.035, .045, .024), black, glove, -.005, 0, 0);
    add(shell(.021, .032, .025), panel, glove, -.029, 0, 0);
    for (let i = 0; i < 4; i++)add(shell(.016, .008, .025), black, glove, .008, -.023 + i * .015, side * .008);
    add(shell(.027, .014, .013), black, glove, -.001, -.027, -side * .02);
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
