#!/usr/bin/env python3
"""
Blender 5.2 CLI asset generator for the K1 Speed Toronto OTL Superleggero electric
rental go-kart, local 1024x1024 PBR texture maps, and articulated node hierarchy.

Run via official Blender CLI:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build-kart-model.py

Outputs:
  - assets/otl-superleggero.blend
  - public/models/otl-superleggero.glb
  - public/models/otl-superleggero-preview.png
  - public/textures/kart-livery-albedo.png
  - public/textures/kart-carbon-albedo.png
  - public/textures/kart-carbon-normal.png
  - public/textures/kart-carbon-roughness.png
  - public/textures/tire-albedo.png
  - public/textures/tire-normal.png
  - public/textures/tire-roughness.png
  - public/textures/metal-alloy-roughness.png
"""

import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_OUT = os.path.join(ROOT_DIR, "assets", "otl-superleggero.blend")
GLB_OUT = os.path.join(ROOT_DIR, "public", "models", "otl-superleggero.glb")
PREVIEW_OUT = os.path.join(ROOT_DIR, "public", "models", "otl-superleggero-preview.png")
TEX_DIR = os.path.join(ROOT_DIR, "public", "textures")

# Shared wheel & steering geometry constants matching src/simulation/kart-parameters.ts
# and src/render/kinematics.ts
WHEELBASE_M = 1.06
FRONT_AXLE_X = 0.54
REAR_AXLE_X = -0.52
FRONT_TRACK_HALF_Z = 0.285
REAR_TRACK_HALF_Z = 0.335
KINGPIN_HALF_Z = 0.185
SPINDLE_LENGTH = FRONT_TRACK_HALF_Z - KINGPIN_HALF_Z  # 0.100 m
TIRE_RADIUS = 0.145
FRONT_TIRE_HALF_WIDTH = 0.056  # 112 mm front slick
REAR_TIRE_HALF_WIDTH = 0.078   # 156 mm rear slick
CASTER_RAD = math.radians(10.0)
KPI_RAD = math.radians(7.0)
REAR_GEAR_RATIO = 3.2

STEER_MOUNT_POS = (0.185, 0.360, 0.0)
STEER_MOUNT_ROT_Z = 0.35
UPPER_SHAFT_LEN = 0.064
U_JOINT_POS = (
    STEER_MOUNT_POS[0] + UPPER_SHAFT_LEN * math.cos(STEER_MOUNT_ROT_Z),
    STEER_MOUNT_POS[1] + UPPER_SHAFT_LEN * math.sin(STEER_MOUNT_ROT_Z),
    0.0,
)
DASH_BINNACLE_POS = (0.262, 0.483)
PITMAN_PIVOT = (0.458, 0.192, 0.0)
PITMAN_BALL_LOCAL = (0.004, -0.056, 0.014)
KNUCKLE_ARM_BALL_LOCAL = (-0.086, 0.044, -0.014)
PEDAL_PIVOT_POS = (0.428, 0.095, 0.075)
BRAKE_CLEVIS_LOCAL = (0.0, 0.038, -0.047)  # world (0.428, 0.133, -0.122)
BRAKE_MASTER_BORE = (0.382, 0.124, -0.122)
THROTTLE_CLEVIS_LOCAL = (0.0, 0.038, 0.047)  # world (0.428, 0.133, +0.122)
THROTTLE_TPS_PIVOT = (0.416, 0.124, 0.122)

REAR_SPROCKET_RADIUS = 0.068
MOTOR_PINION_POS = (-0.425, 0.215, 0.210)
MOTOR_PINION_RADIUS = REAR_SPROCKET_RADIUS / REAR_GEAR_RATIO  # 0.02125 m

DRIVER_HIP_PIVOT = (-0.220, 0.205, 0.0)
DRIVER_NECK_PIVOT = (-0.326, 0.585, 0.0)
DRIVER_SHOULDER = (-0.335, 0.485, 0.138)
DRIVER_HIP_JOINT = (-0.175, 0.197, 0.078)
DRIVER_UPPER_ARM_LEN = 0.305
DRIVER_FOREARM_LEN = 0.285
DRIVER_THIGH_LEN = 0.300
DRIVER_SHIN_LEN = 0.265
GLOVE_OFFSET = (-0.010, 0.0, 0.105)
GLOVE_WRIST_LOCAL = (
    -0.032 * math.cos(STEER_MOUNT_ROT_Z),
    -0.032 * math.sin(STEER_MOUNT_ROT_Z),
    0.0,
)
PEDAL_SOLE_LOCAL = (-0.017, 0.068, 0.0)
PEDAL_ANKLE_OFFSET = (-0.047, -0.015, 0.0)


def t2b(x: float, y: float, z: float) -> Vector:
    """Convert Three.js (+X forward, +Y up, +Z right) to Blender (+X forward, -Y right, +Z up)."""
    return Vector((x, -z, y))


def solve_two_bone_ik_three(
    root: Vector,
    target: Vector,
    upper_len: float,
    lower_len: float,
    pole_dir: Vector,
) -> tuple[Vector, Vector]:
    to_t = target - root
    raw_dist = to_t.length
    direction = to_t / raw_dist if raw_dist > 1e-6 else Vector((1.0, 0.0, 0.0))
    min_r = abs(upper_len - lower_len) + 1e-5
    max_r = upper_len + lower_len - 1e-5
    dist = max(min_r, min(max_r, raw_dist))
    bend = pole_dir - direction * pole_dir.dot(direction)
    if bend.length_squared < 1e-8:
        bend = Vector((0.0, 1.0, 0.0)) - direction * direction.y
        if bend.length_squared < 1e-8:
            bend = Vector((0.0, 0.0, 1.0))
    bend.normalize()
    cos_a = max(-1.0, min(1.0, (upper_len * upper_len + dist * dist - lower_len * lower_len) / (2.0 * upper_len * dist)))
    along = upper_len * cos_a
    perp = math.sqrt(max(0.0, upper_len * upper_len - along * along))
    return root + direction * along + bend * perp, root + direction * dist


def orient_limb_object_three(obj: bpy.types.Object, start: Vector, end: Vector, pole_dir: Vector) -> None:
    z_axis = (end - start).normalized()
    x_axis = pole_dir.cross(z_axis)
    if x_axis.length_squared < 1e-8:
        x_axis = Vector((1.0, 0.0, 0.0))
    else:
        x_axis.normalize()
    y_axis = z_axis.cross(x_axis).normalized()
    # Blender local (+X, +Y, +Z) corresponds to Three.js (+X, -Z, +Y) via t2b()
    col_bx = t2b(x_axis.x, x_axis.y, x_axis.z)
    col_by = t2b(-z_axis.x, -z_axis.y, -z_axis.z)
    col_bz = t2b(y_axis.x, y_axis.y, y_axis.z)
    obj.location = t2b(start.x, start.y, start.z)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Matrix((col_bx, col_by, col_bz)).transposed().to_quaternion()


def vec_norm(v: tuple[float, float, float]) -> tuple[float, float, float]:
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)


def kingpin_axis(side: int) -> tuple[float, float, float]:
    return vec_norm((
        -math.sin(CASTER_RAD) * math.cos(KPI_RAD),
        math.cos(CASTER_RAD) * math.cos(KPI_RAD),
        -side * math.sin(KPI_RAD),
    ))


# =============================================================================
# DETERMINISTIC 1024x1024 PBR TEXTURE GENERATION
# =============================================================================
_FONT_5X7 = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


def draw_bitmap_text(
    img: np.ndarray,
    text: str,
    x0: int,
    y0: int,
    scale: int,
    color: tuple[float, float, float, float],
    spacing: int = 1,
    angle_rad: float = 0.0,
) -> None:
    """Draws crisp bitmap text into an RGBA float32 buffer, optionally rotated around (x0, y0)."""
    h, w, _ = img.shape
    if abs(angle_rad) < 1e-4:
        cx = x0
        for ch in text.upper():
            glyph = _FONT_5X7.get(ch, _FONT_5X7[" "])
            for row_idx, row in enumerate(glyph):
                py0 = y0 + (6 - row_idx) * scale
                for col_idx, bit in enumerate(row):
                    if bit != "1":
                        continue
                    px0 = cx + col_idx * scale
                    px1 = min(w, px0 + scale)
                    py1 = min(h, py0 + scale)
                    if px0 < w and py0 < h and px1 > 0 and py1 > 0:
                        img[max(0, py0):py1, max(0, px0):px1] = color
            cx += (5 + spacing) * scale
        return

    ca, sa = math.cos(angle_rad), math.sin(angle_rad)
    cx = 0.0
    for ch in text.upper():
        glyph = _FONT_5X7.get(ch, _FONT_5X7[" "])
        for row_idx, row in enumerate(glyph):
            ly = (6 - row_idx) * scale
            for col_idx, bit in enumerate(row):
                if bit != "1":
                    continue
                lx = cx + col_idx * scale
                for dy in range(scale):
                    for dx in range(scale):
                        rx = x0 + int(round((lx + dx) * ca - (ly + dy) * sa))
                        ry = y0 + int(round((lx + dx) * sa + (ly + dy) * ca))
                        if 0 <= rx < w and 0 <= ry < h:
                            img[ry, rx] = color
        cx += (5 + spacing) * scale


def save_rgba_png(path: str, rgba: np.ndarray, colorspace: str = "sRGB") -> bpy.types.Image:
    h, w, _ = rgba.shape
    name = os.path.basename(path)
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0.0, 1.0).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


