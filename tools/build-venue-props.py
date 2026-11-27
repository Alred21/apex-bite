"""Generate UV-unwrapped modular indoor arena props in Blender 5.2.

Outputs:
  - assets/venue-props.blend
  - public/models/venue-props.glb
  - (optional scratch preview PNG via --preview <path>)

Run via:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build-venue-props.py
"""

from __future__ import annotations

import math
import os
import sys
import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_OUT = os.path.join(ROOT_DIR, "assets", "venue-props.blend")
GLB_OUT = os.path.join(ROOT_DIR, "public", "models", "venue-props.glb")
TEX_DIR = os.path.join(ROOT_DIR, "public", "textures")


def t2b(tx: float, ty: float, tz: float) -> Vector:
    """Map Three.js (x right/fwd, y up, z right) -> Blender (x, -z, y)."""
    return Vector((tx, -tz, ty))


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def get_principled(mat: bpy.types.Material):
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def make_pbr_material(
    name: str,
    rgb: tuple[float, float, float],
    roughness: float = 0.45,
    metalness: float = 0.0,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.1,
    emissive_rgb: tuple[float, float, float] | None = None,
    emissive_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = get_principled(mat)
    if bsdf is None:
        return mat

    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metalness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if emissive_rgb is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (
            emissive_rgb[0],
            emissive_rgb[1],
            emissive_rgb[2],
            1.0,
        )
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return mat


def make_empty(name: str, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector((0.0, 0.0, 0.0))
    if parent is not None:
        obj.parent = parent
    return obj


def ensure_uv_box_projection(bm: bmesh.types.BMesh, scale: float = 1.5) -> None:
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


def finalize_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    smooth: bool = False,
    uv_scale: float = 1.5,
    custom_uv: bool = False,
) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth
    if not custom_uv:
        ensure_uv_box_projection(bm, scale=uv_scale)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material)
    if parent is not None:
        obj.parent = parent
    return obj


def add_box_three(
    bm: bmesh.types.BMesh,
    center_three: tuple[float, float, float],
    size_three: tuple[float, float, float],
    rot_euler_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    sx, sy, sz = size_three
    # Three.js (x, y, z) -> Blender (x, -z, y)
    mat_scale = Matrix.Diagonal((sx, sz, sy, 1.0))
    # Convert Three.js Euler XYZ to Blender Euler
    rx, ry, rz = rot_euler_three
    mat_rot = (
        Matrix.Rotation(ry, 4, "Z")
        @ Matrix.Rotation(-rz, 4, "Y")
        @ Matrix.Rotation(rx, 4, "X")
    )
    mat_trans = Matrix.Translation(t2b(*center_three))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat_trans @ mat_rot @ mat_scale)


def add_cylinder_between_three(
    bm: bmesh.types.BMesh,
    p0_three: tuple[float, float, float],
    p1_three: tuple[float, float, float],
    radius: float,
    segments: int = 10,
) -> None:
    a = t2b(*p0_three)
    b = t2b(*p1_three)
    delta = b - a
    length = delta.length
    if length < 1e-6:
        return
    mid = (a + b) * 0.5
    quat = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    mat = Matrix.Translation(mid) @ quat.to_matrix().to_4x4()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=length,
        matrix=mat,
    )


