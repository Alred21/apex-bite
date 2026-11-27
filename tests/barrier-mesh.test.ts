import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildK1TorontoCircuit } from '../src/simulation/circuit';
import { BARRIER_HALF_THICKNESS_METERS } from '../src/simulation/barrier-geometry';
import type { CircuitData, CircuitSample } from '../src/simulation/types';
import { buildSeamlessProtexBarriers, buildSeamlessProtexBarriersGeometry } from '../src/render/barriers';
import { buildTrackRibbonMesh } from '../src/render/scene';
import { createSimulationSession } from '../src/simulation/session';

function assertValidGeometry(geo: THREE.BufferGeometry, label: string): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const index = geo.getIndex();

  expect(pos, `${label} must have position attribute`).toBeDefined();
  expect(norm, `${label} must have normal attribute`).toBeDefined();
  expect(uv, `${label} must have uv attribute`).toBeDefined();
  expect(pos.count, `${label} must have vertices`).toBeGreaterThan(0);
  expect(norm.count, `${label} normal count must match position count`).toBe(pos.count);
  expect(uv.count, `${label} uv count must match position count`).toBe(pos.count);

  const posArr = pos.array as Float32Array;
  const normArr = norm.array as Float32Array;
  const uvArr = uv.array as Float32Array;

  let nonFinitePos = 0;
  let nonFiniteNorm = 0;
  let badNormLen = 0;
  let nonFiniteUv = 0;
  for (let i = 0; i < pos.count; i++) {
    const i3 = i * 3;
    const i2 = i * 2;
    if (!Number.isFinite(posArr[i3]) || !Number.isFinite(posArr[i3 + 1]) || !Number.isFinite(posArr[i3 + 2])) {
      nonFinitePos++;
    }
    const nx = normArr[i3];
    const ny = normArr[i3 + 1];
    const nz = normArr[i3 + 2];
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
      nonFiniteNorm++;
    } else if (Math.abs(Math.hypot(nx, ny, nz) - 1) > 0.02) {
      badNormLen++;
    }
    if (!Number.isFinite(uvArr[i2]) || !Number.isFinite(uvArr[i2 + 1])) {
      nonFiniteUv++;
    }
  }
  expect(nonFinitePos, `${label} non-finite positions`).toBe(0);
  expect(nonFiniteNorm, `${label} non-finite normals`).toBe(0);
  expect(badNormLen, `${label} non-unit normals`).toBe(0);
  expect(nonFiniteUv, `${label} non-finite uvs`).toBe(0);

  const triCount = index ? index.count / 3 : pos.count / 3;
  expect(triCount, `${label} must have triangles`).toBeGreaterThan(0);

  let degenerateTris = 0;
  let invertedTris = 0;

  for (let t = 0; t < triCount; t++) {
    const i0 = (index ? index.getX(t * 3) : t * 3) * 3;
    const i1 = (index ? index.getX(t * 3 + 1) : t * 3 + 1) * 3;
    const i2 = (index ? index.getX(t * 3 + 2) : t * 3 + 2) * 3;

    const abx = posArr[i1] - posArr[i0];
    const aby = posArr[i1 + 1] - posArr[i0 + 1];
    const abz = posArr[i1 + 2] - posArr[i0 + 2];
    const acx = posArr[i2] - posArr[i0];
    const acy = posArr[i2 + 1] - posArr[i0 + 1];
    const acz = posArr[i2 + 2] - posArr[i0 + 2];
    const fnx = aby * acz - abz * acy;
    const fny = abz * acx - abx * acz;
    const fnz = abx * acy - aby * acx;
    const area2 = Math.hypot(fnx, fny, fnz);
    if (area2 <= 1e-7) {
      degenerateTris++;
      continue;
    }
    const inv = 1 / area2;
    const ux = fnx * inv;
    const uy = fny * inv;
    const uz = fnz * inv;
    for (const idx3 of [i0, i1, i2]) {
      const dot = ux * normArr[idx3] + uy * normArr[idx3 + 1] + uz * normArr[idx3 + 2];
      if (dot <= 0.5) {
        invertedTris++;
        break;
      }
    }
  }
  expect(degenerateTris, `${label} degenerate triangles`).toBe(0);
  expect(invertedTris, `${label} inverted winding triangles`).toBe(0);
}

