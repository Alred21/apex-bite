import * as THREE from 'three';
import type { RendererAssets } from './assets';

export interface VenueMaterials {
  pavement: THREE.MeshPhysicalMaterial;
  trackSurface: THREE.MeshPhysicalMaterial;
  infield: THREE.MeshPhysicalMaterial;
  redBarrier: THREE.MeshPhysicalMaterial;
  whiteBarrier: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  galvanizedSteel: THREE.MeshStandardMaterial;
}

function createProceduralFallbackMaps(): {
  concreteMap: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  plasticMap: THREE.CanvasTexture;
} {
  let seed = 18026;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = 142 + Math.round(random() * 32);
    pixels.data.set([grain, grain, grain, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(25,25,25,${0.015 + random() * 0.035})`;
    ctx.lineWidth = 1 + random() * 9;
    ctx.beginPath();
    ctx.arc(random() * 512, random() * 512, 70 + random() * 400, random() * 6.28, random() * 6.28);
    ctx.stroke();
  }
  const concreteMap = new THREE.CanvasTexture(canvas);
  concreteMap.colorSpace = THREE.SRGBColorSpace;
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.anisotropy = 4;

  const concreteBump = concreteMap.clone();
  concreteBump.colorSpace = THREE.NoColorSpace;
  concreteBump.needsUpdate = true;

  const scuffs = document.createElement('canvas');
  scuffs.width = 256;
  scuffs.height = 128;
  const scuffCtx = scuffs.getContext('2d')!;
  scuffCtx.fillStyle = '#eeeeee';
  scuffCtx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 85; i++) {
    scuffCtx.fillStyle = `rgba(15,18,20,${0.02 + random() * 0.1})`;
    scuffCtx.fillRect(random() * 256, 65 + random() * 56, 2 + random() * 46, 1 + random() * 2);
  }
  const plasticMap = new THREE.CanvasTexture(scuffs);
  plasticMap.colorSpace = THREE.SRGBColorSpace;
  plasticMap.wrapS = plasticMap.wrapT = THREE.RepeatWrapping;

  return { concreteMap, concreteBump, plasticMap };
}

function attachTrackSurfaceShader(material: THREE.MeshPhysicalMaterial): void {
  material.customProgramCacheKey = () => 'apex-track-surface-v1';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aTrackSurface;
varying vec3 vTrackSurface;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTrackSurface = aTrackSurface;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTrackSurface;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float trackGroove = clamp(vTrackSurface.x, 0.0, 1.0);
float trackEdgeMeters = vTrackSurface.y;
float trackDistMeters = vTrackSurface.z;
float jointPhase = abs(fract(trackDistMeters * 0.25 + 0.5) - 0.5) * 4.0;
float jointMask = 1.0 - smoothstep(0.010, 0.028, jointPhase);
float edgeStripe = smoothstep(0.155, 0.168, trackEdgeMeters) * (1.0 - smoothstep(0.248, 0.262, trackEdgeMeters));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.56, 0.58), trackGroove * 0.85);
diffuseColor.rgb *= (1.0 - 0.34 * jointMask);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.81), edgeStripe * 0.88);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float grooveRough = clamp(vTrackSurface.x, 0.0, 1.0);
float edgeRoughMeters = vTrackSurface.y;
float edgeStripeRough = smoothstep(0.155, 0.168, edgeRoughMeters) * (1.0 - smoothstep(0.248, 0.262, edgeRoughMeters));
roughnessFactor = mix(roughnessFactor, max(0.22, roughnessFactor * 0.46), grooveRough);
roughnessFactor = mix(roughnessFactor, 0.74, edgeStripeRough * 0.8);`,
      );
  };
}

/**
 * Creates physically based venue materials using preloaded 1024^2 PBR maps when available,
 * with deterministic procedural canvas fallbacks when assets are omitted.
 */
export function createVenueMaterials(assets?: RendererAssets): VenueMaterials {
  const textures = assets?.textures ?? {};
  const hasTrackPbr = Boolean(textures.trackConcreteAlbedo);
  const hasInfieldPbr = Boolean(textures.infieldConcreteAlbedo);
  const hasBarrierPbr = Boolean(textures.barrierHdpeAlbedo);
  const fallback =
    !hasTrackPbr || !hasInfieldPbr || !hasBarrierPbr ? createProceduralFallbackMaps() : null;

  const pavementParams: THREE.MeshPhysicalMaterialParameters = hasTrackPbr
    ? {
        color: 0xe6e8ea,
        map: textures.trackConcreteAlbedo,
        normalMap: textures.trackConcreteNormal ?? null,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: textures.trackConcreteRoughness ?? null,
        roughness: textures.trackConcreteRoughness ? 1.0 : 0.64,
        metalness: 0,
        clearcoat: 0.18,
        clearcoatRoughness: 0.42,
      }
    : {
        color: 0x4b4d4e,
        map: fallback!.concreteMap,
        bumpMap: fallback!.concreteBump,
        bumpScale: 0.012,
        roughness: 0.72,
        metalness: 0,
        clearcoat: 0.15,
        clearcoatRoughness: 0.46,
      };

  const pavement = new THREE.MeshPhysicalMaterial(pavementParams);
  const trackSurface = new THREE.MeshPhysicalMaterial(pavementParams);
  attachTrackSurfaceShader(trackSurface);

  const infield = new THREE.MeshPhysicalMaterial(
    hasInfieldPbr
      ? {
          color: 0xffffff,
          map: textures.infieldConcreteAlbedo,
          roughnessMap: textures.infieldConcreteRoughness ?? null,
          roughness: textures.infieldConcreteRoughness ? 1.0 : 0.48,
          metalness: 0,
          clearcoat: 0.24,
          clearcoatRoughness: 0.36,
        }
      : {
          color: 0x168ec9,
          map: fallback!.concreteMap,
          bumpMap: fallback!.concreteBump,
          bumpScale: 0.006,
          roughness: 0.61,
          metalness: 0,
          clearcoat: 0.2,
          clearcoatRoughness: 0.4,
        },
  );

  const barrierAlbedo = hasBarrierPbr ? textures.barrierHdpeAlbedo : fallback!.plasticMap;
  const barrierRough = hasBarrierPbr ? (textures.barrierHdpeRoughness ?? null) : null;

  const redBarrier = new THREE.MeshPhysicalMaterial({
    color: 0xc41a24,
    map: barrierAlbedo,
    roughnessMap: barrierRough,
    roughness: barrierRough ? 1.0 : 0.56,
    metalness: 0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.48,
  });

  const whiteBarrier = new THREE.MeshPhysicalMaterial({
    color: 0xe2e1d8,
    map: barrierAlbedo,
    roughnessMap: barrierRough,
    roughness: barrierRough ? 1.0 : 0.62,
    metalness: 0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.48,
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x181a1b,
    roughness: 0.92,
    metalness: 0,
  });

  const galvanizedSteel = new THREE.MeshStandardMaterial({
    color: 0x9aa3ab,
    roughness: 0.36,
    metalness: 0.8,
  });

  return {
    pavement,
    trackSurface,
    infield,
    redBarrier,
    whiteBarrier,
    rubber,
    galvanizedSteel,
  };
}

export function createTireMarkMaterial(): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.scale(1, 0.5);
  const fade = context.createRadialGradient(64, 64, 6, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,0.85)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({
    color: 0x151718,
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
}
