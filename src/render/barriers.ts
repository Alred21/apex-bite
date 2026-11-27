import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BARRIER_HALF_THICKNESS_METERS } from '../simulation/barrier-geometry';
import type { CircuitData, Vector2D } from '../simulation/types';

export interface BarrierMaterials {
  redBarrier: THREE.Material;
  whiteBarrier: THREE.Material;
  rubber: THREE.Material;
  galvanizedSteel?: THREE.Material;
}

export interface SeamlessProtexBarriersGeometry {
  redBarrierGeometry: THREE.BufferGeometry;
  whiteBarrierGeometry: THREE.BufferGeometry;
  rubRailGeometry: THREE.BufferGeometry;
  linkPinGeometry: THREE.BufferGeometry;
  linkPinMatrices: THREE.Matrix4[];
  flexMountGeometry: THREE.BufferGeometry;
  flexMountMatrices: THREE.Matrix4[];
  moduleCount: number;
  moduleLengthsMeters: number[];
}

interface ProfilePoint {
  d: number; // Signed offset from barrier centerline: negative = track-facing, positive = outer back
  y: number;
}

interface ProfileFacet {
  a: ProfilePoint;
  b: ProfilePoint;
  v0: number;
  v1: number;
}

// Molded Protex HDPE cross-section (total base width ~0.235 m aligned to BARRIER_HALF_THICKNESS_METERS = 0.12 m).
// Track-facing inner points stay at -0.115 m so mitered spline chords never intrude into the drivable corridor.
const PROTEX_PROFILE_POINTS: readonly ProfilePoint[] = [
  { d: -0.115, y: 0.000 }, // 0: Inner base flange bottom
  { d: -0.115, y: 0.055 }, // 1: Inner base flange top
  { d: -0.100, y: 0.068 }, // 2: Lower rub-rail channel chamfer
  { d: -0.090, y: 0.072 }, // 3: Rub-rail recess bottom
  { d: -0.090, y: 0.142 }, // 4: Rub-rail recess top
  { d: -0.112, y: 0.156 }, // 5: Upper rub-rail channel chamfer
  { d: -0.114, y: 0.415 }, // 6: Upper inner face
  { d: -0.076, y: 0.475 }, // 7: Inner beveled top shoulder
  { d: -0.025, y: 0.475 }, // 8: Top crown inner
  { d: -0.015, y: 0.492 }, // 9: Molded longitudinal top rib inner
  { d: 0.015, y: 0.492 }, // 10: Molded longitudinal top rib outer
  { d: 0.025, y: 0.475 }, // 11: Top crown outer
  { d: 0.078, y: 0.475 }, // 12: Outer beveled top shoulder
  { d: 0.106, y: 0.415 }, // 13: Upper outer back face
  { d: 0.106, y: 0.070 }, // 14: Lower outer back face
  { d: 0.120, y: 0.055 }, // 15: Outer base flange top
  { d: 0.120, y: 0.000 }, // 16: Outer base flange bottom
];

// Continuous black rubber rub-rail seated flush inside the recessed inner groove [-0.115, -0.091].
const RUB_RAIL_PROFILE_POINTS: readonly ProfilePoint[] = [
  { d: -0.115, y: 0.075 },
  { d: -0.115, y: 0.139 },
  { d: -0.091, y: 0.139 },
  { d: -0.091, y: 0.075 },
];

function buildFacets(points: readonly ProfilePoint[]): ProfileFacet[] {
  const facets: ProfileFacet[] = [];
  let totalPerimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    totalPerimeter += Math.hypot(b.d - a.d, b.y - a.y);
  }
  let accum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.d - a.d, b.y - a.y);
    const v0 = accum / totalPerimeter;
    accum += len;
    const v1 = accum / totalPerimeter;
    facets.push({ a, b, v0, v1 });
  }
  return facets;
}

const PROTEX_FACETS = buildFacets(PROTEX_PROFILE_POINTS);
const RUB_RAIL_FACETS = buildFacets(RUB_RAIL_PROFILE_POINTS);

interface LoopVertex {
  x: number;
  z: number;
  arc: number;
  isJoint: boolean;
  moduleIndex: number;
}

interface OffsetRing {
  innerX: number;
  innerZ: number;
  outerX: number;
  outerZ: number;
  u: number;
  arc: number;
  moduleIndex: number;
  isJoint: boolean;
}

interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function createAccumulator(): GeometryAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function finalizeGeometry(acc: GeometryAccumulator): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2));
  geo.setIndex(acc.indices);
  geo.computeBoundingSphere();
  return geo;
}

