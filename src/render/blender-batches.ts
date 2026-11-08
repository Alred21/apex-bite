import * as THREE from 'three';
import type { BlenderGroupBatches } from './otl-superleggero-meshes';

/** Instantiates Blender-authored batches synchronously, one mesh per material key. */
export function addBlenderBatches(
  batches: BlenderGroupBatches,
  materials: Record<string, THREE.Material>,
  parent: THREE.Group,
  fallbackKey: string,
  withUv = false,
): void {
  for (const [matKey, batch] of Object.entries(batches)) {
    const material = materials[matKey] ?? materials[fallbackKey];
    if (!material) throw new Error(`Missing Blender material "${matKey}" and fallback "${fallbackKey}"`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    if (withUv) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(batch.positions.length / 3 * 2), 2));
    }
    geometry.setIndex(batch.indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }
}
