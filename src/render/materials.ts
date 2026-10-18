import * as THREE from 'three';

// All maps are original deterministic procedural artwork, generated locally.
// One tile represents 2 m of pavement; no remote textures or font downloads.
export function createVenueMaterials(): {
  pavement: THREE.MeshStandardMaterial;
  infield: THREE.MeshStandardMaterial;
  redBarrier: THREE.MeshStandardMaterial;
  whiteBarrier: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
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
  // Fine aggregate, old rubber arcs and polished wear; deliberately restrained.
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(25,25,25,${0.015 + random() * 0.035})`;
    ctx.lineWidth = 1 + random() * 9;
    ctx.beginPath();
    ctx.arc(random() * 512, random() * 512, 70 + random() * 400, random() * 6.28, random() * 6.28);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const bump = map.clone();
  bump.colorSpace = THREE.NoColorSpace;
  bump.needsUpdate = true;
  const pavement = new THREE.MeshStandardMaterial({
    color: 0x4b4d4e, map, roughness: 0.72, metalness: 0,
    bumpMap: bump, bumpScale: 0.012,
  });
  const infield = new THREE.MeshStandardMaterial({
    color: 0x168ec9, map, roughness: 0.61, metalness: 0,
    bumpMap: bump, bumpScale: 0.006,
  });
  const scuffs = document.createElement('canvas');
  scuffs.width = 256; scuffs.height = 128;
  const scuffCtx = scuffs.getContext('2d')!;
  scuffCtx.fillStyle = '#eeeeee'; scuffCtx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 85; i++) {
    scuffCtx.fillStyle = `rgba(15,18,20,${0.02 + random() * 0.1})`;
    scuffCtx.fillRect(random() * 256, 65 + random() * 56, 2 + random() * 46, 1 + random() * 2);
  }
  const plasticMap = new THREE.CanvasTexture(scuffs);
  plasticMap.colorSpace = THREE.SRGBColorSpace;
  plasticMap.wrapS = plasticMap.wrapT = THREE.RepeatWrapping;
  return {
    pavement, infield,
    redBarrier: new THREE.MeshStandardMaterial({ color: 0xbe1923, map: plasticMap, roughness: 0.58, metalness: 0 }),
    whiteBarrier: new THREE.MeshStandardMaterial({ color: 0xdeddd4, map: plasticMap, roughness: 0.65, metalness: 0 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x181a1b, roughness: 0.94 }),
  };
}

export function createTireMarkMaterial(): THREE.MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.scale(1, 0.5);
  const fade = context.createRadialGradient(64, 64, 6, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,255,255,0.85)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = fade; context.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({
    color: 0x151718, map: new THREE.CanvasTexture(canvas),
    transparent: true, opacity: 0.2, depthWrite: false,
  });
}
