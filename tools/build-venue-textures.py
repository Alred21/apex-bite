"""Generate deterministic, seamlessly tileable 1024x1024 PBR venue textures in Blender 5.2.

Run via:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build-venue-textures.py
"""

from __future__ import annotations

import os
import sys
import bpy
import numpy as np

SIZE = 1024
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "textures"))


def periodic_noise(grid_res: int, rng: np.random.Generator) -> np.ndarray:
    """Bilinear-quintic periodic value noise upsampled seamlessly to SIZE x SIZE."""
    base = rng.random((grid_res, grid_res), dtype=np.float32)
    coords = np.linspace(0.0, float(grid_res), SIZE, endpoint=False, dtype=np.float32)
    x0 = np.floor(coords).astype(np.int32) % grid_res
    x1 = (x0 + 1) % grid_res
    fx = coords - np.floor(coords)
    # Quintic smoothstep
    ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0)

    c00 = base[np.ix_(x0, x0)]
    c10 = base[np.ix_(x0, x1)]
    c01 = base[np.ix_(x1, x0)]
    c11 = base[np.ix_(x1, x1)]

    ux_row = ux[None, :]
    uy_col = ux[:, None]
    nx0 = c00 * (1.0 - ux_row) + c10 * ux_row
    nx1 = c01 * (1.0 - ux_row) + c11 * ux_row
    return nx0 * (1.0 - uy_col) + nx1 * uy_col


def periodic_fbm(octaves: list[tuple[int, float]], rng: np.random.Generator) -> np.ndarray:
    acc = np.zeros((SIZE, SIZE), dtype=np.float32)
    weight_sum = 0.0
    for res, weight in octaves:
        acc += periodic_noise(res, rng) * weight
        weight_sum += weight
    return acc / max(1e-6, weight_sum)


def save_png(filename: str, rgba: np.ndarray, is_srgb: bool) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    filepath = os.path.join(OUT_DIR, filename)
    name = f"tex_{filename}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(
        name=name,
        width=SIZE,
        height=SIZE,
        alpha=False,
        float_buffer=False,
    )
    img.colorspace_settings.name = "sRGB" if is_srgb else "Non-Color"
    # Blender image pixels are bottom-up RGBA float32 in [0, 1]
    flipped = np.flipud(rgba).astype(np.float32)
    img.pixels.foreach_set(flipped.ravel())
    img.filepath_raw = filepath
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print(f"Wrote {filepath} ({SIZE}x{SIZE}, {'sRGB' if is_srgb else 'Non-Color'})")


def to_rgb_from_gray(gray: np.ndarray, tint: tuple[float, float, float] = (1.0, 1.0, 1.0)) -> np.ndarray:
    rgba = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    rgba[..., 0] = np.clip(gray * tint[0], 0.0, 1.0)
    rgba[..., 1] = np.clip(gray * tint[1], 0.0, 1.0)
    rgba[..., 2] = np.clip(gray * tint[2], 0.0, 1.0)
    return rgba


def build_track_concrete(rng: np.random.Generator) -> None:
    # Multi-scale trowel polish + fine mineral aggregate + hairline pore grain
    macro = periodic_fbm([(4, 0.55), (8, 0.30), (16, 0.15)], rng)
    medium = periodic_fbm([(32, 0.5), (64, 0.35), (128, 0.15)], rng)
    micro = periodic_fbm([(128, 0.45), (256, 0.35), (512, 0.20)], rng)
    speckle = rng.random((SIZE, SIZE), dtype=np.float32)
    pores = (speckle < 0.015).astype(np.float32) * -0.14 + (speckle > 0.985).astype(np.float32) * 0.08

    # Subtle tileable trowel / rubber arc streaks
    y_idx, x_idx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    u = x_idx / SIZE * (2.0 * np.pi)
    v = y_idx / SIZE * (2.0 * np.pi)
    trowel = 0.5 + 0.5 * np.sin(u * 2.0 + macro * 5.2 + np.cos(v * 2.0) * 1.4)

    height = np.clip(0.45 * macro + 0.30 * medium + 0.25 * micro + pores * 0.5, 0.0, 1.0)

    # Sealed concrete albedo (cool slate indoor concrete, neutral enough for shader groove darkening)
    albedo_gray = np.clip(0.36 + 0.11 * (macro - 0.5) + 0.09 * (medium - 0.5) + 0.07 * (micro - 0.5) + 0.025 * (trowel - 0.5) + pores * 0.35, 0.18, 0.58)
    save_png("track-concrete-albedo.png", to_rgb_from_gray(albedo_gray, (0.97, 0.99, 1.02)), is_srgb=True)

    # Periodic Sobel normal map
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 2.0 + (
        np.roll(np.roll(height, -1, axis=0), -1, axis=1) - np.roll(np.roll(height, -1, axis=0), 1, axis=1)
        + np.roll(np.roll(height, 1, axis=0), -1, axis=1) - np.roll(np.roll(height, 1, axis=0), 1, axis=1)
    )
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 2.0 + (
        np.roll(np.roll(height, -1, axis=0), -1, axis=1) - np.roll(np.roll(height, 1, axis=0), -1, axis=1)
        + np.roll(np.roll(height, -1, axis=0), 1, axis=1) - np.roll(np.roll(height, 1, axis=0), 1, axis=1)
    )
    strength = 1.65
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_rgba = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    normal_rgba[..., 0] = nx * inv_len * 0.5 + 0.5
    normal_rgba[..., 1] = ny * inv_len * 0.5 + 0.5
    normal_rgba[..., 2] = nz * inv_len * 0.5 + 0.5
    save_png("track-concrete-normal.png", normal_rgba, is_srgb=False)

    # Roughness: sealed concrete satin sheen [0.46 .. 0.78]
    rough = np.clip(0.62 + 0.16 * (0.5 - macro) + 0.12 * (micro - 0.5) - 0.04 * (trowel - 0.5) - pores * 0.4, 0.44, 0.80)
    save_png("track-concrete-roughness.png", to_rgb_from_gray(rough), is_srgb=False)


