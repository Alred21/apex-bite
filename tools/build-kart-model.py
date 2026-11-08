#!/usr/bin/env python3
"""
Blender CLI asset generator for the K1 Speed Toronto OTL Superleggero electric
rental go-kart and realistic reclined seated driver.

Run via official Blender CLI:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build-kart-model.py

Outputs:
  - assets/otl-superleggero.blend
  - public/models/otl-superleggero.glb
  - public/models/otl-superleggero-preview.png
  - src/render/otl-superleggero-meshes.ts (synchronous frame-0 buffers for Three.js)
"""

import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_OUT = os.path.join(ROOT_DIR, "assets", "otl-superleggero.blend")
GLB_OUT = os.path.join(ROOT_DIR, "public", "models", "otl-superleggero.glb")
TS_OUT = os.path.join(ROOT_DIR, "src", "render", "otl-superleggero-meshes.ts")
PREVIEW_OUT = os.path.join(ROOT_DIR, "public", "models", "otl-superleggero-preview.png")

# Shared wheel & steering geometry constants from src/simulation/kart-parameters.ts
FRONT_AXLE_X = 0.54
REAR_AXLE_X = -0.52
FRONT_TRACK_HALF_Z = 0.285
REAR_TRACK_HALF_Z = 0.335
TIRE_RADIUS = 0.145
WHEEL_HALF_WIDTH = 0.076
MAX_STEER_ANGLE_RAD = 0.46
STEER_MOUNT_POS = (0.185, 0.355, 0.0)
STEER_MOUNT_ROT_Z = 0.35
GLOVE_OFFSET_Z = 0.105


def t2b(x: float, y: float, z: float) -> Vector:
    """Convert Three.js (+X forward, +Y up, +Z right) to Blender (+X forward, -Y right, +Z up)."""
    return Vector((x, -z, y))


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name: str, rgb: tuple[float, float, float], roughness: float = 0.45, metalness: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metalness
    return mat