function evalRingPoint(ring: OffsetRing, d: number, y: number): [number, number, number] {
  const t = (d + BARRIER_HALF_THICKNESS_METERS) / (2 * BARRIER_HALF_THICKNESS_METERS);
  return [
    ring.innerX + (ring.outerX - ring.innerX) * t,
    y,
    ring.innerZ + (ring.outerZ - ring.innerZ) * t,
  ];
}

function pushTriangle(
  acc: GeometryAccumulator,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  expectedOutward: [number, number, number],
): void {
  const abx = p1[0] - p0[0];
  const aby = p1[1] - p0[1];
  const abz = p1[2] - p0[2];
  const acx = p2[0] - p0[0];
  const acy = p2[1] - p0[1];
  const acz = p2[2] - p0[2];
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz);
  if (len <= 1e-8) return;

  nx /= len;
  ny /= len;
  nz /= len;

  const dot = nx * expectedOutward[0] + ny * expectedOutward[1] + nz * expectedOutward[2];
  const base = acc.positions.length / 3;
  if (dot >= 0) {
    acc.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    acc.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    acc.uvs.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
    acc.indices.push(base, base + 1, base + 2);
  } else {
    acc.positions.push(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p1[0], p1[1], p1[2]);
    acc.normals.push(-nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz);
    acc.uvs.push(uv0[0], uv0[1], uv2[0], uv2[1], uv1[0], uv1[1]);
    acc.indices.push(base, base + 1, base + 2);
  }
}

function emitFacetSpan(
  acc: GeometryAccumulator,
  r0: OffsetRing,
  r1: OffsetRing,
  facets: readonly ProfileFacet[],
): void {
  // Segment outward reference vector from midpoint of inner rail to midpoint of outer rail
  const midInnerX = 0.5 * (r0.innerX + r1.innerX);
  const midInnerZ = 0.5 * (r0.innerZ + r1.innerZ);
  const midOuterX = 0.5 * (r0.outerX + r1.outerX);
  const midOuterZ = 0.5 * (r0.outerZ + r1.outerZ);
  const outDx = midOuterX - midInnerX;
  const outDz = midOuterZ - midInnerZ;
  const outLen = Math.hypot(outDx, outDz);
  if (outLen <= 1e-7) return;
  const outNx = outDx / outLen;
  const outNz = outDz / outLen;

  // Determine signed outward normal in (d, y) for each facet relative to cross-section interior (0, 0.24)
  for (const facet of facets) {
    const pA0 = evalRingPoint(r0, facet.a.d, facet.a.y);
    const pB0 = evalRingPoint(r0, facet.b.d, facet.b.y);
    const pA1 = evalRingPoint(r1, facet.a.d, facet.a.y);
    const pB1 = evalRingPoint(r1, facet.b.d, facet.b.y);

    // In (d, y), clockwise loop around interior means outward normal is (-(b.y - a.y), b.d - a.d)
    // Verify sign against centroid (d=0, y=0.20)
    const fd = facet.b.d - facet.a.d;
    const fy = facet.b.y - facet.a.y;
    let nd = -fy;
    let ny = fd;
    const midD = 0.5 * (facet.a.d + facet.b.d);
    const midY = 0.5 * (facet.a.y + facet.b.y) - 0.18;
    if (nd * midD + ny * midY < 0) {
      nd = -nd;
      ny = -ny;
    }
    const nLen = Math.hypot(nd, ny) || 1;
    nd /= nLen;
    ny /= nLen;

    const expected: [number, number, number] = [outNx * nd, ny, outNz * nd];
    const uvA0: [number, number] = [r0.u, facet.v0];
    const uvB0: [number, number] = [r0.u, facet.v1];
    const uvA1: [number, number] = [r1.u, facet.v0];
    const uvB1: [number, number] = [r1.u, facet.v1];

    pushTriangle(acc, pA0, pB0, pB1, uvA0, uvB0, uvB1, expected);
    pushTriangle(acc, pA0, pB1, pA1, uvA0, uvB1, uvA1, expected);
  }
}

