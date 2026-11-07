#!/usr/bin/env python3
"""
Blender CLI asset generator for the K1 Speed Toronto OTL Superleggero electric
rental go-kart and realistic reclined seated driver.

Run via official Blender CLI:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build-kart-model.py

Outputs:
  - assets/otl-superleggero.blend
  - public/models/otl-superleggero.glb
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
    # Normal in X-Y plane: (-ty, tx, 0)
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
    # 1. OTL SUPERLEGGERO FULL WRAPAROUND PROTEX / HDPE BUMPER & SKIRT SYSTEM
    # Strictly inside x in [-0.785, 0.865], z in [-0.432, 0.432]
    # =========================================================================
    bumper_Loop = [
        (-0.755, 0.125, -0.31),
        (-0.66, 0.125, -0.410),
        (-0.20, 0.120, -0.415),
        (0.28, 0.120, -0.412),
        (0.55, 0.122, -0.395),
        (0.77, 0.125, -0.275),
        (0.842, 0.128, -0.11),
        (0.852, 0.128, 0.0),
        (0.842, 0.128, 0.11),
        (0.77, 0.125, 0.275),
        (0.55, 0.122, 0.395),
        (0.28, 0.120, 0.412),
        (-0.20, 0.120, 0.415),
        (-0.66, 0.125, 0.410),
        (-0.755, 0.125, 0.31),
        (-0.772, 0.128, 0.0),
    ]
    create_tube_curve("OTL_Wraparound_Bumper_Main", bumper_Loop, 0.022, mats["rubber"], closed=True, collection=col_stationary)

    # Upper Protex bumper rib & red impact insert strip around nose and side skirts
    bumper_upper = [(x * 0.99, y + 0.030, z * 0.985) for (x, y, z) in bumper_Loop]
    create_tube_curve("OTL_Wraparound_Bumper_Upper", bumper_upper, 0.015, mats["rubber"], closed=True, collection=col_stationary)

    red_insert_front = [
        (0.56, 0.138, -0.395),
        (0.775, 0.140, -0.27),
        (0.848, 0.142, 0.0),
        (0.775, 0.140, 0.27),
        (0.56, 0.138, 0.395),
    ]
    create_tube_curve("OTL_Front_Bumper_Red_Strip", red_insert_front, 0.0085, mats["red"], closed=False, collection=col_stationary)

    for side in (-1, 1):
        side_strip = [
            (-0.62, 0.138, side * 0.412),
            (-0.15, 0.135, side * 0.416),
            (0.32, 0.135, side * 0.410),
        ]
        create_tube_curve(f"OTL_Side_Rub_Strip_{side}", side_strip, 0.008, mats["red"], closed=False, collection=col_stationary)

    # =========================================================================
    # 2. FLOOR PAN, CHASSIS RAILS & FOOTWELL PEDALS
    # =========================================================================
    floor_sections = [
        superellipse_ring(-0.64, 0.062, 0.084, 0.0, 0.26, power_y=0.35, power_z=0.35),
        superellipse_ring(-0.20, 0.062, 0.084, 0.0, 0.28, power_y=0.35, power_z=0.35),
        superellipse_ring(0.28, 0.062, 0.084, 0.0, 0.26, power_y=0.35, power_z=0.35),
        superellipse_ring(0.56, 0.065, 0.086, 0.0, 0.22, power_y=0.35, power_z=0.35),
        superellipse_ring(0.76, 0.072, 0.092, 0.0, 0.15, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Floor_Pan", floor_sections, mats["carbon"], subsurf_levels=1, collection=col_stationary)

    for side in (-1, 1):
        chassis_rail = [
            (-0.70, 0.105, side * 0.22),
            (-0.28, 0.105, side * 0.25),
            (0.36, 0.105, side * 0.21),
            (0.68, 0.110, side * 0.15),
        ]
        create_tube_curve(f"Chassis_Main_Rail_{side}", chassis_rail, 0.016, mats["red"], collection=col_stationary)

        # Footwell support rails & sculpted pedals
        foot_bar = [
            (0.18, 0.095, side * 0.16),
            (0.36, 0.175, side * 0.13),
            (0.49, 0.255, side * 0.11),
        ]
        create_tube_curve(f"Footwell_Strut_{side}", foot_bar, 0.011, mats["steel"], collection=col_stationary)

        pedal_rings = [
            superellipse_ring(0.44, 0.11, 0.21, side * 0.14, 0.028, power_y=0.4, power_z=0.4),
            superellipse_ring(0.455, 0.11, 0.21, side * 0.14, 0.028, power_y=0.4, power_z=0.4),
        ]
        create_loft_mesh(f"Pedal_Face_{side}", pedal_rings, mats["alloy"], subsurf_levels=0, collection=col_stationary)

    for x_cross in (-0.60, -0.18, 0.28, 0.66):
        create_tube_curve(
            f"Chassis_Crossmember_{x_cross:.2f}",
            [(x_cross, 0.105, -0.34), (x_cross, 0.105, 0.34)],
            0.012,
            mats["steel"],
            collection=col_stationary,
        )

    # =========================================================================
    # 3. OTL SUPERLEGGERO SCULPTED NOSE CONE & NASSAU FAIRING
    # Kept crisp and low (y <= 0.34 m at steering cowl) so Helmet Cam has an
    # unobstructed view of the yellow wheel marker and digital binnacle.
    # =========================================================================
    nose_lower_black = [
        superellipse_ring(0.46, 0.115, 0.195, 0.0, 0.24, power_y=0.5, power_z=0.6),
        superellipse_ring(0.60, 0.115, 0.205, 0.0, 0.285, power_y=0.5, power_z=0.6),
        superellipse_ring(0.73, 0.118, 0.200, 0.0, 0.265, power_y=0.5, power_z=0.6),
        superellipse_ring(0.82, 0.122, 0.182, 0.0, 0.165, power_y=0.5, power_z=0.6),
        superellipse_ring(0.85, 0.126, 0.165, 0.0, 0.045, power_y=0.5, power_z=0.6),
    ]
    create_loft_mesh("OTL_Nose_Splitter_Base", nose_lower_black, mats["black"], subsurf_levels=1, collection=col_stationary)

    nose_red_shell = [
        superellipse_ring(0.45, 0.155, 0.255, 0.0, 0.215, power_y=0.55, power_z=0.62),
        superellipse_ring(0.57, 0.155, 0.282, 0.0, 0.268, power_y=0.55, power_z=0.62),
        superellipse_ring(0.69, 0.152, 0.280, 0.0, 0.262, power_y=0.55, power_z=0.62),
        superellipse_ring(0.79, 0.148, 0.242, 0.0, 0.185, power_y=0.55, power_z=0.62),
        superellipse_ring(0.842, 0.142, 0.195, 0.0, 0.055, power_y=0.55, power_z=0.62),
    ]
    create_loft_mesh("OTL_Nose_Red_Cowling", nose_red_shell, mats["red"], subsurf_levels=1, collection=col_stationary)

    # Nassau steering column fairing rising toward the lower steering shaft (max y = 0.335 m)
    nassau_fairing = [
        superellipse_ring(0.20, 0.245, 0.325, 0.0, 0.095, power_y=0.5, power_z=0.55),
        superellipse_ring(0.31, 0.230, 0.335, 0.0, 0.132, power_y=0.5, power_z=0.55),
        superellipse_ring(0.44, 0.205, 0.310, 0.0, 0.155, power_y=0.5, power_z=0.55),
        superellipse_ring(0.56, 0.185, 0.286, 0.0, 0.140, power_y=0.5, power_z=0.55),
    ]
    create_loft_mesh("OTL_Nassau_Fairing", nassau_fairing, mats["red"], subsurf_levels=1, collection=col_stationary)

    # White K1 Speed livery flush fairing panels on the nose cone & Nassau panel
    nose_center_panel = [
        superellipse_ring(0.32, 0.312, 0.340, 0.0, 0.058, power_y=0.35, power_z=0.35),
        superellipse_ring(0.46, 0.285, 0.314, 0.0, 0.072, power_y=0.35, power_z=0.35),
        superellipse_ring(0.64, 0.262, 0.286, 0.0, 0.088, power_y=0.35, power_z=0.35),
        superellipse_ring(0.77, 0.228, 0.250, 0.0, 0.062, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Nose_White_Center_Panel", nose_center_panel, mats["white"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 4. OTL SUPERLEGGERO ANGULAR SCULPTED SIDEPODS & INTAKE DUCTS
    # =========================================================================
    for side in (-1, 1):
        pod_red = [
            superellipse_ring(-0.55, 0.132, 0.235, side * 0.295, 0.032, power_y=0.45, power_z=0.50),
            superellipse_ring(-0.44, 0.132, 0.288, side * 0.312, 0.074, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.014),
            superellipse_ring(-0.20, 0.130, 0.298, side * 0.318, 0.080, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.016),
            superellipse_ring(0.08, 0.130, 0.286, side * 0.315, 0.078, power_y=0.45, power_z=0.50, z_skew_top=-side * 0.012),
            superellipse_ring(0.25, 0.132, 0.258, side * 0.302, 0.062, power_y=0.45, power_z=0.50),
            superellipse_ring(0.35, 0.135, 0.205, side * 0.282, 0.028, power_y=0.45, power_z=0.50),
        ]
        create_loft_mesh(f"OTL_Sidepod_Red_{side}", pod_red, mats["red"], subsurf_levels=1, collection=col_stationary)

        pod_black_base = [
            superellipse_ring(-0.53, 0.112, 0.195, side * 0.305, 0.030, power_y=0.45, power_z=0.5),
            superellipse_ring(-0.38, 0.112, 0.208, side * 0.322, 0.076, power_y=0.45, power_z=0.5),
            superellipse_ring(0.14, 0.112, 0.198, side * 0.320, 0.076, power_y=0.45, power_z=0.5),
            superellipse_ring(0.33, 0.115, 0.172, side * 0.290, 0.025, power_y=0.45, power_z=0.5),
        ]
        create_loft_mesh(f"OTL_Sidepod_Black_Base_{side}", pod_black_base, mats["black"], subsurf_levels=1, collection=col_stationary)

        # Clean upper-shoulder white livery trim crowning the sidepod
        side_white_panel = [
            superellipse_ring(-0.41, 0.275, 0.296, side * 0.312, 0.042, power_y=0.45, power_z=0.5),
            superellipse_ring(-0.18, 0.282, 0.304, side * 0.318, 0.048, power_y=0.45, power_z=0.5),
            superellipse_ring(0.06, 0.274, 0.294, side * 0.315, 0.044, power_y=0.45, power_z=0.5),
            superellipse_ring(0.21, 0.250, 0.268, side * 0.302, 0.032, power_y=0.45, power_z=0.5),
        ]
        create_loft_mesh(f"OTL_Sidepod_White_Panel_{side}", side_white_panel, mats["white"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 5. DEEP RECLINED BUCKET SEAT (~35°), ROLL HOOP / HEADREST & 4-POINT HARNESS
    # =========================================================================
    # Seat shell built from U-channel cross-sections from thigh bolster to headrest
    seat_rows = [
        # (x_center, y_center, half_width, side_bolster_height, thickness)
        (0.08, 0.125, 0.165, 0.065, 0.018),
        (-0.08, 0.092, 0.160, 0.082, 0.018),
        (-0.22, 0.115, 0.162, 0.090, 0.018),
        (-0.32, 0.225, 0.172, 0.078, 0.018),
        (-0.39, 0.365, 0.182, 0.058, 0.018),
        (-0.44, 0.505, 0.175, 0.040, 0.018),
        (-0.46, 0.615, 0.130, 0.022, 0.016),
    ]
    seat_rings = []
    for (sx, sy, sw, sbh, sth) in seat_rows:
        ring = []
        n_u = 12
        # Top surface left -> right
        for j in range(n_u + 1):
            u = (j / n_u) * 2.0 - 1.0
            edge = abs(u) ** 2.6
            px = sx + edge * sbh * 0.45
            py = sy + edge * sbh
            pz = u * sw
            ring.append((px, py, pz))
        # Bottom surface right -> left
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
        (-0.46, 0.22, -0.175),
        (-0.47, 0.52, -0.168),
        (-0.475, 0.78, -0.135),
        (-0.475, 0.858, -0.065),
        (-0.475, 0.862, 0.0),
        (-0.475, 0.858, 0.065),
        (-0.475, 0.78, 0.135),
        (-0.47, 0.52, 0.168),
        (-0.46, 0.22, 0.175),
    ]
    create_tube_curve("OTL_Roll_Hoop_Main", roll_hoop_pts, 0.017, mats["black"], closed=False, collection=col_stationary)

    for side in (-1, 1):
        rear_brace = [
            (-0.475, 0.75, side * 0.13),
            (-0.59, 0.50, side * 0.155),
            (-0.69, 0.26, side * 0.17),
        ]
        create_tube_curve(f"OTL_Roll_Hoop_Rear_Brace_{side}", rear_brace, 0.013, mats["black"], closed=False, collection=col_stationary)

    # Padded headrest cushion mounted on the roll hoop behind the driver's helmet
    headrest_rings = [
        superellipse_ring(-0.465, 0.62, 0.79, 0.0, 0.088, power_y=0.45, power_z=0.45),
        superellipse_ring(-0.435, 0.62, 0.79, 0.0, 0.088, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("OTL_Headrest_Pad", headrest_rings, mats["rubber"], subsurf_levels=1, collection=col_stationary)

    # =========================================================================
    # 6. ENCLOSED REAR ELECTRIC POWERTRAIN SHROUD, LIVE AXLE, MOTOR & BRAKE
    # =========================================================================
    shroud_rings = [
        superellipse_ring(-0.74, 0.135, 0.315, 0.0, 0.165, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.64, 0.135, 0.365, 0.0, 0.205, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.51, 0.135, 0.355, 0.0, 0.195, power_y=0.5, power_z=0.55),
        superellipse_ring(-0.43, 0.135, 0.305, 0.0, 0.155, power_y=0.5, power_z=0.55),
    ]
    create_loft_mesh("OTL_Rear_Powertrain_Shroud", shroud_rings, mats["black"], subsurf_levels=1, collection=col_stationary)

    # Red rear shroud top cover crest
    shroud_crest = [
        superellipse_ring(-0.71, 0.305, 0.362, 0.0, 0.105, power_y=0.5, power_z=0.5),
        superellipse_ring(-0.60, 0.325, 0.382, 0.0, 0.125, power_y=0.5, power_z=0.5),
        superellipse_ring(-0.48, 0.310, 0.365, 0.0, 0.110, power_y=0.5, power_z=0.5),
    ]
    create_loft_mesh("OTL_Rear_Shroud_Red_Crest", shroud_crest, mats["red"], subsurf_levels=1, collection=col_stationary)

    # Rear live axle & HV orange cable
    create_tube_curve(
        "OTL_Rear_Live_Axle",
        [(-0.52, 0.145, -0.385), (-0.52, 0.145, 0.385)],
        0.018,
        mats["steel"],
        collection=col_stationary,
    )
    create_tube_curve(
        "OTL_HV_Orange_Conduit",
        [(-0.60, 0.31, 0.18), (-0.68, 0.36, 0.14), (-0.70, 0.33, -0.08), (-0.59, 0.29, -0.14)],
        0.009,
        mats["orange"],
        collection=col_stationary,
    )

    # Steering column shaft from lower bulkhead to lowered steering mount (0.21, 0.36, 0)
    create_tube_curve(
        "OTL_Steering_Column_Shaft",
        [(0.21, 0.36, 0.0), (0.39, 0.16, 0.0)],
        0.014,
        mats["steel"],
        collection=col_stationary,
    )
    # Compact binnacle support bracket rising to dash housing at (0.295, 0.455, 0)
    create_tube_curve(
        "OTL_Dash_Mount_Bracket",
        [(0.28, 0.28, 0.0), (0.31, 0.42, 0.0), (0.295, 0.46, 0.0)],
        0.0075,
        mats["black"],
        collection=col_stationary,
    )
    dash_housing_rings = [
        superellipse_ring(0.272, 0.445, 0.515, 0.0, 0.076, power_y=0.35, power_z=0.35),
        superellipse_ring(0.308, 0.445, 0.515, 0.0, 0.076, power_y=0.35, power_z=0.35),
    ]
    create_loft_mesh("OTL_Dash_Housing", dash_housing_rings, mats["black"], subsurf_levels=0, collection=col_stationary)

    # =========================================================================
    # 7. F1-STYLE OPEN-TOP / FLAT-BOTTOM STEERING WHEEL (Local to steeringWheel)
    # Pivot is at (0.21, 0.36, 0). Top arch carries the yellow center marker
    # at radius 0.119 m so steering-direction-check.mjs detects > 30 yellow pixels.
    # =========================================================================
    f1_rim_pts = []
    for i in range(36):
        ang = (i / 36) * math.pi * 2.0
        # angle = 0 is top (+Y), pi/2 is right (+Z), pi is bottom (-Y)
        ca = math.cos(ang)
        sa = math.sin(ang)
        r = 0.119
        # Flatten the bottom slightly and sculpt side thumb grips for F1 yoke profile
        y_local = ca * r
        if y_local < -0.088:
            y_local = -0.088 + (y_local + 0.088) * 0.25
        z_local = sa * (r + 0.006 * (abs(sa) ** 3))
        f1_rim_pts.append((0.0, y_local, z_local))
    create_tube_curve("OTL_F1_Wheel_Rim", f1_rim_pts, 0.0155, mats["rubber"], closed=True, collection=col_steer)

    # Yellow top-center marker band on the top of the F1 wheel rim (angle in [-0.14, 0.14])
    marker_pts = []
    for i in range(9):
        ang = -0.13 + (i / 8) * 0.26
        marker_pts.append((0.0, math.cos(ang) * 0.119, math.sin(ang) * 0.119))
    create_tube_curve("OTL_F1_Wheel_Yellow_Marker", marker_pts, 0.0178, mats["accent"], closed=False, collection=col_steer)

    # Alloy F1 hub faceplate & horizontal/lower spokes
    hub_plate = [
        superellipse_ring(-0.008, -0.036, 0.036, 0.0, 0.044, power_y=0.45, power_z=0.45),
        superellipse_ring(0.008, -0.036, 0.036, 0.0, 0.044, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("OTL_F1_Wheel_Hub", hub_plate, mats["black"], subsurf_levels=0, collection=col_steer)
    create_tube_curve(
        "OTL_F1_Wheel_Cross_Spoke",
        [(0.0, -0.006, -0.112), (0.0, 0.0, 0.0), (0.0, -0.006, 0.112)],
        0.010,
        mats["alloy"],
        closed=False,
        collection=col_steer,
    )
    create_tube_curve(
        "OTL_F1_Wheel_Bottom_Spoke",
        [(0.0, 0.0, 0.0), (0.0, -0.088, 0.0)],
        0.009,
        mats["alloy"],
        closed=False,
        collection=col_steer,
    )

    # =========================================================================
    # 8. REALISTIC RECLINED SEATED DRIVER (~35° RECLINE, HELMET CROWN y = 0.83 m)
    # Seated deep in the bucket seat at true 1:1 scale with the OTL Superleggero.
    # =========================================================================
    # Spine points: (x, y, z, tangent_x, tangent_y, radius_normal, radius_side)
    torso_spine = [
        (-0.14, 0.115, 0.0, -0.55, 0.83, 0.068, 0.118),  # Pelvis base in bucket
        (-0.19, 0.175, 0.0, -0.58, 0.81, 0.082, 0.136),  # Hips
        (-0.245, 0.250, 0.0, -0.57, 0.82, 0.078, 0.132), # Waist
        (-0.295, 0.325, 0.0, -0.55, 0.83, 0.084, 0.140), # Lower ribs
        (-0.340, 0.405, 0.0, -0.50, 0.86, 0.092, 0.158), # Chest
        (-0.372, 0.480, 0.0, -0.40, 0.91, 0.088, 0.178), # Upper chest / shoulders
        (-0.388, 0.530, 0.0, -0.25, 0.97, 0.072, 0.155), # Collarbone yoke
        (-0.392, 0.562, 0.0, -0.10, 0.99, 0.050, 0.082), # Neck collar base
    ]
    torso_rings = [
        oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn, rs, n=20)
        for (x, y, z, tx, ty, rn, rs) in torso_spine
    ]
    create_loft_mesh("Driver_Reclined_Torso", torso_rings, mats["suit"], subsurf_levels=1, collection=col_driver_body)

    # Molded Karting Rib Protector vest around the lower chest / ribs
    rib_vest_spine = [
        (-0.255, 0.265, 0.0, -0.56, 0.82, 0.084, 0.140),
        (-0.295, 0.325, 0.0, -0.55, 0.83, 0.090, 0.148),
        (-0.332, 0.390, 0.0, -0.51, 0.86, 0.095, 0.156),
    ]
    rib_rings = [
        oriented_ellipse_ring((x, y, z), (tx, ty, 0.0), rn, rs, n=20)
        for (x, y, z, tx, ty, rn, rs) in rib_vest_spine
    ]
    create_loft_mesh("Driver_Rib_Protector", rib_rings, mats["black"], subsurf_levels=1, collection=col_driver_body)

    # 4-Point Racing Harness shoulder & lap straps over the reclined driver
    for side in (-1, 1):
        harness_pts = [
            (-0.455, 0.545, side * 0.075),
            (-0.375, 0.535, side * 0.092),
            (-0.275, 0.445, side * 0.072),
            (-0.205, 0.325, side * 0.045),
            (-0.165, 0.215, side * 0.025),
        ]
        create_tube_curve(f"Driver_Harness_Strap_{side}", harness_pts, 0.012, mats["harness"], collection=col_driver_body)

        # Bent legs & racing boots reaching the pedals
        leg_spine = [
            ((-0.14, 0.135, side * 0.092), (0.92, 0.38, 0.0), 0.072, 0.068),
            ((0.01, 0.205, side * 0.120), (0.90, 0.42, 0.0), 0.066, 0.062),
            ((0.14, 0.252, side * 0.138), (0.92, -0.15, 0.0), 0.058, 0.055),
            ((0.28, 0.192, side * 0.140), (0.86, -0.50, 0.0), 0.050, 0.048),
            ((0.41, 0.135, side * 0.140), (0.90, -0.42, 0.0), 0.042, 0.040),
        ]
        leg_rings = [
            oriented_ellipse_ring(center, tangent, rn, rs, n=16)
            for (center, tangent, rn, rs) in leg_spine
        ]
        create_loft_mesh(f"Driver_Leg_{side}", leg_rings, mats["suit"], subsurf_levels=1, collection=col_driver_body)

        # Racing boot on pedal
        boot_rings = [
            superellipse_ring(0.385, 0.098, 0.168, side * 0.140, 0.042, power_y=0.5, power_z=0.5),
            superellipse_ring(0.435, 0.105, 0.195, side * 0.140, 0.044, power_y=0.5, power_z=0.5),
            superellipse_ring(0.478, 0.135, 0.212, side * 0.140, 0.036, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Boot_{side}", boot_rings, mats["black"], subsurf_levels=1, collection=col_driver_body)

        # Shoulder epaulette & knee pad accents
        epaulette = [
            superellipse_ring(-0.395, 0.515, 0.538, side * 0.135, 0.036, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.345, 0.505, 0.528, side * 0.135, 0.036, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Epaulette_{side}", epaulette, mats["trim"], subsurf_levels=0, collection=col_driver_body)

    # Harness center buckle
    buckle_rings = [
        superellipse_ring(-0.180, 0.225, 0.265, 0.0, 0.026, power_y=0.4, power_z=0.4),
        superellipse_ring(-0.165, 0.225, 0.265, 0.0, 0.026, power_y=0.4, power_z=0.4),
    ]
    create_loft_mesh("Driver_Harness_Buckle", buckle_rings, mats["alloy"], subsurf_levels=0, collection=col_driver_body)

    # =========================================================================
    # 9. AERODYNAMIC FULL-FACE KARTING HELMET (Crown at y = 0.815 m < 0.86 m Roll Hoop)
    # Seated naturally on a wide padded karting neck collar above the shoulders.
    # =========================================================================
    neck_rings = [
        oriented_ellipse_ring((-0.388, 0.535, 0.0), (0.12, 0.99, 0.0), 0.072, 0.088, n=20),
        oriented_ellipse_ring((-0.376, 0.568, 0.0), (0.16, 0.98, 0.0), 0.068, 0.082, n=20),
        oriented_ellipse_ring((-0.365, 0.598, 0.0), (0.18, 0.98, 0.0), 0.064, 0.076, n=20),
    ]
    create_loft_mesh("Driver_Neck_Collar", neck_rings, mats["black"], subsurf_levels=1, collection=col_driver_head)

    # Full-face helmet shell with integrated aerodynamic chin bar and rear spoiler taper
    helmet_rows = [
        # (x_center, y_level, rx_front, rx_back, rz_halfwidth)
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

    # Wrap-around dark metallic visor across the front eyeport (y = 0.680..0.752)
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

    # Flush chin intake trim
    chin_vent = [
        superellipse_ring(-0.208, 0.625, 0.642, 0.0, 0.032, power_y=0.45, power_z=0.45),
        superellipse_ring(-0.198, 0.625, 0.642, 0.0, 0.026, power_y=0.45, power_z=0.45),
    ]
    create_loft_mesh("Driver_Helmet_Chin_Vent", chin_vent, mats["black"], subsurf_levels=0, collection=col_driver_head)

    # =========================================================================
    # 10. RACING GLOVES (Local to Left/Right hand grip on F1 wheel)
    # =========================================================================
    for side, col_glove in ((-1, col_glove_l), (1, col_glove_r)):
        palm_rings = [
            superellipse_ring(-0.042, -0.028, 0.028, 0.0, 0.022, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.015, -0.038, 0.038, 0.0, 0.024, power_y=0.5, power_z=0.5),
            superellipse_ring(0.012, -0.035, 0.035, 0.0, 0.020, power_y=0.5, power_z=0.5),
            superellipse_ring(0.026, -0.022, 0.022, 0.0, 0.014, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Glove_Palm_{side}", palm_rings, mats["black"], subsurf_levels=1, collection=col_glove)

        cuff_rings = [
            superellipse_ring(-0.058, -0.030, 0.030, 0.0, 0.028, power_y=0.5, power_z=0.5),
            superellipse_ring(-0.034, -0.028, 0.028, 0.0, 0.025, power_y=0.5, power_z=0.5),
        ]
        create_loft_mesh(f"Driver_Glove_Cuff_{side}", cuff_rings, mats["glovePad"], subsurf_levels=0, collection=col_glove)

        for f_idx in range(4):
            fy = -0.024 + f_idx * 0.016
            finger_pts = [
                (-0.010, fy, side * 0.008),
                (0.002, fy, side * 0.020),
                (0.022, fy, side * 0.018),
                (0.030, fy, side * 0.002),
                (0.020, fy, -side * 0.012),
            ]
            create_tube_curve(f"Driver_Glove_Finger_{side}_{f_idx}", finger_pts, 0.0058, mats["black"], collection=col_glove)

    # =========================================================================
    # EXPORT .BLEND, .GLB, AND SYNCHRONOUS TYPESCRIPT MESH BUFFERS
    # =========================================================================
    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(TS_OUT), exist_ok=True)

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def extract_collection_batches(col: bpy.types.Collection) -> dict[str, tuple[list[float], list[float], list[int]]]:
        # Invert key map from material name -> short key
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
                # Transform Blender (bx, by, bz) back to Three.js (x = bx, y = bz, z = -by)
                co = obj.matrix_world @ v.co
                no = (obj.matrix_world.to_3x3() @ v.normal).normalized()
                pos_list.extend((round(co.x, 4), round(co.z, 4), round(-co.y, 4)))
                norm_list.extend((round(no.x, 3), round(no.z, 3), round(-no.y, 3)))

            for f in bm.faces:
                # Handedness of (bx, bz, -by) is right-handed (det = +1), so winding order is preserved
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

    # Position steering wheel, gloves, and 4 wheels at their assembled world poses before saving .blend / .glb
    for obj in col_steer.objects:
        obj.location = t2b(0.21, 0.36, 0.0)
    for obj in col_glove_l.objects:
        obj.location = t2b(0.21 - 0.013, 0.36, -0.119)
    for obj in col_glove_r.objects:
        obj.location = t2b(0.21 - 0.013, 0.36, 0.119)

    for label, wx, wz in (("FL", 0.54, -0.36), ("FR", 0.54, 0.36), ("RL", -0.52, -0.37), ("RR", -0.52, 0.37)):
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=0.145,
            depth=0.136,
            location=t2b(wx, 0.145, wz),
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
            location=t2b(wx, 0.145, wz),
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
            (-0.372, 0.485, side * 0.172),
            (-0.11, 0.34, side * 0.195),
            (0.175, 0.36, side * 0.119),
        ]
        create_tube_curve(f"Driver_Sleeve_Posed_{side}", arm_pts, 0.044, mats["suit"], collection=col_driver_body)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )

    # Render a studio 3/4 preview image using Blender's CPU Cycles renderer (works cleanly inside sandbox)
    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("Preview_Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = Vector((1.75, 1.85, 1.05))
    direction = Vector((-0.05, 0.0, 0.36)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    # Studio key & fill lights + floor plane for the Cycles render
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

    print(f"SUCCESS: Generated {BLEND_OUT}, {GLB_OUT}, {PREVIEW_OUT}, and {TS_OUT} ({total_tris} triangles)")


if __name__ == "__main__":
    build_otl_superleggero()
