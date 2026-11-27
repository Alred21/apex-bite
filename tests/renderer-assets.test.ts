import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  cloneAssetSceneWithUniqueMaterials,
  configureLoadedTexture,
  preloadRendererAssets,
  type RendererAssets,
} from '../src/render/assets';
import { createKartRig } from '../src/render/kart';
import { createSimulationSession } from '../src/simulation/session';

describe('renderer asset preloader and material-cloning seam', () => {
  it('exports preloadRendererAssets cleanly in Node without browser-only top-level side effects', () => {
    expect(typeof preloadRendererAssets).toBe('function');
  });

  it('cloneAssetSceneWithUniqueMaterials shares BufferGeometry while cloning every Material independently', () => {
    const source = new THREE.Group();
    source.name = 'SourceKart';

    const bodyGeo = new THREE.BoxGeometry(1.2, 0.3, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xb8101c,
      opacity: 1,
      transparent: false,
      emissive: 0x000000,
      depthWrite: true,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.name = 'Bodywork';

    const childGroup = new THREE.Group();
    const trimGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
    const trimMatA = new THREE.MeshStandardMaterial({ color: 0xeeeff2, opacity: 0.9, depthWrite: true });
    const trimMatB = new THREE.MeshBasicMaterial({ color: 0x15191d, opacity: 1, depthWrite: true });
    const trimMesh = new THREE.Mesh(trimGeo, [trimMatA, trimMatB]);
    trimMesh.name = 'MultiMaterialTrim';
    childGroup.add(trimMesh);

    source.add(bodyMesh, childGroup);

    const playerClone = cloneAssetSceneWithUniqueMaterials(source);
    const ghostClone = cloneAssetSceneWithUniqueMaterials(source);

    expect(playerClone).toBeInstanceOf(THREE.Group);
    expect(ghostClone).toBeInstanceOf(THREE.Group);
    expect(playerClone).not.toBe(source);
    expect(ghostClone).not.toBe(source);
    expect(ghostClone).not.toBe(playerClone);

    const playerBody = playerClone.getObjectByName('Bodywork') as THREE.Mesh;
    const ghostBody = ghostClone.getObjectByName('Bodywork') as THREE.Mesh;
    expect(playerBody.geometry).toBe(bodyGeo);
    expect(ghostBody.geometry).toBe(bodyGeo);

    const playerBodyMat = playerBody.material as THREE.MeshStandardMaterial;
    const ghostBodyMat = ghostBody.material as THREE.MeshStandardMaterial;
    expect(playerBodyMat).not.toBe(bodyMat);
    expect(ghostBodyMat).not.toBe(bodyMat);
    expect(ghostBodyMat).not.toBe(playerBodyMat);

    // Mutate Ghost clone material properties (tint, translucency, emissive, depthWrite)
    ghostBodyMat.color.setHex(0xfacc15);
    ghostBodyMat.opacity = 0.42;
    ghostBodyMat.transparent = true;
    ghostBodyMat.emissive.setHex(0xfacc15);
    ghostBodyMat.depthWrite = false;

    expect(bodyMat.color.getHex()).toBe(0xb8101c);
    expect(bodyMat.opacity).toBe(1);
    expect(bodyMat.transparent).toBe(false);
    expect(bodyMat.emissive.getHex()).toBe(0x000000);
    expect(bodyMat.depthWrite).toBe(true);

    expect(playerBodyMat.color.getHex()).toBe(0xb8101c);
    expect(playerBodyMat.opacity).toBe(1);
    expect(playerBodyMat.transparent).toBe(false);
    expect(playerBodyMat.emissive.getHex()).toBe(0x000000);
    expect(playerBodyMat.depthWrite).toBe(true);

    // Multi-material mesh array cloning & shared geometry
    const playerTrim = playerClone.getObjectByName('MultiMaterialTrim') as THREE.Mesh;
    const ghostTrim = ghostClone.getObjectByName('MultiMaterialTrim') as THREE.Mesh;
    expect(playerTrim.geometry).toBe(trimGeo);
    expect(ghostTrim.geometry).toBe(trimGeo);
    const ghostTrimMats = ghostTrim.material as THREE.Material[];
    const playerTrimMats = playerTrim.material as THREE.Material[];
    expect(Array.isArray(ghostTrimMats)).toBe(true);
    expect(ghostTrimMats[0]).not.toBe(trimMatA);
    expect(ghostTrimMats[0]).not.toBe(playerTrimMats[0]);
    expect(ghostTrimMats[1]).not.toBe(trimMatB);
    expect(ghostTrimMats[1]).not.toBe(playerTrimMats[1]);

    (ghostTrimMats[0] as THREE.MeshStandardMaterial).color.setHex(0x22c55e);
    ghostTrimMats[0].opacity = 0.25;
    ghostTrimMats[0].depthWrite = false;
    expect((playerTrimMats[0] as THREE.MeshStandardMaterial).color.getHex()).toBe(0xeeeff2);
    expect(playerTrimMats[0].opacity).toBe(0.9);
    expect(playerTrimMats[0].depthWrite).toBe(true);
  });

  it('createKartRig() works synchronously in Node with no arguments and accepts optional RendererAssets', () => {
    const rigNoArgs = createKartRig();
    expect(rigNoArgs.root).toBeInstanceOf(THREE.Group);

    const emptyAssets: RendererAssets = {
      kartGltf: null,
      venuePropsGltf: null,
      textures: {},
    };
    const rigWithAssets = createKartRig(emptyAssets);
    expect(rigWithAssets.root).toBeInstanceOf(THREE.Group);

    const session = createSimulationSession();
    const snapshot = session.getSnapshot();
    rigNoArgs.update(snapshot);
    rigWithAssets.update(snapshot);

    expect(rigNoArgs.root.position.x).toBeCloseTo(snapshot.kart.position.x, 6);
    expect(rigWithAssets.root.position.x).toBeCloseTo(snapshot.kart.position.x, 6);
  });

  it('configureLoadedTexture applies SRGBColorSpace to albedo/livery, NoColorSpace to normal/roughness/AO, RepeatWrapping, and anisotropy 4', () => {
    const albedo = configureLoadedTexture(new THREE.Texture(), 'albedo');
    const livery = configureLoadedTexture(new THREE.Texture(), 'livery');
    const normal = configureLoadedTexture(new THREE.Texture(), 'normal');
    const roughness = configureLoadedTexture(new THREE.Texture(), 'roughness');
    const ao = configureLoadedTexture(new THREE.Texture(), 'ao');

    expect(albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(livery.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(roughness.colorSpace).toBe(THREE.NoColorSpace);
    expect(ao.colorSpace).toBe(THREE.NoColorSpace);

    for (const tex of [albedo, livery, normal, roughness, ao]) {
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.anisotropy).toBe(4);
    }
  });
});