def build_infield_concrete(rng: np.random.Generator) -> None:
    macro = periodic_fbm([(4, 0.5), (12, 0.35), (24, 0.15)], rng)
    stipple = periodic_fbm([(64, 0.4), (192, 0.4), (384, 0.2)], rng)
    speckle = rng.random((SIZE, SIZE), dtype=np.float32)
    flecks = (speckle > 0.992).astype(np.float32) * 0.08 - (speckle < 0.008).astype(np.float32) * 0.06

    # K1 Speed Toronto painted epoxy blue infield concrete
    rgba = np.ones((SIZE, SIZE, 4), dtype=np.float32)
    base_mod = 0.90 + 0.16 * (macro - 0.5) + 0.10 * (stipple - 0.5) + flecks
    rgba[..., 0] = np.clip(0.085 * base_mod, 0.02, 0.35)
    rgba[..., 1] = np.clip(0.495 * base_mod, 0.15, 0.72)
    rgba[..., 2] = np.clip(0.765 * base_mod, 0.35, 0.95)
    save_png("infield-concrete-albedo.png", rgba, is_srgb=True)

    # Satin epoxy concrete roughness [0.34 .. 0.60]
    rough = np.clip(0.46 + 0.14 * (0.5 - macro) + 0.12 * (stipple - 0.5), 0.32, 0.62)
    save_png("infield-concrete-roughness.png", to_rgb_from_gray(rough), is_srgb=False)


def build_barrier_hdpe(rng: np.random.Generator) -> None:
    # Rotational-molded HDPE pebble grain + subtle vertical mold edge + longitudinal scuff streaks
    pebble = periodic_fbm([(64, 0.45), (192, 0.35), (384, 0.20)], rng)
    macro = periodic_fbm([(4, 0.6), (12, 0.4)], rng)
    # Horizontal streaks along U (barrier length)
    streaks = periodic_fbm([(4, 0.25), (32, 0.35), (128, 0.40)], rng)
    row_streaks = np.mean(streaks, axis=1, keepdims=True)
    scuff_band = np.clip(0.75 * streaks + 0.25 * row_streaks, 0.0, 1.0)
    scuffs = np.clip((scuff_band - 0.62) * 2.5, 0.0, 1.0)

    # Neutral high-value albedo so material tinting produces vibrant red & white Protex HDPE
    albedo = np.clip(0.93 + 0.05 * (macro - 0.5) + 0.04 * (pebble - 0.5) - 0.13 * scuffs, 0.65, 0.99)
    save_png("barrier-hdpe-albedo.png", to_rgb_from_gray(albedo, (1.0, 0.995, 0.99)), is_srgb=True)

    # Satin HDPE roughness [0.40 .. 0.68], burnished slightly smoother on scuffs
    rough = np.clip(0.56 + 0.12 * (pebble - 0.5) + 0.08 * (0.5 - macro) - 0.10 * scuffs, 0.38, 0.72)
    save_png("barrier-hdpe-roughness.png", to_rgb_from_gray(rough), is_srgb=False)


def main() -> int:
    rng = np.random.default_rng(20260654)
    build_track_concrete(rng)
    build_infield_concrete(rng)
    build_barrier_hdpe(rng)
    return 0


if __name__ == "__main__":
    sys.exit(main())