def generate_pbr_textures() -> dict[str, bpy.types.Image]:
    """Generates all 8 local 1024x1024 PBR maps deterministically under public/textures/."""
    os.makedirs(TEX_DIR, exist_ok=True)
    N = 1024
    yy, xx = np.mgrid[0:N, 0:N]
    rng = np.random.default_rng(20261127)

    # 1-3. Carbon 2x2 twill weave (albedo, normal, roughness)
    cell = 8
    tx = (xx // cell) % 4
    ty = (yy // cell) % 4
    phase = (tx + ty) % 4
    warp = (phase < 2)
    u_local = (xx % cell) / float(cell)
    v_local = (yy % cell) / float(cell)
    profile_warp = np.sin(u_local * math.pi)
    profile_weft = np.sin(v_local * math.pi)
    fiber_val = np.where(warp, 0.10 + 0.08 * profile_warp, 0.06 + 0.06 * profile_weft)

    carbon_albedo = np.ones((N, N, 4), dtype=np.float32)
    carbon_albedo[:, :, 0] = fiber_val
    carbon_albedo[:, :, 1] = fiber_val * 1.03
    carbon_albedo[:, :, 2] = fiber_val * 1.08

    dh_dx = np.where(warp, np.cos(u_local * math.pi) * 0.45, 0.0)
    dh_dy = np.where(~warp, np.cos(v_local * math.pi) * 0.45, 0.0)
    nz = np.ones((N, N), dtype=np.float32)
    nlen = np.sqrt(dh_dx * dh_dx + dh_dy * dh_dy + nz * nz)
    carbon_normal = np.ones((N, N, 4), dtype=np.float32)
    carbon_normal[:, :, 0] = 0.5 + 0.5 * (-dh_dx / nlen)
    carbon_normal[:, :, 1] = 0.5 + 0.5 * (-dh_dy / nlen)
    carbon_normal[:, :, 2] = 0.5 + 0.5 * (nz / nlen)

    rough_val = np.where(warp, 0.38 + 0.14 * (1.0 - profile_warp), 0.48 + 0.14 * (1.0 - profile_weft))
    carbon_rough = np.ones((N, N, 4), dtype=np.float32)
    carbon_rough[:, :, 0] = rough_val
    carbon_rough[:, :, 1] = rough_val
    carbon_rough[:, :, 2] = rough_val

    # 4. Kart Livery Albedo (1024x1024):
    # UV Layout:
    #   v in [0.55, 1.00], u in [0.00, 1.00]: Nose Cone & Nassau Fairing top-projected (u = z_norm, v = x_norm)
    #   v in [0.00, 0.55], u in [0.00, 1.00]: Sidepods top/side-projected (u = x_norm, v = side_wrap)
    livery = np.ones((N, N, 4), dtype=np.float32)
    # Base crimson red (#b8101c -> linear-friendly sRGB ~0.72, 0.06, 0.11)
    livery[:, :, 0] = 0.72
    livery[:, :, 1] = 0.06
    livery[:, :, 2] = 0.11

    # Subtle metallic flake micro-variation
    flake = rng.normal(0.0, 0.012, (N, N)).astype(np.float32)
    livery[:, :, 0] = np.clip(livery[:, :, 0] + flake, 0.0, 1.0)
    livery[:, :, 1] = np.clip(livery[:, :, 1] + flake * 0.4, 0.0, 1.0)
    livery[:, :, 2] = np.clip(livery[:, :, 2] + flake * 0.4, 0.0, 1.0)

    # Upper region (v >= 0.55): Nose + Nassau
    # v in [0.55, 0.64]: clean crimson with subtle flake (Nassau fairing)
    # v in [0.64, 0.99]: Nose Cone with carbon side trim, APEX BITE / 07 plate, and white forward tip
    nose_mask = yy >= int(0.55 * N)
    # Forward tip white band extending cleanly to top edge (anti-aliased 3px feather at v = 0.895)
    tip_edge = 0.895 * N
    tip_blend = np.clip((yy - (tip_edge - 1.5)) / 3.0, 0.0, 1.0)
    tip_mask = nose_mask & (tip_blend > 0.0)
    for ch, target_c in enumerate((0.94, 0.95, 0.96)):
        livery[tip_mask, ch] = livery[tip_mask, ch] * (1.0 - tip_blend[tip_mask]) + target_c * tip_blend[tip_mask]
    # Carbon outer edge trim on nose (v in [0.65, 0.895) and (u < 0.16 or u > 0.84))
    nose_carbon = (yy >= int(0.65 * N)) & (yy < int(0.895 * N) - 1) & ((xx < int(0.16 * N)) | (xx > int(0.84 * N)))
    livery[nose_carbon, 0:3] = carbon_albedo[nose_carbon, 0:3] * 1.15
    # Crisp dark number plate backing on flat nose plateau (u in [0.22, 0.78], v in [0.71, 0.86])
    plate_nose = nose_mask & (xx >= int(0.22 * N)) & (xx <= int(0.78 * N)) & (yy >= int(0.71 * N)) & (yy <= int(0.86 * N))
    livery[plate_nose, 0:3] = (0.08, 0.10, 0.12)
    # White pinstripe border around nose plate
    plate_border = nose_mask & (
        ((xx >= int(0.21 * N)) & (xx <= int(0.79 * N)) & ((yy == int(0.71 * N)) | (yy == int(0.71 * N) + 3) | (yy == int(0.86 * N)) | (yy == int(0.86 * N) - 3)))
    )
    livery[plate_border, 0:3] = (0.94, 0.95, 0.96)
    draw_bitmap_text(livery, "APEX BITE", 268, int(0.79 * N), 8, (0.95, 0.96, 0.96, 1.0))
    draw_bitmap_text(livery, "07", 455, int(0.73 * N), 8, (0.85, 0.91, 0.18, 1.0))

    # Lower region (v < 0.55): Sidepods (u = x along pod, v = wrap across top & outer skirt)
    pod_mask = yy < int(0.55 * N)
    # White diagonal stripe along upper sidepod shoulder
    diag = pod_mask & (yy >= int(0.37 * N)) & (yy <= int(0.46 * N))
    livery[diag, 0:3] = (0.94, 0.95, 0.96)
    # Carbon lower skirt band (v < 0.14)
    skirt = pod_mask & (yy < int(0.14 * N))
    livery[skirt, 0:3] = carbon_albedo[skirt, 0:3] * 1.15
    # Dark inset badge panel on sidepod upper flank (u in [0.26, 0.86], v in [0.18, 0.35])
    pod_plate = pod_mask & (xx >= int(0.26 * N)) & (xx <= int(0.86 * N)) & (yy >= int(0.18 * N)) & (yy <= int(0.35 * N))
    livery[pod_plate, 0:3] = (0.07, 0.09, 0.11)
    # Red leading accent bar on badge
    pod_bar = pod_mask & (xx >= int(0.26 * N)) & (xx <= int(0.29 * N)) & (yy >= int(0.18 * N)) & (yy <= int(0.35 * N))
    livery[pod_bar, 0:3] = (0.78, 0.08, 0.12)
    draw_bitmap_text(livery, "APEX BITE", 315, int(0.275 * N), 8, (0.95, 0.96, 0.96, 1.0))
    draw_bitmap_text(livery, "07", 510, int(0.205 * N), 8, (0.85, 0.91, 0.18, 1.0))

    # 5-7. Tire Albedo, Normal, Roughness (1024x1024)
    # UV layout:
    #   v in [0.00, 0.50]: Circumferential tread band (u = circumference, v = across tread width)
    #   v in [0.50, 1.00]: Polar/radial sidewall (centered at u=0.5, v=0.75, radius <= 0.24)
    tire_grain = rng.normal(0.0, 0.015, (N, N)).astype(np.float32)
    tire_albedo = np.ones((N, N, 4), dtype=np.float32)
    tire_albedo[:, :, 0] = 0.085 + tire_grain
    tire_albedo[:, :, 1] = 0.088 + tire_grain
    tire_albedo[:, :, 2] = 0.092 + tire_grain

    # Circumferential tread wear striations on tread band (v < 0.50)
    tread_mask = yy < int(0.50 * N)
    striation = 0.012 * np.sin((yy / float(N)) * 180.0) + 0.008 * np.sin((xx / float(N)) * 22.0)
    tire_albedo[tread_mask, 0] += striation[tread_mask]
    tire_albedo[tread_mask, 1] += striation[tread_mask]
    tire_albedo[tread_mask, 2] += striation[tread_mask]

    # Sidewall molded ribs + radial markings (u_c = u - 0.5, v_c = v - 0.75)
    su = (xx / float(N)) - 0.5
    sv = (yy / float(N)) - 0.75
    sr = np.sqrt(su * su + sv * sv)
    sang = np.arctan2(sv, su)
    rib1 = np.exp(-((sr - 0.215) / 0.004) ** 2)
    rib2 = np.exp(-((sr - 0.155) / 0.004) ** 2)
    sidewall_mask = yy >= int(0.50 * N)
    tire_albedo[sidewall_mask, 0] += 0.03 * (rib1 + rib2)[sidewall_mask]
    tire_albedo[sidewall_mask, 1] += 0.03 * (rib1 + rib2)[sidewall_mask]
    tire_albedo[sidewall_mask, 2] += 0.03 * (rib1 + rib2)[sidewall_mask]

    # Molded sidewall lettering along arc at sr ≈ 0.188, advancing clockwise so text reads forward
    for label, ang_start in (("OTL CORSE", 0.48), ("INDOOR SLICK", math.pi + 0.62)):
        for idx, ch in enumerate(label):
            ang = ang_start - idx * 0.115
            cx = int((0.5 + math.cos(ang) * 0.188) * N)
            cy = int((0.75 + math.sin(ang) * 0.188) * N)
            draw_bitmap_text(tire_albedo, ch, cx, cy, 4, (0.50, 0.52, 0.50, 1.0), angle_rad=ang - math.pi / 2.0)

    # Tire normal map: grain + sidewall ribs + center mold parting line
    height_tire = tire_grain * 1.4 + 0.05 * (rib1 + rib2)
    # Center mold parting ridge at v = 0.25
    height_tire += 0.03 * np.exp(-(((yy / float(N)) - 0.25) / 0.003) ** 2)
    gy, gx = np.gradient(height_tire)
    tnz = np.ones((N, N), dtype=np.float32) * 0.25
    tnlen = np.sqrt(gx * gx + gy * gy + tnz * tnz)
    tire_normal = np.ones((N, N, 4), dtype=np.float32)
    tire_normal[:, :, 0] = 0.5 + 0.5 * (-gx / tnlen)
    tire_normal[:, :, 1] = 0.5 + 0.5 * (-gy / tnlen)
    tire_normal[:, :, 2] = 0.5 + 0.5 * (tnz / tnlen)

    # Tire roughness: center contact patch slightly glossier (0.68), shoulders/sidewall matte (0.88)
    dist_center = np.abs((yy / float(N)) - 0.25) / 0.25
    tire_r = np.where(tread_mask, 0.68 + 0.20 * (dist_center ** 1.4), 0.88) + tire_grain * 1.2
    tire_rough = np.ones((N, N, 4), dtype=np.float32)
    tire_rough[:, :, 0] = tire_r
    tire_rough[:, :, 1] = tire_r
    tire_rough[:, :, 2] = tire_r

    # 8. Brushed / CNC Metal Alloy Roughness (1024x1024)
    streak_x = rng.normal(0.0, 0.035, (1, N)).astype(np.float32)
    streak_fine = rng.normal(0.0, 0.020, (N, N)).astype(np.float32)
    metal_r = np.clip(0.24 + streak_x + streak_fine + 0.03 * np.sin((yy / float(N)) * 90.0), 0.14, 0.42)
    metal_rough = np.ones((N, N, 4), dtype=np.float32)
    metal_rough[:, :, 0] = metal_r
    metal_rough[:, :, 1] = metal_r
    metal_rough[:, :, 2] = metal_r

    # 9-11. Nomex Racing Suit Fabric (tileable dark navy/charcoal weave + quilted box-stitching)
    s_cell = 4
    stx = (xx // s_cell) % 2
    sty = (yy // s_cell) % 2
    s_warp = ((stx + sty) % 2) == 0
    su_l = (xx % s_cell) / float(s_cell)
    sv_l = (yy % s_cell) / float(s_cell)
    s_prof = np.where(s_warp, np.sin(su_l * math.pi), np.sin(sv_l * math.pi))
    quilt_y = np.exp(-(((yy % 96) - 48.0) / 2.2) ** 2)
    quilt_x = np.exp(-(((xx % 128) - 64.0) / 2.0) ** 2) * 0.45
    stitch_dip = np.clip(quilt_y + quilt_x, 0.0, 1.0)
    fabric_noise = rng.normal(0.0, 0.008, (N, N)).astype(np.float32)
    suit_shade = np.clip(0.86 + 0.14 * s_prof - 0.16 * stitch_dip + fabric_noise, 0.55, 1.05)

    suit_albedo = np.ones((N, N, 4), dtype=np.float32)
    suit_albedo[:, :, 0] = np.clip(0.105 * suit_shade, 0.0, 1.0)
    suit_albedo[:, :, 1] = np.clip(0.140 * suit_shade, 0.0, 1.0)
    suit_albedo[:, :, 2] = np.clip(0.185 * suit_shade, 0.0, 1.0)

    suit_h = 0.035 * s_prof - 0.08 * stitch_dip + fabric_noise * 0.8
    sgy, sgx = np.gradient(suit_h)
    snz = np.ones((N, N), dtype=np.float32) * 0.22
    snlen = np.sqrt(sgx * sgx + sgy * sgy + snz * snz)
    suit_normal = np.ones((N, N, 4), dtype=np.float32)
    suit_normal[:, :, 0] = 0.5 + 0.5 * (-sgx / snlen)
    suit_normal[:, :, 1] = 0.5 + 0.5 * (-sgy / snlen)
    suit_normal[:, :, 2] = 0.5 + 0.5 * (snz / snlen)

    suit_r = np.clip(0.88 - 0.08 * s_prof + 0.07 * stitch_dip + fabric_noise * 1.5, 0.72, 0.96)
    suit_rough = np.ones((N, N, 4), dtype=np.float32)
    suit_rough[:, :, 0] = suit_r
    suit_rough[:, :, 1] = suit_r
    suit_rough[:, :, 2] = suit_r

    # 12. Helmet Pearl-White + Crimson/Gold Livery Albedo (1024x1024)
    # UV layout: u = lateral wrap around sagittal X (0.5 = crown/chin centerline), v = rear(0)..front(1)
    u_norm = xx / float(N)
    v_norm = yy / float(N)
    pearl = rng.normal(0.0, 0.008, (N, N)).astype(np.float32)
    helmet_albedo = np.ones((N, N, 4), dtype=np.float32)
    helmet_albedo[:, :, 0] = np.clip(0.91 + pearl, 0.0, 1.0)
    helmet_albedo[:, :, 1] = np.clip(0.93 + pearl, 0.0, 1.0)
    helmet_albedo[:, :, 2] = np.clip(0.92 + pearl, 0.0, 1.0)

    # Center crimson racing stripe + flanking gold pinstripes (crown & back down to rear spoiler)
    stripe_v = (v_norm >= 0.04) & (v_norm <= 0.84)
    center_crimson = stripe_v & (np.abs(u_norm - 0.50) <= 0.045)
    gold_pin = stripe_v & (
        ((np.abs(u_norm - 0.50) >= 0.052) & (np.abs(u_norm - 0.50) <= 0.064))
    )
    helmet_albedo[center_crimson, 0:3] = (0.72, 0.055, 0.10)
    helmet_albedo[gold_pin, 0:3] = (0.85, 0.70, 0.16)

    # Swept crimson & dark-slate side aero chevrons along left/right cheeks & temples
    side_dist = np.abs(u_norm - 0.50)
    diag_band = (side_dist >= 0.19) & (side_dist <= 0.36)
    swoosh_y = 0.28 + 0.52 * (side_dist - 0.19) / 0.17
    swoosh_crimson = diag_band & (np.abs(v_norm - swoosh_y) <= 0.055)
    swoosh_gold = diag_band & (np.abs(v_norm - (swoosh_y + 0.068)) <= 0.015)
    swoosh_slate = diag_band & (np.abs(v_norm - (swoosh_y - 0.075)) <= 0.032)
    helmet_albedo[swoosh_crimson, 0:3] = (0.72, 0.055, 0.10)
    helmet_albedo[swoosh_gold, 0:3] = (0.85, 0.70, 0.16)
    helmet_albedo[swoosh_slate, 0:3] = (0.12, 0.15, 0.19)

    # Rear carbon lower collar trim & subtle "07" number on rear & sides
    rear_trim = v_norm < 0.09
    helmet_albedo[rear_trim, 0:3] = (0.10, 0.12, 0.14)
    draw_bitmap_text(helmet_albedo, "07", int(0.468 * N), int(0.14 * N), 6, (0.95, 0.96, 0.96, 1.0))
    draw_bitmap_text(helmet_albedo, "07", int(0.17 * N), int(0.45 * N), 6, (0.95, 0.96, 0.96, 1.0))
    draw_bitmap_text(helmet_albedo, "07", int(0.76 * N), int(0.45 * N), 6, (0.95, 0.96, 0.96, 1.0))

    return {
        "kart_livery_albedo": save_rgba_png(os.path.join(TEX_DIR, "kart-livery-albedo.png"), livery, "sRGB"),
        "kart_carbon_albedo": save_rgba_png(os.path.join(TEX_DIR, "kart-carbon-albedo.png"), carbon_albedo, "sRGB"),
        "kart_carbon_normal": save_rgba_png(os.path.join(TEX_DIR, "kart-carbon-normal.png"), carbon_normal, "Non-Color"),
        "kart_carbon_roughness": save_rgba_png(os.path.join(TEX_DIR, "kart-carbon-roughness.png"), carbon_rough, "Non-Color"),
        "tire_albedo": save_rgba_png(os.path.join(TEX_DIR, "tire-albedo.png"), tire_albedo, "sRGB"),
        "tire_normal": save_rgba_png(os.path.join(TEX_DIR, "tire-normal.png"), tire_normal, "Non-Color"),
        "tire_roughness": save_rgba_png(os.path.join(TEX_DIR, "tire-roughness.png"), tire_rough, "Non-Color"),
        "metal_alloy_roughness": save_rgba_png(os.path.join(TEX_DIR, "metal-alloy-roughness.png"), metal_rough, "Non-Color"),
        "suit_fabric_albedo": save_rgba_png(os.path.join(TEX_DIR, "suit-fabric-albedo.png"), suit_albedo, "sRGB"),
        "suit_fabric_normal": save_rgba_png(os.path.join(TEX_DIR, "suit-fabric-normal.png"), suit_normal, "Non-Color"),
        "suit_fabric_roughness": save_rgba_png(os.path.join(TEX_DIR, "suit-fabric-roughness.png"), suit_rough, "Non-Color"),
        "helmet_livery_albedo": save_rgba_png(os.path.join(TEX_DIR, "helmet-livery-albedo.png"), helmet_albedo, "sRGB"),
    }


# =============================================================================
# MATERIAL HELPERS (LOOK UP BY node.type == 'BSDF_PRINCIPLED')
# =============================================================================
def get_principled(mat: bpy.types.Material):
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def make_pbr_material(
    name: str,
    rgb: tuple[float, float, float] | None = None,
    roughness: float = 0.45,
    metalness: float = 0.0,
    albedo_img: bpy.types.Image | None = None,
    normal_img: bpy.types.Image | None = None,
    roughness_img: bpy.types.Image | None = None,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.08,
    emissive_rgb: tuple[float, float, float] | None = None,
    emissive_strength: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = get_principled(mat)
    if not bsdf:
        return mat

    if rgb is not None:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else "HASHED"

    if emissive_rgb is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (emissive_rgb[0], emissive_rgb[1], emissive_rgb[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emissive_strength

    if albedo_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if roughness_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = roughness_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = normal_img
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.65
        nt.links.new(tex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


# =============================================================================
# GEOMETRY & UV HELPERS
# =============================================================================
def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_empty(name: str, loc_three: tuple[float, float, float] = (0.0, 0.0, 0.0), parent=None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = t2b(*loc_three)
    if parent is not None:
        obj.parent = parent
    return obj


def ensure_uv_box_projection(bm: bmesh.types.BMesh, scale: float = 2.0) -> None:
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * scale, co.y * scale)
            elif ax >= ay and ax >= az:
                loop[uv_layer].uv = (co.y * scale, co.z * scale)
            else:
                loop[uv_layer].uv = (co.x * scale, co.z * scale)


def create_loft_mesh(
    name: str,
    rings: list[list[tuple[float, float, float]]],
    material: bpy.types.Material,
    closed_loop: bool = True,
    cap_ends: bool = True,
    subsurf_levels: int = 1,
    parent: bpy.types.Object = None,
    origin_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    uv_fn=None,
) -> bpy.types.Object:
    """Create a smooth lofted mesh in local coordinates relative to `origin_three`."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent

    ox, oy, oz = origin_three
    bm = bmesh.new()
    bm_rings = []
    for ring in rings:
        bm_ring = [bm.verts.new(t2b(x - ox, y - oy, z - oz)) for (x, y, z) in ring]
        bm_rings.append(bm_ring)

    n_pts = len(rings[0])
    for r in range(len(bm_rings) - 1):
        r0 = bm_rings[r]
        r1 = bm_rings[r + 1]
        limit = n_pts if closed_loop else n_pts - 1
        for i in range(limit):
            j = (i + 1) % n_pts
            try:
                bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            except ValueError:
                pass

    if cap_ends and closed_loop and n_pts >= 3:
        try:
            bm.faces.new(list(reversed(bm_rings[0])))
            bm.faces.new(bm_rings[-1])
        except ValueError:
            pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True

    if uv_fn is not None:
        uv_layer = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for loop in f.loops:
                bco = loop.vert.co
                # convert local blender back to world three
                tx = bco.x + ox
                ty = bco.z + oy
                tz = -bco.y + oz
                loop[uv_layer].uv = uv_fn(tx, ty, tz)
    else:
        ensure_uv_box_projection(bm, scale=4.0)

    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.append(material)
    if subsurf_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
    return obj


def create_tube_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    closed: bool = False,
    resolution_u: int = 8,
    bevel_resolution: int = 3,
    parent: bpy.types.Object = None,
    origin_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    ox, oy, oz = origin_three
    curve_data = bpy.data.curves.new(name=name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution_u
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_resolution
    curve_data.use_fill_caps = not closed

    spline = curve_data.splines.new(type="NURBS" if len(points) >= 4 else "POLY")
    spline.points.add(len(points) - 1)
    for i, (x, y, z) in enumerate(points):
        bx, by, bz = t2b(x - ox, y - oy, z - oz)
        spline.points[i].co = (bx, by, bz, 1.0)
    spline.use_cyclic_u = closed
    if spline.type == "NURBS":
        spline.use_endpoint_u = not closed
        spline.order_u = min(4, len(points))

    curve_obj = bpy.data.objects.new(name + "_curve_obj", curve_data)
    bpy.context.scene.collection.objects.link(curve_obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = curve_obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    mesh.name = name

    bm = bmesh.new()
    bm.from_mesh(mesh)
    for f in bm.faces:
        f.smooth = True
    ensure_uv_box_projection(bm, scale=4.0)
    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.append(material)
    bpy.data.objects.remove(curve_obj, do_unlink=True)
    bpy.data.curves.remove(curve_data, do_unlink=True)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def create_cylinder_between(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    segments: int = 16,
    parent: bpy.types.Object = None,
    origin_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    v0 = Vector(p0)
    v1 = Vector(p1)
    axis = v1 - v0
    length = axis.length
    if length < 1e-6:
        axis = Vector((1.0, 0.0, 0.0))
        length = 1e-3
    tangent = tuple((axis / length))
    r0 = oriented_ellipse_ring(p0, tangent, radius, radius, n=segments)
    r1 = oriented_ellipse_ring(p1, tangent, radius, radius, n=segments)
    return create_loft_mesh(name, [r0, r1], material, subsurf_levels=0, parent=parent, origin_three=origin_three)


def superellipse_ring(
    x: float,
    y_bottom: float,
    y_top: float,
    z_center: float,
    half_width: float,
    n: int = 16,
    power_y: float = 0.55,
    power_z: float = 0.65,
    z_skew_top: float = 0.0,
) -> list[tuple[float, float, float]]:
    pts = []
    y_mid = 0.5 * (y_bottom + y_top)
    y_half = 0.5 * (y_top - y_bottom)
    for i in range(n):
        ang = (i / n) * math.pi * 2.0
        cy = math.cos(ang)
        sz = math.sin(ang)
        sy = math.copysign(abs(cy) ** power_y, cy)
        wz = math.copysign(abs(sz) ** power_z, sz)
        y = y_mid + sy * y_half
        z_shift = z_skew_top * (0.5 + 0.5 * sy)
        z = z_center + z_shift + wz * half_width
        pts.append((x, y, z))
    return pts


def oriented_ellipse_ring(
    center: tuple[float, float, float],
    tangent: tuple[float, float, float],
    radius_normal: float,
    radius_side: float,
    n: int = 16,
) -> list[tuple[float, float, float]]:
    """Build a ring perpendicular to `tangent` in Three.js coordinates (+X forward, +Y up, +Z right)."""
    t = Vector(tangent).normalized()
    up_ref = Vector((0.0, 1.0, 0.0)) if abs(t.y) < 0.92 else Vector((1.0, 0.0, 0.0))
    side_vec = t.cross(up_ref).normalized()
    norm_vec = side_vec.cross(t).normalized()
    c = Vector(center)
    pts = []
    for i in range(n):
        ang = (i / n) * math.pi * 2.0
        ca = math.cos(ang)
        sa = math.sin(ang)
        p = c + norm_vec * (ca * radius_normal) + side_vec * (sa * radius_side)
        pts.append((p.x, p.y, p.z))
    return pts


# =============================================================================
# SCULPTED WHEEL BUILDER (STAGGERED 112mm FRONT / 156mm REAR SLICKS)
# =============================================================================
def build_sculpted_wheel(
    name: str,
    origin_three: tuple[float, float, float],
    local_pos_three: tuple[float, float, float],
    side: int,
    half_width: float,
    mats: dict[str, bpy.types.Material],
    parent: bpy.types.Object,
) -> bpy.types.Object:
    wheel_root = make_empty(name, local_pos_three, parent=parent)
    ox, oy, oz = origin_three

    # 1. Sculpted slick tire with rounded shoulders + sidewall bead + dedicated tread/sidewall UVs
    # Profile points (radius, z_local_offset)
    hw = half_width
    profile = [
        (0.088, -hw * 0.92),
        (0.106, -hw * 0.98),
        (0.128, -hw * 0.99),
        (0.141, -hw * 0.78),
        (0.145, -hw * 0.48),
        (0.145, 0.0),
        (0.145, hw * 0.48),
        (0.141, hw * 0.78),
        (0.128, hw * 0.99),
        (0.106, hw * 0.98),
        (0.088, hw * 0.92),
    ]
    n_seg = 40
    tire_mesh = bpy.data.meshes.new(name + "_Tire")
    tire_obj = bpy.data.objects.new(name + "_Tire", tire_mesh)
    bpy.context.scene.collection.objects.link(tire_obj)
    tire_obj.parent = wheel_root

    bm = bmesh.new()
    rings_bm = []
    for r_val, z_off in profile:
        ring = []
        for i in range(n_seg):
            ang = (i / n_seg) * math.pi * 2.0
            lx = math.cos(ang) * r_val
            ly = math.sin(ang) * r_val
            ring.append(bm.verts.new(t2b(lx, ly, z_off)))
        rings_bm.append(ring)

    uv_layer = bm.loops.layers.uv.verify()
    for p_idx in range(len(profile) - 1):
        r0 = rings_bm[p_idx]
        r1 = rings_bm[p_idx + 1]
        is_tread = 3 <= p_idx <= 6
        for i in range(n_seg):
            j = (i + 1) % n_seg
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.smooth = True
            for loop in f.loops:
                bco = loop.vert.co
                lx = bco.x
                ly = bco.z
                lz = -bco.y
                ang = math.atan2(ly, lx)
                rad = math.hypot(lx, ly)
                if is_tread:
                    u = (ang / (2.0 * math.pi)) % 1.0
                    v = 0.25 + 0.24 * (lz / hw)
                    loop[uv_layer].uv = (u, v)
                else:
                    # Map sidewall radius [0.088..0.141] onto radial ring [0.13..0.235] around (0.5, 0.75)
                    # Mirror U on right side (+Z) so sidewall text reads forward on both sides of the kart
                    rn = 0.13 + ((rad - 0.088) / (0.145 - 0.088)) * 0.105
                    u_side = (0.5 - math.cos(ang) * rn) if (side > 0) else (0.5 + math.cos(ang) * rn)
                    loop[uv_layer].uv = (u_side, 0.75 + math.sin(ang) * rn)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(tire_mesh)
    bm.free()
    tire_mesh.materials.append(mats["tire"])

    # 2. Dished split-rim aluminum barrel & beadlock lip
    rim_profile = [
        (0.089, -hw * 0.90),
        (0.094, -hw * 0.96),
        (0.088, -hw * 0.88),
        (0.072, -hw * 0.55),
        (0.072, hw * 0.55),
        (0.088, hw * 0.88),
        (0.094, hw * 0.96),
        (0.089, hw * 0.90),
    ]
    rim_rings = []
    for r_val, z_off in rim_profile:
        rim_rings.append([(ox + math.cos(a) * r_val, oy + math.sin(a) * r_val, oz + z_off)
                          for a in ((k / 28) * math.pi * 2.0 for k in range(28))])
    create_loft_mesh(
        name + "_Rim",
        rim_rings,
        mats["alloy"],
        closed_loop=True,
        cap_ends=False,
        subsurf_levels=0,
        parent=wheel_root,
        origin_three=origin_three,
    )

    # 3. Sculpted dished inner hub barrel + 3 spokes + lug bolts + center locknut + valve stem
    create_cylinder_between(
        name + "_HubCore",
        (ox, oy, oz - hw * 0.84),
        (ox, oy, oz + hw * 0.84),
        0.032,
        mats["alloy"],
        segments=16,
        parent=wheel_root,
        origin_three=origin_three,
    )
    # Center spindle locknut + red anodized dust cap on outboard face
    nut_z0 = oz + side * (hw * 0.82)
    nut_z1 = oz + side * (hw * 0.98)
    create_cylinder_between(
        name + "_CenterLocknut",
        (ox, oy, nut_z0),
        (ox, oy, nut_z1),
        0.015,
        mats["steel"],
        segments=6,
        parent=wheel_root,
        origin_three=origin_three,
    )
    create_cylinder_between(
        name + "_HubCap",
        (ox, oy, nut_z1),
        (ox, oy, oz + side * (hw * 1.01)),
        0.010,
        mats["red"],
        segments=12,
        parent=wheel_root,
        origin_three=origin_three,
    )

    # 3 sculpted spokes + 3 perimeter lug bolts
    spoke_z = oz + side * (hw * 0.72)
    for k in range(3):
        ang = (k / 3.0) * math.pi * 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        create_cylinder_between(
            f"{name}_Spoke_{k}",
            (ox + ca * 0.024, oy + sa * 0.024, spoke_z),
            (ox + ca * 0.080, oy + sa * 0.080, oz + side * (hw * 0.84)),
            0.0085,
            mats["alloy"],
            segments=10,
            parent=wheel_root,
            origin_three=origin_three,
        )
        create_cylinder_between(
            f"{name}_LugBolt_{k}",
            (ox + ca * 0.024, oy + sa * 0.024, oz + side * (hw * 0.80)),
            (ox + ca * 0.024, oy + sa * 0.024, oz + side * (hw * 0.93)),
            0.0045,
            mats["steel"],
            segments=6,
            parent=wheel_root,
            origin_three=origin_three,
        )

    # Angled brass/steel valve stem on outboard rim dish
    create_cylinder_between(
        name + "_ValveStem",
        (ox, oy - 0.076, oz + side * (hw * 0.74)),
        (ox, oy - 0.062, oz + side * (hw * 0.90)),
        0.0026,
        mats["steel"],
        segments=8,
        parent=wheel_root,
        origin_three=origin_three,
    )
    return wheel_root


# =============================================================================
# TANGENTIAL TOOTHED DRIVE BELT WITH LONGITUDINAL UVS
# =============================================================================
def build_toothed_drive_belt(
    name: str,
    c1: tuple[float, float],
    r1: float,
    c2: tuple[float, float],
    r2: float,
    z_center: float,
    width_z: float,
    thickness: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    origin_three: tuple[float, float, float],
) -> bpy.types.Object:
    """Builds a closed tangential drive belt loop in XY plane at `z_center` with longitudinal UVs."""
    x1, y1 = c1
    x2, y2 = c2
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    base_ang = math.atan2(dy, dx)
    # External common tangent angle offset
    cos_alpha = max(-0.99, min(0.99, (r1 - r2) / dist))
    alpha = math.acos(cos_alpha)

    # Sample centerline points around c1 (from base_ang + alpha to base_ang + 2*pi - alpha)
    # then around c2 (from base_ang - alpha to base_ang + alpha)
    pts_2d: list[tuple[float, float]] = []
    n_arc1 = 22
    a1_start = base_ang + alpha
    a1_end = base_ang + 2.0 * math.pi - alpha
    for i in range(n_arc1 + 1):
        t = i / n_arc1
        a = a1_start + t * (a1_end - a1_start)
        pts_2d.append((x1 + math.cos(a) * r1, y1 + math.sin(a) * r1))

    n_arc2 = 14
    a2_start = base_ang - alpha
    a2_end = base_ang + alpha
    for i in range(n_arc2 + 1):
        t = i / n_arc2
        a = a2_start + t * (a2_end - a2_start)
        pts_2d.append((x2 + math.cos(a) * r2, y2 + math.sin(a) * r2))

    # Cumulative arc lengths for longitudinal UV u
    n_pts = len(pts_2d)
    cum_s = [0.0]
    for i in range(1, n_pts + 1):
        px0, py0 = pts_2d[i - 1]
        px1, py1 = pts_2d[i % n_pts]
        cum_s.append(cum_s[-1] + math.hypot(px1 - px0, py1 - py0))
    total_len = cum_s[-1] or 1.0

    ox, oy, oz = origin_three
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent

    bm = bmesh.new()
    rings = []
    hw = width_z * 0.5
    ht = thickness * 0.5
    for i in range(n_pts):
        px, py = pts_2d[i]
        px_prev, py_prev = pts_2d[(i - 1) % n_pts]
        px_next, py_next = pts_2d[(i + 1) % n_pts]
        tx, ty = px_next - px_prev, py_next - py_prev
        tl = math.hypot(tx, ty) or 1.0
        # Outward normal in XY (belt runs CCW around c1->c2)
        nx, ny = ty / tl, -tx / tl
        # Check outward direction relative to loop centroid
        cx_mid = 0.5 * (x1 + x2)
        cy_mid = 0.5 * (y1 + y2)
        if (px - cx_mid) * nx + (py - cy_mid) * ny < 0:
            nx, ny = -nx, -ny
        tooth_mod = 0.0018 * (1.0 if i % 2 == 0 else -0.4)
        r_out = ht + 0.002
        r_in = -(ht + tooth_mod)
        corners = [
            (px + nx * r_in, py + ny * r_in, z_center - hw),
            (px + nx * r_out, py + ny * r_out, z_center - hw),
            (px + nx * r_out, py + ny * r_out, z_center + hw),
            (px + nx * r_in, py + ny * r_in, z_center + hw),
        ]
        rings.append([bm.verts.new(t2b(cx - ox, cy - oy, cz - oz)) for (cx, cy, cz) in corners])

    uv_layer = bm.loops.layers.uv.verify()
    for i in range(n_pts):
        j = (i + 1) % n_pts
        u0 = (cum_s[i] / total_len) * 8.0
        u1 = (cum_s[i + 1] / total_len) * 8.0
        r0 = rings[i]
        r1 = rings[j]
        for k in range(4):
            kn = (k + 1) % 4
            f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            f.smooth = False
            v0 = k / 4.0
            v1 = (k + 1) / 4.0
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u0, v1)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u1, v0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    return obj


# =============================================================================
# MAIN MODEL BUILDER
# =============================================================================
def build_otl_superleggero():
    clear_scene()
    scene = bpy.context.scene
    textures = generate_pbr_textures()

    mats = {
        "livery": make_pbr_material(
            "ApexBite_Livery",
            roughness=0.22,
            metalness=0.04,
            albedo_img=textures["kart_livery_albedo"],
            coat_weight=0.85,
            coat_roughness=0.06,
        ),
        "red": make_pbr_material(
            "K1_Crimson_Red",
            rgb=(0.72, 0.055, 0.09),
            roughness=0.24,
            metalness=0.05,
            coat_weight=0.85,
            coat_roughness=0.06,
        ),
        "black": make_pbr_material(
            "OTL_Satin_Black",
            rgb=(0.08, 0.095, 0.11),
            roughness=0.46,
            metalness=0.05,
        ),
        "white": make_pbr_material(
            "K1_Livery_White",
            rgb=(0.93, 0.94, 0.95),
            roughness=0.26,
            metalness=0.02,
            coat_weight=0.75,
            coat_roughness=0.08,
        ),
        "rubber": make_pbr_material(
            "Protex_HDPE_Rubber",
            rgb=(0.085, 0.090, 0.095),
            roughness=0.82,
            metalness=0.0,
        ),
        "tire": make_pbr_material(
            "Tire_Indoor_Slick",
            roughness=0.82,
            metalness=0.0,
            albedo_img=textures["tire_albedo"],
            normal_img=textures["tire_normal"],
            roughness_img=textures["tire_roughness"],
        ),
        "steel": make_pbr_material(
            "Chromoly_Steel",
            rgb=(0.38, 0.41, 0.45),
            roughness=0.26,
            metalness=0.88,
            roughness_img=textures["metal_alloy_roughness"],
        ),
        "alloy": make_pbr_material(
            "Machined_Alloy",
            rgb=(0.70, 0.74, 0.78),
            roughness=0.22,
            metalness=0.92,
            roughness_img=textures["metal_alloy_roughness"],
        ),
        "carbon": make_pbr_material(
            "Molded_Carbon",
            roughness=0.48,
            metalness=0.06,
            albedo_img=textures["kart_carbon_albedo"],
            normal_img=textures["kart_carbon_normal"],
            roughness_img=textures["kart_carbon_roughness"],
            coat_weight=0.45,
            coat_roughness=0.14,
        ),
        "accent": make_pbr_material(
            "Telemetry_Yellow",
            rgb=(0.68, 0.78, 0.02),
            roughness=0.35,
            metalness=0.0,
        ),
        "blueBtn": make_pbr_material(
            "Dash_Blue_Button",
            rgb=(0.15, 0.48, 0.85),
            roughness=0.42,
            metalness=0.0,
        ),
        "orange": make_pbr_material(
            "HV_Cable_Orange",
            rgb=(0.91, 0.41, 0.09),
            roughness=0.44,
            metalness=0.0,
        ),
        "reservoir": make_pbr_material(
            "Brake_Fluid_Reservoir",
            rgb=(0.88, 0.84, 0.62),
            roughness=0.18,
            metalness=0.0,
            alpha=0.58,
        ),
        "brakeLed": make_pbr_material(
            "Kart_Brake_LED_Lens",
            rgb=(0.68, 0.04, 0.04),
            roughness=0.18,
            metalness=0.0,
            emissive_rgb=(0.95, 0.08, 0.04),
            emissive_strength=1.2,
        ),
        "dashScreen": make_pbr_material(
            "Kart_Dash_Display",
            rgb=(0.06, 0.12, 0.13),
            roughness=0.15,
            metalness=0.0,
        ),
        "harness": make_pbr_material("Racing_Harness_Red", rgb=(0.80, 0.08, 0.11), roughness=0.68),
        "suit": make_pbr_material(
            "Driver_Suit_Navy",
            roughness=0.86,
            albedo_img=textures["suit_fabric_albedo"],
            normal_img=textures["suit_fabric_normal"],
            roughness_img=textures["suit_fabric_roughness"],
        ),
        "suitRed": make_pbr_material(
            "Suit_Nomex_Crimson",
            rgb=(0.66, 0.055, 0.095),
            roughness=0.86,
            normal_img=textures["suit_fabric_normal"],
            roughness_img=textures["suit_fabric_roughness"],
        ),
        "suitSlate": make_pbr_material(
            "Suit_Nomex_Slate",
            rgb=(0.18, 0.21, 0.26),
            roughness=0.86,
            normal_img=textures["suit_fabric_normal"],
            roughness_img=textures["suit_fabric_roughness"],
        ),
        "panel": make_pbr_material("Driver_Suit_Slate", rgb=(0.035, 0.045, 0.060), roughness=0.78),
        "glovePad": make_pbr_material("Driver_Glove_Grip", rgb=(0.21, 0.25, 0.28), roughness=0.76),
        "helmet": make_pbr_material(
            "Helmet_Pearl_White",
            roughness=0.16,
            metalness=0.06,
            albedo_img=textures["helmet_livery_albedo"],
            coat_weight=0.90,
            coat_roughness=0.05,
        ),
        "visor": make_pbr_material(
            "Helmet_Iridium_Visor",
            rgb=(0.10, 0.16, 0.22),
            roughness=0.10,
            metalness=0.68,
            coat_weight=0.95,
            coat_roughness=0.04,
        ),
    }

    # Root hierarchy nodes matching ADR-0006 & Ticket #52
    kart_root = make_empty("Kart_Root")
    chassis_static = make_empty("Kart_Chassis_Static", parent=kart_root)
    brake_led_node = make_empty("Kart_Brake_LED", (-0.498, 0.710, 0.0), parent=kart_root)
    steering_col_asm = make_empty("Kart_Steering_Column_Assembly", parent=kart_root)
    steering_upper = make_empty("Kart_Steering_Upper", STEER_MOUNT_POS, parent=steering_col_asm)
    steering_lower = make_empty("Kart_Steering_Lower", PITMAN_PIVOT, parent=steering_col_asm)

    knuckle_l = make_empty("Kart_Knuckle_L", (FRONT_AXLE_X, TIRE_RADIUS, -KINGPIN_HALF_Z), parent=kart_root)
    knuckle_r = make_empty("Kart_Knuckle_R", (FRONT_AXLE_X, TIRE_RADIUS, KINGPIN_HALF_Z), parent=kart_root)
    tie_rod_l = make_empty("Kart_TieRod_L", parent=kart_root)
    tie_rod_r = make_empty("Kart_TieRod_R", parent=kart_root)

    rear_axle_spin = make_empty("Kart_Rear_Axle_Spin", (REAR_AXLE_X, TIRE_RADIUS, 0.0), parent=kart_root)
    motor_pinion_spin = make_empty("Kart_Motor_Pinion_Spin", MOTOR_PINION_POS, parent=kart_root)
    wheel_rl = build_sculpted_wheel(
        "Kart_Wheel_RL",
        (REAR_AXLE_X, TIRE_RADIUS, -REAR_TRACK_HALF_Z),
        (REAR_AXLE_X, TIRE_RADIUS, -REAR_TRACK_HALF_Z),
        -1,
        REAR_TIRE_HALF_WIDTH,
        mats,
        kart_root,
    )
    wheel_rr = build_sculpted_wheel(
        "Kart_Wheel_RR",
        (REAR_AXLE_X, TIRE_RADIUS, REAR_TRACK_HALF_Z),
        (REAR_AXLE_X, TIRE_RADIUS, REAR_TRACK_HALF_Z),
        1,
        REAR_TIRE_HALF_WIDTH,
        mats,
        kart_root,
    )
    wheel_fl = build_sculpted_wheel(
        "Kart_Wheel_FL",
        (FRONT_AXLE_X, TIRE_RADIUS, -FRONT_TRACK_HALF_Z),
        (0.0, 0.0, -SPINDLE_LENGTH),
        -1,
        FRONT_TIRE_HALF_WIDTH,
        mats,
        knuckle_l,
    )
    wheel_fr = build_sculpted_wheel(
        "Kart_Wheel_FR",
        (FRONT_AXLE_X, TIRE_RADIUS, FRONT_TRACK_HALF_Z),
        (0.0, 0.0, SPINDLE_LENGTH),
        1,
        FRONT_TIRE_HALF_WIDTH,
        mats,
        knuckle_r,
    )

    pedal_brake = make_empty(
        "Kart_Pedal_Brake",
        (PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], -PEDAL_PIVOT_POS[2]),
        parent=kart_root,
    )
    pedal_throttle = make_empty(
        "Kart_Pedal_Throttle",
        (PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], PEDAL_PIVOT_POS[2]),
        parent=kart_root,
    )
    brake_pushrod = make_empty("Kart_Brake_Pushrod", (0.405, 0.128, -0.122), parent=kart_root)
    throttle_link = make_empty("Kart_Throttle_Link", (0.422, 0.128, 0.122), parent=kart_root)

    driver_torso = make_empty("Driver_Torso", DRIVER_HIP_PIVOT, parent=kart_root)
    driver_neck_pivot = make_empty("Driver_Neck_Pivot", (
        DRIVER_NECK_PIVOT[0] - DRIVER_HIP_PIVOT[0],
        DRIVER_NECK_PIVOT[1] - DRIVER_HIP_PIVOT[1],
        DRIVER_NECK_PIVOT[2] - DRIVER_HIP_PIVOT[2],
    ), parent=driver_torso)
    driver_head = make_empty("Driver_Head", (0.0, 0.0, 0.0), parent=driver_neck_pivot)
    driver_upper_arm_l = make_empty("Driver_UpperArm_L", (DRIVER_SHOULDER[0], DRIVER_SHOULDER[1], -DRIVER_SHOULDER[2]), parent=kart_root)
    driver_upper_arm_r = make_empty("Driver_UpperArm_R", (DRIVER_SHOULDER[0], DRIVER_SHOULDER[1], DRIVER_SHOULDER[2]), parent=kart_root)
    driver_forearm_l = make_empty("Driver_Forearm_L", parent=kart_root)
    driver_forearm_r = make_empty("Driver_Forearm_R", parent=kart_root)
    driver_glove_l = make_empty("Driver_Glove_L", parent=steering_upper)
    driver_glove_r = make_empty("Driver_Glove_R", parent=steering_upper)
    driver_thigh_l = make_empty("Driver_Thigh_L", (DRIVER_HIP_JOINT[0], DRIVER_HIP_JOINT[1], -DRIVER_HIP_JOINT[2]), parent=kart_root)
    driver_thigh_r = make_empty("Driver_Thigh_R", (DRIVER_HIP_JOINT[0], DRIVER_HIP_JOINT[1], DRIVER_HIP_JOINT[2]), parent=kart_root)
    driver_shin_l = make_empty("Driver_Shin_L", parent=kart_root)
    driver_shin_r = make_empty("Driver_Shin_R", parent=kart_root)
    driver_boot_l = make_empty("Driver_Boot_L", parent=kart_root)
    driver_boot_r = make_empty("Driver_Boot_R", parent=kart_root)

    # =========================================================================
    # 1. CONTINUOUS WRAPAROUND MOLDED PROTEX HDPE BUMPER + CORNER SHOCK MOUNTS
    # Strictly inside |z| <= 0.446, x in [-0.795, 0.875] with >15 mm tire gap
    # =========================================================================
    front_bumper_pts = [
        (0.700, 0.110, -0.092),
        (0.768, 0.118, -0.120),
        (0.808, 0.122, -0.242),
        (0.842, 0.124, -0.180),
        (0.858, 0.125, 0.0),
        (0.842, 0.124, 0.180),
        (0.808, 0.122, 0.242),
        (0.768, 0.118, 0.120),
        (0.700, 0.110, 0.092),
    ]
    create_tube_curve("OTL_Front_Bumper_Main", front_bumper_pts, 0.017, mats["rubber"], parent=chassis_static)
    create_tube_curve(
        "OTL_Front_Bumper_Red_Strip",
        [(0.822, 0.122, -0.236), (0.854, 0.124, -0.180), (0.871, 0.125, 0.0), (0.854, 0.124, 0.180), (0.822, 0.122, 0.236)],
        0.0045,
        mats["red"],
        parent=chassis_static,
    )

    rear_bumper_pts = [
        (-0.660, 0.105, -0.155),
        (-0.718, 0.115, -0.215),
        (-0.742, 0.120, -0.348),
        (-0.770, 0.122, -0.235),
        (-0.778, 0.122, 0.0),
        (-0.770, 0.122, 0.235),
        (-0.742, 0.120, 0.348),
        (-0.718, 0.115, 0.215),
        (-0.660, 0.105, 0.155),
    ]
    create_tube_curve("OTL_Rear_Bumper_Main", rear_bumper_pts, 0.017, mats["rubber"], parent=chassis_static)
    create_tube_curve(
        "OTL_Rear_Bumper_Red_Strip",
        [(-0.785, 0.122, -0.220), (-0.791, 0.122, 0.0), (-0.785, 0.122, 0.220)],
        0.0045,
        mats["red"],
        parent=chassis_static,
    )
    rear_bumper_upper = [
        (-0.640, 0.165, -0.125),
        (-0.715, 0.166, -0.210),
        (-0.740, 0.168, -0.335),
        (-0.768, 0.168, -0.230),
        (-0.776, 0.168, 0.0),
        (-0.768, 0.168, 0.230),
        (-0.740, 0.168, 0.335),
        (-0.715, 0.166, 0.210),
        (-0.640, 0.165, 0.125),
    ]
    create_tube_curve("OTL_Rear_Bumper_Upper", rear_bumper_upper, 0.0125, mats["rubber"], parent=chassis_static)
    for side in (-1, 1):
        create_cylinder_between(
            f"OTL_Rear_Bumper_Post_{side}",
            (-0.768, 0.120, side * 0.225),
            (-0.768, 0.168, side * 0.225),
            0.011,
            mats["rubber"],
            parent=chassis_static,
        )
        # Side Protex wraparound rail + corner elastomer shock-mount blocks
        side_bumper_main = [
            (-0.335, 0.105, side * 0.185),
            (-0.320, 0.115, side * 0.392),
            (-0.100, 0.118, side * 0.415),
            (0.140, 0.118, side * 0.412),
            (0.285, 0.115, side * 0.362),
            (0.305, 0.105, side * 0.160),
        ]
        create_tube_curve(f"OTL_Side_Bumper_Main_{side}", side_bumper_main, 0.016, mats["rubber"], parent=chassis_static)
        create_tube_curve(
            f"OTL_Side_Rub_Strip_{side}",
            [(-0.260, 0.118, side * 0.422), (-0.100, 0.118, side * 0.432), (0.140, 0.118, side * 0.428), (0.220, 0.117, side * 0.402)],
            0.005,
            mats["red"],
            parent=chassis_static,
        )
        # Corner elastomer shock mount blocks (front & rear bumper corners)
        for bx, by, bz in ((0.798, 0.121, side * 0.222), (-0.736, 0.120, side * 0.322)):
            block = [
                superellipse_ring(bx - 0.018, by - 0.022, by + 0.022, bz, 0.020, power_y=0.3, power_z=0.3),
                superellipse_ring(bx + 0.018, by - 0.022, by + 0.022, bz, 0.020, power_y=0.3, power_z=0.3),
            ]
            create_loft_mesh(f"OTL_Elastomer_Mount_{bx:.2f}_{side}", block, mats["black"], subsurf_levels=0, parent=chassis_static)

    # =========================================================================
    # 2. FLOOR PAN, CHROMOLY SPACEFRAME & TILTED KINGPIN C-YOKES (CASTER 10°, KPI 7°)
    # =========================================================================
    floor_sections = [
        superellipse_ring(-0.62, 0.064, 0.080, 0.0, 0.148, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.34, 0.064, 0.080, 0.0, 0.180, power_y=0.35, power_z=0.35),
        superellipse_ring(0.05, 0.064, 0.080, 0.0, 0.180, power_y=0.35, power_z=0.35),
        superellipse_ring(0.32, 0.064, 0.080, 0.0, 0.142, power_y=0.35, power_z=0.35),
        superellipse_ring(0.42, 0.066, 0.082, 0.0, 0.102, power_y=0.35, power_z=0.35),
        superellipse_ring(0.70, 0.070, 0.086, 0.0, 0.092, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Floor_Pan", floor_sections, mats["carbon"], subsurf_levels=1, parent=chassis_static)

    for side in (-1, 1):
        chassis_rail = [
            (-0.680, 0.105, side * 0.155),
            (-0.328, 0.105, side * 0.185),
            (0.260, 0.105, side * 0.160),
            (0.420, 0.106, side * 0.102),
            (0.700, 0.110, side * 0.095),
        ]
        create_tube_curve(f"Chassis_Main_Rail_{side}", chassis_rail, 0.013, mats["red"], parent=chassis_static)

        # Tilted Kingpin axis C-yoke & bolt (caster = 10°, KPI = 7°)
        ka = Vector(kingpin_axis(side))
        kp_center = Vector((FRONT_AXLE_X, TIRE_RADIUS, side * KINGPIN_HALF_Z))
        kp_top = kp_center + ka * 0.036
        kp_bot = kp_center - ka * 0.036
        inward_dir = Vector((0.0, 0.0, -side))
        c_yoke_pts = [
            tuple(kp_top + ka * 0.002),
            tuple(kp_top + inward_dir * 0.020),
            tuple(kp_center + inward_dir * 0.024),
            tuple(kp_bot + inward_dir * 0.020),
            tuple(kp_bot - ka * 0.002),
        ]
        create_tube_curve(f"OTL_Kingpin_C_Yoke_{side}", c_yoke_pts, 0.006, mats["black"], parent=chassis_static)
        create_cylinder_between(
            f"OTL_Kingpin_Bolt_{side}",
            tuple(kp_bot - ka * 0.004),
            tuple(kp_top + ka * 0.004),
            0.005,
            mats["alloy"],
            segments=12,
            parent=chassis_static,
        )
        # Front A-frame outriggers meeting the C-yoke spine cleanly
        yoke_spine = kp_center + inward_dir * 0.022
        create_tube_curve(
            f"OTL_Front_Chassis_Outrigger_{side}",
            [(0.455, 0.106, side * 0.100), (0.505, 0.128, side * 0.136), tuple(yoke_spine)],
            0.0105,
            mats["red"],
            parent=chassis_static,
        )
        create_tube_curve(
            f"OTL_Front_Chassis_Forward_Leg_{side}",
            [(0.635, 0.109, side * 0.095), (0.575, 0.128, side * 0.136), tuple(yoke_spine)],
            0.0095,
            mats["red"],
            parent=chassis_static,
        )

        # Steering support uprights inside Nassau tower
        create_tube_curve(
            f"OTL_Steering_Support_Upright_{side}",
            [(0.320, 0.082, side * 0.038), (0.312, 0.210, side * 0.038), (0.302, 0.330, side * 0.034)],
            0.008,
            mats["steel"],
            parent=chassis_static,
        )
        for x_nerf in (-0.180, 0.150):
            create_tube_curve(
                f"OTL_Sidepod_Nerf_Bar_{side}_{x_nerf:.2f}",
                [(x_nerf, 0.105, side * 0.175), (x_nerf, 0.155, side * 0.215), (x_nerf, 0.168, side * 0.255)],
                0.0085,
                mats["steel"],
                parent=chassis_static,
            )
        create_tube_curve(
            f"OTL_Seat_Support_Strut_{side}",
            [(-0.285, 0.105, side * 0.180), (-0.335, 0.175, side * 0.156), (-0.355, 0.235, side * 0.142)],
            0.0085,
            mats["steel"],
            parent=chassis_static,
        )
        create_tube_curve(
            f"OTL_Rear_Bumper_Stay_{side}",
            [(-0.600, 0.105, side * 0.152), (-0.755, 0.165, side * 0.215)],
            0.0085,
            mats["red"],
            parent=chassis_static,
        )

    for x_cross, z_span in ((-0.60, 0.155), (-0.18, 0.180), (0.24, 0.160), (0.50, 0.098)):
        create_cylinder_between(
            f"Chassis_Crossmember_{x_cross:.2f}",
            (x_cross, 0.105, -z_span),
            (x_cross, 0.105, z_span),
            0.010,
            mats["steel"],
            parent=chassis_static,
        )

    # Hydraulic brake master cylinder + translucent fluid reservoir + braided line + TPS housing
    # Mounted outside the chassis rail at |z| = 0.122, y in [0.108, 0.142] so pedal clevis clears the rail
    master_cyl = [
        superellipse_ring(0.352, 0.108, 0.140, -0.122, 0.015, power_y=0.45, power_z=0.45),
        superellipse_ring(0.402, 0.108, 0.140, -0.122, 0.015, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("OTL_Brake_Master_Cylinder", master_cyl, mats["alloy"], subsurf_levels=0, parent=chassis_static)
    reservoir = [
        oriented_ellipse_ring((0.374, 0.140, -0.122), (0.0, 1.0, 0.0), 0.011, 0.011, n=14),
        oriented_ellipse_ring((0.374, 0.166, -0.122), (0.0, 1.0, 0.0), 0.011, 0.011, n=14),
    ]
    create_loft_mesh("OTL_Brake_Fluid_Reservoir", reservoir, mats["reservoir"], subsurf_levels=0, parent=chassis_static)
    create_tube_curve(
        "OTL_Hydraulic_Brake_Line",
        [
            (0.352, 0.118, -0.124),
            (0.240, 0.108, -0.148),
            (-0.180, 0.105, -0.172),
            (-0.440, 0.130, -0.172),
            (-0.475, 0.228, -0.195),
            (-0.555, 0.260, -0.215),
        ],
        0.0038,
        mats["black"],
        parent=chassis_static,
    )
    tps_box = [
        superellipse_ring(0.362, 0.108, 0.138, 0.122, 0.014, power_y=0.35, power_z=0.35),
        superellipse_ring(0.416, 0.108, 0.138, 0.122, 0.014, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Throttle_Sensor_Box", tps_box, mats["black"], subsurf_levels=0, parent=chassis_static)
    create_cylinder_between(
        "OTL_Pedal_Pivot_Crossbar",
        (0.428, 0.095, -0.098),
        (0.428, 0.095, 0.098),
        0.0075,
        mats["steel"],
        parent=chassis_static,
    )
    # Lower steering column bearing housing seated slightly up the shaft from PITMAN_PIVOT,
    # braced horizontally along y = 0.212 m to the steering support uprights (above pedals & tie rods)
    u_vec_s = Vector(U_JOINT_POS)
    p_vec_s = Vector(PITMAN_PIVOT)
    l_dir_s = (p_vec_s - u_vec_s).normalized()
    bearing_center = p_vec_s - l_dir_s * 0.028
    lower_bearing = [
        oriented_ellipse_ring(tuple(bearing_center - l_dir_s * 0.012), tuple(l_dir_s), 0.020, 0.022, n=14),
        oriented_ellipse_ring(tuple(bearing_center + l_dir_s * 0.012), tuple(l_dir_s), 0.020, 0.022, n=14),
    ]
    create_loft_mesh("OTL_Steering_Lower_Bearing", lower_bearing, mats["alloy"], subsurf_levels=0, parent=chassis_static)
    for side in (-1, 1):
        create_tube_curve(
            f"OTL_Steering_Bearing_Stay_{side}",
            [
                tuple(bearing_center + Vector((0.0, 0.0, side * 0.020))),
                (0.390, 0.212, side * 0.038),
                (0.312, 0.210, side * 0.038),
            ],
            0.007,
            mats["steel"],
            parent=chassis_static,
        )

    # =========================================================================
    # 3. SCULPTED BEVELED NOSE CONE, NASSAU FAIRING & FLUSH UV LIVERY (NO STICKER PLANES!)
    # =========================================================================
    def nose_uv(tx: float, _ty: float, tz: float) -> tuple[float, float]:
        # Front-facing readable livery on the sloped nose cone (tx in [0.485, 0.758])
        u = max(0.02, min(0.98, 0.5 - tz / 0.23))
        v = max(0.65, min(0.995, 0.65 + ((tx - 0.485) / 0.273) * 0.345))
        return (u, v)

    def nassau_uv(_tx: float, _ty: float, _tz: float) -> tuple[float, float]:
        return (0.50, 0.60)

    nose_lower_black = [
        superellipse_ring(0.470, 0.098, 0.118, 0.0, 0.084, power_y=0.4, power_z=0.55),
        superellipse_ring(0.530, 0.100, 0.120, 0.0, 0.092, power_y=0.4, power_z=0.55),
        superellipse_ring(0.585, 0.116, 0.150, 0.0, 0.104, power_y=0.4, power_z=0.55),
        superellipse_ring(0.755, 0.122, 0.150, 0.0, 0.104, power_y=0.4, power_z=0.55),
    ]
    create_loft_mesh("OTL_Nose_Splitter_Base", nose_lower_black, mats["carbon"], subsurf_levels=1, parent=chassis_static)

    # Raised underside tunnel (y_bottom >= 0.228 over steering shaft & Pitman pivot)
    nose_shell = [
        superellipse_ring(0.390, 0.285, 0.335, 0.0, 0.076, power_y=0.25, power_z=0.55),
        superellipse_ring(0.485, 0.218, 0.258, 0.0, 0.086, power_y=0.25, power_z=0.55),
        superellipse_ring(0.545, 0.152, 0.245, 0.0, 0.098, power_y=0.25, power_z=0.55),
        superellipse_ring(0.585, 0.148, 0.239, 0.0, 0.104, power_y=0.25, power_z=0.55),
        superellipse_ring(0.655, 0.148, 0.228, 0.0, 0.103, power_y=0.25, power_z=0.55),
        superellipse_ring(0.679, 0.148, 0.224, 0.0, 0.102, power_y=0.25, power_z=0.55),
        superellipse_ring(0.704, 0.147, 0.219, 0.0, 0.098, power_y=0.25, power_z=0.55),
        superellipse_ring(0.730, 0.146, 0.214, 0.0, 0.091, power_y=0.30, power_z=0.55),
        superellipse_ring(0.748, 0.147, 0.207, 0.0, 0.080, power_y=0.35, power_z=0.55),
        superellipse_ring(0.756, 0.156, 0.194, 0.0, 0.060, power_y=0.45, power_z=0.55),
    ]
    create_loft_mesh(
        "OTL_Nose_Livery_Shell",
        nose_shell,
        mats["livery"],
        subsurf_levels=1,
        parent=chassis_static,
        uv_fn=nose_uv,
    )

    # Arched Nassau fairing sitting cleanly ABOVE the steering shaft & U-joint tunnel
    nassau_fairing = [
        superellipse_ring(0.268, 0.396, 0.452, 0.0, 0.066, power_y=0.35, power_z=0.50),
        superellipse_ring(0.308, 0.355, 0.453, 0.0, 0.074, power_y=0.35, power_z=0.50),
        superellipse_ring(0.390, 0.285, 0.335, 0.0, 0.080, power_y=0.40, power_z=0.52),
        superellipse_ring(0.485, 0.220, 0.254, 0.0, 0.082, power_y=0.35, power_z=0.52),
    ]
    create_loft_mesh(
        "OTL_Nassau_Fairing",
        nassau_fairing,
        mats["livery"],
        subsurf_levels=1,
        parent=chassis_static,
        uv_fn=nassau_uv,
    )

    # Recessed fasteners on nose & Nassau cowl
    for fx, fy, fz in (
        (0.515, 0.246, -0.070), (0.515, 0.246, 0.070),
        (0.690, 0.221, -0.065), (0.690, 0.221, 0.065),
        (0.312, 0.398, -0.048), (0.312, 0.398, 0.048),
    ):
        create_cylinder_between(
            f"OTL_Fastener_{fx:.2f}_{fz:.2f}",
            (fx, fy - 0.004, fz),
            (fx, fy + 0.0025, fz),
            0.0045,
            mats["steel"],
            segments=6,
            parent=chassis_static,
        )

    # Sleek low-profile integrated dash binnacle bezel seated forward of Kart_Dash_Screen at (0.262, 0.483)
    dash_bezel = [
        superellipse_ring(0.265, 0.448, 0.518, 0.0, 0.080, power_y=0.22, power_z=0.22),
        superellipse_ring(0.302, 0.442, 0.512, 0.0, 0.076, power_y=0.22, power_z=0.22),
    ]
    create_loft_mesh("OTL_Dash_Housing", dash_bezel, mats["carbon"], subsurf_levels=0, parent=chassis_static)

    # Dedicated Dash Screen quad + physical blue/yellow buttons at (0.262, 0.483, 0)
    # Level horizontally along Z, tilted upward 0.22 rad toward the driver's eyes
    dash_center = Vector((DASH_BINNACLE_POS[0], DASH_BINNACLE_POS[1], 0.0))
    dash_right = Vector((0.0, 0.0, 1.0))
    dash_up = Vector((math.sin(0.22), math.cos(0.22), 0.0))
    dash_norm = Vector((-math.cos(0.22), math.sin(0.22), 0.0))

    def dash_pt(dx: float, dy: float, dz: float) -> tuple[float, float, float]:
        v = dash_center + dash_right * dx + dash_up * dy + dash_norm * dz
        return (v.x, v.y, v.z)

    screen_mesh = bpy.data.meshes.new("Kart_Dash_Screen")
    screen_obj = bpy.data.objects.new("Kart_Dash_Screen", screen_mesh)
    bpy.context.scene.collection.objects.link(screen_obj)
    screen_obj.parent = chassis_static
    bm_s = bmesh.new()
    hw_s, hh_s = 0.056, 0.025
    svs = [
        bm_s.verts.new(t2b(*dash_pt(-hw_s, -hh_s, 0.005))),
        bm_s.verts.new(t2b(*dash_pt(hw_s, -hh_s, 0.005))),
        bm_s.verts.new(t2b(*dash_pt(hw_s, hh_s, 0.005))),
        bm_s.verts.new(t2b(*dash_pt(-hw_s, hh_s, 0.005))),
    ]
    sf = bm_s.faces.new(svs)
    suv = bm_s.loops.layers.uv.verify()
    sf.loops[0][suv].uv = (0.0, 0.0)
    sf.loops[1][suv].uv = (1.0, 0.0)
    sf.loops[2][suv].uv = (1.0, 1.0)
    sf.loops[3][suv].uv = (0.0, 1.0)
    bm_s.to_mesh(screen_mesh)
    bm_s.free()
    screen_mesh.materials.append(mats["dashScreen"])

    # Physical blue mode button (left) & yellow lap button (right)
    for bx, bmat, bname in ((-0.068, mats["blueBtn"], "Dash_Button_Blue"), (0.068, mats["accent"], "Dash_Button_Yellow")):
        create_cylinder_between(
            bname,
            dash_pt(bx, 0.0, 0.001),
            dash_pt(bx, 0.0, 0.007),
            0.0044,
            bmat,
            segments=12,
            parent=chassis_static,
        )

    # =========================================================================
    # 4. WIDE SCULPTED SIDEPODS WITH BATTERY BAY COVERS, LOUVERS & FLUSH UV LIVERY
    # =========================================================================
    for side in (-1, 1):
        def make_pod_uv(s_sign: int):
            pod_z_profile = (
                (-0.320, 0.285),
                (-0.230, 0.298),
                (-0.020, 0.300),
                (0.175, 0.298),
                (0.255, 0.282),
                (0.302, 0.260),
            )

            def pod_center_z(px: float) -> float:
                if px <= pod_z_profile[0][0]:
                    return pod_z_profile[0][1]
                for idx in range(len(pod_z_profile) - 1):
                    x0, z0 = pod_z_profile[idx]
                    x1, z1 = pod_z_profile[idx + 1]
                    if px <= x1:
                        t = (px - x0) / (x1 - x0)
                        return z0 + (z1 - z0) * t
                return pod_z_profile[-1][1]

            def pod_uv(tx: float, ty: float, tz: float) -> tuple[float, float]:
                u_raw = max(0.02, min(0.98, (tx + 0.32) / 0.62))
                u = (1.0 - u_raw) if s_sign < 0 else u_raw
                # Keep entire inboard cockpit-facing sidepod wall clean solid crimson (zero mirrored badge or sliver)
                z_mid = pod_center_z(tx)
                az = abs(tz)
                if az <= z_mid + 0.004:
                    return (u, 0.50)
                vert = max(0.0, min(1.0, (ty - 0.140) / 0.148))
                v_out = 0.04 + vert * 0.43
                if vert > 0.65 and az < z_mid + 0.032:
                    blend = max(0.0, min(1.0, (z_mid + 0.032 - az) / 0.028))
                    v_out = v_out * (1.0 - blend) + 0.50 * blend
                return (u, max(0.02, min(0.53, v_out)))
            return pod_uv

        pod_rings = [
            superellipse_ring(-0.320, 0.138, 0.238, side * 0.285, 0.032, power_y=0.35, power_z=0.50),
            superellipse_ring(-0.230, 0.138, 0.288, side * 0.298, 0.066, power_y=0.25, power_z=0.50),
            superellipse_ring(-0.020, 0.138, 0.288, side * 0.300, 0.070, power_y=0.25, power_z=0.50),
            superellipse_ring(0.175, 0.138, 0.288, side * 0.298, 0.066, power_y=0.25, power_z=0.50),
            superellipse_ring(0.255, 0.138, 0.252, side * 0.282, 0.046, power_y=0.35, power_z=0.50),
            superellipse_ring(0.302, 0.140, 0.205, side * 0.260, 0.024, power_y=0.35, power_z=0.50),
        ]
        create_loft_mesh(
            f"OTL_Sidepod_Livery_{side}",
            pod_rings,
            mats["livery"],
            subsurf_levels=1,
            parent=chassis_static,
            uv_fn=make_pod_uv(side),
        )
        # Molded carbon battery bay cover inset on upper deck
        battery_cover = [
            superellipse_ring(-0.245, 0.278, 0.292, side * 0.236, 0.026, power_y=0.3, power_z=0.3),
            superellipse_ring(-0.085, 0.278, 0.292, side * 0.236, 0.026, power_y=0.3, power_z=0.3),
        ]
        create_loft_mesh(f"OTL_Battery_Cover_{side}", battery_cover, mats["carbon"], subsurf_levels=0, parent=chassis_static)
        # Cooling louver slats along rear sidepod flank (behind the APEX BITE 07 badge)
        for lv_idx in range(4):
            lx = -0.265 + lv_idx * 0.022
            louver = [
                superellipse_ring(lx - 0.006, 0.178, 0.222, side * 0.358, 0.005, power_y=0.3, power_z=0.3),
                superellipse_ring(lx + 0.006, 0.184, 0.228, side * 0.358, 0.005, power_y=0.3, power_z=0.3),
            ]
            create_loft_mesh(f"OTL_Sidepod_Louver_{side}_{lv_idx}", louver, mats["black"], subsurf_levels=0, parent=chassis_static)

        # Routed orange HV battery-to-inverter cable anchored flush into subsurfed bulkhead faces
        create_tube_curve(
            f"OTL_HV_Cable_{side}",
            [
                (-0.270, 0.188, side * 0.285),
                (-0.298, 0.188, side * 0.280),
                (-0.348, 0.194, side * 0.215),
                (-0.398, 0.208, side * 0.148),
                (-0.440, 0.220, side * 0.106),
                (-0.472, 0.222, side * 0.092),
            ],
            0.0065,
            mats["orange"],
            parent=chassis_static,
        )
        create_cylinder_between(
            f"OTL_HV_Grommet_Pod_{side}",
            (-0.290, 0.188, side * 0.282),
            (-0.305, 0.189, side * 0.274),
            0.011,
            mats["rubber"],
            segments=12,
            parent=chassis_static,
        )
        create_cylinder_between(
            f"OTL_HV_Grommet_Shroud_{side}",
            (-0.432, 0.218, side * 0.114),
            (-0.448, 0.221, side * 0.100),
            0.011,
            mats["rubber"],
            segments=12,
            parent=chassis_static,
        )

    # =========================================================================
    # 5. RECLINED BUCKET SEAT, REAR ROLL HOOP (0.862 m), HEADREST & BRAKE LED
    # =========================================================================
    seat_rows = [
        (0.02, 0.122, 0.150, 0.042, 0.014),
        (-0.11, 0.115, 0.152, 0.058, 0.014),
        (-0.24, 0.142, 0.152, 0.062, 0.014),
        (-0.34, 0.245, 0.142, 0.038, 0.014),
        (-0.405, 0.375, 0.122, 0.012, 0.014),
        (-0.452, 0.485, 0.108, 0.006, 0.014),
        (-0.468, 0.545, 0.088, 0.004, 0.014),
    ]
    seat_rings = []
    for (sx, sy, sw, sbh, sth) in seat_rows:
        ring = []
        n_u = 12
        for j in range(n_u + 1):
            u = (j / n_u) * 2.0 - 1.0
            edge = abs(u) ** 2.6
            ring.append((sx + edge * sbh * 0.40, sy + edge * sbh, u * sw))
        for j in range(n_u, -1, -1):
            u = (j / n_u) * 2.0 - 1.0
            edge = abs(u) ** 2.6
            ring.append((sx + edge * sbh * 0.40 - sth * 0.75, sy + edge * sbh - sth, u * (sw + sth * 0.35)))
        seat_rings.append(ring)
    create_loft_mesh("OTL_Reclined_Bucket_Seat", seat_rings, mats["carbon"], subsurf_levels=1, parent=chassis_static)

    roll_hoop_pts = [
        (-0.478, 0.240, -0.125),
        (-0.482, 0.540, -0.128),
        (-0.485, 0.780, -0.118),
        (-0.485, 0.858, -0.058),
        (-0.485, 0.862, 0.0),
        (-0.485, 0.858, 0.058),
        (-0.485, 0.780, 0.118),
        (-0.482, 0.540, 0.128),
        (-0.478, 0.240, 0.125),
    ]
    create_tube_curve("OTL_Roll_Hoop_Main", roll_hoop_pts, 0.014, mats["black"], parent=chassis_static)
    create_cylinder_between(
        "OTL_Roll_Hoop_Crossbar",
        (-0.484, 0.710, -0.122),
        (-0.484, 0.710, 0.122),
        0.012,
        mats["black"],
        parent=chassis_static,
    )
    for side in (-1, 1):
        create_tube_curve(
            f"OTL_Roll_Hoop_Rear_Brace_{side}",
            [(-0.485, 0.740, side * 0.115), (-0.560, 0.500, side * 0.112), (-0.625, 0.240, side * 0.108)],
            0.0115,
            mats["black"],
            parent=chassis_static,
        )
    headrest_rings = [
        superellipse_ring(-0.482, 0.635, 0.785, 0.0, 0.074, power_y=0.35, power_z=0.45),
        superellipse_ring(-0.454, 0.635, 0.785, 0.0, 0.074, power_y=0.35, power_z=0.45),
    ]
    create_loft_mesh("OTL_Headrest_Pad", headrest_rings, mats["rubber"], subsurf_levels=0, parent=chassis_static)

    # Rear LED housing on roll hoop crossbar + separate emissive Kart_Brake_LED lens
    led_housing = [
        superellipse_ring(-0.506, 0.692, 0.728, 0.0, 0.044, power_y=0.3, power_z=0.3),
        superellipse_ring(-0.486, 0.692, 0.728, 0.0, 0.044, power_y=0.3, power_z=0.3),
    ]
    create_loft_mesh("OTL_Brake_LED_Housing", led_housing, mats["black"], subsurf_levels=0, parent=chassis_static)
    led_lens = [
        superellipse_ring(-0.512, 0.698, 0.722, 0.0, 0.036, power_y=0.3, power_z=0.3),
        superellipse_ring(-0.506, 0.698, 0.722, 0.0, 0.036, power_y=0.3, power_z=0.3),
    ]
    create_loft_mesh(
        "Kart_Brake_LED_Lens",
        led_lens,
        mats["brakeLed"],
        subsurf_levels=0,
        parent=brake_led_node,
        origin_three=(-0.498, 0.710, 0.0),
    )

    # =========================================================================
    # 6. REAR POWERTRAIN STATIC HOUSING, CALIPER, BEARING CASSETTES & SPINNING ASSEMBLIES
    # =========================================================================
    shroud_rings = [
        superellipse_ring(-0.675, 0.178, 0.295, 0.0, 0.132, power_y=0.45, power_z=0.50),
        superellipse_ring(-0.600, 0.178, 0.305, 0.0, 0.146, power_y=0.45, power_z=0.50),
        superellipse_ring(-0.500, 0.178, 0.302, 0.0, 0.134, power_y=0.45, power_z=0.50),
        superellipse_ring(-0.420, 0.178, 0.285, 0.0, 0.126, power_y=0.45, power_z=0.50),
    ]
    create_loft_mesh("OTL_Rear_Powertrain_Shroud", shroud_rings, mats["black"], subsurf_levels=1, parent=chassis_static)
    shroud_crest = [
        superellipse_ring(-0.650, 0.304, 0.342, 0.0, 0.088, power_y=0.45, power_z=0.50),
        superellipse_ring(-0.575, 0.305, 0.352, 0.0, 0.098, power_y=0.45, power_z=0.50),
        superellipse_ring(-0.485, 0.304, 0.340, 0.0, 0.088, power_y=0.45, power_z=0.50),
    ]
    create_loft_mesh("OTL_Rear_Shroud_Red_Crest", shroud_crest, mats["red"], subsurf_levels=1, parent=chassis_static)

    for side in (-1, 1):
        hanger_rings = [
            superellipse_ring(-0.552, 0.102, 0.178, side * 0.162, 0.010, power_y=0.35, power_z=0.35),
            superellipse_ring(-0.488, 0.102, 0.178, side * 0.162, 0.010, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(f"OTL_Rear_Bearing_Hanger_{side}", hanger_rings, mats["black"], subsurf_levels=0, parent=chassis_static)
        cassette_rings = [
            oriented_ellipse_ring((REAR_AXLE_X, TIRE_RADIUS, side * 0.152), (0.0, 0.0, 1.0), 0.030, 0.030, n=16),
            oriented_ellipse_ring((REAR_AXLE_X, TIRE_RADIUS, side * 0.172), (0.0, 0.0, 1.0), 0.030, 0.030, n=16),
        ]
        create_loft_mesh(f"OTL_Rear_Bearing_Cassette_{side}", cassette_rings, mats["alloy"], subsurf_levels=0, parent=chassis_static)

    # Twin-piston red rear brake caliper straddling rotor (gap at z = -0.215 +- 0.008 m)
    for cz0, cz1 in ((-0.238, -0.223), (-0.207, -0.192)):
        pad_body = [
            superellipse_ring(-0.588, 0.182, 0.242, 0.5 * (cz0 + cz1), 0.5 * (cz1 - cz0), power_y=0.35, power_z=0.35),
            superellipse_ring(-0.532, 0.182, 0.242, 0.5 * (cz0 + cz1), 0.5 * (cz1 - cz0), power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(f"OTL_Rear_Brake_Caliper_Half_{cz0:.3f}", pad_body, mats["red"], subsurf_levels=0, parent=chassis_static)
    bridge = [
        superellipse_ring(-0.582, 0.242, 0.258, -0.215, 0.023, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.538, 0.242, 0.258, -0.215, 0.023, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Rear_Brake_Caliper_Bridge", bridge, mats["red"], subsurf_levels=0, parent=chassis_static)
    create_cylinder_between(
        "OTL_Brake_Caliper_Bracket",
        (-0.490, 0.178, -0.165),
        (-0.535, 0.242, -0.198),
        0.0065,
        mats["alloy"],
        parent=chassis_static,
    )

    # Finned aluminum motor housing + E-stop mushroom switch
    for fin_idx in range(5):
        fz = -0.064 + fin_idx * 0.032
        fin_rings = [
            superellipse_ring(-0.684, 0.168, 0.268, fz, 0.0035, power_y=0.25, power_z=0.25),
            superellipse_ring(-0.662, 0.168, 0.268, fz, 0.0035, power_y=0.25, power_z=0.25),
        ]
        create_loft_mesh(f"OTL_Motor_Cooling_Fin_{fin_idx}", fin_rings, mats["alloy"], subsurf_levels=0, parent=chassis_static)

    create_cylinder_between(
        "OTL_EStop_Collar",
        (-0.635, 0.296, 0.0),
        (-0.635, 0.312, 0.0),
        0.018,
        mats["accent"],
        segments=14,
        parent=chassis_static,
    )
    create_cylinder_between(
        "OTL_EStop_Button",
        (-0.635, 0.312, 0.0),
        (-0.635, 0.328, 0.0),
        0.015,
        mats["red"],
        segments=14,
        parent=chassis_static,
    )

    # Kart_Rear_Axle_Spin: live axle + keyway collars + ventilated rotor + toothed sprocket
    axle_origin = (REAR_AXLE_X, TIRE_RADIUS, 0.0)
    create_cylinder_between(
        "OTL_Rear_Live_Axle",
        (REAR_AXLE_X, TIRE_RADIUS, -REAR_TRACK_HALF_Z),
        (REAR_AXLE_X, TIRE_RADIUS, REAR_TRACK_HALF_Z),
        0.0155,
        mats["steel"],
        segments=20,
        parent=rear_axle_spin,
        origin_three=axle_origin,
    )
    for collar_z in (-0.186, -0.138, 0.138, 0.186):
        create_cylinder_between(
            f"OTL_Axle_Collar_{collar_z:.3f}",
            (REAR_AXLE_X, TIRE_RADIUS, collar_z - 0.006),
            (REAR_AXLE_X, TIRE_RADIUS, collar_z + 0.006),
            0.022,
            mats["red"],
            segments=16,
            parent=rear_axle_spin,
            origin_three=axle_origin,
        )
    # Cross-drilled ventilated brake rotor at z = -0.215
    create_cylinder_between(
        "OTL_Brake_Rotor_Disc",
        (REAR_AXLE_X, TIRE_RADIUS, -0.219),
        (REAR_AXLE_X, TIRE_RADIUS, -0.211),
        0.095,
        mats["alloy"],
        segments=28,
        parent=rear_axle_spin,
        origin_three=axle_origin,
    )
    create_cylinder_between(
        "OTL_Brake_Rotor_Bell",
        (REAR_AXLE_X, TIRE_RADIUS, -0.223),
        (REAR_AXLE_X, TIRE_RADIUS, -0.207),
        0.048,
        mats["black"],
        segments=20,
        parent=rear_axle_spin,
        origin_three=axle_origin,
    )
    for b_idx in range(6):
        ang = (b_idx / 6.0) * math.pi * 2.0
        bx = REAR_AXLE_X + math.cos(ang) * 0.072
        by = TIRE_RADIUS + math.sin(ang) * 0.072
        create_cylinder_between(
            f"OTL_Rotor_Slot_{b_idx}",
            (bx, by, -0.220),
            (bx, by, -0.210),
            0.005,
            mats["black"],
            segments=8,
            parent=rear_axle_spin,
            origin_three=axle_origin,
        )

    # Rear toothed sprocket at z = +0.210
    create_cylinder_between(
        "OTL_Rear_Sprocket_Disc",
        (REAR_AXLE_X, TIRE_RADIUS, 0.202),
        (REAR_AXLE_X, TIRE_RADIUS, 0.218),
        REAR_SPROCKET_RADIUS - 0.003,
        mats["alloy"],
        segments=28,
        parent=rear_axle_spin,
        origin_three=axle_origin,
    )
    for tz in (0.200, 0.220):
        create_cylinder_between(
            f"OTL_Rear_Sprocket_Flange_{tz:.3f}",
            (REAR_AXLE_X, TIRE_RADIUS, tz - 0.0015),
            (REAR_AXLE_X, TIRE_RADIUS, tz + 0.0015),
            REAR_SPROCKET_RADIUS + 0.002,
            mats["black"],
            segments=28,
            parent=rear_axle_spin,
            origin_three=axle_origin,
        )
    for t_idx in range(18):
        ang = (t_idx / 18.0) * math.pi * 2.0
        tx = REAR_AXLE_X + math.cos(ang) * (REAR_SPROCKET_RADIUS - 0.001)
        ty = TIRE_RADIUS + math.sin(ang) * (REAR_SPROCKET_RADIUS - 0.001)
        create_cylinder_between(
            f"OTL_Rear_Sprocket_Tooth_{t_idx}",
            (tx, ty, 0.202),
            (tx, ty, 0.218),
            0.0035,
            mats["steel"],
            segments=6,
            parent=rear_axle_spin,
            origin_three=axle_origin,
        )

    # Kart_Motor_Pinion_Spin + Motor output shaft
    create_cylinder_between(
        "OTL_Motor_Output_Shaft",
        (MOTOR_PINION_POS[0], MOTOR_PINION_POS[1], 0.145),
        (MOTOR_PINION_POS[0], MOTOR_PINION_POS[1], 0.220),
        0.011,
        mats["steel"],
        segments=14,
        parent=motor_pinion_spin,
        origin_three=MOTOR_PINION_POS,
    )
    create_cylinder_between(
        "OTL_Motor_Pinion_Gear",
        (MOTOR_PINION_POS[0], MOTOR_PINION_POS[1], 0.201),
        (MOTOR_PINION_POS[0], MOTOR_PINION_POS[1], 0.219),
        MOTOR_PINION_RADIUS - 0.001,
        mats["alloy"],
        segments=16,
        parent=motor_pinion_spin,
        origin_three=MOTOR_PINION_POS,
    )
    for t_idx in range(10):
        ang = (t_idx / 10.0) * math.pi * 2.0
        px = MOTOR_PINION_POS[0] + math.cos(ang) * (MOTOR_PINION_RADIUS - 0.001)
        py = MOTOR_PINION_POS[1] + math.sin(ang) * (MOTOR_PINION_RADIUS - 0.001)
        create_cylinder_between(
            f"OTL_Pinion_Tooth_{t_idx}",
            (px, py, 0.201),
            (px, py, 0.219),
            0.003,
            mats["steel"],
            segments=6,
            parent=motor_pinion_spin,
            origin_three=MOTOR_PINION_POS,
        )

    # Kart_Drive_Belt: tangential toothed belt with longitudinal UVs
    build_toothed_drive_belt(
        "Kart_Drive_Belt",
        (REAR_AXLE_X, TIRE_RADIUS),
        REAR_SPROCKET_RADIUS + 0.003,
        (MOTOR_PINION_POS[0], MOTOR_PINION_POS[1]),
        MOTOR_PINION_RADIUS + 0.003,
        0.210,
        0.015,
        0.006,
        mats["rubber"],
        kart_root,
        (0.0, 0.0, 0.0),
    )

    # =========================================================================
    # 7. STEERING COLUMN ASSEMBLY (F1 YOKE + MARKER + SHAFTS + U-JOINT + PITMAN ARM)
    # =========================================================================
    cm_s, sm_s = math.cos(STEER_MOUNT_ROT_Z), math.sin(STEER_MOUNT_ROT_Z)

    def upper_to_world(lx: float, ly: float, lz: float) -> tuple[float, float, float]:
        return (
            STEER_MOUNT_POS[0] + lx * cm_s - ly * sm_s,
            STEER_MOUNT_POS[1] + lx * sm_s + ly * cm_s,
            STEER_MOUNT_POS[2] + lz,
        )

    f1_rim_pts = []
    for i in range(36):
        ang = (i / 36) * math.pi * 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        y_local = ca * 0.088
        if y_local < -0.070:
            y_local = -0.070 + (y_local + 0.070) * 0.22
        z_local = sa * (0.105 + 0.004 * (abs(sa) ** 3))
        f1_rim_pts.append(upper_to_world(0.0, y_local, z_local))
    create_tube_curve(
        "Kart_F1_Wheel_Rim",
        f1_rim_pts,
        0.0135,
        mats["rubber"],
        closed=True,
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )

    # Bright yellow 12-o'clock top center marker band (visible in Helmet Cam y in [640, 775])
    marker_pts = [
        upper_to_world(0.0, math.cos(-0.18 + (i / 10) * 0.36) * 0.088, math.sin(-0.18 + (i / 10) * 0.36) * 0.105)
        for i in range(11)
    ]
    create_tube_curve(
        "Kart_F1_Wheel_Yellow_Marker",
        marker_pts,
        0.0165,
        mats["accent"],
        closed=False,
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )

    # Carbon center face plate + rotary dials + hub boss + upper shaft + U-joint fork
    hub_plate = [
        oriented_ellipse_ring(upper_to_world(-0.007, 0.0, 0.0), (cm_s, sm_s, 0.0), 0.028, 0.036, n=16),
        oriented_ellipse_ring(upper_to_world(0.007, 0.0, 0.0), (cm_s, sm_s, 0.0), 0.028, 0.036, n=16),
    ]
    create_loft_mesh("Kart_F1_Wheel_Hub", hub_plate, mats["carbon"], subsurf_levels=0, parent=steering_upper, origin_three=STEER_MOUNT_POS)
    for dz_dial, dmat in ((-0.018, mats["red"]), (0.018, mats["blueBtn"])):
        create_cylinder_between(
            f"Kart_Wheel_Dial_{dz_dial:.3f}",
            upper_to_world(-0.008, -0.010, dz_dial),
            upper_to_world(-0.012, -0.010, dz_dial),
            0.0055,
            dmat,
            segments=12,
            parent=steering_upper,
            origin_three=STEER_MOUNT_POS,
        )
    create_tube_curve(
        "Kart_F1_Wheel_Cross_Spoke",
        [upper_to_world(0.0, -0.005, -0.098), upper_to_world(0.0, 0.0, 0.0), upper_to_world(0.0, -0.005, 0.098)],
        0.0085,
        mats["alloy"],
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )
    create_tube_curve(
        "Kart_F1_Wheel_Bottom_Spoke",
        [upper_to_world(0.0, 0.0, 0.0), upper_to_world(0.0, -0.068, 0.0)],
        0.008,
        mats["alloy"],
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )
    create_cylinder_between(
        "Kart_Steering_Hub_Boss",
        upper_to_world(0.004, 0.0, 0.0),
        upper_to_world(0.032, 0.0, 0.0),
        0.018,
        mats["black"],
        segments=16,
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )
    create_cylinder_between(
        "Kart_Steering_Upper_Shaft",
        upper_to_world(0.028, 0.0, 0.0),
        upper_to_world(UPPER_SHAFT_LEN - 0.010, 0.0, 0.0),
        0.011,
        mats["steel"],
        segments=14,
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )
    # U-joint input coupler + central Cardan spider sphere at U_JOINT_POS
    create_cylinder_between(
        "Kart_UJoint_Upper_Coupler",
        upper_to_world(UPPER_SHAFT_LEN - 0.012, 0.0, 0.0),
        U_JOINT_POS,
        0.015,
        mats["alloy"],
        segments=14,
        parent=steering_upper,
        origin_three=STEER_MOUNT_POS,
    )

    # Lower steering shaft + U-joint lower coupler + welded Pitman arm on steering_lower
    u_vec = Vector(U_JOINT_POS)
    p_vec = Vector(PITMAN_PIVOT)
    lower_dir = (p_vec - u_vec).normalized()
    lower_start = u_vec + lower_dir * 0.016  # 16 mm from U-joint center to avoid overlap with upper coupler
    create_cylinder_between(
        "Kart_UJoint_Lower_Coupler",
        tuple(lower_start),
        tuple(lower_start + lower_dir * 0.018),
        0.0145,
        mats["alloy"],
        segments=14,
        parent=steering_lower,
        origin_three=PITMAN_PIVOT,
    )
    create_cylinder_between(
        "Kart_Steering_Lower_Shaft",
        tuple(lower_start + lower_dir * 0.016),
        tuple(p_vec + lower_dir * 0.018),
        0.011,
        mats["steel"],
        segments=14,
        parent=steering_lower,
        origin_three=PITMAN_PIVOT,
    )
    # Welded Pitman arm collar + dual ears descending to PITMAN_BALL_LOCAL
    create_cylinder_between(
        "Kart_Pitman_Collar",
        tuple(p_vec - lower_dir * 0.012),
        tuple(p_vec + lower_dir * 0.012),
        0.015,
        mats["alloy"],
        segments=14,
        parent=steering_lower,
        origin_three=PITMAN_PIVOT,
    )
    for side in (-1, 1):
        pb = (
            PITMAN_PIVOT[0] + PITMAN_BALL_LOCAL[0],
            PITMAN_PIVOT[1] + PITMAN_BALL_LOCAL[1],
            PITMAN_PIVOT[2] + side * PITMAN_BALL_LOCAL[2],
        )
        # Pitman arm terminates at a clevis eye 19 mm rearward (-X) of the Heim ball so it never swings into the tie rod
        pb_arm_eye = (pb[0] - 0.019, pb[1], pb[2])
        create_cylinder_between(
            f"Kart_Pitman_Arm_{side}",
            PITMAN_PIVOT,
            pb_arm_eye,
            0.0055,
            mats["alloy"],
            segments=12,
            parent=steering_lower,
            origin_three=PITMAN_PIVOT,
        )
        create_cylinder_between(
            f"Kart_Pitman_Ball_Stud_{side}",
            (pb[0] - 0.019, pb[1], pb[2]),
            (pb[0] + 0.004, pb[1], pb[2]),
            0.0042,
            mats["steel"],
            segments=10,
            parent=steering_lower,
            origin_three=PITMAN_PIVOT,
        )

    # =========================================================================
    # 8. TILTED KINGPIN KNUCKLES & FIXED-LENGTH TIE RODS
    # =========================================================================
    for side, k_node, tr_node in ((-1, knuckle_l, tie_rod_l), (1, knuckle_r, tie_rod_r)):
        k_origin = (FRONT_AXLE_X, TIRE_RADIUS, side * KINGPIN_HALF_Z)
        ka = Vector(kingpin_axis(side))
        kp_v = Vector(k_origin)
        create_cylinder_between(
            f"Kart_Knuckle_Barrel_{side}",
            tuple(kp_v - ka * 0.027),
            tuple(kp_v + ka * 0.027),
            0.012,
            mats["alloy"],
            segments=14,
            parent=k_node,
            origin_three=k_origin,
        )
        create_cylinder_between(
            f"Kart_Knuckle_Stub_Axle_{side}",
            (k_origin[0], k_origin[1], k_origin[2] + side * 0.013),
            (k_origin[0], k_origin[1], k_origin[2] + side * (SPINDLE_LENGTH + 0.010)),
            0.0135,
            mats["steel"],
            segments=16,
            parent=k_node,
            origin_three=k_origin,
        )
        kb = (
            k_origin[0] + KNUCKLE_ARM_BALL_LOCAL[0],
            k_origin[1] + KNUCKLE_ARM_BALL_LOCAL[1],
            k_origin[2] + side * KNUCKLE_ARM_BALL_LOCAL[2],
        )
        arm_root = tuple(kp_v + ka * 0.020 + Vector((-0.014, 0.0, 0.0)))
        kb_arm_eye = (kb[0], kb[1] - 0.018, kb[2])
        create_cylinder_between(
            f"Kart_Knuckle_Steering_Arm_{side}",
            arm_root,
            kb_arm_eye,
            0.0055,
            mats["alloy"],
            segments=12,
            parent=k_node,
            origin_three=k_origin,
        )
        create_cylinder_between(
            f"Kart_Knuckle_Ball_Stud_{side}",
            (kb[0], kb[1] - 0.019, kb[2]),
            (kb[0], kb[1] + 0.004, kb[2]),
            0.0042,
            mats["steel"],
            segments=10,
            parent=k_node,
            origin_three=k_origin,
        )

        # Tie Rod: centered at (0,0,0), oriented strictly along local +Z from -rod_len/2 to +rod_len/2
        pb_world = Vector((
            PITMAN_PIVOT[0] + PITMAN_BALL_LOCAL[0],
            PITMAN_PIVOT[1] + PITMAN_BALL_LOCAL[1],
            PITMAN_PIVOT[2] + side * PITMAN_BALL_LOCAL[2],
        ))
        kb_world = Vector(kb)
        rod_len = (kb_world - pb_world).length
        half_len = 0.5 * rod_len
        tr_origin = tuple(0.5 * (pb_world + kb_world))
        tr_node.location = t2b(*tr_origin)
        # Orient tr_node at rest so local +Z points along (kb_world - pb_world)
        dir_three = (kb_world - pb_world).normalized()
        dir_blender = Vector((dir_three.x, -dir_three.z, dir_three.y))
        z_blender = Vector((0.0, -1.0, 0.0))  # Three.js +Z = Blender -Y
        rot_q = z_blender.rotation_difference(dir_blender)
        tr_node.rotation_mode = "QUATERNION"
        tr_node.rotation_quaternion = rot_q

        create_cylinder_between(
            f"Kart_TieRod_Shaft_{side}",
            (0.0, 0.0, -(half_len - 0.012)),
            (0.0, 0.0, half_len - 0.012),
            0.0048,
            mats["alloy"],
            segments=10,
            parent=tr_node,
            origin_three=(0.0, 0.0, 0.0),
        )
        for end_s in (-1, 1):
            create_cylinder_between(
                f"Kart_TieRod_JamNut_{side}_{end_s}",
                (0.0, 0.0, end_s * (half_len - 0.025)),
                (0.0, 0.0, end_s * (half_len - 0.015)),
                0.0072,
                mats["red"],
                segments=6,
                parent=tr_node,
                origin_three=(0.0, 0.0, 0.0),
            )
            # Spherical Heim joint collar centered around ball stud (X-axis at Pitman, Y-axis at Knuckle)
            if end_s < 0:
                create_cylinder_between(
                    f"Kart_TieRod_Heim_{side}_{end_s}",
                    (-0.004, 0.0, end_s * half_len),
                    (0.004, 0.0, end_s * half_len),
                    0.0085,
                    mats["steel"],
                    segments=14,
                    parent=tr_node,
                    origin_three=(0.0, 0.0, 0.0),
                )
            else:
                create_cylinder_between(
                    f"Kart_TieRod_Heim_{side}_{end_s}",
                    (0.0, -0.004, end_s * half_len),
                    (0.0, 0.004, end_s * half_len),
                    0.0085,
                    mats["steel"],
                    segments=14,
                    parent=tr_node,
                    origin_three=(0.0, 0.0, 0.0),
                )

    # =========================================================================
    # 9. FOOTWELL PEDALS, BRAKE PUSHROD & THROTTLE LINKAGE
    # =========================================================================
    for side, p_node in ((-1, pedal_brake), (1, pedal_throttle)):
        p_origin = (PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], side * PEDAL_PIVOT_POS[2])
        create_cylinder_between(
            f"Kart_Pedal_Hinge_{side}",
            (p_origin[0], p_origin[1], p_origin[2] - 0.014),
            (p_origin[0], p_origin[1], p_origin[2] + 0.014),
            0.0095,
            mats["steel"],
            segments=12,
            parent=p_node,
            origin_three=p_origin,
        )
        create_cylinder_between(
            f"Kart_Pedal_Arm_{side}",
            (p_origin[0], p_origin[1] + 0.011, p_origin[2]),
            (p_origin[0] - 0.008, p_origin[1] + 0.088, p_origin[2]),
            0.006,
            mats["alloy"],
            segments=10,
            parent=p_node,
            origin_three=p_origin,
        )
        pad_rings = [
            superellipse_ring(p_origin[0] - 0.012, p_origin[1] + 0.032, p_origin[1] + 0.096, p_origin[2], 0.020, power_y=0.35, power_z=0.35),
            superellipse_ring(p_origin[0] - 0.006, p_origin[1] + 0.032, p_origin[1] + 0.096, p_origin[2], 0.020, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(f"Kart_Pedal_Plate_{side}", pad_rings, mats["alloy"], subsurf_levels=0, parent=p_node, origin_three=p_origin)
        grip_rings = [
            superellipse_ring(p_origin[0] - 0.015, p_origin[1] + 0.062, p_origin[1] + 0.090, p_origin[2], 0.018, power_y=0.35, power_z=0.35),
            superellipse_ring(p_origin[0] - 0.012, p_origin[1] + 0.062, p_origin[1] + 0.090, p_origin[2], 0.018, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(
            f"Kart_Pedal_Grip_{side}",
            grip_rings,
            mats["red" if side < 0 else "accent"],
            subsurf_levels=0,
            parent=p_node,
            origin_three=p_origin,
        )
        # Clevis ear extending outward to z = side * 0.122 above chassis rail for pushrod / throttle link
        clevis_pt = (p_origin[0] + BRAKE_CLEVIS_LOCAL[0], p_origin[1] + BRAKE_CLEVIS_LOCAL[1], side * 0.122)
        create_cylinder_between(
            f"Kart_Pedal_Clevis_{side}",
            (p_origin[0], p_origin[1] + BRAKE_CLEVIS_LOCAL[1], p_origin[2]),
            clevis_pt,
            0.0045,
            mats["steel"],
            segments=8,
            parent=p_node,
            origin_three=p_origin,
        )

    # Brake pushrod (origin at midpoint between clevis and master bore, oriented along +Z)
    b_clevis = Vector((PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1] + BRAKE_CLEVIS_LOCAL[1], -0.122))
    b_bore = Vector(BRAKE_MASTER_BORE)
    b_len = (b_clevis - b_bore).length
    brake_pushrod.location = t2b(*tuple(0.5 * (b_clevis + b_bore)))
    b_dir_three = (b_clevis - b_bore).normalized()
    b_dir_bl = Vector((b_dir_three.x, -b_dir_three.z, b_dir_three.y))
    brake_pushrod.rotation_mode = "QUATERNION"
    brake_pushrod.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(b_dir_bl)
    create_cylinder_between(
        "Kart_Brake_Pushrod_Shaft",
        (0.0, 0.0, -0.5 * b_len),
        (0.0, 0.0, 0.5 * b_len),
        0.004,
        mats["steel"],
        segments=10,
        parent=brake_pushrod,
        origin_three=(0.0, 0.0, 0.0),
    )

    # Throttle linkage rod (connecting throttle pedal clevis to TPS sensor pivot)
    t_clevis = Vector((PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1] + THROTTLE_CLEVIS_LOCAL[1], 0.122))
    t_tps = Vector(THROTTLE_TPS_PIVOT)
    t_len = (t_clevis - t_tps).length
    throttle_link.location = t2b(*tuple(0.5 * (t_clevis + t_tps)))
    t_dir_three = (t_clevis - t_tps).normalized()
    t_dir_bl = Vector((t_dir_three.x, -t_dir_three.z, t_dir_three.y))
    throttle_link.rotation_mode = "QUATERNION"
    throttle_link.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(t_dir_bl)
    create_cylinder_between(
        "Kart_Throttle_Link_Shaft",
        (0.0, 0.0, -0.5 * t_len),
        (0.0, 0.0, 0.5 * t_len),
        0.0038,
        mats["alloy"],
        segments=10,
        parent=throttle_link,
        origin_three=(0.0, 0.0, 0.0),
    )

    # =========================================================================
    # 10. SCULPTED, UV-UNWRAPPED, ARTICULATED DRIVER (NOMEX SUIT, 4-PT HARNESS,
    #     FULL-FACE HELMET, 2-BONE IK ARMS/GLOVES & PEDAL-TRACKING LEGS/BOOTS)
    # =========================================================================
    # Seat shoulder harness grommet anchors (on static seat/roll-hoop shoulder zone)
    for side in (-1, 1):
        anchor_rings = [
            superellipse_ring(-0.464, 0.506, 0.526, side * 0.068, 0.022, power_y=0.3, power_z=0.3),
            superellipse_ring(-0.450, 0.506, 0.526, side * 0.068, 0.022, power_y=0.3, power_z=0.3),
        ]
        create_loft_mesh(f"OTL_Harness_Anchor_{side}", anchor_rings, mats["steel"], subsurf_levels=0, parent=chassis_static)

    # Torso (parented under Driver_Torso at DRIVER_HIP_PIVOT for subtle lateral-G lean)
    torso_spine = [
        (-0.145, 0.168, 0.0, -0.55, 0.83, 0.048, 0.098, 0.0),
        (-0.185, 0.218, 0.0, -0.56, 0.83, 0.056, 0.112, 0.022),
        (-0.232, 0.285, 0.0, -0.55, 0.83, 0.060, 0.114, 0.030),
        (-0.275, 0.355, 0.0, -0.52, 0.85, 0.064, 0.120, 0.024),
        (-0.312, 0.425, 0.0, -0.46, 0.89, 0.068, 0.128, 0.015),
        (-0.336, 0.486, 0.0, -0.35, 0.94, 0.066, 0.138, 0.008),
        (-0.344, 0.532, 0.0, -0.20, 0.98, 0.055, 0.118, 0.0),
        (-0.340, 0.568, 0.0, -0.05, 1.00, 0.048, 0.064, 0.0),
        (-0.330, 0.592, 0.0, 0.15, 0.99, 0.044, 0.054, 0.0),
    ]
    torso_rings = []
    for r_idx, (x, y, z, tx, ty, rn, rs, fold_amp) in enumerate(torso_spine):
        ring = oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn, rs, n=24)
        if fold_amp > 0.0:
            sculpted = []
            for j, (px, py, pz) in enumerate(ring):
                ang = (j / 24) * math.pi * 2.0
                # Natural fabric fold ridges across anterior torso flexion
                front_weight = max(0.0, math.cos(ang))
                crease = fold_amp * front_weight * (0.5 + 0.5 * math.sin(r_idx * 2.3 + ang * 3.0)) * 0.06
                sculpted.append((px + math.cos(ang) * crease, py, pz + math.sin(ang) * crease * 0.3))
            torso_rings.append(sculpted)
        else:
            torso_rings.append(ring)

    def suit_torso_uv(tx: float, ty: float, tz: float) -> tuple[float, float]:
        return (tz * 3.2 + 0.5, ty * 3.2)

    create_loft_mesh(
        "Driver_Torso_Suit",
        torso_rings,
        mats["suit"],
        subsurf_levels=1,
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
        uv_fn=suit_torso_uv,
    )

    # Suit mandarin collar + front crimson racing chest/zipper placket
    collar_rings = [
        oriented_ellipse_ring((-0.336, 0.558, 0.0), (0.08, 0.99, 0.0), 0.050, 0.060, n=20),
        oriented_ellipse_ring((-0.333, 0.574, 0.0), (0.12, 0.99, 0.0), 0.051, 0.061, n=20),
        oriented_ellipse_ring((-0.329, 0.585, 0.0), (0.14, 0.99, 0.0), 0.048, 0.056, n=20),
    ]
    create_loft_mesh(
        "Driver_Suit_Collar",
        collar_rings,
        mats["panel"],
        subsurf_levels=0,
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
    )

    # Chest seam/zipper strip + slate shoulder yoke panels + shoulder pads/epaulets
    placket_pts = []
    for idx in (6, 5, 4):
        x, y, _, tx, ty, rn, _rs, _f = torso_spine[idx]
        tlen = math.hypot(tx, ty) or 1.0
        nx, ny = ty / tlen, -tx / tlen
        placket_pts.append((x + nx * (rn + 0.004), y + ny * (rn + 0.004), 0.0))
    create_tube_curve(
        "Driver_Suit_Chest_Zipper",
        placket_pts,
        0.0045,
        mats["red"],
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
    )
    for side in (-1, 1):
        pad_rings = [
            oriented_ellipse_ring((-0.340, 0.525, side * 0.092), (0.0, -0.35, side * 0.94), 0.036, 0.046, n=16),
            oriented_ellipse_ring((-0.337, 0.506, side * 0.122), (0.0, -0.45, side * 0.89), 0.040, 0.046, n=16),
            oriented_ellipse_ring((-0.335, 0.488, side * 0.140), (0.0, -0.55, side * 0.83), 0.036, 0.038, n=16),
        ]
        create_loft_mesh(
            f"Driver_Shoulder_Pad_{side}",
            pad_rings,
            mats["panel"],
            subsurf_levels=1,
            parent=driver_torso,
            origin_three=DRIVER_HIP_PIVOT,
        )

    # Snug molded carbon rib protector (strictly inside seat bolsters)
    rib_rings = [
        oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn + 0.008, rs + 0.009, n=22)
        for (x, y, z, tx, ty, rn, rs, _f) in torso_spine[2:5]
    ]
    create_loft_mesh(
        "Driver_Rib_Protector",
        rib_rings,
        mats["carbon"],
        subsurf_levels=1,
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
    )

    # Complete anchored 4-point harness (2 shoulder straps anchored behind seat -> over shoulders -> camlock buckle,
    # plus 2 lap belts from hip anchors -> camlock buckle)
    def ribbon_ring(pt: tuple[float, float, float], tangent: tuple[float, float, float], half_w: float, half_t: float):
        return oriented_ellipse_ring(pt, tangent, half_t, half_w, n=12)

    buckle_center = (-0.168, 0.320, 0.0)
    buckle_rings = [
        superellipse_ring(-0.180, 0.300, 0.340, 0.0, 0.024, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.160, 0.300, 0.340, 0.0, 0.024, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh(
        "Driver_Harness_Buckle",
        buckle_rings,
        mats["alloy"],
        subsurf_levels=0,
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
    )
    latch_rings = [
        superellipse_ring(-0.161, 0.312, 0.328, 0.0, 0.011, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.156, 0.312, 0.328, 0.0, 0.011, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh(
        "Driver_Harness_Latch",
        latch_rings,
        mats["red"],
        subsurf_levels=0,
        parent=driver_torso,
        origin_three=DRIVER_HIP_PIVOT,
    )

    for side in (-1, 1):
        # Compute chest surface points cleanly outside torso suit AND rib protector
        def chest_pt(idx: int, z_pos: float, extra_n: float) -> tuple[float, float, float]:
            x, y, _, tx, ty, rn, rs, _f = torso_spine[idx]
            tlen = math.hypot(tx, ty) or 1.0
            nx, ny = ty / tlen, -tx / tlen
            frac = min(0.85, abs(z_pos) / max(0.05, rs))
            depth = math.sqrt(max(0.0, 1.0 - frac * frac)) * (rn + extra_n)
            return (x + nx * depth, y + ny * depth, side * abs(z_pos))

        sh_pts = [
            (-0.448, 0.516, side * 0.068),
            (-0.398, 0.542, side * 0.072),
            (-0.342, 0.556, side * 0.070),
            chest_pt(5, 0.064, 0.008),
            chest_pt(4, 0.052, 0.015),
            chest_pt(3, 0.036, 0.015),
            (-0.172, 0.328, side * 0.016),
        ]
        sh_rings = []
        for idx, pt in enumerate(sh_pts):
            p_prev = sh_pts[max(0, idx - 1)]
            p_next = sh_pts[min(len(sh_pts) - 1, idx + 1)]
            tang = (p_next[0] - p_prev[0], p_next[1] - p_prev[1], p_next[2] - p_prev[2])
            sh_rings.append(ribbon_ring(pt, tang, 0.016, 0.0045))
        create_loft_mesh(
            f"Driver_Harness_Shoulder_{side}",
            sh_rings,
            mats["harness"],
            subsurf_levels=0,
            parent=driver_torso,
            origin_three=DRIVER_HIP_PIVOT,
        )

        lap_pts = [
            (-0.220, 0.212, side * 0.114),
            (-0.184, 0.252, side * 0.094),
            (-0.166, 0.288, side * 0.064),
            (-0.166, 0.312, side * 0.032),
            (-0.168, 0.318, side * 0.016),
        ]
        lap_rings = []
        for idx, pt in enumerate(lap_pts):
            p_prev = lap_pts[max(0, idx - 1)]
            p_next = lap_pts[min(len(lap_pts) - 1, idx + 1)]
            tang = (p_next[0] - p_prev[0], p_next[1] - p_prev[1], p_next[2] - p_prev[2])
            lap_rings.append(ribbon_ring(pt, tang, 0.016, 0.0045))
        create_loft_mesh(
            f"Driver_Harness_Lap_{side}",
            lap_rings,
            mats["harness"],
            subsurf_levels=0,
            parent=driver_torso,
            origin_three=DRIVER_HIP_PIVOT,
        )

    # Helmet & Balaclava Neck (parented under Driver_Head at DRIVER_NECK_PIVOT)
    neck_rings = [
        oriented_ellipse_ring((-0.336, 0.565, 0.0), (0.12, 0.99, 0.0), 0.056, 0.064, n=20),
        oriented_ellipse_ring((-0.328, 0.592, 0.0), (0.16, 0.98, 0.0), 0.054, 0.062, n=20),
        oriented_ellipse_ring((-0.320, 0.620, 0.0), (0.18, 0.98, 0.0), 0.054, 0.062, n=20),
    ]
    create_loft_mesh(
        "Driver_Neck_Collar",
        neck_rings,
        mats["black"],
        subsurf_levels=0,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
    )

    # Aerodynamic full-face karting helmet (center ~(-0.316, 0.708, 0), crown 0.822 < 0.862 roll hoop,
    # rear x >= -0.428 clearing headrest at -0.454, recessed eyeport step)
    helmet_rows = [
        (-0.318, 0.592, 0.076, 0.066, 0.076),
        (-0.308, 0.624, 0.130, 0.094, 0.102),
        (-0.305, 0.654, 0.138, 0.104, 0.114),
        (-0.310, 0.684, 0.134, 0.110, 0.119),
        (-0.314, 0.710, 0.132, 0.111, 0.120),
        (-0.318, 0.736, 0.126, 0.110, 0.118),
        (-0.324, 0.766, 0.114, 0.106, 0.111),
        (-0.328, 0.794, 0.086, 0.092, 0.088),
        (-0.332, 0.814, 0.044, 0.050, 0.048),
        (-0.334, 0.822, 0.010, 0.012, 0.010),
    ]
    helmet_rings = []
    for (hx, hy, rxf, rxb, rz) in helmet_rows:
        ring = []
        in_eyeport_y = 0.676 <= hy <= 0.742
        for j in range(32):
            ang = (j / 32) * math.pi * 2.0
            ca, sa = math.cos(ang), math.sin(ang)
            rx = rxf if ca >= 0 else rxb
            # Indent recessed eyeport pocket smoothly across front window
            ang_signed = ((ang + math.pi) % (2.0 * math.pi)) - math.pi
            if in_eyeport_y and abs(ang_signed) < 0.94:
                recess = 0.008 * math.cos((ang_signed / 0.94) * (math.pi * 0.5)) ** 0.5
                rx -= recess
                rz_eff = rz - recess * 0.45
            else:
                rz_eff = rz
            ring.append((hx + ca * rx, hy, sa * rz_eff))
        helmet_rings.append(ring)

    def helmet_uv(tx: float, ty: float, tz: float) -> tuple[float, float]:
        ang_lat = math.atan2(tz, max(0.015, ty - 0.675))
        u = max(0.02, min(0.98, 0.5 + (ang_lat / math.pi) * 0.78))
        v = max(0.02, min(0.98, (tx + 0.435) / 0.275))
        return (u, v)

    create_loft_mesh(
        "Driver_Helmet_Shell",
        helmet_rings,
        mats["helmet"],
        subsurf_levels=1,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
        uv_fn=helmet_uv,
    )

    # Rubber eyeport perimeter gasket + recessed dark iridium visor + alloy visor pivot hardware
    gasket_pts = []
    # Top brow arc (left -> right)
    for j in range(13):
        ang = -0.96 + (j / 12) * 1.92
        gasket_pts.append((-0.317 + math.cos(ang) * 0.123, 0.742, math.sin(ang) * 0.116))
    # Right side descent
    gasket_pts.append((-0.313 + math.cos(0.96) * 0.129, 0.708, math.sin(0.96) * 0.118))
    # Bottom sill arc (right -> left)
    for j in range(13):
        ang = 0.96 - (j / 12) * 1.92
        gasket_pts.append((-0.309 + math.cos(ang) * 0.132, 0.674, math.sin(ang) * 0.118))
    # Left side ascent
    gasket_pts.append((-0.313 + math.cos(-0.96) * 0.129, 0.708, math.sin(-0.96) * 0.118))
    create_tube_curve(
        "Driver_Helmet_Eyeport_Gasket",
        gasket_pts,
        0.0038,
        mats["rubber"],
        closed=True,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
    )

    visor_rows = [
        (-0.310, 0.677, 0.129, 0.116),
        (-0.312, 0.700, 0.128, 0.118),
        (-0.316, 0.720, 0.125, 0.117),
        (-0.319, 0.739, 0.119, 0.113),
    ]
    visor_rings = []
    for (vx, vy, rx, rz) in visor_rows:
        ring = []
        n_v = 18
        for j in range(n_v + 1):
            ang = -0.95 + (j / n_v) * 1.90
            ring.append((vx + math.cos(ang) * (rx + 0.0035), vy, math.sin(ang) * (rz + 0.0035)))
        for j in range(n_v, -1, -1):
            ang = -0.95 + (j / n_v) * 1.90
            ring.append((vx + math.cos(ang) * (rx - 0.001), vy, math.sin(ang) * (rz - 0.001)))
        visor_rings.append(ring)
    create_loft_mesh(
        "Driver_Helmet_Visor",
        visor_rings,
        mats["visor"],
        subsurf_levels=0,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
    )

    # Visor side pivot discs & Allen screws + brow intake vents + flush chin vent + rear aero spoiler
    for side in (-1, 1):
        create_cylinder_between(
            f"Driver_Helmet_Visor_Pivot_{side}",
            (-0.312, 0.708, side * 0.117),
            (-0.312, 0.708, side * 0.124),
            0.012,
            mats["alloy"],
            segments=14,
            parent=driver_head,
            origin_three=DRIVER_NECK_PIVOT,
        )
        create_cylinder_between(
            f"Driver_Helmet_Visor_Screw_{side}",
            (-0.312, 0.708, side * 0.123),
            (-0.312, 0.708, side * 0.126),
            0.005,
            mats["black"],
            segments=8,
            parent=driver_head,
            origin_three=DRIVER_NECK_PIVOT,
        )
        brow_vent = [
            superellipse_ring(-0.228, 0.752, 0.764, side * 0.036, 0.011, power_y=0.35, power_z=0.35),
            superellipse_ring(-0.215, 0.750, 0.762, side * 0.036, 0.010, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(
            f"Driver_Helmet_Brow_Vent_{side}",
            brow_vent,
            mats["black"],
            subsurf_levels=0,
            parent=driver_head,
            origin_three=DRIVER_NECK_PIVOT,
        )

    chin_vent = [
        superellipse_ring(-0.175, 0.638, 0.654, 0.0, 0.026, power_y=0.40, power_z=0.40),
        superellipse_ring(-0.169, 0.640, 0.652, 0.0, 0.022, power_y=0.40, power_z=0.40),
    ]
    create_loft_mesh(
        "Driver_Helmet_Chin_Vent",
        chin_vent,
        mats["black"],
        subsurf_levels=0,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
    )
    # Low-profile curved carbon rear aero spoiler lip hugging the helmet shell curvature
    def helmet_rear_profile(hy: float) -> tuple[float, float, float]:
        if hy <= 0.766:
            t = max(0.0, min(1.0, (hy - 0.736) / 0.030))
            return (-0.318 - 0.006 * t, 0.110 - 0.004 * t, 0.118 - 0.007 * t)
        t = max(0.0, min(1.0, (hy - 0.766) / 0.028))
        return (-0.324 - 0.004 * t, 0.106 - 0.014 * t, 0.111 - 0.023 * t)

    spoiler_rings = []
    n_sp = 14
    sp_half_arc = 0.56
    for sy, lip_aft in ((0.744, 0.002), (0.754, 0.0065), (0.764, 0.0055), (0.773, 0.0015)):
        hx_s, rxb_s, rz_s = helmet_rear_profile(sy)
        ring = []
        for j in range(n_sp + 1):
            frac = (j / n_sp) * 2.0 - 1.0
            ang = math.pi + frac * sp_half_arc
            taper = max(0.15, math.cos(frac * math.pi * 0.5))
            rxb_o = rxb_s + lip_aft * taper
            ring.append((hx_s + math.cos(ang) * rxb_o, sy, math.sin(ang) * (rz_s + 0.0015 * taper)))
        for j in range(n_sp, -1, -1):
            frac = (j / n_sp) * 2.0 - 1.0
            ang = math.pi + frac * sp_half_arc
            ring.append((hx_s + math.cos(ang) * (rxb_s - 0.0025), sy, math.sin(ang) * (rz_s - 0.0020)))
        spoiler_rings.append(ring)
    create_loft_mesh(
        "Driver_Helmet_Spoiler",
        spoiler_rings,
        mats["carbon"],
        subsurf_levels=1,
        parent=driver_head,
        origin_three=DRIVER_NECK_PIVOT,
    )

    # Helper to build sculpted bone-aligned limb segments along local +Z [0..L]
    def build_sculpted_limb(
        name: str,
        stations: list[tuple[float, float, float, float]],
        mat: bpy.types.Material,
        parent_obj: bpy.types.Object,
        stripe_mat: bpy.types.Material | None = None,
        stripe_z_range: tuple[float, float] | None = None,
    ) -> None:
        rings = []
        for z_pos, rx, ry, fold_amp in stations:
            ring = []
            for j in range(18):
                ang = (j / 18) * math.pi * 2.0
                ca, sa = math.cos(ang), math.sin(ang)
                fold = 1.0 + fold_amp * math.sin(ang * 3.0)
                ring.append((ca * rx * fold, sa * ry * fold, z_pos))
            rings.append(ring)

        def limb_uv(tx: float, ty: float, tz: float) -> tuple[float, float]:
            ang = math.atan2(ty, tx)
            return ((ang / (math.pi * 2.0)) + 0.5, tz * 3.2)

        obj = create_loft_mesh(
            name,
            rings,
            mat,
            subsurf_levels=1,
            parent=parent_obj,
            origin_three=(0.0, 0.0, 0.0),
            uv_fn=limb_uv,
        )
        if stripe_mat is not None and stripe_z_range is not None:
            obj.data.materials.append(stripe_mat)
            z_lo, z_hi = stripe_z_range
            verts = obj.data.vertices
            for poly in obj.data.polygons:
                if len(poly.vertices) < 3:
                    continue
                center = sum((verts[vi].co for vi in poly.vertices), Vector((0.0, 0.0, 0.0))) / len(poly.vertices)
                # Convert Blender local (bx, by, bz) back to Three.js local (tx, ty, tz) = (bx, bz, -by)
                cx, cy, cz = center.x, center.z, -center.y
                if cy > 0.0 and abs(math.atan2(cx, cy)) < 0.20 and z_lo <= cz <= z_hi:
                    poly.material_index = 1

    # Sculpted 2-bone IK arms + detailed racing gloves (posed at rest steering=0)
    steer_hub_v = Vector(STEER_MOUNT_POS)
    for side, ua_node, fa_node, g_node in (
        (-1, driver_upper_arm_l, driver_forearm_l, driver_glove_l),
        (1, driver_upper_arm_r, driver_forearm_r, driver_glove_r),
    ):
        g_loc_three = upper_to_world(GLOVE_OFFSET[0], GLOVE_OFFSET[1], side * GLOVE_OFFSET[2])
        g_node.location = t2b(
            g_loc_three[0] - STEER_MOUNT_POS[0],
            g_loc_three[1] - STEER_MOUNT_POS[1],
            g_loc_three[2] - STEER_MOUNT_POS[2],
        )
        g_origin = g_loc_three

        # Detailed racing glove: palm, knuckle guard, cuff, and 4 curled fingers wrapping F1 rim
        palm_rings = [
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] - 0.017, 0.000, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.019, 0.017, n=14),
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] - 0.004, 0.002, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.023, 0.019, n=14),
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] + 0.010, 0.002, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.021, 0.017, n=14),
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] + 0.018, 0.000, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.015, 0.012, n=14),
        ]
        create_loft_mesh(f"Driver_Glove_Palm_{side}", palm_rings, mats["black"], subsurf_levels=1, parent=g_node, origin_three=g_origin)

        cuff_rings = [
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] - 0.042, 0.0, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.024, 0.023, n=14),
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] - 0.018, 0.0, side * GLOVE_OFFSET[2]), (cm_s, sm_s, 0.0), 0.022, 0.020, n=14),
        ]
        create_loft_mesh(f"Driver_Glove_Cuff_{side}", cuff_rings, mats["glovePad"], subsurf_levels=0, parent=g_node, origin_three=g_origin)

        knuckle_rings = [
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] + 0.002, 0.018, side * (GLOVE_OFFSET[2] + 0.006)), (cm_s, sm_s, 0.0), 0.007, 0.018, n=10),
            oriented_ellipse_ring(upper_to_world(GLOVE_OFFSET[0] + 0.014, 0.017, side * (GLOVE_OFFSET[2] + 0.006)), (cm_s, sm_s, 0.0), 0.006, 0.017, n=10),
        ]
        create_loft_mesh(f"Driver_Glove_Knuckle_{side}", knuckle_rings, mats["carbon"], subsurf_levels=0, parent=g_node, origin_three=g_origin)

        # Curled fingers wrapping cleanly around the outer wheel grip tube
        for f_idx, fy_off in enumerate((-0.015, -0.005, 0.005, 0.015)):
            rim_z = side * 0.109
            f_pts = [
                upper_to_world(GLOVE_OFFSET[0] + 0.016, fy_off, side * GLOVE_OFFSET[2] + side * 0.008),
                upper_to_world(0.016, fy_off, rim_z + side * 0.015),
                upper_to_world(0.022, fy_off, rim_z),
                upper_to_world(0.014, fy_off, rim_z - side * 0.015),
            ]
            create_tube_curve(
                f"Driver_Glove_Finger_{side}_{f_idx}",
                f_pts,
                0.0052,
                mats["black"],
                parent=g_node,
                origin_three=g_origin,
            )

        # UpperArm & Forearm authored along local +Z with hemispherical joint caps & flush fabric stripes
        build_sculpted_limb(
            f"Driver_UpperArm_{side}",
            [
                (-0.020, 0.016, 0.016, 0.0),
                (-0.012, 0.032, 0.033, 0.0),
                (0.000, 0.041, 0.042, 0.0),
                (0.022, 0.042, 0.043, 0.0),
                (0.095, 0.041, 0.042, 0.014),
                (0.195, 0.037, 0.038, 0.018),
                (0.272, 0.034, 0.034, 0.012),
                (DRIVER_UPPER_ARM_LEN - 0.012, 0.032, 0.032, 0.0),
                (DRIVER_UPPER_ARM_LEN, 0.0305, 0.0305, 0.0),
                (DRIVER_UPPER_ARM_LEN + 0.014, 0.024, 0.024, 0.0),
                (DRIVER_UPPER_ARM_LEN + 0.022, 0.011, 0.011, 0.0),
            ],
            mats["suit"],
            ua_node,
            stripe_mat=mats["suitRed"],
            stripe_z_range=(0.022, DRIVER_UPPER_ARM_LEN - 0.022),
        )
        build_sculpted_limb(
            f"Driver_Forearm_{side}",
            [
                (-0.020, 0.013, 0.013, 0.0),
                (-0.012, 0.028, 0.028, 0.0),
                (0.000, 0.0345, 0.0345, 0.0),
                (0.016, 0.035, 0.0355, 0.0),
                (0.085, 0.034, 0.035, 0.014),
                (0.185, 0.029, 0.029, 0.016),
                (0.255, 0.024, 0.024, 0.010),
                (DRIVER_FOREARM_LEN - 0.008, 0.021, 0.021, 0.0),
                (DRIVER_FOREARM_LEN + 0.006, 0.015, 0.015, 0.0),
            ],
            mats["suit"],
            fa_node,
            stripe_mat=mats["suitRed"],
            stripe_z_range=(0.020, DRIVER_FOREARM_LEN - 0.028),
        )

        shoulder_v = Vector((DRIVER_SHOULDER[0], DRIVER_SHOULDER[1], side * DRIVER_SHOULDER[2]))
        wrist_v = Vector(upper_to_world(GLOVE_OFFSET[0], GLOVE_OFFSET[1], side * GLOVE_OFFSET[2])) + Vector(GLOVE_WRIST_LOCAL)
        arm_pole = Vector((-0.05, -0.15, side * 0.99)).normalized()
        elbow_v, wrist_ik = solve_two_bone_ik_three(shoulder_v, wrist_v, DRIVER_UPPER_ARM_LEN, DRIVER_FOREARM_LEN, arm_pole)
        orient_limb_object_three(ua_node, shoulder_v, elbow_v, arm_pole)
        orient_limb_object_three(fa_node, elbow_v, wrist_ik, arm_pole)

    # Sculpted 2-bone IK thighs, shins & pedal-tracking boots (posed at rest pedal=0)
    for side, th_node, sh_node, bt_node in (
        (-1, driver_thigh_l, driver_shin_l, driver_boot_l),
        (1, driver_thigh_r, driver_shin_r, driver_boot_r),
    ):
        build_sculpted_limb(
            f"Driver_Thigh_{side}",
            [
                (-0.010, 0.028, 0.028, 0.0),
                (0.000, 0.044, 0.044, 0.0),
                (0.022, 0.048, 0.049, 0.0),
                (0.105, 0.047, 0.048, 0.014),
                (0.205, 0.044, 0.045, 0.016),
                (0.275, 0.041, 0.041, 0.010),
                (DRIVER_THIGH_LEN - 0.014, 0.040, 0.040, 0.0),
                (DRIVER_THIGH_LEN, 0.039, 0.039, 0.0),
                (DRIVER_THIGH_LEN + 0.016, 0.032, 0.032, 0.0),
                (DRIVER_THIGH_LEN + 0.028, 0.014, 0.014, 0.0),
            ],
            mats["suit"],
            th_node,
            stripe_mat=mats["suitSlate"],
            stripe_z_range=(0.030, DRIVER_THIGH_LEN - 0.035),
        )
        # Conformal curved carbon knee pad hugging the anterior knee arc (flush with zero air gap)
        kp_rings_local = []
        n_kp = 9
        for z_off, r_base, half_ang in (
            (-0.040, 0.041, 0.68),
            (-0.018, 0.040, 0.82),
            (0.004, 0.038, 0.78),
            (0.018, 0.032, 0.50),
        ):
            zp = DRIVER_THIGH_LEN + z_off
            ring = []
            for i in range(n_kp + 1):
                a = -half_ang + (i / n_kp) * (2.0 * half_ang)
                ring.append((math.sin(a) * (r_base + 0.0035), math.cos(a) * (r_base + 0.0035), zp))
            for i in range(n_kp, -1, -1):
                a = -half_ang + (i / n_kp) * (2.0 * half_ang)
                ring.append((math.sin(a) * (r_base - 0.0015), math.cos(a) * (r_base - 0.0015), zp))
            kp_rings_local.append(ring)
        create_loft_mesh(
            f"Driver_Knee_Pad_{side}",
            kp_rings_local,
            mats["carbon"],
            subsurf_levels=1,
            parent=th_node,
            origin_three=(0.0, 0.0, 0.0),
        )

        build_sculpted_limb(
            f"Driver_Shin_{side}",
            [
                (-0.022, 0.013, 0.013, 0.0),
                (-0.012, 0.029, 0.029, 0.0),
                (0.000, 0.0365, 0.0365, 0.0),
                (0.018, 0.039, 0.040, 0.0),
                (0.095, 0.038, 0.040, 0.014),
                (0.195, 0.032, 0.033, 0.016),
                (0.252, 0.027, 0.027, 0.012),
                (DRIVER_SHIN_LEN - 0.006, 0.024, 0.024, 0.0),
                (DRIVER_SHIN_LEN + 0.005, 0.016, 0.016, 0.0),
            ],
            mats["suit"],
            sh_node,
            stripe_mat=mats["suitRed"],
            stripe_z_range=(0.025, DRIVER_SHIN_LEN - 0.025),
        )

        # Detailed karting boot authored relative to ankle origin (0, 0, 0)
        boot_body_rings = [
            superellipse_ring(-0.028, -0.052, 0.028, 0.0, 0.026, power_y=0.45, power_z=0.45),
            superellipse_ring(-0.002, -0.042, 0.038, 0.0, 0.027, power_y=0.45, power_z=0.45),
            superellipse_ring(0.024, -0.020, 0.040, 0.0, 0.026, power_y=0.45, power_z=0.45),
            superellipse_ring(0.042, -0.002, 0.042, 0.0, 0.022, power_y=0.45, power_z=0.45),
        ]
        create_loft_mesh(
            f"Driver_Boot_Upper_{side}",
            boot_body_rings,
            mats["black"],
            subsurf_levels=1,
            parent=bt_node,
            origin_three=(0.0, 0.0, 0.0),
        )
        sole_rings = [
            superellipse_ring(0.026, -0.044, 0.010, 0.0, 0.025, power_y=0.35, power_z=0.35),
            superellipse_ring(0.046, -0.016, 0.040, 0.0, 0.023, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(
            f"Driver_Boot_Sole_{side}",
            sole_rings,
            mats["rubber"],
            subsurf_levels=0,
            parent=bt_node,
            origin_three=(0.0, 0.0, 0.0),
        )
        strap_rings = [
            superellipse_ring(-0.016, 0.012, 0.032, 0.0, 0.028, power_y=0.35, power_z=0.35),
            superellipse_ring(0.008, 0.014, 0.034, 0.0, 0.028, power_y=0.35, power_z=0.35),
        ]
        create_loft_mesh(
            f"Driver_Boot_Strap_{side}",
            strap_rings,
            mats["red"],
            subsurf_levels=0,
            parent=bt_node,
            origin_three=(0.0, 0.0, 0.0),
        )

        hip_v = Vector((DRIVER_HIP_JOINT[0], DRIVER_HIP_JOINT[1], side * DRIVER_HIP_JOINT[2]))
        sole_rest = Vector((PEDAL_PIVOT_POS[0] + PEDAL_SOLE_LOCAL[0], PEDAL_PIVOT_POS[1] + PEDAL_SOLE_LOCAL[1], side * PEDAL_PIVOT_POS[2]))
        ankle_v = sole_rest + Vector(PEDAL_ANKLE_OFFSET)
        leg_pole = Vector((0.0, 0.72, side * 0.69)).normalized()
        knee_v, ankle_ik = solve_two_bone_ik_three(hip_v, ankle_v, DRIVER_THIGH_LEN, DRIVER_SHIN_LEN, leg_pole)
        orient_limb_object_three(th_node, hip_v, knee_v, leg_pole)
        orient_limb_object_three(sh_node, knee_v, ankle_ik, leg_pole)
        bt_node.location = t2b(ankle_ik.x, ankle_ik.y, ankle_ik.z)

    # =========================================================================
    # SAVE .BLEND AND EXPORT .GLB (WITH MODIFIERS APPLIED & OBJECT HIERARCHY INTACT)
    # =========================================================================
    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )

    # =========================================================================
    # STUDIO CYCLES PREVIEW RENDER
    # =========================================================================
    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("Preview_Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = Vector((1.75, 1.85, 1.05))
    direction = Vector((-0.05, 0.0, 0.36)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    for lname, loc, energy in (
        ("Studio_Key", (2.5, 2.2, 3.2), 200.0),
        ("Studio_Fill", (-2.2, 2.0, 2.4), 100.0),
        ("Studio_Rim", (-1.8, -2.5, 2.8), 120.0),
    ):
        ldata = bpy.data.lights.new(name=lname, type="AREA")
        ldata.energy = energy
        ldata.size = 2.0
        lobj = bpy.data.objects.new(name=lname, object_data=ldata)
        scene.collection.objects.link(lobj)
        lobj.location = Vector(loc)
        ldir = Vector((0.0, 0.0, 0.3)) - lobj.location
        lobj.rotation_euler = ldir.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, 0.0))
    floor_obj = bpy.context.active_object
    floor_obj.name = "Studio_Floor"
    floor_obj.data.materials.append(make_pbr_material("Studio_Floor_Mat", (0.16, 0.18, 0.21), roughness=0.72))

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.filepath = PREVIEW_OUT
    bpy.ops.render.render(write_still=True)

    print(f"SUCCESS: Generated {BLEND_OUT}, {GLB_OUT}, {PREVIEW_OUT}, and 12 PBR textures in {TEX_DIR}")


if __name__ == "__main__":
    build_otl_superleggero()