def add_uv_quad_three(
    bm: bmesh.types.BMesh,
    v00: tuple[float, float, float],
    v10: tuple[float, float, float],
    v11: tuple[float, float, float],
    v01: tuple[float, float, float],
) -> None:
    """Create a quad with exact [0,1]x[0,1] UVs for CanvasTexture projection."""
    uv_layer = bm.loops.layers.uv.verify()
    verts = [bm.verts.new(t2b(*p)) for p in (v00, v10, v11, v01)]
    face = bm.faces.new(verts)
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for loop, uv in zip(face.loops, uvs):
        loop[uv_layer].uv = uv


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "dark_steel": make_pbr_material("Arena_Dark_Steel", (0.11, 0.13, 0.15), roughness=0.42, metalness=0.78),
        "galvanized_steel": make_pbr_material("Arena_Galvanized_Steel", (0.56, 0.60, 0.64), roughness=0.34, metalness=0.84),
        "crimson_paint": make_pbr_material("Arena_Crimson_Accent", (0.72, 0.06, 0.09), roughness=0.30, metalness=0.08, coat_weight=0.7),
        "safety_yellow": make_pbr_material("Arena_Safety_Yellow", (0.86, 0.64, 0.05), roughness=0.38, metalness=0.05),
        "housing_matte": make_pbr_material("Arena_Housing_Matte", (0.06, 0.07, 0.08), roughness=0.62, metalness=0.22),
        "cable_orange": make_pbr_material("Arena_Cable_Orange", (0.94, 0.31, 0.04), roughness=0.45, metalness=0.0),
        "tire_rubber": make_pbr_material("Arena_Tire_Rubber", (0.045, 0.047, 0.050), roughness=0.88, metalness=0.0),
        "scoreboard_screen": make_pbr_material(
            "Gantry_Scoreboard_Screen_Mat",
            (0.05, 0.08, 0.10),
            roughness=0.28,
            metalness=0.05,
            emissive_rgb=(0.1, 0.15, 0.2),
            emissive_strength=0.4,
        ),
        "gantry_pod_led": make_pbr_material(
            "Gantry_Pod_LED_Mat",
            (0.9, 0.12, 0.10),
            roughness=0.18,
            emissive_rgb=(0.95, 0.16, 0.10),
            emissive_strength=2.2,
        ),
        "marshal_led": make_pbr_material(
            "Marshal_LED_Face_Mat",
            (0.10, 0.85, 0.28),
            roughness=0.22,
            emissive_rgb=(0.12, 0.92, 0.30),
            emissive_strength=2.0,
        ),
        "charger_led": make_pbr_material(
            "Charger_Status_LED_Mat",
            (0.12, 0.88, 0.56),
            roughness=0.20,
            emissive_rgb=(0.15, 0.95, 0.65),
            emissive_strength=2.2,
        ),
        "highbay_diffuser": make_pbr_material(
            "HighBay_Diffuser_Mat",
            (0.95, 0.98, 1.0),
            roughness=0.20,
            emissive_rgb=(0.90, 0.95, 1.0),
            emissive_strength=3.2,
        ),
    }


