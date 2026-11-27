import * as THREE from 'three';
import { KART_WHEEL_GEOMETRY } from '../simulation/kart-parameters';
import type { PracticeMode, SessionSnapshot } from '../simulation/types';

const REAR_TIRE_WIDTH_METERS = 0.156;
const HALF_TIRE_WIDTH_METERS = REAR_TIRE_WIDTH_METERS * 0.5;
const SKID_Y_METERS = 0.017;
const MIN_STEP_METERS = 0.05;
const MAX_CONTINUOUS_STEP_METERS = 1.25;
const AXLE_SCRUB_THRESHOLD = 0.22;
const SLIP_RATIO_THRESHOLD = 0.28;
const MIN_SPEED_KPH = 8;

function createSkidRibbonTexture(): THREE.DataTexture {
  const width = 64;
  const height = 16;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const vNorm = y / Math.max(1, height - 1);
    const longitudinal = 0.88 + 0.12 * Math.sin(vNorm * Math.PI * 2);
    for (let x = 0; x < width; x++) {
      const uNorm = (x + 0.5) / width;
      const distFromCenter = Math.abs(uNorm * 2 - 1);
      // Soft shoulder taper at tire edges + subtle dual-ribbed tread streaks
      const edgeFade = Math.max(0, Math.min(1, (1 - distFromCenter) / 0.22));
      const rib = 0.85 + 0.15 * Math.cos(distFromCenter * Math.PI * 3);
      const alpha = Math.round(edgeFade * edgeFade * rib * longitudinal * 255);
      const offset = (y * width + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Fixed-capacity, zero-allocation ring-buffer dual rear-tire skid ribbon renderer.
 * Emits smooth continuous quads at +-0.335 m rear track (0.156 m tire width) and splits
 * strips cleanly on resets, mode teleports, and grip recovery without bridge artifacts.
 */
export class SkidRibbonSystem {
  public readonly capacity: number;
  public readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly uvs: Float32Array;
  private readonly colors: Float32Array;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly uvAttr: THREE.BufferAttribute;

  private cursor = 0;
  private activeCount = 0;
  private hasAnchor = false;
  private lastTick = -1;
  private lastMode: PracticeMode | null = null;

  private anchorRearX = 0;
  private anchorRearZ = 0;
  private anchorLeftInnerX = 0;
  private anchorLeftInnerZ = 0;
  private anchorLeftOuterX = 0;
  private anchorLeftOuterZ = 0;
  private anchorRightInnerX = 0;
  private anchorRightInnerZ = 0;
  private anchorRightOuterX = 0;
  private anchorRightOuterZ = 0;
  private anchorAlpha = 0.4;
  private anchorV = 0;

  constructor(capacity = 400) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const vertexCount = this.capacity * 8; // 2 quads * 4 vertices per dual-tire step
    const indexCount = this.capacity * 12; // 2 quads * 6 indices per dual-tire step

    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.uvs = new Float32Array(vertexCount * 2);
    this.colors = new Float32Array(vertexCount * 4);
    const indices = new Uint16Array(indexCount);

    for (let slot = 0; slot < this.capacity; slot++) {
      const vBase = slot * 8;
      const iBase = slot * 12;

      for (let v = 0; v < 8; v++) {
        const nIdx = (vBase + v) * 3;
        this.normals[nIdx] = 0;
        this.normals[nIdx + 1] = 1;
        this.normals[nIdx + 2] = 0;
      }

      // Left tire quad: (0, 1, 2) and (1, 3, 2)
      indices[iBase] = vBase;
      indices[iBase + 1] = vBase + 1;
      indices[iBase + 2] = vBase + 2;
      indices[iBase + 3] = vBase + 1;
      indices[iBase + 4] = vBase + 3;
      indices[iBase + 5] = vBase + 2;

      // Right tire quad: (4, 5, 6) and (5, 7, 6)
      indices[iBase + 6] = vBase + 4;
      indices[iBase + 7] = vBase + 5;
      indices[iBase + 8] = vBase + 6;
      indices[iBase + 9] = vBase + 5;
      indices[iBase + 10] = vBase + 7;
      indices[iBase + 11] = vBase + 6;
    }

    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 4);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(this.uvs, 2);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', this.uvAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: createSkidRibbonTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'SkidRibbonMesh';
    this.mesh.frustumCulled = false;
  }

  public getActiveSegmentCount(): number {
    return this.activeCount;
  }

  public breakStrip(): void {
    this.hasAnchor = false;
  }

  public clear(): void {
    this.cursor = 0;
    this.activeCount = 0;
    this.hasAnchor = false;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  public update(snapshot: SessionSnapshot): void {
    const { kart } = snapshot;
    if (snapshot.tick < this.lastTick || (this.lastMode !== null && snapshot.mode !== this.lastMode)) {
      this.hasAnchor = false;
    }
    this.lastMode = snapshot.mode;

    const isSkidding =
      (kart.axleScrub > AXLE_SCRUB_THRESHOLD || kart.slipRatio > SLIP_RATIO_THRESHOLD) &&
      kart.speedKph > MIN_SPEED_KPH;

    if (!isSkidding) {
      this.lastTick = snapshot.tick;
      this.hasAnchor = false;
      return;
    }

    if (snapshot.tick === this.lastTick && this.hasAnchor) {
      return;
    }
    this.lastTick = snapshot.tick;

    const cosH = Math.cos(kart.headingRad);
    const sinH = Math.sin(kart.headingRad);
    const rightX = -sinH;
    const rightZ = cosH;
    // rearAxleMeters is -0.52 m behind CG
    const rearX = kart.position.x + cosH * KART_WHEEL_GEOMETRY.rearAxleMeters;
    const rearZ = kart.position.z + sinH * KART_WHEEL_GEOMETRY.rearAxleMeters;

    const trackHalf = KART_WHEEL_GEOMETRY.rearTrackHalfMeters;
    const leftCenterX = rearX - rightX * trackHalf;
    const leftCenterZ = rearZ - rightZ * trackHalf;
    const rightCenterX = rearX + rightX * trackHalf;
    const rightCenterZ = rearZ + rightZ * trackHalf;

    const currLeftInnerX = leftCenterX - rightX * HALF_TIRE_WIDTH_METERS;
    const currLeftInnerZ = leftCenterZ - rightZ * HALF_TIRE_WIDTH_METERS;
    const currLeftOuterX = leftCenterX + rightX * HALF_TIRE_WIDTH_METERS;
    const currLeftOuterZ = leftCenterZ + rightZ * HALF_TIRE_WIDTH_METERS;

    const currRightInnerX = rightCenterX - rightX * HALF_TIRE_WIDTH_METERS;
    const currRightInnerZ = rightCenterZ - rightZ * HALF_TIRE_WIDTH_METERS;
    const currRightOuterX = rightCenterX + rightX * HALF_TIRE_WIDTH_METERS;
    const currRightOuterZ = rightCenterZ + rightZ * HALF_TIRE_WIDTH_METERS;

    const intensity = Math.max(
      0.25,
      Math.min(1.0, (Math.max(kart.axleScrub, kart.slipRatio) - 0.18) * 1.4),
    );

    if (!this.hasAnchor) {
      this.setAnchor(
        rearX,
        rearZ,
        currLeftInnerX,
        currLeftInnerZ,
        currLeftOuterX,
        currLeftOuterZ,
        currRightInnerX,
        currRightInnerZ,
        currRightOuterX,
        currRightOuterZ,
        intensity,
        0,
      );
      return;
    }

    const stepDist = Math.hypot(rearX - this.anchorRearX, rearZ - this.anchorRearZ);
    if (stepDist > MAX_CONTINUOUS_STEP_METERS) {
      // Teleport or reset displacement: split strip cleanly without bridging
      this.setAnchor(
        rearX,
        rearZ,
        currLeftInnerX,
        currLeftInnerZ,
        currLeftOuterX,
        currLeftOuterZ,
        currRightInnerX,
        currRightInnerZ,
        currRightOuterX,
        currRightOuterZ,
        intensity,
        0,
      );
      return;
    }

    if (stepDist < MIN_STEP_METERS) {
      return;
    }

    const nextV = this.anchorV + stepDist * 2.0;
    const slot = this.cursor % this.capacity;
    const vBase = slot * 8;

    this.writeVertex(vBase, this.anchorLeftInnerX, this.anchorLeftInnerZ, 0, this.anchorV, this.anchorAlpha);
    this.writeVertex(vBase + 1, this.anchorLeftOuterX, this.anchorLeftOuterZ, 1, this.anchorV, this.anchorAlpha);
    this.writeVertex(vBase + 2, currLeftInnerX, currLeftInnerZ, 0, nextV, intensity);
    this.writeVertex(vBase + 3, currLeftOuterX, currLeftOuterZ, 1, nextV, intensity);

    this.writeVertex(vBase + 4, this.anchorRightInnerX, this.anchorRightInnerZ, 0, this.anchorV, this.anchorAlpha);
    this.writeVertex(vBase + 5, this.anchorRightOuterX, this.anchorRightOuterZ, 1, this.anchorV, this.anchorAlpha);
    this.writeVertex(vBase + 6, currRightInnerX, currRightInnerZ, 0, nextV, intensity);
    this.writeVertex(vBase + 7, currRightOuterX, currRightOuterZ, 1, nextV, intensity);

    this.cursor += 1;
    if (this.activeCount < this.capacity) {
      this.activeCount += 1;
      this.mesh.geometry.setDrawRange(0, this.activeCount * 12);
    }

    this.positionAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;

    this.setAnchor(
      rearX,
      rearZ,
      currLeftInnerX,
      currLeftInnerZ,
      currLeftOuterX,
      currLeftOuterZ,
      currRightInnerX,
      currRightInnerZ,
      currRightOuterX,
      currRightOuterZ,
      intensity,
      nextV,
    );
  }

  private setAnchor(
    rearX: number,
    rearZ: number,
    liX: number,
    liZ: number,
    loX: number,
    loZ: number,
    riX: number,
    riZ: number,
    roX: number,
    roZ: number,
    alpha: number,
    v: number,
  ): void {
    this.hasAnchor = true;
    this.anchorRearX = rearX;
    this.anchorRearZ = rearZ;
    this.anchorLeftInnerX = liX;
    this.anchorLeftInnerZ = liZ;
    this.anchorLeftOuterX = loX;
    this.anchorLeftOuterZ = loZ;
    this.anchorRightInnerX = riX;
    this.anchorRightInnerZ = riZ;
    this.anchorRightOuterX = roX;
    this.anchorRightOuterZ = roZ;
    this.anchorAlpha = alpha;
    this.anchorV = v;
  }

  private writeVertex(
    vertexIndex: number,
    x: number,
    z: number,
    u: number,
    v: number,
    alpha: number,
  ): void {
    const pIdx = vertexIndex * 3;
    this.positions[pIdx] = x;
    this.positions[pIdx + 1] = SKID_Y_METERS;
    this.positions[pIdx + 2] = z;

    const uvIdx = vertexIndex * 2;
    this.uvs[uvIdx] = u;
    this.uvs[uvIdx + 1] = v;

    const cIdx = vertexIndex * 4;
    this.colors[cIdx] = 0.08;
    this.colors[cIdx + 1] = 0.085;
    this.colors[cIdx + 2] = 0.09;
    this.colors[cIdx + 3] = alpha;
  }
}