function buildSideLoop(
  points: Vector2D[],
  outwardSign: 1 | -1, // -1 for leftBarrier (away from track is left of tangent), +1 for rightBarrier
): {
  segments: Array<{ r0: OffsetRing; r1: OffsetRing; moduleIndex: number }>;
  moduleLengths: number[];
  jointPositions: Array<{ x: number; z: number; tx: number; tz: number; nx: number; nz: number }>;
  midpointPositions: Array<{ x: number; z: number; tx: number; tz: number; nx: number; nz: number }>;
} {
  const n = points.length;
  const cumArc: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cumArc.push(cumArc[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const totalLength = cumArc[n];

  // Choose an even number of modules so alternating red/white wraps cleanly around the closed loop
  const targetModuleLength = 1.25;
  const halfCount = Math.max(2, Math.round(totalLength / (2 * targetModuleLength)));
  const moduleCount = halfCount * 2;
  const moduleLength = totalLength / moduleCount;
  const moduleLengths = new Array<number>(moduleCount).fill(moduleLength);

  // Build dense vertex loop merging original spline samples and exact module joint boundaries
  const rawVertices: LoopVertex[] = [];
  let jointIdx = 0;
  let sampleIdx = 0;

  while (sampleIdx < n || jointIdx < moduleCount) {
    const nextSampleArc = sampleIdx < n ? cumArc[sampleIdx] : Infinity;
    const nextJointArc = jointIdx < moduleCount ? jointIdx * moduleLength : Infinity;

    if (nextJointArc <= nextSampleArc + 1e-6) {
      // Interpolate exact point on polyline at nextJointArc
      let seg = 0;
      while (seg < n - 1 && cumArc[seg + 1] < nextJointArc) seg++;
      const segLen = Math.max(1e-9, cumArc[seg + 1] - cumArc[seg]);
      const t = Math.max(0, Math.min(1, (nextJointArc - cumArc[seg]) / segLen));
      const a = points[seg];
      const b = points[(seg + 1) % n];
      rawVertices.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        arc: nextJointArc,
        isJoint: true,
        moduleIndex: jointIdx,
      });
      if (Math.abs(nextSampleArc - nextJointArc) <= 0.015) {
        sampleIdx++;
      }
      jointIdx++;
    } else {
      const p = points[sampleIdx];
      const modIdx = Math.min(moduleCount - 1, Math.floor(nextSampleArc / moduleLength));
      rawVertices.push({
        x: p.x,
        z: p.z,
        arc: nextSampleArc,
        isJoint: false,
        moduleIndex: modIdx,
      });
      sampleIdx++;
    }
  }

  // Filter out near-duplicate vertices while preserving module joints
  const vertices: LoopVertex[] = [];
  for (const v of rawVertices) {
    if (vertices.length === 0) {
      vertices.push(v);
      continue;
    }
    const prev = vertices[vertices.length - 1];
    const dist = Math.hypot(v.x - prev.x, v.z - prev.z);
    if (dist < 1e-3) {
      if (v.isJoint && !prev.isJoint) {
        vertices[vertices.length - 1] = v;
      }
      continue;
    }
    vertices.push(v);
  }
  if (vertices.length > 2) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-3) {
      vertices.pop();
    }
  }

  const mCount = vertices.length;
  const segTangents: Array<{ tx: number; tz: number; nx: number; nz: number }> = [];
  for (let i = 0; i < mCount; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % mCount];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.max(1e-9, Math.hypot(dx, dz));
    const tx = dx / len;
    const tz = dz / len;
    // Right-hand normal is (-tz, tx); left-hand normal is (tz, -tx)
    const nx = -tz * outwardSign;
    const nz = tx * outwardSign;
    segTangents.push({ tx, tz, nx, nz });
  }

  // Build mitered / bevel-split segments
  const HALF_T = BARRIER_HALF_THICKNESS_METERS;
  const BEVEL_COS_THRESHOLD = 0.94; // ~20 degrees
  const MAX_MITER_SCALE = 1.18;

  // Precompute incoming & outgoing ring pairs at each vertex i
  const inRings: OffsetRing[] = [];
  const outRings: OffsetRing[] = [];

  for (let i = 0; i < mCount; i++) {
    const v = vertices[i];
    const prevSeg = segTangents[(i - 1 + mCount) % mCount];
    const nextSeg = segTangents[i];
    const dotT = prevSeg.tx * nextSeg.tx + prevSeg.tz * nextSeg.tz;

    let bx = prevSeg.nx + nextSeg.nx;
    let bz = prevSeg.nz + nextSeg.nz;
    const bLen = Math.hypot(bx, bz);
    if (bLen > 1e-6) {
      bx /= bLen;
      bz /= bLen;
    } else {
      bx = nextSeg.nx;
      bz = nextSeg.nz;
    }
    const denom = Math.max(0.25, bx * prevSeg.nx + bz * prevSeg.nz);
    const miterScale = Math.min(MAX_MITER_SCALE, 1 / denom);

    const u = v.arc / moduleLength;
    if (dotT >= BEVEL_COS_THRESHOLD) {
      // Smooth corner: single mitered ring
      const ox = bx * HALF_T * miterScale;
      const oz = bz * HALF_T * miterScale;
      const ring: OffsetRing = {
        innerX: v.x - ox,
        innerZ: v.z - oz,
        outerX: v.x + ox,
        outerZ: v.z + oz,
        u,
        arc: v.arc,
        moduleIndex: v.moduleIndex,
        isJoint: v.isJoint,
      };
      inRings.push(ring);
      outRings.push(ring);
    } else {
      // Sharp corner: bevel split on the convex side, clamped miter on the concave side
      const turnIntoOutward = nextSeg.tx * prevSeg.nx + nextSeg.tz * prevSeg.nz;
      const clampedMiter = Math.min(1.2, 1 / Math.max(0.35, denom));
      if (turnIntoOutward < 0) {
        // Turning away from outward normal: outer face is convex (splits), inner face is concave (miters)
        const innerX = v.x - bx * HALF_T * clampedMiter;
        const innerZ = v.z - bz * HALF_T * clampedMiter;
        inRings.push({
          innerX,
          innerZ,
          outerX: v.x + prevSeg.nx * HALF_T,
          outerZ: v.z + prevSeg.nz * HALF_T,
          u,
          arc: v.arc,
          moduleIndex: v.moduleIndex,
          isJoint: v.isJoint,
        });
        outRings.push({
          innerX,
          innerZ,
          outerX: v.x + nextSeg.nx * HALF_T,
          outerZ: v.z + nextSeg.nz * HALF_T,
          u,
          arc: v.arc,
          moduleIndex: v.moduleIndex,
          isJoint: v.isJoint,
        });
      } else {
        // Turning toward outward normal: inner face is convex (splits), outer face is concave (miters)
        const outerX = v.x + bx * HALF_T * clampedMiter;
        const outerZ = v.z + bz * HALF_T * clampedMiter;
        inRings.push({
          innerX: v.x - prevSeg.nx * HALF_T,
          innerZ: v.z - prevSeg.nz * HALF_T,
          outerX,
          outerZ,
          u,
          arc: v.arc,
          moduleIndex: v.moduleIndex,
          isJoint: v.isJoint,
        });
        outRings.push({
          innerX: v.x - nextSeg.nx * HALF_T,
          innerZ: v.z - nextSeg.nz * HALF_T,
          outerX,
          outerZ,
          u,
          arc: v.arc,
          moduleIndex: v.moduleIndex,
          isJoint: v.isJoint,
        });
      }
    }
  }

  // Prevent concave-rail inversion on ultra-tight curves (such as Turn 3 R = 0.247 m):
  // If consecutive outer or inner offset points reverse along the segment tangent, blend to midpoint.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < mCount; i++) {
      const nextIdx = (i + 1) % mCount;
      const seg = segTangents[i];
      const rA = outRings[i];
      const rB = inRings[nextIdx];

      const outerDot = (rB.outerX - rA.outerX) * seg.tx + (rB.outerZ - rA.outerZ) * seg.tz;
      if (outerDot <= 1e-4) {
        const mx = 0.5 * (rA.outerX + rB.outerX);
        const mz = 0.5 * (rA.outerZ + rB.outerZ);
        rA.outerX = mx - seg.tx * 5e-3;
        rA.outerZ = mz - seg.tz * 5e-3;
        rB.outerX = mx + seg.tx * 5e-3;
        rB.outerZ = mz + seg.tz * 5e-3;
      }

      const innerDot = (rB.innerX - rA.innerX) * seg.tx + (rB.innerZ - rA.innerZ) * seg.tz;
      if (innerDot <= 1e-4) {
        const mx = 0.5 * (rA.innerX + rB.innerX);
        const mz = 0.5 * (rA.innerZ + rB.innerZ);
        rA.innerX = mx - seg.tx * 5e-3;
        rA.innerZ = mz - seg.tz * 5e-3;
        rB.innerX = mx + seg.tx * 5e-3;
        rB.innerZ = mz + seg.tz * 5e-3;
      }
    }
  }

  // Collect ordered spans (main segments + any bevel wedges)
  const segments: Array<{ r0: OffsetRing; r1: OffsetRing; moduleIndex: number }> = [];
  let currentModule = 0;
  for (let i = 0; i < mCount; i++) {
    if (vertices[i].isJoint) {
      currentModule = vertices[i].moduleIndex;
    }
    const rStart = outRings[i];
    const nextIdx = (i + 1) % mCount;
    const rEnd = inRings[nextIdx];
    const rEndWrapped: OffsetRing =
      nextIdx === 0
        ? { ...rEnd, u: totalLength / moduleLength }
        : rEnd;
    segments.push({ r0: rStart, r1: rEndWrapped, moduleIndex: currentModule });

    if (inRings[nextIdx] !== outRings[nextIdx]) {
      const bevelModule = vertices[nextIdx].isJoint ? vertices[nextIdx].moduleIndex : currentModule;
      segments.push({
        r0: inRings[nextIdx],
        r1: outRings[nextIdx],
        moduleIndex: bevelModule,
      });
    }
  }

  // Compute joint positions (for interlocking pins) and module midpoints (for flex-spring mounts)
  const jointPositions: Array<{ x: number; z: number; tx: number; tz: number; nx: number; nz: number }> = [];
  for (let i = 0; i < mCount; i++) {
    if (!vertices[i].isJoint) continue;
    const v = vertices[i];
    const seg = segTangents[i];
    jointPositions.push({ x: v.x, z: v.z, tx: seg.tx, tz: seg.tz, nx: seg.nx, nz: seg.nz });
  }

  const midpointPositions: Array<{ x: number; z: number; tx: number; tz: number; nx: number; nz: number }> = [];
  for (let m = 0; m < moduleCount; m++) {
    const midArc = (m + 0.5) * moduleLength;
    let seg = 0;
    while (seg < n - 1 && cumArc[seg + 1] < midArc) seg++;
    const segLen = Math.max(1e-9, cumArc[seg + 1] - cumArc[seg]);
    const t = Math.max(0, Math.min(1, (midArc - cumArc[seg]) / segLen));
    const a = points[seg];
    const b = points[(seg + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dLen = Math.max(1e-9, Math.hypot(dx, dz));
    const tx = dx / dLen;
    const tz = dz / dLen;
    const nx = -tz * outwardSign;
    const nz = tx * outwardSign;
    midpointPositions.push({
      x: a.x + dx * t,
      z: a.z + dz * t,
      tx,
      tz,
      nx,
      nz,
    });
  }

  return { segments, moduleLengths, jointPositions, midpointPositions };
}

function buildLinkPinGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.017, 0.017, 0.48, 10, 1);
  shaft.translate(0, 0.25, 0);
  const cap = new THREE.CylinderGeometry(0.028, 0.024, 0.026, 10, 1);
  cap.translate(0, 0.502, 0);
  const merged = mergeGeometries([shaft, cap], false);
  shaft.dispose();
  cap.dispose();
  if (!merged) throw new Error('Failed to build link pin geometry');
  return merged;
}