def build_gantry_truss(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build overhead Start/Finish truss gantry spanning z in [-3.67, +3.67], beam bottom y >= 3.55 m."""
    root = make_empty("Arena_Gantry_Truss")
    col_half_z = 3.67
    beam_bottom_y = 3.55
    beam_top_y = 4.45
    truss_half_x = 0.28
    span_end_z = col_half_z + 0.34

    # Structural dark steel frame: columns, base gussets, horizontal truss chords & Warren diagonals
    bm_steel = bmesh.new()
    for sz in (-1.0, 1.0):
        cz = sz * col_half_z
        # Base plate + vertical twin-post column
        add_box_three(bm_steel, (0.0, 0.025, cz), (0.52, 0.05, 0.52))
        add_box_three(bm_steel, (-0.16, 2.25, cz), (0.14, 4.50, 0.18))
        add_box_three(bm_steel, (0.16, 2.25, cz), (0.14, 4.50, 0.18))
        # Cross rungs along tower
        for ry in (0.7, 1.4, 2.1, 2.8, 3.55, 4.35):
            add_box_three(bm_steel, (0.0, ry, cz), (0.36, 0.06, 0.14))
        # Diagonal tower lacing
        for iy in range(4):
            y0 = 0.7 + iy * 0.7
            y1 = y0 + 0.7
            add_cylinder_between_three(bm_steel, (-0.16, y0, cz), (0.16, y1, cz), 0.024, 8)
            add_cylinder_between_three(bm_steel, (0.16, y0, cz), (-0.16, y1, cz), 0.024, 8)
        # Knee brace at top inner corner
        add_cylinder_between_three(
            bm_steel,
            (0.0, beam_bottom_y - 0.52, cz),
            (0.0, beam_bottom_y, cz - sz * 0.58),
            0.042,
            10,
        )

    # Four longitudinal truss chords spanning Z
    for sx in (-1.0, 1.0):
        cx = sx * truss_half_x
        add_box_three(bm_steel, (cx, beam_bottom_y + 0.045, 0.0), (0.09, 0.09, span_end_z * 2.0))
        add_box_three(bm_steel, (cx, beam_top_y - 0.045, 0.0), (0.09, 0.09, span_end_z * 2.0))

    # Warren truss web diagonals & transverse frames
    bays = 10
    z_step = (span_end_z * 2.0) / bays
    for i in range(bays + 1):
        z_pos = -span_end_z + i * z_step
        add_cylinder_between_three(bm_steel, (-truss_half_x, beam_bottom_y + 0.04, z_pos), (truss_half_x, beam_bottom_y + 0.04, z_pos), 0.026, 8)
        add_cylinder_between_three(bm_steel, (-truss_half_x, beam_top_y - 0.04, z_pos), (truss_half_x, beam_top_y - 0.04, z_pos), 0.026, 8)
        add_cylinder_between_three(bm_steel, (-truss_half_x, beam_bottom_y + 0.04, z_pos), (-truss_half_x, beam_top_y - 0.04, z_pos), 0.026, 8)
        add_cylinder_between_three(bm_steel, (truss_half_x, beam_bottom_y + 0.04, z_pos), (truss_half_x, beam_top_y - 0.04, z_pos), 0.026, 8)
        if i < bays:
            z_next = z_pos + z_step
            y_a = beam_bottom_y + 0.04 if i % 2 == 0 else beam_top_y - 0.04
            y_b = beam_top_y - 0.04 if i % 2 == 0 else beam_bottom_y + 0.04
            add_cylinder_between_three(bm_steel, (-truss_half_x, y_a, z_pos), (-truss_half_x, y_b, z_next), 0.024, 8)
            add_cylinder_between_three(bm_steel, (truss_half_x, y_a, z_pos), (truss_half_x, y_b, z_next), 0.024, 8)

    finalize_bmesh("Gantry_Steel_Frame", bm_steel, mats["dark_steel"], parent=root)

    # Crimson safety lower tower sleeves & top fascia accents
    bm_red = bmesh.new()
    for sz in (-1.0, 1.0):
        add_box_three(bm_red, (0.0, 0.56, sz * col_half_z), (0.46, 0.96, 0.28))
    add_box_three(bm_red, (-0.31, beam_top_y - 0.04, 0.0), (0.04, 0.10, 4.30))
    finalize_bmesh("Gantry_Crimson_Accents", bm_red, mats["crimson_paint"], parent=root)

    # Scoreboard housing (y in [3.66, 4.38], z in [-2.05, +2.05])
    bm_sb_box = bmesh.new()
    add_box_three(bm_sb_box, (-0.34, 4.02, 0.0), (0.14, 0.72, 4.10))
    finalize_bmesh("Gantry_Scoreboard_Housing", bm_sb_box, mats["housing_matte"], parent=root)

    # Digital timing scoreboard screen quad facing -X (approaching kart)
    bm_screen = bmesh.new()
    add_uv_quad_three(
        bm_screen,
        (-0.415, 3.70, -1.96),
        (-0.415, 3.70, 1.96),
        (-0.415, 4.34, 1.96),
        (-0.415, 4.34, -1.96),
    )
    finalize_bmesh(
        "Gantry_Scoreboard_Screen",
        bm_screen,
        mats["scoreboard_screen"],
        parent=root,
        custom_uv=True,
    )

    # 5-pod LED Start-Light Housing suspended cleanly at y in [3.38, 3.63] (>= 3.35 m)
    bm_tree = bmesh.new()
    add_box_three(bm_tree, (-0.34, 3.50, 0.0), (0.18, 0.24, 1.78))
    # Individual visor hoods around each of 5 pods
    for idx in range(5):
        pz = (idx - 2) * 0.32
        add_box_three(bm_tree, (-0.44, 3.59, pz), (0.10, 0.025, 0.22))
        add_box_three(bm_tree, (-0.43, 3.50, pz - 0.11), (0.08, 0.18, 0.02))
        add_box_three(bm_tree, (-0.43, 3.50, pz + 0.11), (0.08, 0.18, 0.02))
    finalize_bmesh("Gantry_Light_Housing", bm_tree, mats["housing_matte"], parent=root)

    # 5 separate named emissive start-light lenses
    for idx in range(5):
        pz = (idx - 2) * 0.32
        bm_pod = bmesh.new()
        add_cylinder_between_three(bm_pod, (-0.42, 3.50, pz), (-0.445, 3.50, pz), 0.072, 16)
        finalize_bmesh(
            f"Gantry_Light_Pod_{idx}",
            bm_pod,
            mats["gantry_pod_led"].copy(),
            parent=root,
            smooth=True,
        )

    return root


def build_pit_charging_stanchion(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build electric kart charging stanchion with coiled orange power cable & status light."""
    root = make_empty("Arena_Pit_Charging_Stanchion")

    bm_body = bmesh.new()
    add_box_three(bm_body, (0.0, 0.02, 0.0), (0.38, 0.04, 0.34))
    add_box_three(bm_body, (0.0, 0.64, 0.0), (0.20, 1.20, 0.24))
    add_box_three(bm_body, (0.06, 0.96, 0.0), (0.14, 0.36, 0.18))
    # Side cable saddle hook
    add_cylinder_between_three(bm_body, (0.0, 0.78, 0.12), (0.0, 0.78, 0.22), 0.022, 10)
    add_box_three(bm_body, (0.0, 0.80, 0.22), (0.12, 0.06, 0.03))
    finalize_bmesh("Charging_Stanchion_Body", bm_body, mats["dark_steel"], parent=root)

    bm_cap = bmesh.new()
    add_box_three(bm_cap, (0.0, 1.26, 0.0), (0.22, 0.05, 0.26))
    finalize_bmesh("Charging_Stanchion_Cap", bm_cap, mats["galvanized_steel"], parent=root)

    bm_stripe = bmesh.new()
    add_box_three(bm_stripe, (0.105, 0.45, 0.0), (0.015, 0.62, 0.16))
    finalize_bmesh("Charging_Stanchion_Accent", bm_stripe, mats["crimson_paint"], parent=root)

    # Coiled orange charging cable loops hanging on side saddle
    bm_cable = bmesh.new()
    coil_turns = 4
    pts_per_turn = 18
    total_pts = coil_turns * pts_per_turn
    prev_pt: tuple[float, float, float] | None = None
    for i in range(total_pts + 1):
        ang = (i / pts_per_turn) * math.tau
        tx = 0.0 + math.cos(ang) * 0.11
        ty = 0.65 + math.sin(ang) * 0.15
        tz = 0.16 + (i / total_pts) * 0.075
        pt = (tx, ty, tz)
        if prev_pt is not None:
            add_cylinder_between_three(bm_cable, prev_pt, pt, 0.014, 8)
        prev_pt = pt
    finalize_bmesh("Charging_Coiled_Cable", bm_cable, mats["cable_orange"], parent=root, smooth=True)

    # Top status LED beacon
    bm_led = bmesh.new()
    add_box_three(bm_led, (0.0, 1.305, 0.0), (0.14, 0.04, 0.18))
    finalize_bmesh("Charging_Status_LED", bm_led, mats["charger_led"], parent=root)

    return root


def build_tire_stack(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build bundled rubber safety tire stack (3 stacked ribbed kart tires with strap)."""
    root = make_empty("Arena_Tire_Stack")

    bm_tires = bmesh.new()
    offsets = [(0.0, 0.0), (0.015, -0.012), (-0.010, 0.014)]
    for idx, (ox, oz) in enumerate(offsets):
        cy = 0.09 + idx * 0.175
        # Create hollow tire cross-section lofted around Y axis
        segs_around = 24
        # Cross-section profile (r_offset, y_offset) in radial plane
        profile = [
            (0.145, -0.075),
            (0.245, -0.085),
            (0.285, -0.060),
            (0.292, -0.025),
            (0.285, 0.0),
            (0.292, 0.025),
            (0.285, 0.060),
            (0.245, 0.085),
            (0.145, 0.075),
            (0.135, 0.045),
            (0.135, -0.045),
        ]
        rings = []
        for s in range(segs_around):
            ang = (s / segs_around) * math.tau
            ca, sa = math.cos(ang), math.sin(ang)
            ring = [
                bm_tires.verts.new(t2b(ox + ca * r, cy + py, oz + sa * r))
                for (r, py) in profile
            ]
            rings.append(ring)
        n_prof = len(profile)
        for s in range(segs_around):
            r0 = rings[s]
            r1 = rings[(s + 1) % segs_around]
            for p in range(n_prof):
                p_next = (p + 1) % n_prof
                bm_tires.faces.new((r0[p], r1[p], r1[p_next], r0[p_next]))

    finalize_bmesh("Tire_Stack_Rubber", bm_tires, mats["tire_rubber"], parent=root, smooth=True)

    # Vertical safety tie-down straps
    bm_strap = bmesh.new()
    for sx in (-1.0, 1.0):
        add_box_three(bm_strap, (sx * 0.288, 0.27, 0.0), (0.018, 0.53, 0.055))
    add_box_three(bm_strap, (0.0, 0.535, 0.0), (0.58, 0.018, 0.055))
    finalize_bmesh("Tire_Stack_Straps", bm_strap, mats["safety_yellow"], parent=root)

    return root


def build_marshal_panel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build stanchion-mounted LED corner marshal display board (Marshal_LED_Face)."""
    root = make_empty("Arena_Marshal_Panel")

    bm_post = bmesh.new()
    add_box_three(bm_post, (0.0, 0.02, 0.0), (0.34, 0.04, 0.34))
    add_cylinder_between_three(bm_post, (0.0, 0.04, 0.0), (0.0, 1.72, 0.0), 0.042, 12)
    add_box_three(bm_post, (-0.02, 1.72, 0.0), (0.08, 0.14, 0.14))
    finalize_bmesh("Marshal_Stanchion_Post", bm_post, mats["galvanized_steel"], parent=root, smooth=True)

    bm_housing = bmesh.new()
    add_box_three(bm_housing, (-0.06, 1.72, 0.0), (0.11, 0.52, 0.52))
    # Sun-visor hood around LED matrix
    add_box_three(bm_housing, (-0.15, 1.97, 0.0), (0.10, 0.025, 0.52))
    add_box_three(bm_housing, (-0.14, 1.72, -0.25), (0.08, 0.50, 0.025))
    add_box_three(bm_housing, (-0.14, 1.72, 0.25), (0.08, 0.50, 0.025))
    finalize_bmesh("Marshal_Panel_Housing", bm_housing, mats["housing_matte"], parent=root)

    # Separate named emissive face facing -X (oncoming driver)
    bm_face = bmesh.new()
    add_uv_quad_three(
        bm_face,
        (-0.122, 1.50, -0.21),
        (-0.122, 1.50, 0.21),
        (-0.122, 1.94, 0.21),
        (-0.122, 1.94, -0.21),
    )
    finalize_bmesh("Marshal_LED_Face", bm_face, mats["marshal_led"], parent=root, custom_uv=True)

    return root


def build_drain_grate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build flush metal infield floor drainage grate."""
    root = make_empty("Arena_Drain_Grate")

    bm_frame = bmesh.new()
    # Perimeter frame (0.84 m x 0.52 m, flush thickness 0.016 m)
    add_box_three(bm_frame, (0.0, 0.008, -0.24), (0.84, 0.016, 0.04))
    add_box_three(bm_frame, (0.0, 0.008, 0.24), (0.84, 0.016, 0.04))
    add_box_three(bm_frame, (-0.40, 0.008, 0.0), (0.04, 0.016, 0.44))
    add_box_three(bm_frame, (0.40, 0.008, 0.0), (0.04, 0.016, 0.44))
    finalize_bmesh("Drain_Grate_Frame", bm_frame, mats["dark_steel"], parent=root)

    bm_bars = bmesh.new()
    for i in range(-6, 7):
        bx = i * 0.056
        add_box_three(bm_bars, (bx, 0.009, 0.0), (0.022, 0.014, 0.44))
    for sz in (-0.11, 0.11):
        add_box_three(bm_bars, (0.0, 0.006, sz), (0.74, 0.008, 0.018))
    finalize_bmesh("Drain_Grate_Bars", bm_bars, mats["galvanized_steel"], parent=root)

    return root


def build_highbay_lamp(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Build industrial high-bay LED fixture housing + diffuser panel."""
    root = make_empty("Arena_HighBay_Lamp")

    bm_housing = bmesh.new()
    add_box_three(bm_housing, (0.0, 0.05, 0.0), (2.25, 0.10, 0.62))
    # Cooling fins along top
    for i in range(-4, 5):
        add_box_three(bm_housing, (i * 0.24, 0.12, 0.0), (0.025, 0.05, 0.56))
    # Suspension hanger brackets up to roof truss
    for sx in (-0.85, 0.85):
        add_cylinder_between_three(bm_housing, (sx, 0.10, 0.0), (sx, 0.36, 0.0), 0.014, 8)
    finalize_bmesh("HighBay_Housing", bm_housing, mats["dark_steel"], parent=root)

    bm_diff = bmesh.new()
    add_box_three(bm_diff, (0.0, -0.01, 0.0), (2.10, 0.024, 0.50))
    finalize_bmesh("HighBay_Diffuser", bm_diff, mats["highbay_diffuser"], parent=root)

    return root


def render_preview(preview_path: str) -> None:
    scene = bpy.context.scene
    # Arrange copies in a clean studio showcase layout for visual inspection
    showcase = [
        ("Arena_Gantry_Truss", (0.0, 0.0, 0.0), 0.0),
        ("Arena_Pit_Charging_Stanchion", (-4.8, 0.0, 2.2), 0.3),
        ("Arena_Tire_Stack", (-3.5, 0.0, 2.5), 0.0),
        ("Arena_Marshal_Panel", (4.8, 0.0, 2.2), -0.3),
        ("Arena_Drain_Grate", (-1.5, 0.0, 2.5), 0.0),
        ("Arena_HighBay_Lamp", (1.6, 2.2, 2.2), 0.0),
    ]
    for name, loc_three, rot_z in showcase:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.location = t2b(*loc_three)
            obj.rotation_euler = (0.0, 0.0, rot_z)

    cam_data = bpy.data.cameras.new("Preview_Camera")
    cam_data.lens = 35
    cam_obj = bpy.data.objects.new("Preview_Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = t2b(-8.5, 3.2, 7.2)
    direction = t2b(0.0, 1.8, 0.2) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    for lname, loc, energy in (
        ("Key_Light", (-6.0, 7.0, 6.0), 1200.0),
        ("Fill_Light", (6.0, 5.0, 5.0), 650.0),
        ("Rim_Light", (0.0, 6.0, -7.0), 700.0),
    ):
        ldata = bpy.data.lights.new(name=lname, type="AREA")
        ldata.energy = energy
        ldata.size = 4.0
        lobj = bpy.data.objects.new(name=lname, object_data=ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc)
        ldir = t2b(0.0, 1.5, 0.0) - lobj.location
        lobj.rotation_euler = ldir.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.mesh.primitive_plane_add(size=24.0, location=(0.0, 0.0, 0.0))
    floor = bpy.context.active_object
    floor.data.materials.append(make_pbr_material("Preview_Floor", (0.14, 0.17, 0.20), roughness=0.68))

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = preview_path
    bpy.ops.render.render(write_still=True)


def main() -> int:
    clear_scene()
    mats = create_materials()

    build_gantry_truss(mats)
    build_pit_charging_stanchion(mats)
    build_tire_stack(mats)
    build_marshal_panel(mats)
    build_drain_grate(mats)
    build_highbay_lamp(mats)

    os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"SUCCESS: Wrote {BLEND_OUT} and {GLB_OUT}")

    if "--preview" in sys.argv:
        idx = sys.argv.index("--preview")
        if idx + 1 < len(sys.argv):
            render_preview(sys.argv[idx + 1])
            print(f"SUCCESS: Rendered preview to {sys.argv[idx + 1]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