interface BarrierSegIndexEntry {
  side: 'leftBarrier' | 'rightBarrier';
  ax: number;
  az: number;
  dx: number;
  dz: number;
  lenSq: number;
  in0x: number;
  in0z: number;
  in1x: number;
  in1z: number;
}

function buildBarrierSpatialGrid(samples: CircuitSample[]): {
  grid: Map<string, BarrierSegIndexEntry[]>;
  cellSize: number;
} {
  const cellSize = 4;
  const grid = new Map<string, BarrierSegIndexEntry[]>();
  const n = samples.length;

  for (const side of ['leftBarrier', 'rightBarrier'] as const) {
    const inwardSign = side === 'leftBarrier' ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];
      const a = s0[side];
      const b = s1[side];
      const entry: BarrierSegIndexEntry = {
        side,
        ax: a.x,
        az: a.z,
        dx: b.x - a.x,
        dz: b.z - a.z,
        lenSq: (b.x - a.x) ** 2 + (b.z - a.z) ** 2,
        in0x: s0.normal.x * inwardSign,
        in0z: s0.normal.z * inwardSign,
        in1x: s1.normal.x * inwardSign,
        in1z: s1.normal.z * inwardSign,
      };
      const minGx = Math.floor((Math.min(a.x, b.x) - 1) / cellSize);
      const maxGx = Math.floor((Math.max(a.x, b.x) + 1) / cellSize);
      const minGz = Math.floor((Math.min(a.z, b.z) - 1) / cellSize);
      const maxGz = Math.floor((Math.max(a.z, b.z) + 1) / cellSize);
      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gz = minGz; gz <= maxGz; gz++) {
          const key = `${gx},${gz}`;
          const list = grid.get(key) ?? [];
          list.push(entry);
          grid.set(key, list);
        }
      }
    }
  }
  return { grid, cellSize };
}

function signedInwardFromBarrierLoop(
  spatial: { grid: Map<string, BarrierSegIndexEntry[]>; cellSize: number },
  px: number,
  pz: number,
): {
  inwardMeters: number;
  outwardMeters: number;
} {
  const gx = Math.floor(px / spatial.cellSize);
  const gz = Math.floor(pz / spatial.cellSize);
  let bestDistSq = Infinity;
  let bestInward = 0;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const candidates = spatial.grid.get(`${gx + ox},${gz + oz}`);
      if (!candidates) continue;
      for (const seg of candidates) {
        const t =
          seg.lenSq > 1e-12
            ? Math.max(0, Math.min(1, ((px - seg.ax) * seg.dx + (pz - seg.az) * seg.dz) / seg.lenSq))
            : 0;
        const bx = seg.ax + seg.dx * t;
        const bz = seg.az + seg.dz * t;
        const dSq = (px - bx) * (px - bx) + (pz - bz) * (pz - bz);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          const inx = seg.in0x + (seg.in1x - seg.in0x) * t;
          const inz = seg.in0z + (seg.in1z - seg.in0z) * t;
          const inLen = Math.hypot(inx, inz) || 1;
          bestInward = ((px - bx) * inx + (pz - bz) * inz) / inLen;
        }
      }
    }
  }

  return {
    inwardMeters: bestInward,
    outwardMeters: -bestInward,
  };
}