function buildFlexMountGeometry(): THREE.BufferGeometry {
  // Galvanized steel flex-spring backing mount seated flush against outer back face (z+ = outward)
  const backPlate = new THREE.BoxGeometry(0.16, 0.22, 0.014);
  backPlate.translate(0, 0.21, 0.113);
  const topLeaf = new THREE.BoxGeometry(0.11, 0.018, 0.042);
  topLeaf.translate(0, 0.28, 0.134);
  const botLeaf = new THREE.BoxGeometry(0.11, 0.018, 0.042);
  botLeaf.translate(0, 0.14, 0.134);
  const spine = new THREE.BoxGeometry(0.09, 0.16, 0.016);
  spine.translate(0, 0.21, 0.149);
  const merged = mergeGeometries([backPlate, topLeaf, botLeaf, spine], false);
  backPlate.dispose();
  topLeaf.dispose();
  botLeaf.dispose();
  spine.dispose();
  if (!merged) throw new Error('Failed to build flex mount geometry');
  return merged;
}

function buildOrientationMatrix(
  px: number,
  py: number,
  pz: number,
  tx: number,
  tz: number,
  nx: number,
  nz: number,
): THREE.Matrix4 {
  // Local +X = tangent (along barrier), +Y = up, +Z = outward normal (away from track)
  // Ensure right-handed basis (if det < 0, negate +X so scale stays positive)
  const crossY = nz * tx - nx * tz;
  const flipX = crossY >= 0 ? 1 : -1;
  const mat = new THREE.Matrix4();
  mat.makeBasis(
    new THREE.Vector3(tx * flipX, 0, tz * flipX),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(nx, 0, nz),
  );
  mat.setPosition(px, py, pz);
  return mat;
}

