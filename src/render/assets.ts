import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface RendererAssets {
  kartGltf: GLTF | null;
  venuePropsGltf: GLTF | null;
  textures: Record<string, THREE.Texture>;
}

export type TextureChannel = 'albedo' | 'livery' | 'normal' | 'roughness' | 'ao';

export interface TextureAssetSpec {
  key: string;
  url: string;
  channel: TextureChannel;
}

const KART_MODEL_URL = '/models/otl-superleggero.glb';
const VENUE_PROPS_MODEL_URL = '/models/venue-props.glb';

const OPTIONAL_TEXTURE_SPECS: readonly TextureAssetSpec[] = [
  { key: 'kart-livery-albedo', url: '/textures/kart-livery-albedo.png', channel: 'livery' },
  { key: 'kart-carbon-albedo', url: '/textures/kart-carbon-albedo.png', channel: 'albedo' },
  { key: 'kart-carbon-normal', url: '/textures/kart-carbon-normal.png', channel: 'normal' },
  { key: 'kart-carbon-roughness', url: '/textures/kart-carbon-roughness.png', channel: 'roughness' },
  { key: 'tire-albedo', url: '/textures/tire-albedo.png', channel: 'albedo' },
  { key: 'tire-normal', url: '/textures/tire-normal.png', channel: 'normal' },
  { key: 'tire-roughness', url: '/textures/tire-roughness.png', channel: 'roughness' },
  { key: 'metal-alloy-roughness', url: '/textures/metal-alloy-roughness.png', channel: 'roughness' },
];

let cachedAssetsPromise: Promise<RendererAssets> | null = null;

/**
 * Configures color space, wrapping, and anisotropic filtering for a loaded PBR texture.
 */
export function configureLoadedTexture(
  texture: THREE.Texture,
  channel: TextureChannel,
): THREE.Texture {
  texture.colorSpace =
    channel === 'albedo' || channel === 'livery'
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

async function tryLoadGltf(loader: GLTFLoader, url: string): Promise<GLTF | null> {
  try {
    return await loader.loadAsync(url);
  } catch {
    return null;
  }
}

async function tryLoadTexture(
  loader: THREE.TextureLoader,
  spec: TextureAssetSpec,
): Promise<[string, THREE.Texture] | null> {
  try {
    const texture = await loader.loadAsync(spec.url);
    return [spec.key, configureLoadedTexture(texture, spec.channel)];
  } catch {
    return null;
  }
}

/**
 * Preloads bundled local GLB models and PBR textures once per runtime session,
 * returning a cached promise so the first rendered frame never pops assets in.
 */
export function preloadRendererAssets(): Promise<RendererAssets> {
  if (cachedAssetsPromise) return cachedAssetsPromise;

  cachedAssetsPromise = (async (): Promise<RendererAssets> => {
    const gltfLoader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    const [kartGltf, venuePropsGltf, loadedTextures] = await Promise.all([
      gltfLoader.loadAsync(KART_MODEL_URL),
      tryLoadGltf(gltfLoader, VENUE_PROPS_MODEL_URL),
      Promise.all(OPTIONAL_TEXTURE_SPECS.map((spec) => tryLoadTexture(textureLoader, spec))),
    ]);

    const textures: Record<string, THREE.Texture> = {};
    for (const entry of loadedTextures) {
      if (entry) textures[entry[0]] = entry[1];
    }

    return { kartGltf, venuePropsGltf, textures };
  })();

  return cachedAssetsPromise;
}

/**
 * Clones an object hierarchy while keeping BufferGeometry shared across instances
 * and cloning every Material independently so Ghost Kart overrides never leak.
 */
export function cloneAssetSceneWithUniqueMaterials(root: THREE.Object3D): THREE.Group {
  const cloned = root.clone(true);
  const clonedMaterials = new Map<THREE.Material, THREE.Material>();

  const cloneMaterial = (material: THREE.Material): THREE.Material => {
    let copy = clonedMaterials.get(material);
    if (!copy) {
      copy = material.clone();
      clonedMaterials.set(material, copy);
    }
    return copy;
  };

  cloned.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map(cloneMaterial);
    } else if (object.material) {
      object.material = cloneMaterial(object.material);
    }
  });

  if (cloned instanceof THREE.Group) return cloned;
  const wrapper = new THREE.Group();
  wrapper.add(cloned);
  return wrapper;
}