describe('Seamless Protex HDPE Barriers Geometry', () => {
  const circuit = buildK1TorontoCircuit();

  it('builds finite, non-degenerate, consistently wound geometry with alternating 1.0-1.5 m modules', () => {
    const result = buildSeamlessProtexBarriersGeometry(circuit);

    assertValidGeometry(result.redBarrierGeometry, 'redBarrier');
    assertValidGeometry(result.whiteBarrierGeometry, 'whiteBarrier');
    assertValidGeometry(result.rubRailGeometry, 'rubRail');
    assertValidGeometry(result.linkPinGeometry, 'linkPin');
    assertValidGeometry(result.flexMountGeometry, 'flexMount');

    expect(result.moduleCount).toBeGreaterThan(100);
    expect(result.moduleLengthsMeters.length).toBe(result.moduleCount);
    for (const len of result.moduleLengthsMeters) {
      expect(len).toBeGreaterThanOrEqual(1.0);
      expect(len).toBeLessThanOrEqual(1.5);
    }

    expect(result.linkPinMatrices.length).toBe(result.moduleCount);
    expect(result.flexMountMatrices.length).toBeGreaterThan(0);
    for (const mat of [...result.linkPinMatrices, ...result.flexMountMatrices]) {
      for (const e of mat.elements) {
        expect(Number.isFinite(e)).toBe(true);
      }
    }
  });

  it('maintains bounded ~0.24 m wall thickness and strict non-intrusion into the drivable Circuit corridor across all 11 Turns', () => {
    const result = buildSeamlessProtexBarriersGeometry(circuit);
    const spatial = buildBarrierSpatialGrid(circuit.samples);

    // Every vertex of the HDPE barrier body and rub-rail must never intrude past BARRIER_HALF_THICKNESS_METERS (0.12 m)
    // inward from the physical barrier centerline, nor flare past bounded ~0.24 m total wall thickness.
    for (const [name, geo] of [
      ['redBarrier', result.redBarrierGeometry],
      ['whiteBarrier', result.whiteBarrierGeometry],
      ['rubRail', result.rubRailGeometry],
    ] as const) {
      const pos = geo.getAttribute('position');
      let maxInward = -Infinity;
      let maxOutward = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const { inwardMeters, outwardMeters } = signedInwardFromBarrierLoop(spatial, x, z);
        if (inwardMeters > maxInward) maxInward = inwardMeters;
        if (outwardMeters > maxOutward) maxOutward = outwardMeters;
      }
      expect(minY, `${name} minY`).toBeGreaterThanOrEqual(-1e-5);
      expect(maxY, `${name} maxY`).toBeLessThanOrEqual(0.55);
      expect(
        maxInward,
        `${name} max inward intrusion beyond barrier centerline must stay <= 0.12 m`,
      ).toBeLessThanOrEqual(BARRIER_HALF_THICKNESS_METERS + 0.002);
      expect(
        maxOutward,
        `${name} max outward thickness beyond barrier centerline must stay bounded around 0.12 m`,
      ).toBeLessThanOrEqual(BARRIER_HALF_THICKNESS_METERS + 0.015);
    }

    // Verify no instanced linkPin or flexMount intrudes into the drivable corridor
    const pinPos = result.linkPinGeometry.getAttribute('position');
    const mountPos = result.flexMountGeometry.getAttribute('position');
    const v = new THREE.Vector3();
    for (const [label, geo, matrices] of [
      ['linkPin', pinPos, result.linkPinMatrices],
      ['flexMount', mountPos, result.flexMountMatrices],
    ] as const) {
      let maxInward = -Infinity;
      for (const m of matrices) {
        for (let i = 0; i < geo.count; i++) {
          v.fromBufferAttribute(geo, i).applyMatrix4(m);
          const { inwardMeters } = signedInwardFromBarrierLoop(spatial, v.x, v.z);
          if (inwardMeters > maxInward) maxInward = inwardMeters;
        }
      }
      expect(
        maxInward,
        `${label} must not intrude into drivable corridor`,
      ).toBeLessThanOrEqual(BARRIER_HALF_THICKNESS_METERS + 0.002);
    }
  });

  it('assembles Three.js barrier group with instanced link pins and galvanized flex-spring mounts', () => {
    const group = buildSeamlessProtexBarriers(circuit, {
      redBarrier: new THREE.MeshStandardMaterial({ color: 0xc41a24 }),
      whiteBarrier: new THREE.MeshStandardMaterial({ color: 0xe2e1d8 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x181a1b }),
      galvanizedSteel: new THREE.MeshStandardMaterial({ color: 0x9aa3ab }),
    });
    expect(group.getObjectByName('ProtexBarriersRed')).toBeInstanceOf(THREE.Mesh);
    expect(group.getObjectByName('ProtexBarriersWhite')).toBeInstanceOf(THREE.Mesh);
    expect(group.getObjectByName('ProtexRubRail')).toBeInstanceOf(THREE.Mesh);
    expect(group.getObjectByName('ProtexLinkPins')).toBeInstanceOf(THREE.InstancedMesh);
    expect(group.getObjectByName('ProtexFlexMounts')).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('builds TrackSurfaceRibbon with world-tiled UVs, rubbered-in Racing Line groove attribute, and edge distances', () => {
    const session = createSimulationSession();
    const snapshot = session.getSnapshot();
    const mesh = buildTrackRibbonMesh(
      snapshot.circuit,
      new THREE.MeshStandardMaterial(),
      snapshot.racingLine.points,
    );
    const trackAttr = mesh.geometry.getAttribute('aTrackSurface');
    expect(trackAttr).toBeDefined();
    expect(trackAttr.itemSize).toBe(3);

    const arr = trackAttr.array as Float32Array;
    let maxGroove = 0;
    let minEdge = Infinity;
    let maxEdge = -Infinity;
    for (let i = 0; i < trackAttr.count; i++) {
      const groove = arr[i * 3];
      const edge = arr[i * 3 + 1];
      if (groove > maxGroove) maxGroove = groove;
      if (edge < minEdge) minEdge = edge;
      if (edge > maxEdge) maxEdge = edge;
    }
    expect(maxGroove).toBeGreaterThan(0.8);
    expect(minEdge).toBeCloseTo(0, 4);
    expect(maxEdge).toBeGreaterThan(2.3);
  });

  it('clamps acute synthetic hairpin corners cleanly without inverted faces or miter spikes', () => {
    // Build a synthetic square/hairpin closed circuit with sharp 90-degree and acute bends
    const corners = [
      { x: 0, z: 0 },
      { x: 16, z: 0 },
      { x: 16, z: 10 },
      { x: 8, z: 10 },
      { x: 10, z: 4 },
      { x: 0, z: 6 },
    ];
    const pts: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      for (let s = 0; s < 6; s++) {
        const t = s / 6;
        pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    const samples: CircuitSample[] = pts.map((p, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz);
      const tangent = { x: dx / len, z: dz / len };
      const normal = { x: -tangent.z, z: tangent.x };
      const halfW = 2.5;
      return {
        index: i,
        distanceMeters: i * 1.2,
        progress: i / pts.length,
        center: p,
        tangent,
        normal,
        widthMeters: halfW * 2,
        leftBarrier: { x: p.x - normal.x * halfW, z: p.z - normal.z * halfW },
        rightBarrier: { x: p.x + normal.x * halfW, z: p.z + normal.z * halfW },
        curvature: 0,
        sector: 1,
      };
    });
    const syntheticCircuit: CircuitData = {
      name: 'Synthetic Hairpin Test',
      totalLengthMeters: samples.length * 1.2,
      trackRecordSeconds: 10,
      samples,
      turns: [],
    };

    const result = buildSeamlessProtexBarriersGeometry(syntheticCircuit);
    assertValidGeometry(result.redBarrierGeometry, 'syntheticRed');
    assertValidGeometry(result.whiteBarrierGeometry, 'syntheticWhite');
    assertValidGeometry(result.rubRailGeometry, 'syntheticRubRail');
  });
});
