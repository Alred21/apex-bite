import * as THREE from 'three';

export type GraphicsQuality = 'Performance' | 'Balanced' | 'High';
const GRAPHICS_KEY = 'apex-bite:graphics-quality';
export function loadGraphicsQuality(): GraphicsQuality {
  try {
    const quality = localStorage.getItem(GRAPHICS_KEY);
    if (quality === 'Performance' || quality === 'High') return quality;
  } catch { /* Preferences are optional when storage is unavailable. */ }
  return 'Balanced';
}

export function applyGraphicsQuality(
  renderer: THREE.WebGLRenderer,
  light: THREE.DirectionalLight,
  quality: GraphicsQuality,
): void {
  const pixelRatioCap = quality === 'Performance' ? 1 : quality === 'Balanced' ? 1.25 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality !== 'Performance';
  if (quality === 'Performance') {
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }
  const shadowSize = quality === 'High' ? 2048 : 1024;
  if (light.shadow.mapSize.width !== shadowSize) {
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.mapSize.set(shadowSize, shadowSize);
  }
  renderer.shadowMap.needsUpdate = true;
  try { localStorage.setItem(GRAPHICS_KEY, quality); } catch { /* Keep the active setting. */ }
}