def create_loft_mesh(
    name: str,
    rings: list[list[tuple[float, float, float]]],
    material: bpy.types.Material,
    closed_loop: bool = True,
    cap_ends: bool = True,
    subsurf_levels: int = 1,
    collection: bpy.types.Collection = None,
) -> bpy.types.Object:
    """Create a smooth lofted mesh in Blender from cross-section rings in Three.js coordinates."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)

    bm = bmesh.new()
    bm_rings = []
    for ring in rings:
        bm_ring = [bm.verts.new(t2b(x, y, z)) for (x, y, z) in ring]
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
    collection: bpy.types.Collection = None,
) -> bpy.types.Object:
    """Create a 3D tube using Blender's native Curve + Bevel object pipeline and convert to mesh."""
    curve_data = bpy.data.curves.new(name=name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution_u
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_resolution
    curve_data.use_fill_caps = not closed

    spline = curve_data.splines.new(type="NURBS" if len(points) >= 4 else "POLY")
    spline.points.add(len(points) - 1)
    for i, (x, y, z) in enumerate(points):
        bx, by, bz = t2b(x, y, z)
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
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.materials.append(material)

    bpy.data.objects.remove(curve_obj, do_unlink=True)
    bpy.data.curves.remove(curve_data, do_unlink=True)

    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


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
    tx, ty, tz = tangent
    tlen = math.hypot(tx, ty, tz) or 1.0
    tx, ty, tz = tx / tlen, ty / tlen, tz / tlen
    nx, ny = -ty, tx
    nlen = math.hypot(nx, ny) or 1.0
    nx, ny = nx / nlen, ny / nlen
    cx, cy, cz = center
    pts = []
    for i in range(n):
        ang = (i / n) * math.pi * 2.0
        ca = math.cos(ang)
        sa = math.sin(ang)
        px = cx + nx * (ca * radius_normal)
        py = cy + ny * (ca * radius_normal)
        pz = cz + sa * radius_side
        pts.append((px, py, pz))
    return pts


def build_otl_superleggero():
    clear_scene()
    scene = bpy.context.scene

    # Collections for organized .blend and .glb hierarchy
    col_stationary = bpy.data.collections.new("Kart_Stationary")
    col_wheel = bpy.data.collections.new("Kart_Wheel")
    col_steer = bpy.data.collections.new("Kart_SteeringWheel")
    col_driver_body = bpy.data.collections.new("Driver_Fixed")
    col_driver_head = bpy.data.collections.new("Driver_Head")
    col_glove_l = bpy.data.collections.new("Driver_Glove_L")
    col_glove_r = bpy.data.collections.new("Driver_Glove_R")
    for c in (col_stationary, col_wheel, col_steer, col_driver_body, col_driver_head, col_glove_l, col_glove_r):
        scene.collection.children.link(c)

    # Materials matching K1 Speed OTL Superleggero livery & race gear
    mats = {
        "red": make_material("K1_Crimson_Red", (0.72, 0.055, 0.09), roughness=0.28, metalness=0.06),
        "black": make_material("OTL_Satin_Black", (0.08, 0.095, 0.11), roughness=0.48, metalness=0.04),
        "white": make_material("K1_Livery_White", (0.93, 0.94, 0.95), roughness=0.32, metalness=0.02),
        "rubber": make_material("Protex_HDPE_Rubber", (0.09, 0.095, 0.10), roughness=0.84, metalness=0.0),
        "steel": make_material("Chromoly_Steel", (0.34, 0.37, 0.40), roughness=0.28, metalness=0.88),
        "alloy": make_material("Machined_Alloy", (0.66, 0.70, 0.74), roughness=0.22, metalness=0.90),
        "carbon": make_material("Molded_Carbon", (0.13, 0.15, 0.17), roughness=0.58, metalness=0.08),
        "accent": make_material("Telemetry_Yellow", (0.835, 0.898, 0.165), roughness=0.38, metalness=0.0),
        "orange": make_material("HV_Cable_Orange", (0.91, 0.41, 0.09), roughness=0.46, metalness=0.0),
        "harness": make_material("Racing_Harness_Red", (0.80, 0.08, 0.11), roughness=0.68, metalness=0.0),
        "suit": make_material("Driver_Suit_Navy", (0.14, 0.20, 0.26), roughness=0.88, metalness=0.0),
        "panel": make_material("Driver_Suit_Slate", (0.34, 0.39, 0.43), roughness=0.84, metalness=0.0),
        "trim": make_material("Driver_Suit_Accent", (0.82, 0.14, 0.16), roughness=0.62, metalness=0.0),
        "glovePad": make_material("Driver_Glove_Grip", (0.21, 0.25, 0.28), roughness=0.78, metalness=0.0),
        "helmet": make_material("Helmet_Pearl_White", (0.90, 0.92, 0.91), roughness=0.22, metalness=0.06),
        "visor": make_material("Helmet_Iridium_Visor", (0.10, 0.16, 0.22), roughness=0.12, metalness=0.65),
    }

    # =========================================================================
    # 1. OTL SUPERLEGGERO PROTEX BUMPER SYSTEM (ZERO WHEEL OVERLAP)
    # Front wheels sweep x in [0.376, 0.704], |z| in [0.1525, 0.4175] at ±0.46 rad.
    # Rear wheels occupy x in [-0.665, -0.375], |z| in [0.259, 0.411].
    # Therefore:
    #   - Front nose bumper stays strictly ahead of front tires (x >= 0.735)
    #     and joins the narrow central nose frame (|z| <= 0.115) inside the tires.
    #   - Side rub bumpers stay strictly between rear and front tires (x in [-0.340, 0.340]).
    #   - Rear bumper stays strictly behind rear tires (x <= -0.695) and anchors
    #     into the inner rear chassis rails (|z| <= 0.175).
    # =========================================================================
    front_bumper_pts = [
        (0.680, 0.122, -0.102),
        (0.748, 0.124, -0.135),
        (0.785, 0.125, -0.245),
        (0.828, 0.126, -0.185),
        (0.854, 0.128, 0.0),
        (0.828, 0.126, 0.185),
        (0.785, 0.125, 0.245),
        (0.748, 0.124, 0.135),
        (0.680, 0.122, 0.102),
    ]
    create_tube_curve("OTL_Front_Bumper_Main", front_bumper_pts, 0.018, mats["rubber"], closed=False, collection=col_stationary)
    front_bumper_upper = [(x, y + 0.026, z * 0.96) for (x, y, z) in front_bumper_pts]
    create_tube_curve("OTL_Front_Bumper_Upper", front_bumper_upper, 0.013, mats["rubber"], closed=False, collection=col_stationary)

    red_insert_front = [
        (0.760, 0.138, -0.145),
        (0.790, 0.138, -0.232),
        (0.830, 0.139, -0.175),
        (0.855, 0.140, 0.0),
        (0.830, 0.139, 0.175),
        (0.790, 0.138, 0.232),
        (0.760, 0.138, 0.145),
    ]
    create_tube_curve("OTL_Front_Bumper_Red_Strip", red_insert_front, 0.008, mats["red"], closed=False, collection=col_stationary)

    # Rear wraparound Protex bumper behind rear tires (x <= -0.695 where tires end at -0.665)
    rear_bumper_pts = [
        (-0.620, 0.125, -0.172),
        (-0.708, 0.126, -0.220),
        (-0.735, 0.128, -0.345),
        (-0.768, 0.130, -0.240),
        (-0.776, 0.132, 0.0),
        (-0.768, 0.130, 0.240),
        (-0.735, 0.128, 0.345),
        (-0.708, 0.126, 0.220),
        (-0.620, 0.125, 0.172),
    ]
    create_tube_curve("OTL_Rear_Bumper_Main", rear_bumper_pts, 0.019, mats["rubber"], closed=False, collection=col_stationary)
    rear_bumper_upper = [(x, y + 0.028, z * 0.98) for (x, y, z) in rear_bumper_pts]
    create_tube_curve("OTL_Rear_Bumper_Upper", rear_bumper_upper, 0.013, mats["rubber"], closed=False, collection=col_stationary)

    # Side Protex protection bars strictly between rear (x = -0.375) and front (x = +0.376) tires
    for side in (-1, 1):
        side_bumper_main = [
            (-0.335, 0.120, side * 0.185),
            (-0.320, 0.120, side * 0.382),
            (-0.100, 0.120, side * 0.398),
            (0.150, 0.120, side * 0.395),
            (0.320, 0.120, side * 0.365),
            (0.335, 0.120, side * 0.120),
        ]
        create_tube_curve(f"OTL_Side_Bumper_Main_{side}", side_bumper_main, 0.018, mats["rubber"], closed=False, collection=col_stationary)

        side_strip = [
            (-0.310, 0.134, side * 0.260),
            (-0.275, 0.134, side * 0.376),
            (0.0, 0.134, side * 0.394),
            (0.275, 0.134, side * 0.354),
            (0.310, 0.134, side * 0.220),
        ]
        create_tube_curve(f"OTL_Side_Rub_Strip_{side}", side_strip, 0.008, mats["red"], closed=False, collection=col_stationary)

    # =========================================================================
    # 2. FLOOR PAN, CHASSIS RAILS, KINGPIN AXLE & FOOTWELL PEDALS
    # =========================================================================
    # Floor pan narrows to half_width <= 0.115 m for x >= 0.34 m so front tires have huge clearance
    floor_sections = [
        superellipse_ring(-0.62, 0.064, 0.082, 0.0, 0.175, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.34, 0.064, 0.082, 0.0, 0.215, power_y=0.35, power_z=0.35),
        superellipse_ring(0.05, 0.064, 0.082, 0.0, 0.215, power_y=0.35, power_z=0.35),
        superellipse_ring(0.32, 0.064, 0.082, 0.0, 0.145, power_y=0.35, power_z=0.35),
        superellipse_ring(0.42, 0.066, 0.084, 0.0, 0.112, power_y=0.35, power_z=0.35),
        superellipse_ring(0.70, 0.070, 0.088, 0.0, 0.105, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Floor_Pan", floor_sections, mats["carbon"], subsurf_levels=1, collection=col_stationary)

    for side in (-1, 1):
        chassis_rail = [
            (-0.68, 0.102, side * 0.165),
            (-0.32, 0.102, side * 0.195),
            (0.26, 0.102, side * 0.165),
            (0.42, 0.105, side * 0.105),
            (0.70, 0.110, side * 0.095),
        ]
        create_tube_curve(f"Chassis_Main_Rail_{side}", chassis_rail, 0.014, mats["red"], collection=col_stationary)

        # Sculpted alloy pedals tucked cleanly inside the narrow footwell (z = ±0.078 m)
        pedal_rings = [
            superellipse_ring(0.455, 0.105, 0.195, side * 0.078, 0.022, power_y=0.4, power_z=0.4),
            superellipse_ring(0.468, 0.105, 0.195, side * 0.078, 0.022, power_y=0.4, power_z=0.4),
        ]
        create_loft_mesh(f"Pedal_Face_{side}", pedal_rings, mats["alloy"], subsurf_levels=0, collection=col_stationary)

    # Crossmembers strictly inside the main rails (never entering wheel envelopes)
    for x_cross, z_span in ((-0.60, 0.165), (-0.18, 0.195), (0.24, 0.165)):
        create_tube_curve(
            f"Chassis_Crossmember_{x_cross:.2f}",
            [(x_cross, 0.102, -z_span), (x_cross, 0.102, z_span)],
            0.012,
            mats["steel"],
            collection=col_stationary,
        )

    # Front axle kingpin beam along x = 0.54, y = 0.145, stopping at |z| = 0.188 m
    # (clear of the inner front wheel face at |z| = 0.206 m even at full 0.46 rad steer lock)
    create_tube_curve(
        "OTL_Front_Kingpin_Beam",
        [(FRONT_AXLE_X, TIRE_RADIUS, -0.188), (FRONT_AXLE_X, TIRE_RADIUS, 0.188)],
        0.013,
        mats["steel"],
        collection=col_stationary,
    )

    # =========================================================================
    # 3. OTL SUPERLEGGERO SCULPTED NOSE CONE & NASSAU FAIRING
    # Between the front wheels (x in [0.36, 0.72]), half_width <= 0.115 m so turned
    # tires (|z| >= 0.1525 m) have > 3.5 cm air gap. Ahead of x = 0.735 m, the front
    # spoiler wing flares out to |z| = 0.26 m behind the front bumper.
    # =========================================================================
    nose_lower_black = [
        superellipse_ring(0.38, 0.108, 0.175, 0.0, 0.110, power_y=0.5, power_z=0.6),
        superellipse_ring(0.56, 0.110, 0.182, 0.0, 0.110, power_y=0.5, power_z=0.6),
        superellipse_ring(0.72, 0.114, 0.182, 0.0, 0.112, power_y=0.5, power_z=0.6),
        superellipse_ring(0.775, 0.118, 0.178, 0.0, 0.195, power_y=0.5, power_z=0.6),
        superellipse_ring(0.815, 0.122, 0.172, 0.0, 0.155, power_y=0.5, power_z=0.6),
        superellipse_ring(0.845, 0.126, 0.162, 0.0, 0.055, power_y=0.5, power_z=0.6),
    ]
    create_loft_mesh("OTL_Nose_Splitter_Base", nose_lower_black, mats["black"], subsurf_levels=1, collection=col_stationary)

    nose_red_shell = [
        superellipse_ring(0.38, 0.145, 0.242, 0.0, 0.106, power_y=0.55, power_z=0.62),
        superellipse_ring(0.54, 0.145, 0.235, 0.0, 0.108, power_y=0.55, power_z=0.62),
        superellipse_ring(0.71, 0.142, 0.218, 0.0, 0.108, power_y=0.55, power_z=0.62),
        superellipse_ring(0.775, 0.140, 0.208, 0.0, 0.175, power_y=0.55, power_z=0.62),
        superellipse_ring(0.815, 0.138, 0.194, 0.0, 0.135, power_y=0.55, power_z=0.62),
        superellipse_ring(0.842, 0.136, 0.175, 0.0, 0.048, power_y=0.55, power_z=0.62),
    ]
    create_loft_mesh("OTL_Nose_Red_Cowling", nose_red_shell, mats["red"], subsurf_levels=1, collection=col_stationary)

    # Sculpted Nassau tower starts at x = 0.268 m (strictly forward of the rotating steering
    # wheel & gloves at x_l <= 0.016 m!), rising to cradle the digital dash binnacle at y = 0.442 m
    # and sloping smoothly forward into the nose cone.
    nassau_fairing = [
        superellipse_ring(0.268, 0.235, 0.435, 0.0, 0.066, power_y=0.45, power_z=0.50),
        superellipse_ring(0.305, 0.205, 0.442, 0.0, 0.076, power_y=0.45, power_z=0.50),
        superellipse_ring(0.390, 0.180, 0.335, 0.0, 0.094, power_y=0.50, power_z=0.55),
        superellipse_ring(0.480, 0.168, 0.262, 0.0, 0.102, power_y=0.50, power_z=0.55),
        superellipse_ring(0.560, 0.160, 0.236, 0.0, 0.098, power_y=0.50, power_z=0.55),
    ]
    create_loft_mesh("OTL_Nassau_Fairing", nassau_fairing, mats["red"], subsurf_levels=1, collection=col_stationary)

    # Flush white K1 Speed livery center panel along the front nose slope
    nose_center_panel = [
        superellipse_ring(0.415, 0.295, 0.304, 0.0, 0.028, power_y=0.35, power_z=0.35),
        superellipse_ring(0.485, 0.246, 0.260, 0.0, 0.058, power_y=0.35, power_z=0.35),
        superellipse_ring(0.660, 0.212, 0.226, 0.0, 0.062, power_y=0.35, power_z=0.35),
        superellipse_ring(0.765, 0.194, 0.204, 0.0, 0.036, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Nose_White_Center_Panel", nose_center_panel, mats["white"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 4. OTL SUPERLEGGERO SCULPTED SIDEPODS (x in [-0.335, +0.335])
    # Strictly between rear wheel front edge (x = -0.375) and front wheel rear edge
    # (x = +0.376 at full lock), guaranteeing >= 4 cm clearance to all 4 wheels.
    # =========================================================================
    for side in (-1, 1):
        pod_red = [
            superellipse_ring(-0.335, 0.132, 0.235, side * 0.275, 0.028, power_y=0.45, power_z=0.50),
            superellipse_ring(-0.250, 0.130, 0.286, side * 0.295, 0.066, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.010),
            superellipse_ring(-0.040, 0.130, 0.292, side * 0.298, 0.070, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.010),
            superellipse_ring(0.160, 0.130, 0.284, side * 0.295, 0.066, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.008),
            superellipse_ring(0.270, 0.132, 0.252, side * 0.282, 0.048, power_y=0.45, power_z=0.50),
            superellipse_ring(0.335, 0.135, 0.205, side * 0.255, 0.024, power_y=0.45, power_z=0.50),
        ]
        create_loft_mesh(f"OTL_Sidepod_Red_{side}", pod_red, mats["red"], subsurf_levels=1, collection=col_stationary)

        pod_black_base = [
            superellipse_ring(-0.320, 0.112, 0.188, side * 0.282, 0.026, power_y=0.45, power_z=0.5),
            superellipse_ring(-0.200, 0.112, 0.198, side * 0.302, 0.068, power_y=0.45, power_z=0.5),
            superellipse_ring(0.180, 0.112, 0.194, side * 0.298, 0.066, power_y=0.45, power_z=0.5),
            superellipse_ring(0.315, 0.115, 0.172, side * 0.265, 0.024, power_y=0.45, power_z=0.5),
        ]
        create_loft_mesh(f"OTL_Sidepod_Black_Base_{side}", pod_black_base, mats["black"], subsurf_levels=1, collection=col_stationary)

        # Flat-crowned upper-shoulder white livery trim (top at y = 0.295 m for flush decal placement)
        side_white_panel = [
            superellipse_ring(-0.220, 0.276, 0.294, side * 0.292, 0.040, power_y=0.35, power_z=0.4),
            superellipse_ring(-0.060, 0.278, 0.295, side * 0.295, 0.044, power_y=0.35, power_z=0.4),
            superellipse_ring(0.100, 0.276, 0.294, side * 0.292, 0.042, power_y=0.35, power_z=0.4),
            superellipse_ring(0.210, 0.258, 0.274, side * 0.282, 0.030, power_y=0.35, power_z=0.4),
        ]
        create_loft_mesh(f"OTL_Sidepod_White_Panel_{side}", side_white_panel, mats["white"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 5. DEEP RECLINED BUCKET SEAT (~35°), ROLL HOOP / HEADREST & 4-POINT HARNESS
    # =========================================================================
    seat_rows = [
        # (x_center, y_center, half_width, side_bolster_height, thickness)
        (0.04, 0.105, 0.155, 0.052, 0.016),
        (-0.10, 0.088, 0.155, 0.068, 0.016),
        (-0.24, 0.110, 0.158, 0.076, 0.016),
        (-0.34, 0.220, 0.165, 0.068, 0.016),
        (-0.41, 0.360, 0.172, 0.052, 0.016),
        (-0.45, 0.500, 0.165, 0.036, 0.016),
        (-0.47, 0.610, 0.125, 0.020, 0.015),
    ]
    seat_rings = []
    for (sx, sy, sw, sbh, sth) in seat_rows:
        ring = []
        n_u = 12
        for j in range(n_u + 1):
            u = (j / n_u) * 2.0 - 1.0
            edge = abs(u) ** 2.6
            px = sx + edge * sbh * 0.45
            py = sy + edge * sbh
            pz = u * sw
            ring.append((px, py, pz))
        for j in range(n_u, -1, -1):
            u = (j / n_u) * 2.0 - 1.0
            edge = abs(u) ** 2.6
            px = sx + edge * sbh * 0.45 - sth * 0.7
            py = sy + edge * sbh - sth
            pz = u * (sw + sth * 0.4)
            ring.append((px, py, pz))
        seat_rings.append(ring)
    create_loft_mesh("OTL_Reclined_Bucket_Seat", seat_rings, mats["carbon"], closed_loop=True, cap_ends=True, subsurf_levels=1, collection=col_stationary)

    # Signature OTL Superleggero rear roll hoop / headrest cage behind seat (top y = 0.86 m)
    roll_hoop_pts = [
        (-0.47, 0.22, -0.165),
        (-0.48, 0.52, -0.158),
        (-0.485, 0.78, -0.130),
        (-0.485, 0.858, -0.062),
        (-0.485, 0.862, 0.0),
        (-0.485, 0.858, 0.062),
        (-0.485, 0.78, 0.130),
        (-0.48, 0.52, 0.158),
        (-0.47, 0.22, 0.165),
    ]
    create_tube_curve("OTL_Roll_Hoop_Main", roll_hoop_pts, 0.016, mats["black"], closed=False, collection=col_stationary)

    for side in (-1, 1):
        rear_brace = [
            (-0.485, 0.75, side * 0.125),
            (-0.59, 0.50, side * 0.145),
            (-0.68, 0.26, side * 0.155),
        ]
        create_tube_curve(f"OTL_Roll_Hoop_Rear_Brace_{side}", rear_brace, 0.012, mats["black"], closed=False, collection=col_stationary)

    headrest_rings = [
        superellipse_ring(-0.475, 0.62, 0.79, 0.0, 0.084, power_y=0.45, power_z=0.45),
        superellipse_ring(-0.445, 0.62, 0.79, 0.0, 0.084, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("OTL_Headrest_Pad", headrest_rings, mats["rubber"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 6. ENCLOSED REAR ELECTRIC POWERTRAIN SHROUD, LIVE AXLE & STEERING SUPPORT
    # Narrowed to half_width <= 0.175 m so rear wheels (|z| >= 0.259 m) and rear
    # brake rotor (z = -0.222 m) have generous air clearance.
    # =========================================================================
    shroud_rings = [
        superellipse_ring(-0.71, 0.135, 0.305, 0.0, 0.145, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.62, 0.135, 0.355, 0.0, 0.172, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.50, 0.135, 0.345, 0.0, 0.168, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.42, 0.135, 0.295, 0.0, 0.140, power_y=0.5, power_z=0.55),
    ]
    create_loft_mesh("OTL_Rear_Powertrain_Shroud", shroud_rings, mats["black"], subsurf_levels=1, collection=col_stationary)

    shroud_crest = [
        superellipse_ring(-0.69, 0.295, 0.352, 0.0, 0.095, power_y=0.5, power_z=0.5),
        superellipse_ring(-0.59, 0.315, 0.372, 0.0, 0.112, power_y=0.5, power_z=0.5),
        superellipse_ring(-0.47, 0.300, 0.355, 0.0, 0.098, power_y=0.5, power_z=0.5),
    ]
    create_loft_mesh("OTL_Rear_Shroud_Red_Crest", shroud_crest, mats["red"], subsurf_levels=1, collection=col_stationary)

    # Rear live axle between inner rear wheel hubs (|z| <= 0.250 m < 0.259 m inner tire face)
    create_tube_curve(
        "OTL_Rear_Live_Axle",
        [(REAR_AXLE_X, TIRE_RADIUS, -0.250), (REAR_AXLE_X, TIRE_RADIUS, 0.250)],
        0.016,
        mats["steel"],
        collection=col_stationary,
    )
    create_tube_curve(
        "OTL_HV_Orange_Conduit",
        [(-0.58, 0.31, 0.14), (-0.66, 0.35, 0.11), (-0.68, 0.32, -0.07), (-0.57, 0.28, -0.12)],
        0.0085,
        mats["orange"],
        collection=col_stationary,
    )

    # Straight steering hub boss along the exact wheel rotation axis (y_l = 0, z_l = 0, x_l in [0.028, 0.095])
    # connecting the steering wheel hub straight into the Nassau tower with zero bend!
    create_tube_curve(
        "OTL_Steering_Column_Shaft",
        [(0.212, 0.365, 0.0), (0.245, 0.377, 0.0), (0.280, 0.390, 0.0)],
        0.016,
        mats["black"],
        collection=col_stationary,
    )
    # Integrated rectangular dash binnacle housing crowned directly onto the Nassau tower brow
    # flush behind dashScreen at (0.262, 0.478, 0)
    dash_housing_rings = [
        superellipse_ring(0.265, 0.440, 0.510, 0.0, 0.074, power_y=0.25, power_z=0.25),
        superellipse_ring(0.298, 0.435, 0.506, 0.0, 0.070, power_y=0.25, power_z=0.25),
    ]
    create_loft_mesh("OTL_Dash_Housing", dash_housing_rings, mats["black"], subsurf_levels=0, collection=col_stationary)

    # =========================================================================
    # 7. F1-STYLE COMPACT STEERING YOKE (Local to steeringWheel at (0.19, 0.355, 0))
    # Compact vertical profile (y_local in [-0.072, +0.088], z_local in [-0.105, +0.105])
    # so the top arch stays strictly below the dash display (y = 0.443..0.507) and
    # the bottom stays strictly above the driver's knees (y <= 0.214).
    # =========================================================================
    f1_rim_pts = []
    for i in range(36):
        ang = (i / 36) * math.pi * 2.0
        ca = math.cos(ang)
        sa = math.sin(ang)
        y_local = ca * 0.088
        if y_local < -0.070:
            y_local = -0.070 + (y_local + 0.070) * 0.22
        z_local = sa * (0.105 + 0.004 * (abs(sa) ** 3))
        f1_rim_pts.append((0.0, y_local, z_local))
    create_tube_curve("OTL_F1_Wheel_Rim", f1_rim_pts, 0.0135, mats["rubber"], closed=True, collection=col_steer)

    # Yellow top-center marker band on the top arch of the F1 wheel (y_local = 0.088)
    marker_pts = []
    for i in range(9):
        ang = -0.15 + (i / 8) * 0.30
        marker_pts.append((0.0, math.cos(ang) * 0.088, math.sin(ang) * 0.105))
    create_tube_curve("OTL_F1_Wheel_Yellow_Marker", marker_pts, 0.016, mats["accent"], closed=False, collection=col_steer)

    hub_plate = [
        superellipse_ring(-0.008, -0.030, 0.030, 0.0, 0.038, power_y=0.45, power_z=0.45),
        superellipse_ring(0.008, -0.030, 0.030, 0.0, 0.038, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("OTL_F1_Wheel_Hub", hub_plate, mats["black"], subsurf_levels=0, collection=col_steer)
    create_tube_curve(
        "OTL_F1_Wheel_Cross_Spoke",
        [(0.0, -0.005, -0.098), (0.0, 0.0, 0.0), (0.0, -0.005, 0.098)],
        0.009,
        mats["alloy"],
        closed=False,
        collection=col_steer,
    )
    create_tube_curve(
        "OTL_F1_Wheel_Bottom_Spoke",
        [(0.0, 0.0, 0.0), (0.0, -0.068, 0.0)],
        0.008,
        mats["alloy"],
        closed=False,
        collection=col_steer,
    )

    # =========================================================================
    # 8. REALISTIC RECLINED SEATED DRIVER (~35° RECLINE, HELMET CROWN y = 0.82 m)
    # Positioned inside the bucket seat with knees bowed low and wide so they
    # never touch the rotating steering wheel, gloves, or Nassau fairing.
    # =========================================================================
    torso_spine = [
        (-0.145, 0.145, 0.0, -0.55, 0.83, 0.056, 0.108),  # Pelvis base above seat floor
        (-0.195, 0.195, 0.0, -0.58, 0.81, 0.068, 0.124),  # Hips
        (-0.245, 0.265, 0.0, -0.57, 0.82, 0.068, 0.122),  # Waist
        (-0.292, 0.335, 0.0, -0.55, 0.83, 0.074, 0.132),  # Lower ribs
        (-0.335, 0.410, 0.0, -0.50, 0.86, 0.080, 0.146),  # Chest
        (-0.368, 0.482, 0.0, -0.40, 0.91, 0.078, 0.162),  # Upper chest / shoulders
        (-0.384, 0.530, 0.0, -0.25, 0.97, 0.066, 0.142),  # Collarbone yoke
        (-0.388, 0.562, 0.0, -0.10, 0.99, 0.048, 0.078),  # Neck collar base
    ]
    torso_rings = [
        oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn, rs, n=20)
        for (x, y, z, tx, ty, rn, rs) in torso_spine
    ]
    create_loft_mesh("Driver_Reclined_Torso", torso_rings, mats["suit"], subsurf_levels=1, collection=col_driver_body)

    rib_vest_spine = [
        (-0.252, 0.275, 0.0, -0.56, 0.82, 0.073, 0.130),
        (-0.292, 0.335, 0.0, -0.55, 0.83, 0.079, 0.138),
        (-0.328, 0.395, 0.0, -0.51, 0.86, 0.083, 0.146),
    ]
    rib_rings = [
        oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn, rs, n=20)
        for (x, y, z, tx, ty, rn, rs) in rib_vest_spine
    ]
    create_loft_mesh("Driver_Rib_Protector", rib_rings, mats["black"], subsurf_levels=1, collection=col_driver_body)

    for side in (-1, 1):
        harness_pts = [
            (-0.445, 0.545, side * 0.072),
            (-0.365, 0.535, side * 0.088),
            (-0.265, 0.445, side * 0.068),
            (-0.195, 0.325, side * 0.042),
            (-0.155, 0.225, side * 0.024),
        ]
        create_tube_curve(f"Driver_Harness_Strap_{side}", harness_pts, 0.011, mats["harness"], collection=col_driver_body)

        # Bent legs seamlessly joined to pelvis and bowed outward at the knees (y_top <= 0.214 m)
        # so they stay > 5 cm clear of the rotating steering wheel/gloves
        leg_spine = [
            ((-0.18, 0.165, side * 0.068), (0.96, 0.20, 0.0), 0.056, 0.058),
            ((-0.03, 0.168, side * 0.118), (0.98, 0.08, 0.0), 0.048, 0.048),
            ((0.14, 0.170, side * 0.148), (0.98, -0.14, 0.0), 0.042, 0.042),
            ((0.28, 0.148, side * 0.112), (0.96, -0.22, 0.0), 0.036, 0.036),
            ((0.40, 0.132, side * 0.078), (0.98, -0.15, 0.0), 0.030, 0.030),
        ]
        leg_rings = [
            oriented_ellipse_ring(center, tangent, rn, rs, n=16)
            for (center, tangent, rn, rs) in leg_spine
        ]
        create_loft_mesh(f"Driver_Leg_{side}", leg_rings, mats["suit"], subsurf_levels=1, collection=col_driver_body)

        # Racing boot on pedal inside the narrow front footwell (z = ±0.078 m)
        boot_rings = [
            superellipse_ring(0.385, 0.096, 0.158, side * 0.078, 0.030, power_y=0.5, power_z=0.5),
            superellipse_ring(0.425, 0.102, 0.182, side * 0.078, 0.032, power_y=0.5, power_z=0.5),
            superellipse_ring(0.452, 0.125, 0.194, side * 0.078, 0.026, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Boot_{side}", boot_rings, mats["black"], subsurf_levels=1, collection=col_driver_body)

        epaulette = [
            superellipse_ring(-0.390, 0.515, 0.536, side * 0.128, 0.034, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.342, 0.505, 0.526, side * 0.128, 0.034, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Epaulette_{side}", epaulette, mats["trim"], subsurf_levels=0, collection=col_driver_body)

    buckle_rings = [
        superellipse_ring(-0.172, 0.228, 0.264, 0.0, 0.024, power_y=0.4, power_z=0.4),
        superellipse_ring(-0.156, 0.228, 0.264, 0.0, 0.024, power_y=0.4, power_z=0.4),
    ]
    create_loft_mesh("Driver_Harness_Buckle", buckle_rings, mats["alloy"], subsurf_levels=0, collection=col_driver_body)

    # =========================================================================
    # 9. AERODYNAMIC FULL-FACE KARTING HELMET (Crown at y = 0.818 m < 0.86 m Roll Hoop)
    # =========================================================================
    neck_rings = [
        oriented_ellipse_ring((-0.388, 0.535, 0.0), (0.12, 0.99, 0.0), 0.070, 0.084, n=20),
        oriented_ellipse_ring((-0.376, 0.568, 0.0), (0.16, 0.98, 0.0), 0.066, 0.078, n=20),
        oriented_ellipse_ring((-0.365, 0.598, 0.0), (0.18, 0.98, 0.0), 0.062, 0.074, n=20),
    ]
    create_loft_mesh("Driver_Neck_Collar", neck_rings, mats["black"], subsurf_levels=1, collection=col_driver_head)

    helmet_rows = [
        (-0.352, 0.590, 0.082, 0.072, 0.082),
        (-0.338, 0.618, 0.136, 0.104, 0.108),
        (-0.330, 0.652, 0.148, 0.118, 0.120),
        (-0.333, 0.692, 0.144, 0.126, 0.125),
        (-0.338, 0.732, 0.138, 0.132, 0.126),
        (-0.344, 0.768, 0.122, 0.128, 0.118),
        (-0.350, 0.795, 0.092, 0.104, 0.094),
        (-0.356, 0.812, 0.048, 0.056, 0.052),
        (-0.358, 0.818, 0.010, 0.012, 0.010),
    ]
    helmet_rings = []
    for (hx, hy, rxf, rxb, rz) in helmet_rows:
        ring = []
        for j in range(24):
            ang = (j / 24) * math.pi * 2.0
            ca = math.cos(ang)
            sa = math.sin(ang)
            rx = rxf if ca >= 0 else rxb
            ring.append((hx + ca * rx, hy, sa * rz))
        helmet_rings.append(ring)
    create_loft_mesh("Driver_Helmet_Shell", helmet_rings, mats["helmet"], subsurf_levels=1, collection=col_driver_head)

    visor_rows = [
        (-0.332, 0.680, 0.146, 0.125),
        (-0.336, 0.706, 0.143, 0.127),
        (-0.340, 0.730, 0.139, 0.127),
        (-0.343, 0.752, 0.128, 0.121),
    ]
    visor_rings = []
    for (vx, vy, rx, rz) in visor_rows:
        ring = []
        n_v = 14
        for j in range(n_v + 1):
            ang = -1.12 + (j / n_v) * 2.24
            ring.append((vx + math.cos(ang) * (rx + 0.004), vy, math.sin(ang) * (rz + 0.004)))
        for j in range(n_v, -1, -1):
            ang = -1.12 + (j / n_v) * 2.24
            ring.append((vx + math.cos(ang) * (rx - 0.004), vy, math.sin(ang) * (rz - 0.004)))
        visor_rings.append(ring)
    create_loft_mesh("Driver_Helmet_Visor", visor_rings, mats["visor"], subsurf_levels=0, collection=col_driver_head)

    chin_vent = [
        superellipse_ring(-0.208, 0.625, 0.642, 0.0, 0.032, power_y=0.45, power_z=0.45),
        superellipse_ring(-0.198, 0.625, 0.642, 0.0, 0.026, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("Driver_Helmet_Chin_Vent", chin_vent, mats["black"], subsurf_levels=0, collection=col_driver_head)

    # =========================================================================
    # 10. RACING GLOVES (Local to Left/Right hand grip on F1 wheel)
    # Compact profile wrapping the rim so x_local stays within [-0.038, +0.016].
    # =========================================================================
    for side, col_glove in ((-1, col_glove_l), (1, col_glove_r)):
        palm_rings = [
            superellipse_ring(-0.028, -0.022, 0.022, 0.0, 0.018, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.010, -0.028, 0.028, 0.0, 0.020, power_y=0.5, power_z=0.5),
            superellipse_ring(0.010, -0.026, 0.026, 0.0, 0.018, power_y=0.5, power_z=0.5),
            superellipse_ring(0.020, -0.018, 0.018, 0.0, 0.012, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Glove_Palm_{side}", palm_rings, mats["black"], subsurf_levels=1, collection=col_glove)

        cuff_rings = [
            superellipse_ring(-0.042, -0.022, 0.022, 0.0, 0.022, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.024, -0.022, 0.022, 0.0, 0.020, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Glove_Cuff_{side}", cuff_rings, mats["glovePad"], subsurf_levels=0, collection=col_glove)

        for f_idx in range(4):
            fy = -0.018 + f_idx * 0.012
            finger_pts = [
                (-0.006, fy, side * 0.006),
                (0.004, fy, side * 0.016),
                (0.016, fy, side * 0.014),
                (0.022, fy, side * 0.002),
                (0.014, fy, -side * 0.010),
            ]
            create_tube_curve(f"Driver_Glove_Finger_{side}_{f_idx}", finger_pts, 0.0048, mats["black"], collection=col_glove)

    # =========================================================================
    # EXPORT .BLEND, .GLB, AND SYNCHRONOUS TYPESCRIPT MESH BUFFERS
    # =========================================================================
    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(TS_OUT), exist_ok=True)

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def extract_collection_batches(col: bpy.types.Collection) -> dict[str, tuple[list[float], list[float], list[int]]]:
        mat_to_key = {m.name: k for k, m in mats.items()}
        batches: dict[str, tuple[list[float], list[float], list[int]]] = {}

        for obj in col.objects:
            if obj.type != "MESH":
                continue
            eval_obj = obj.evaluated_get(depsgraph)
            eval_mesh = eval_obj.to_mesh()
            bm = bmesh.new()
            bm.from_mesh(eval_mesh)
            bmesh.ops.triangulate(bm, faces=bm.faces)
            bm.normal_update()

            mat_name = eval_mesh.materials[0].name if eval_mesh.materials else "K1_Crimson_Red"
            key = mat_to_key.get(mat_name, "red")
            if key not in batches:
                batches[key] = ([], [], [])
            pos_list, norm_list, idx_list = batches[key]
            base_vertex = len(pos_list) // 3

            for v in bm.verts:
                co = obj.matrix_world @ v.co
                no = (obj.matrix_world.to_3x3() @ v.normal).normalized()
                pos_list.extend((round(co.x, 4), round(co.z, 4), round(-co.y, 4)))
                norm_list.extend((round(no.x, 3), round(no.z, 3), round(-no.y, 3)))

            for f in bm.faces:
                v0, v1, v2 = f.verts[0].index, f.verts[1].index, f.verts[2].index
                idx_list.extend((base_vertex + v0, base_vertex + v1, base_vertex + v2))

            bm.free()
            eval_obj.to_mesh_clear()
        return batches

    groups_data = {
        "stationary": extract_collection_batches(col_stationary),
        "steeringWheel": extract_collection_batches(col_steer),
        "driverFixed": extract_collection_batches(col_driver_body),
        "driverHead": extract_collection_batches(col_driver_head),
        "gloveLeft": extract_collection_batches(col_glove_l),
        "gloveRight": extract_collection_batches(col_glove_r),
    }

    # =========================================================================
    # MATHEMATICAL 3D CLEARANCE VERIFICATION (NORMAL & FULL STEERING LOCK)
    # =========================================================================
    def collect_verts(batches: dict[str, tuple[list[float], list[float], list[int]]]) -> list[tuple[float, float, float]]:
        pts = []
        for pos, _, _ in batches.values():
            for i in range(0, len(pos), 3):
                pts.append((pos[i], pos[i + 1], pos[i + 2]))
        return pts

    stat_verts = collect_verts(groups_data["stationary"])
    driver_verts = collect_verts(groups_data["driverFixed"])
    steer_verts = collect_verts(groups_data["steeringWheel"])
    glove_l_verts = collect_verts(groups_data["gloveLeft"])
    glove_r_verts = collect_verts(groups_data["gloveRight"])

    # 1. Verify front and rear wheel clearances at steer = 0 and steer = ±MAX_STEER_ANGLE_RAD
    # Exclude only the axle shaft / kingpin vertices that intentionally sit between inner wheel hubs
    for steer_rad in (-MAX_STEER_ANGLE_RAD, 0.0, MAX_STEER_ANGLE_RAD):
        c_s, s_s = math.cos(-steer_rad), math.sin(-steer_rad)
        for side in (-1, 1):
            wx, wy, wz = FRONT_AXLE_X, TIRE_RADIUS, side * FRONT_TRACK_HALF_Z
            for (px, py, pz) in stat_verts + driver_verts:
                # Ignore central kingpin beam vertices inside |z| <= 0.195 at x ~= 0.54
                if abs(px - FRONT_AXLE_X) <= 0.025 and abs(py - TIRE_RADIUS) <= 0.025 and abs(pz) <= 0.195:
                    continue
                dx, dy, dz = px - wx, py - wy, pz - wz
                # Rotate into front wheel local frame
                lx = dx * c_s - dz * s_s
                lz = dx * s_s + dz * c_s
                radial = math.hypot(lx, dy)
                if radial < TIRE_RADIUS + 0.015 and abs(lz) < WHEEL_HALF_WIDTH + 0.015:
                    raise AssertionError(
                        f"Front wheel overlap at steer={steer_rad:.2f} rad, side={side}: point=({px:.3f}, {py:.3f}, {pz:.3f})"
                    )

    for side in (-1, 1):
        wx, wy, wz = REAR_AXLE_X, TIRE_RADIUS, side * REAR_TRACK_HALF_Z
        for (px, py, pz) in stat_verts + driver_verts:
            # Ignore rear live axle shaft inside |z| <= 0.252 at x ~= -0.52
            if abs(px - REAR_AXLE_X) <= 0.025 and abs(py - TIRE_RADIUS) <= 0.025 and abs(pz) <= 0.252:
                continue
            dx, dy, dz = px - wx, py - wy, pz - wz
            radial = math.hypot(dx, dy)
            if radial < TIRE_RADIUS + 0.015 and abs(dz) < WHEEL_HALF_WIDTH + 0.015:
                raise AssertionError(f"Rear wheel overlap at side={side}: point=({px:.3f}, {py:.3f}, {pz:.3f})")

    # 2. Verify rotating steeringWheel + gloves clearance against stationary bodywork & driver legs
    # In steeringMount local space (origin=(0.21, 0.36, 0), rot_z=0.40), the rotating assembly
    # occupies x_l in [-0.055, +0.018] and r_l <= 0.145 m.
    cm, sm = math.cos(STEER_MOUNT_ROT_Z), math.sin(STEER_MOUNT_ROT_Z)
    max_rot_xl = -1e9
    min_rot_xl = 1e9
    max_rot_rl = 0.0
    for (lx, ly, lz) in steer_verts:
        max_rot_xl = max(max_rot_xl, lx)
        min_rot_xl = min(min_rot_xl, lx)
        max_rot_rl = max(max_rot_rl, math.hypot(ly, lz))
    for side, g_verts in ((-1, glove_l_verts), (1, glove_r_verts)):
        for (gx, gy, gz) in g_verts:
            lx, ly, lz = gx - 0.010, gy, gz + side * GLOVE_OFFSET_Z
            max_rot_xl = max(max_rot_xl, lx)
            min_rot_xl = min(min_rot_xl, lx)
            max_rot_rl = max(max_rot_rl, math.hypot(ly, lz))

    for (px, py, pz) in stat_verts + driver_verts:
        dx, dy = px - STEER_MOUNT_POS[0], py - STEER_MOUNT_POS[1]
        xl = dx * cm + dy * sm
        yl = -dx * sm + dy * cm
        rl = math.hypot(yl, pz)
        if (min_rot_xl - 0.010) <= xl <= (max_rot_xl + 0.010) and rl <= (max_rot_rl + 0.010):
            raise AssertionError(
                f"Steering wheel / glove swept envelope overlap at point=({px:.3f}, {py:.3f}, {pz:.3f}), xl={xl:.3f}, rl={rl:.3f}"
            )

    # Write TypeScript synchronous mesh module
    lines = [
        "// AUTO-GENERATED BY tools/build-kart-model.py via Blender 5.2 CLI — DO NOT EDIT MANUALLY",
        "export interface BlenderMeshBatch {",
        "  positions: number[];",
        "  normals: number[];",
        "  indices: number[];",
        "}",
        "",
        "export type BlenderGroupBatches = Record<string, BlenderMeshBatch>;",
        "",
    ]
    total_tris = 0
    for group_name, batches in groups_data.items():
        lines.append(f"export const {group_name.upper()}_BATCHES: BlenderGroupBatches = {{")
        for mat_key, (pos, norm, idx) in batches.items():
            total_tris += len(idx) // 3
            pos_str = ",".join(f"{x:g}" for x in pos)
            norm_str = ",".join(f"{x:g}" for x in norm)
            idx_str = ",".join(str(i) for i in idx)
            lines.append(f"  {mat_key}: {{")
            lines.append(f"    positions: [{pos_str}],")
            lines.append(f"    normals: [{norm_str}],")
            lines.append(f"    indices: [{idx_str}],")
            lines.append("  },")
        lines.append("};")
        lines.append("")

    with open(TS_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    # =========================================================================
    # ASSEMBLE WORLD POSES FOR .BLEND, .GLB, AND CYCLES PREVIEW RENDER
    # Apply the exact Three.js steeringMount transform (pos=(0.21, 0.36, 0), rot_z=0.4)
    # and KART_WHEEL_GEOMETRY wheel centers so .blend/.glb/preview match Three.js 1:1.
    # =========================================================================
    def transform_mesh_in_three_space(obj: bpy.types.Object, offset_local: tuple[float, float, float]) -> None:
        ox, oy, oz = offset_local
        for v in obj.data.vertices:
            # Convert Blender vertex (bx, by, bz) -> Three.js (tx, ty, tz)
            tx, ty, tz = v.co.x + ox, v.co.z + oy, -v.co.y + oz
            # Apply steeringMount rotation.z = 0.40 and translation (0.21, 0.36, 0)
            wx = STEER_MOUNT_POS[0] + tx * cm - ty * sm
            wy = STEER_MOUNT_POS[1] + tx * sm + ty * cm
            wz = STEER_MOUNT_POS[2] + tz
            v.co = t2b(wx, wy, wz)
        obj.data.update()

    for obj in col_steer.objects:
        transform_mesh_in_three_space(obj, (0.0, 0.0, 0.0))
    for obj in col_glove_l.objects:
        transform_mesh_in_three_space(obj, (-0.010, 0.0, -GLOVE_OFFSET_Z))
    for obj in col_glove_r.objects:
        transform_mesh_in_three_space(obj, (-0.010, 0.0, GLOVE_OFFSET_Z))

    for label, wx, wz in (
        ("FL", FRONT_AXLE_X, -FRONT_TRACK_HALF_Z),
        ("FR", FRONT_AXLE_X, FRONT_TRACK_HALF_Z),
        ("RL", REAR_AXLE_X, -REAR_TRACK_HALF_Z),
        ("RR", REAR_AXLE_X, REAR_TRACK_HALF_Z),
    ):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=TIRE_RADIUS,
            depth=0.136,
            location=t2b(wx, TIRE_RADIUS, wz),
            rotation=(math.pi / 2, 0.0, 0.0),
        )
        wheel_obj = bpy.context.active_object
        wheel_obj.name = f"OTL_Wheel_{label}"
        wheel_obj.data.materials.append(mats["rubber"])
        for c in list(wheel_obj.users_collection):
            c.objects.unlink(wheel_obj)
        col_wheel.objects.link(wheel_obj)

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24,
            radius=0.090,
            depth=0.142,
            location=t2b(wx, TIRE_RADIUS, wz),
            rotation=(math.pi / 2, 0.0, 0.0),
        )
        rim_obj = bpy.context.active_object
        rim_obj.name = f"OTL_Rim_{label}"
        rim_obj.data.materials.append(mats["alloy"])
        for c in list(rim_obj.users_collection):
            c.objects.unlink(rim_obj)
        col_wheel.objects.link(rim_obj)

    for side in (-1, 1):
        arm_pts = [
            (-0.368, 0.482, side * 0.165),
            (-0.095, 0.375, side * 0.195),
            (0.160, 0.352, side * GLOVE_OFFSET_Z),
        ]
        create_tube_curve(f"Driver_Sleeve_Posed_{side}", arm_pts, 0.042, mats["suit"], collection=col_driver_body)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )

    # Render a studio 3/4 preview image using Blender's CPU Cycles renderer
    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("Preview_Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = Vector((1.75, 1.85, 1.05))
    direction = Vector((-0.05, 0.0, 0.36)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    for lname, loc, energy in (
        ("Studio_Key", (2.5, 2.2, 3.2), 180.0),
        ("Studio_Fill", (-2.2, 2.0, 2.4), 90.0),
        ("Studio_Rim", (-1.8, -2.5, 2.8), 110.0),
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
    floor_mat = make_material("Studio_Floor_Mat", (0.16, 0.18, 0.21), roughness=0.72, metalness=0.0)
    floor_obj.data.materials.append(floor_mat)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.filepath = PREVIEW_OUT
    bpy.ops.render.render(write_still=True)

    print(
        f"SUCCESS: Verified zero 3D overlaps (rot_xl=[{min_rot_xl:.3f}, {max_rot_xl:.3f}], max_rl={max_rot_rl:.3f}) "
        f"and generated {BLEND_OUT}, {GLB_OUT}, {PREVIEW_OUT}, and {TS_OUT} ({total_tris} triangles)"
    )


if __name__ == "__main__":
    build_otl_superleggero()