/**
 * Pure geometry builder for spline-mitered Protex HDPE barriers, continuous rub-rail,
 * interlocking module pins, and galvanized flex-spring mounts. Callable in Node without WebGL.
 */
export function buildSeamlessProtexBarriersGeometry(
  circuit: CircuitData,
): SeamlessProtexBarriersGeometry {
  const redAcc = createAccumulator();
  const whiteAcc = createAccumulator();
  const rubAcc = createAccumulator();

  const leftLoop = buildSideLoop(
    circuit.samples.map((s) => s.leftBarrier),
    -1,
  );
  const rightLoop = buildSideLoop(
    circuit.samples.map((s) => s.rightBarrier),
    1,
  );

  for (const loop of [leftLoop, rightLoop]) {
    for (const seg of loop.segments) {
      const targetAcc = seg.moduleIndex % 2 === 0 ? redAcc : whiteAcc;
      emitFacetSpan(targetAcc, seg.r0, seg.r1, PROTEX_FACETS);
      emitFacetSpan(rubAcc, seg.r0, seg.r1, RUB_RAIL_FACETS);
    }
  }

  const linkPinMatrices: THREE.Matrix4[] = [];
  const flexMountMatrices: THREE.Matrix4[] = [];

  for (const loop of [leftLoop, rightLoop]) {
    for (const j of loop.jointPositions) {
      linkPinMatrices.push(buildOrientationMatrix(j.x, 0, j.z, j.tx, j.tz, j.nx, j.nz));
    }
    for (const m of loop.midpointPositions) {
      flexMountMatrices.push(buildOrientationMatrix(m.x, 0, m.z, m.tx, m.tz, m.nx, m.nz));
    }
  }

  const moduleLengthsMeters = [...leftLoop.moduleLengths, ...rightLoop.moduleLengths];

  return {
    redBarrierGeometry: finalizeGeometry(redAcc),
    whiteBarrierGeometry: finalizeGeometry(whiteAcc),
    rubRailGeometry: finalizeGeometry(rubAcc),
    linkPinGeometry: buildLinkPinGeometry(),
    linkPinMatrices,
    flexMountGeometry: buildFlexMountGeometry(),
    flexMountMatrices,
    moduleCount: moduleLengthsMeters.length,
    moduleLengthsMeters,
  };
}

/**
 * Builds the complete Three.js scene group for the seamless Protex HDPE barriers,
 * continuous rubber rub-rail, instanced interlock pins, and instanced steel flex mounts.
 */
export function buildSeamlessProtexBarriers(
  circuit: CircuitData,
  materials: BarrierMaterials,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SeamlessProtexBarriers';

  const geo = buildSeamlessProtexBarriersGeometry(circuit);

  const redMesh = new THREE.Mesh(geo.redBarrierGeometry, materials.redBarrier);
  redMesh.name = 'ProtexBarriersRed';
  redMesh.castShadow = true;
  redMesh.receiveShadow = true;

  const whiteMesh = new THREE.Mesh(geo.whiteBarrierGeometry, materials.whiteBarrier);
  whiteMesh.name = 'ProtexBarriersWhite';
  whiteMesh.castShadow = true;
  whiteMesh.receiveShadow = true;

  const rubMesh = new THREE.Mesh(geo.rubRailGeometry, materials.rubber);
  rubMesh.name = 'ProtexRubRail';
  rubMesh.castShadow = false;
  rubMesh.receiveShadow = true;

  const steelMat =
    materials.galvanizedSteel ??
    new THREE.MeshStandardMaterial({
      color: 0x9aa3ab,
      metalness: 0.78,
      roughness: 0.36,
    });

  const pinMesh = new THREE.InstancedMesh(
    geo.linkPinGeometry,
    steelMat,
    geo.linkPinMatrices.length,
  );
  pinMesh.name = 'ProtexLinkPins';
  geo.linkPinMatrices.forEach((m, i) => pinMesh.setMatrixAt(i, m));
  pinMesh.instanceMatrix.needsUpdate = true;

  const mountMesh = new THREE.InstancedMesh(
    geo.flexMountGeometry,
    steelMat,
    geo.flexMountMatrices.length,
  );
  mountMesh.name = 'ProtexFlexMounts';
  geo.flexMountMatrices.forEach((m, i) => mountMesh.setMatrixAt(i, m));
  mountMesh.instanceMatrix.needsUpdate = true;

  group.add(redMesh, whiteMesh, rubMesh, pinMesh, mountMesh);
  return group;
}
