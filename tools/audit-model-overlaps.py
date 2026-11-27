#!/usr/bin/env python3
"""
Automated static & kinematic 3D overlap, linkage, coaxial pushrod, and envelope
audit for the OTL Superleggero Kart using Blender 5.2 BVHTree.

Run via Blender CLI:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/audit-model-overlaps.py
"""

import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Quaternion, Matrix
from mathutils.bvhtree import BVHTree


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_PATH = os.path.join(ROOT_DIR, "assets", "otl-superleggero.blend")

WHEELBASE_M = 1.06
FRONT_AXLE_X = 0.54
TIRE_RADIUS = 0.145
KINGPIN_HALF_Z = 0.185
CASTER_RAD = math.radians(10.0)
KPI_RAD = math.radians(7.0)
MAX_STEER_RAD = 0.46
STEER_RATIO = 2.2

STEER_MOUNT_POS = Vector((0.185, 0.360, 0.0))
STEER_MOUNT_ROT_Z = 0.35
UPPER_SHAFT_LEN = 0.064
U_JOINT_POS = Vector((
    STEER_MOUNT_POS.x + UPPER_SHAFT_LEN * math.cos(STEER_MOUNT_ROT_Z),
    STEER_MOUNT_POS.y + UPPER_SHAFT_LEN * math.sin(STEER_MOUNT_ROT_Z),
    0.0,
))
PITMAN_PIVOT = Vector((0.458, 0.192, 0.0))
PITMAN_BALL_LOCAL = (0.004, -0.056, 0.014)
KNUCKLE_ARM_BALL_LOCAL = (-0.086, 0.044, -0.014)
PEDAL_PIVOT_POS = (0.428, 0.095, 0.075)
BRAKE_CLEVIS_LOCAL = Vector((0.0, 0.038, -0.047))
BRAKE_MASTER_BORE = Vector((0.382, 0.124, -0.122))
THROTTLE_CLEVIS_LOCAL = Vector((0.0, 0.038, 0.047))
THROTTLE_TPS_PIVOT = Vector((0.416, 0.124, 0.122))

DRIVER_HIP_PIVOT = Vector((-0.220, 0.205, 0.0))
DRIVER_SHOULDER = (-0.335, 0.485, 0.138)
DRIVER_HIP_JOINT = (-0.175, 0.197, 0.078)
DRIVER_UPPER_ARM_LEN = 0.305
DRIVER_FOREARM_LEN = 0.285
DRIVER_THIGH_LEN = 0.300
DRIVER_SHIN_LEN = 0.265
GLOVE_OFFSET = (-0.010, 0.0, 0.105)
GLOVE_WRIST_LOCAL = Vector((
    -0.032 * math.cos(STEER_MOUNT_ROT_Z),
    -0.032 * math.sin(STEER_MOUNT_ROT_Z),
    0.0,
))
PEDAL_SOLE_LOCAL = (-0.017, 0.068, 0.0)
PEDAL_ANKLE_OFFSET = Vector((-0.047, -0.015, 0.0))
PEDAL_SLIDE_M = 0.014
MAX_TORSO_LEAN_RAD = math.radians(3.5)


def t2b(v: Vector) -> Vector:
    return Vector((v.x, -v.z, v.y))


def b2t(v: Vector) -> Vector:
    return Vector((v.x, v.z, -v.y))


def kingpin_axis_three(side: int) -> Vector:
    return Vector((
        -math.sin(CASTER_RAD) * math.cos(KPI_RAD),
        math.cos(CASTER_RAD) * math.cos(KPI_RAD),
        -side * math.sin(KPI_RAD),
    )).normalized()


UPPER_AXIS_BACK_THREE = Vector((-math.cos(STEER_MOUNT_ROT_Z), -math.sin(STEER_MOUNT_ROT_Z), 0.0)).normalized()
LOWER_AXIS_BACK_THREE = (U_JOINT_POS - PITMAN_PIVOT).normalized()


def wrap_angle(a: float) -> float:
    a = (a + math.pi) % (math.pi * 2.0)
    return a - math.pi if a >= 0.0 else a + math.pi


def solve_four_bar(sw_angle_rad: float):
    """Exact 4-bar linkage solver in Three.js coordinates matching src/render/kinematics.ts."""
    pitman_q = Quaternion(LOWER_AXIS_BACK_THREE, -sw_angle_rad)
    sides = {}
    for key, side in (("left", -1), ("right", 1)):
        k_pivot = Vector((FRONT_AXLE_X, TIRE_RADIUS, side * KINGPIN_HALF_Z))
        k_axis = kingpin_axis_three(side)
        pb_rest = Vector((PITMAN_BALL_LOCAL[0], PITMAN_BALL_LOCAL[1], side * PITMAN_BALL_LOCAL[2]))
        kb_rest = Vector((KNUCKLE_ARM_BALL_LOCAL[0], KNUCKLE_ARM_BALL_LOCAL[1], side * KNUCKLE_ARM_BALL_LOCAL[2]))

        rod_len = (PITMAN_PIVOT + pb_rest - (k_pivot + kb_rest)).length
        proj = kb_rest.dot(k_axis)
        u = kb_rest - k_axis * proj
        v = k_axis.cross(u)
        c = k_pivot + k_axis * proj

        pb_rot = pitman_q @ pb_rest
        p_world = PITMAN_PIVOT + pb_rot
        d = p_world - c
        A = 2.0 * d.dot(u)
        B = 2.0 * d.dot(v)
        C = u.length_squared + d.length_squared - rod_len * rod_len
        R = math.hypot(A, B)
        ratio = max(-1.0, min(1.0, C / R))
        base = math.atan2(B, A)
        delta = math.acos(ratio)
        t1, t2 = wrap_angle(base + delta), wrap_angle(base - delta)
        k_rot = t1 if abs(t1) <= abs(t2) else t2
        q_world = c + u * math.cos(k_rot) + v * math.sin(k_rot)
        sides[key] = {
            "steer_rad": -k_rot,
            "k_rot": k_rot,
            "k_axis": k_axis,
            "rod_len": rod_len,
            "start": p_world,
            "end": q_world,
        }
    return sides


def three_quat_to_blender_quat(axis_three: Vector, angle_rad: float) -> Quaternion:
    axis_bl = t2b(axis_three).normalized()
    return Quaternion(axis_bl, angle_rad)


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


def orient_limb_three(obj: bpy.types.Object, start: Vector, end: Vector, pole_dir: Vector) -> None:
    z_axis = (end - start).normalized()
    x_axis = pole_dir.cross(z_axis)
    if x_axis.length_squared < 1e-8:
        x_axis = Vector((1.0, 0.0, 0.0))
    else:
        x_axis.normalize()
    y_axis = z_axis.cross(x_axis).normalized()
    col_bx = t2b(x_axis)
    col_by = t2b(-z_axis)
    col_bz = t2b(y_axis)
    obj.location = t2b(start)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Matrix((col_bx, col_by, col_bz)).transposed().to_quaternion()


def build_world_bvh_and_bounds(obj: bpy.types.Object, depsgraph) -> tuple[BVHTree, Vector, Vector, list[Vector]]:
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.transform(bm, matrix=obj.matrix_world, verts=bm.verts)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)

    verts_three = [b2t(v.co) for v in bm.verts]
    xs = [p.x for p in verts_three]
    ys = [p.y for p in verts_three]
    zs = [p.z for p in verts_three]
    bmin = Vector((min(xs), min(ys), min(zs)))
    bmax = Vector((max(xs), max(ys), max(zs)))

    bm.free()
    eval_obj.to_mesh_clear()
    return bvh, bmin, bmax, verts_three


def collect_meshes_under(root_name: str) -> list[bpy.types.Object]:
    root = bpy.data.objects.get(root_name)
    if root is None:
        raise RuntimeError(f"Missing required GLB node: {root_name}")
    out = []

    def walk(o):
        if o.type == "MESH":
            out.append(o)
        for c in o.children:
            walk(c)

    walk(root)
    return out


# Intentional mechanical mating pairs (bearing bores / seated ball studs / belt-pulley teeth / seat contact)
ALLOWED_CONTACT_PREFIXES = (
    # Lower steering shaft passes coaxially inside lower bearing block
    ("Kart_Steering_Lower_Shaft", "OTL_Steering_Lower_Bearing"),
    # Kingpin knuckle barrel & bolt coaxial inside C-yoke
    ("Kart_Knuckle_Barrel_", "OTL_Kingpin_Bolt_"),
    ("Kart_Knuckle_Barrel_", "OTL_Kingpin_C_Yoke_"),
    # Tie-rod Heim joints sit directly on Pitman / knuckle ball studs
    ("Kart_TieRod_Heim_", "Kart_Pitman_Ball_Stud_"),
    ("Kart_TieRod_Heim_", "Kart_Knuckle_Ball_Stud_"),
    # Pedal hinge sits on pedal pivot crossbar
    ("Kart_Pedal_Hinge_", "OTL_Pedal_Pivot_Crossbar"),
    # Brake pushrod & throttle link engage into master cylinder bore / TPS sensor box / clevis
    ("Kart_Brake_Pushrod_Shaft", "OTL_Brake_Master_Cylinder"),
    ("Kart_Brake_Pushrod_Shaft", "Kart_Pedal_Clevis_-1"),
    ("Kart_Throttle_Link_Shaft", "OTL_Throttle_Sensor_Box"),
    ("Kart_Throttle_Link_Shaft", "Kart_Pedal_Clevis_1"),
    # Drive belt wraps sprocket and pinion teeth
    ("Kart_Drive_Belt", "OTL_Rear_Sprocket_"),
    ("Kart_Drive_Belt", "OTL_Motor_Pinion_Gear"),
    ("Kart_Drive_Belt", "OTL_Pinion_Tooth_"),
    # Rear axle passes coaxially through bearing cassettes & hangers & rear wheels
    ("OTL_Rear_Live_Axle", "OTL_Rear_Bearing_Cassette_"),
    ("OTL_Rear_Live_Axle", "OTL_Rear_Bearing_Hanger_"),
    ("OTL_Rear_Live_Axle", "Kart_Wheel_R"),
    # Stub axles pass coaxially into front wheel hub cores
    ("Kart_Knuckle_Stub_Axle_", "Kart_Wheel_F"),
    # Driver torso & harness seat interface & adjacent ball-joint limb sockets + gloves on wheel rim
    ("Driver_Torso_Suit", "OTL_Reclined_Bucket_Seat"),
    ("Driver_Harness_Shoulder_", "OTL_Harness_Anchor_"),
    ("Driver_Glove_", "Kart_F1_Wheel_Rim"),
    ("Driver_UpperArm_-1", "Driver_Torso_Suit"),
    ("Driver_UpperArm_1", "Driver_Torso_Suit"),
    ("Driver_UpperArm_-1", "Driver_Shoulder_Pad_-1"),
    ("Driver_UpperArm_1", "Driver_Shoulder_Pad_1"),
    ("Driver_UpperArm_-1", "Driver_Forearm_-1"),
    ("Driver_UpperArm_1", "Driver_Forearm_1"),
    ("Driver_Forearm_-1", "Driver_Glove_Cuff_-1"),
    ("Driver_Forearm_1", "Driver_Glove_Cuff_1"),
    ("Driver_Thigh_-1", "Driver_Torso_Suit"),
    ("Driver_Thigh_1", "Driver_Torso_Suit"),
    ("Driver_Thigh_-1", "Driver_Shin_-1"),
    ("Driver_Thigh_1", "Driver_Shin_1"),
    ("Driver_Knee_Pad_-1", "Driver_Shin_-1"),
    ("Driver_Knee_Pad_1", "Driver_Shin_1"),
    ("Driver_Shin_-1", "Driver_Boot_Upper_-1"),
    ("Driver_Shin_-1", "Driver_Boot_Strap_-1"),
    ("Driver_Shin_1", "Driver_Boot_Upper_1"),
    ("Driver_Shin_1", "Driver_Boot_Strap_1"),
    ("Driver_Neck_Collar", "Driver_Torso_Suit"),
    ("Driver_Neck_Collar", "Driver_Suit_Collar"),
    # Brake LED lens seated in LED housing
    ("Kart_Brake_LED_Lens", "OTL_Brake_LED_Housing"),
)


def is_allowed_contact(name_a: str, name_b: str) -> bool:
    for p1, p2 in ALLOWED_CONTACT_PREFIXES:
        if (name_a.startswith(p1) and name_b.startswith(p2)) or (name_a.startswith(p2) and name_b.startswith(p1)):
            return True
    return False


def main():
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    scene = bpy.context.scene

    required_nodes = [
        "Kart_Chassis_Static",
        "Kart_Brake_LED",
        "Kart_Steering_Column_Assembly",
        "Kart_Steering_Upper",
        "Kart_Steering_Lower",
        "Kart_Knuckle_L",
        "Kart_Knuckle_R",
        "Kart_TieRod_L",
        "Kart_TieRod_R",
        "Kart_Wheel_FL",
        "Kart_Wheel_FR",
        "Kart_Wheel_RL",
        "Kart_Wheel_RR",
        "Kart_Rear_Axle_Spin",
        "Kart_Motor_Pinion_Spin",
        "Kart_Drive_Belt",
        "Kart_Pedal_Brake",
        "Kart_Brake_Pushrod",
        "Kart_Pedal_Throttle",
        "Kart_Throttle_Link",
        "Driver_Torso",
        "Driver_Neck_Pivot",
        "Driver_Head",
        "Driver_UpperArm_L",
        "Driver_UpperArm_R",
        "Driver_Forearm_L",
        "Driver_Forearm_R",
        "Driver_Glove_L",
        "Driver_Glove_R",
        "Driver_Thigh_L",
        "Driver_Thigh_R",
        "Driver_Shin_L",
        "Driver_Shin_R",
        "Driver_Boot_L",
        "Driver_Boot_R",
    ]
    for node_name in required_nodes:
        if bpy.data.objects.get(node_name) is None:
            raise AssertionError(f"Missing required node '{node_name}' in {BLEND_PATH}")

    # Apply modifiers cleanly once in memory so BVHTree evaluates exact exported meshes
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.modifiers:
            bpy.context.view_layer.objects.active = obj
            for mod in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)

    steer_upper = bpy.data.objects["Kart_Steering_Upper"]
    steer_lower = bpy.data.objects["Kart_Steering_Lower"]
    knuckle_l = bpy.data.objects["Kart_Knuckle_L"]
    knuckle_r = bpy.data.objects["Kart_Knuckle_R"]
    tie_l = bpy.data.objects["Kart_TieRod_L"]
    tie_r = bpy.data.objects["Kart_TieRod_R"]
    pedal_b = bpy.data.objects["Kart_Pedal_Brake"]
    pedal_t = bpy.data.objects["Kart_Pedal_Throttle"]
    pushrod = bpy.data.objects["Kart_Brake_Pushrod"]
    tlink = bpy.data.objects["Kart_Throttle_Link"]
    driver_torso = bpy.data.objects["Driver_Torso"]
    driver_neck = bpy.data.objects["Driver_Neck_Pivot"]
    upper_arm_l = bpy.data.objects["Driver_UpperArm_L"]
    upper_arm_r = bpy.data.objects["Driver_UpperArm_R"]
    forearm_l = bpy.data.objects["Driver_Forearm_L"]
    forearm_r = bpy.data.objects["Driver_Forearm_R"]
    thigh_l = bpy.data.objects["Driver_Thigh_L"]
    thigh_r = bpy.data.objects["Driver_Thigh_R"]
    shin_l = bpy.data.objects["Driver_Shin_L"]
    shin_r = bpy.data.objects["Driver_Shin_R"]
    boot_l = bpy.data.objects["Driver_Boot_L"]
    boot_r = bpy.data.objects["Driver_Boot_R"]

    for obj in (
        steer_upper, steer_lower, knuckle_l, knuckle_r, tie_l, tie_r,
        pedal_b, pedal_t, pushrod, tlink,
        driver_torso, driver_neck,
        upper_arm_l, upper_arm_r, forearm_l, forearm_r,
        thigh_l, thigh_r, shin_l, shin_r, boot_l, boot_r,
    ):
        obj.rotation_mode = "QUATERNION"

    static_meshes = collect_meshes_under("Kart_Chassis_Static")
    groups = {
        "Steering_Upper": collect_meshes_under("Kart_Steering_Upper"),
        "Steering_Lower": collect_meshes_under("Kart_Steering_Lower"),
        "Knuckle_L": [m for m in collect_meshes_under("Kart_Knuckle_L") if not m.name.startswith("Kart_Wheel_FL")],
        "Knuckle_R": [m for m in collect_meshes_under("Kart_Knuckle_R") if not m.name.startswith("Kart_Wheel_FR")],
        "Wheel_FL": collect_meshes_under("Kart_Wheel_FL"),
        "Wheel_FR": collect_meshes_under("Kart_Wheel_FR"),
        "Wheel_RL": collect_meshes_under("Kart_Wheel_RL"),
        "Wheel_RR": collect_meshes_under("Kart_Wheel_RR"),
        "TieRod_L": collect_meshes_under("Kart_TieRod_L"),
        "TieRod_R": collect_meshes_under("Kart_TieRod_R"),
        "Rear_Axle": collect_meshes_under("Kart_Rear_Axle_Spin"),
        "Motor_Pinion": collect_meshes_under("Kart_Motor_Pinion_Spin"),
        "Drive_Belt": collect_meshes_under("Kart_Drive_Belt"),
        "Pedal_Brake": collect_meshes_under("Kart_Pedal_Brake"),
        "Pedal_Throttle": collect_meshes_under("Kart_Pedal_Throttle"),
        "Brake_Pushrod": collect_meshes_under("Kart_Brake_Pushrod"),
        "Throttle_Link": collect_meshes_under("Kart_Throttle_Link"),
        "Brake_LED": collect_meshes_under("Kart_Brake_LED"),
        "Driver_Torso": [m for m in collect_meshes_under("Driver_Torso") if not m.name.startswith("Driver_Neck") and not m.name.startswith("Driver_Helmet")],
        "Driver_Head": collect_meshes_under("Driver_Head"),
        "UpperArm_L": collect_meshes_under("Driver_UpperArm_L"),
        "UpperArm_R": collect_meshes_under("Driver_UpperArm_R"),
        "Forearm_L": collect_meshes_under("Driver_Forearm_L"),
        "Forearm_R": collect_meshes_under("Driver_Forearm_R"),
        "Thigh_L": collect_meshes_under("Driver_Thigh_L"),
        "Thigh_R": collect_meshes_under("Driver_Thigh_R"),
        "Shin_L": collect_meshes_under("Driver_Shin_L"),
        "Shin_R": collect_meshes_under("Driver_Shin_R"),
        "Boot_L": collect_meshes_under("Driver_Boot_L"),
        "Boot_R": collect_meshes_under("Driver_Boot_R"),
    }

    steer_angles = [-MAX_STEER_RAD, -0.5 * MAX_STEER_RAD, 0.0, 0.5 * MAX_STEER_RAD, MAX_STEER_RAD]
    failures = []
    max_rod_err = 0.0
    min_tire_bumper_gap = 1e9
    global_min = Vector((1e9, 1e9, 1e9))
    global_max = Vector((-1e9, -1e9, -1e9))

    ct = math.cos(STEER_MOUNT_ROT_Z)
    st = math.sin(STEER_MOUNT_ROT_Z)

    for steer_rad in steer_angles:
        sw_rad = steer_rad * STEER_RATIO
        four_bar = solve_four_bar(sw_rad)

        steer_upper.rotation_quaternion = three_quat_to_blender_quat(UPPER_AXIS_BACK_THREE, -sw_rad)
        steer_lower.rotation_quaternion = three_quat_to_blender_quat(LOWER_AXIS_BACK_THREE, -sw_rad)

        # Lateral-G torso lean (±3.5 deg proportional to steering corner load) & look-to-apex neck yaw
        torso_lean_rad = (-steer_rad / MAX_STEER_RAD) * MAX_TORSO_LEAN_RAD
        driver_torso.rotation_quaternion = three_quat_to_blender_quat(Vector((1.0, 0.0, 0.0)), torso_lean_rad)
        driver_neck.rotation_quaternion = three_quat_to_blender_quat(Vector((0.0, 1.0, 0.0)), -steer_rad * 0.25)

        # 2-bone arm IK from leaned shoulder to rotated wheel wrist target
        steer_q_three = Quaternion(UPPER_AXIS_BACK_THREE, -sw_rad)
        for side, ua_obj, fa_obj in ((-1, upper_arm_l, forearm_l), (1, upper_arm_r, forearm_r)):
            sh_local = Vector((DRIVER_SHOULDER[0], DRIVER_SHOULDER[1], side * DRIVER_SHOULDER[2])) - DRIVER_HIP_PIVOT
            sh_world = (Quaternion(Vector((1.0, 0.0, 0.0)), torso_lean_rad) @ sh_local) + DRIVER_HIP_PIVOT
            gx, gy, gz = GLOVE_OFFSET
            wrist_hub = Vector((
                gx * ct - gy * st + GLOVE_WRIST_LOCAL.x,
                gx * st + gy * ct + GLOVE_WRIST_LOCAL.y,
                side * gz + GLOVE_WRIST_LOCAL.z,
            ))
            wrist_world = (steer_q_three @ wrist_hub) + STEER_MOUNT_POS
            arm_pole = Vector((-0.05, -0.15, side * 0.99)).normalized()
            elbow_w, wrist_ik = solve_two_bone_ik_three(sh_world, wrist_world, DRIVER_UPPER_ARM_LEN, DRIVER_FOREARM_LEN, arm_pole)
            if abs((elbow_w - sh_world).length - DRIVER_UPPER_ARM_LEN) > 1e-4 or abs((wrist_ik - elbow_w).length - DRIVER_FOREARM_LEN) > 1e-4:
                failures.append(f"Arm IK bone stretch at steer={steer_rad:+.2f} side={side}")
            if (wrist_ik - wrist_world).length > 5e-4:
                failures.append(f"Arm IK wrist separation {(wrist_ik - wrist_world).length:.4f}m at steer={steer_rad:+.2f} side={side}")
            orient_limb_three(ua_obj, sh_world, elbow_w, arm_pole)
            orient_limb_three(fa_obj, elbow_w, wrist_ik, arm_pole)

        knuckle_l.rotation_quaternion = three_quat_to_blender_quat(four_bar["left"]["k_axis"], four_bar["left"]["k_rot"])
        knuckle_r.rotation_quaternion = three_quat_to_blender_quat(four_bar["right"]["k_axis"], four_bar["right"]["k_rot"])

        for side_key, tr_obj in (("left", tie_l), ("right", tie_r)):
            s = four_bar[side_key]["start"]
            e = four_bar[side_key]["end"]
            rod_len = four_bar[side_key]["rod_len"]
            dist = (e - s).length
            err = abs(dist - rod_len)
            max_rod_err = max(max_rod_err, err)
            if err >= 0.0005:
                failures.append(f"TieRod {side_key} length error {err:.6f} m >= 0.0005 m at steer={steer_rad}")
            if max(abs(tr_obj.scale.x - 1.0), abs(tr_obj.scale.y - 1.0), abs(tr_obj.scale.z - 1.0)) > 1e-6:
                failures.append(f"TieRod {side_key} non-unit scale {tuple(tr_obj.scale)}")
            tr_obj.location = t2b(0.5 * (s + e))
            d_bl = t2b((e - s).normalized())
            tr_obj.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(d_bl)

        for throttle_in in (0.0, 1.0):
            for brake_in in (0.0, 1.0):
                # Pedal rotation: -input * 0.24 rad around Three.js +Z
                bq = three_quat_to_blender_quat(Vector((0.0, 0.0, 1.0)), -brake_in * 0.24)
                tq = three_quat_to_blender_quat(Vector((0.0, 0.0, 1.0)), -throttle_in * 0.24)
                pedal_b.rotation_quaternion = bq
                pedal_t.rotation_quaternion = tq

                # 2-bone leg IK + boot pitch tracking live pedals
                for side, p_in, th_obj, sh_obj, bt_obj in (
                    (-1, brake_in, thigh_l, shin_l, boot_l),
                    (1, throttle_in, thigh_r, shin_r, boot_r),
                ):
                    pitch = -p_in * 0.24
                    hip_local = Vector((DRIVER_HIP_JOINT[0], DRIVER_HIP_JOINT[1], side * DRIVER_HIP_JOINT[2])) - DRIVER_HIP_PIVOT
                    hip_world = (Quaternion(Vector((1.0, 0.0, 0.0)), torso_lean_rad) @ hip_local) + DRIVER_HIP_PIVOT
                    p_piv = Vector((PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], side * PEDAL_PIVOT_POS[2]))
                    p_q_three = Quaternion(Vector((0.0, 0.0, 1.0)), pitch)
                    sole_local = Vector((PEDAL_SOLE_LOCAL[0], PEDAL_SOLE_LOCAL[1] - p_in * PEDAL_SLIDE_M, 0.0))
                    sole_w = p_piv + (p_q_three @ sole_local)
                    ankle_w = sole_w + (p_q_three @ PEDAL_ANKLE_OFFSET)
                    leg_pole = Vector((0.0, 0.72, side * 0.69)).normalized()
                    knee_w, ankle_ik = solve_two_bone_ik_three(hip_world, ankle_w, DRIVER_THIGH_LEN, DRIVER_SHIN_LEN, leg_pole)
                    if abs((knee_w - hip_world).length - DRIVER_THIGH_LEN) > 1e-4 or abs((ankle_ik - knee_w).length - DRIVER_SHIN_LEN) > 1e-4:
                        failures.append(f"Leg IK bone stretch at pedal={p_in} side={side}")
                    if (ankle_ik - ankle_w).length > 5e-4:
                        failures.append(f"Leg IK ankle separation {(ankle_ik - ankle_w).length:.4f}m at pedal={p_in} side={side}")
                    orient_limb_three(th_obj, hip_world, knee_w, leg_pole)
                    orient_limb_three(sh_obj, knee_w, ankle_ik, leg_pole)
                    bt_obj.location = t2b(ankle_ik)
                    bt_obj.rotation_quaternion = three_quat_to_blender_quat(Vector((0.0, 0.0, 1.0)), pitch)

                b_piv = Vector((PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], -PEDAL_PIVOT_POS[2]))
                b_clevis_world = b_piv + (Quaternion(Vector((0.0, 0.0, 1.0)), -brake_in * 0.24) @ BRAKE_CLEVIS_LOCAL)
                pushrod.location = t2b(0.5 * (b_clevis_world + BRAKE_MASTER_BORE))
                b_axis = (b_clevis_world - BRAKE_MASTER_BORE).normalized()
                pushrod.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(t2b(b_axis))

                # Check coaxial alignment of brake pushrod against (b_clevis_world -> BRAKE_MASTER_BORE)
                pushrod_axis_three = b2t(pushrod.rotation_quaternion @ Vector((0.0, -1.0, 0.0))).normalized()
                align_dot = abs(pushrod_axis_three.dot(b_axis))
                if align_dot < 0.9999:
                    failures.append(f"Brake pushrod misalignment dot={align_dot:.6f} at brake={brake_in}")

                t_piv = Vector((PEDAL_PIVOT_POS[0], PEDAL_PIVOT_POS[1], PEDAL_PIVOT_POS[2]))
                t_clevis_world = t_piv + (Quaternion(Vector((0.0, 0.0, 1.0)), -throttle_in * 0.24) @ THROTTLE_CLEVIS_LOCAL)
                tlink.location = t2b(0.5 * (t_clevis_world + THROTTLE_TPS_PIVOT))
                t_axis = (t_clevis_world - THROTTLE_TPS_PIVOT).normalized()
                tlink.rotation_quaternion = Vector((0.0, -1.0, 0.0)).rotation_difference(t2b(t_axis))

                bpy.context.view_layer.update()
                depsgraph = bpy.context.evaluated_depsgraph_get()

                static_bvh = {m.name: build_world_bvh_and_bounds(m, depsgraph) for m in static_meshes}
                group_bvh = {}
                for gname, mobjs in groups.items():
                    group_bvh[gname] = {m.name: build_world_bvh_and_bounds(m, depsgraph) for m in mobjs}

                # Bounds check across every mesh in this pose
                all_items = list(static_bvh.items())
                for ddict in group_bvh.values():
                    all_items.extend(ddict.items())
                for mname, (_bvh, bmin, bmax, _verts) in all_items:
                    if mname.startswith("Studio_"):
                        continue
                    global_min.x = min(global_min.x, bmin.x)
                    global_min.y = min(global_min.y, bmin.y)
                    global_min.z = min(global_min.z, bmin.z)
                    global_max.x = max(global_max.x, bmax.x)
                    global_max.y = max(global_max.y, bmax.y)
                    global_max.z = max(global_max.z, bmax.z)

                # Cross-group BVHTree overlap audit
                for gname, ddict in group_bvh.items():
                    for mname, (bvh_a, _, _, verts_a) in ddict.items():
                        # 1. Moving mesh vs all static meshes
                        for sname, (bvh_s, _, _, _) in static_bvh.items():
                            if is_allowed_contact(mname, sname):
                                continue
                            hits = bvh_a.overlap(bvh_s)
                            if hits:
                                failures.append(
                                    f"Overlap [{steer_rad:+.2f}, thr={throttle_in:.0f}, brk={brake_in:.0f}] {mname} <-> {sname} ({len(hits)} tri pairs)"
                                )

                        # 2. Tire-to-static bumper/bodywork clearance check (> 15 mm) at throttle=0, brake=0
                        if throttle_in == 0.0 and brake_in == 0.0 and mname.endswith("_Tire"):
                            for sname, (bvh_s, _, _, _) in static_bvh.items():
                                if sname.startswith("OTL_Floor_Pan") or sname.startswith("OTL_Rear_Live_Axle"):
                                    continue
                                for vx in verts_a[::4]:
                                    loc, _nrm, _idx, dist = bvh_s.find_nearest(t2b(vx))
                                    if loc is not None and dist < min_tire_bumper_gap:
                                        min_tire_bumper_gap = dist
                                        if dist < 0.015:
                                            failures.append(
                                                f"Tire clearance {dist*1000:.1f}mm < 15mm: {mname} <-> {sname} at steer={steer_rad:+.2f}"
                                            )

                # 3. Dynamic group vs dynamic group overlaps (e.g. Pedals vs Driver_Fixed boots, Wheels vs TieRods)
                dyn_names = list(group_bvh.keys())
                for i in range(len(dyn_names)):
                    for j in range(i + 1, len(dyn_names)):
                        ga, gb = dyn_names[i], dyn_names[j]
                        # Skip rear axle vs rear wheels (hub mounts coaxially on axle)
                        if ga == "Rear_Axle" and gb in ("Wheel_RL", "Wheel_RR"):
                            continue
                        for ma, (bvha, _, _, _) in group_bvh[ga].items():
                            for mb, (bvhb, _, _, _) in group_bvh[gb].items():
                                if is_allowed_contact(ma, mb):
                                    continue
                                hits = bvha.overlap(bvhb)
                                if hits:
                                    failures.append(
                                        f"DynOverlap [{steer_rad:+.2f}, thr={throttle_in:.0f}, brk={brake_in:.0f}] {ma} <-> {mb} ({len(hits)} tri pairs)"
                                    )

    # Check strict envelope bounds
    if global_min.x < -0.80 or global_max.x > 0.88:
        failures.append(f"X envelope violation: [{global_min.x:.4f}, {global_max.x:.4f}] outside [-0.80, 0.88]")
    if max(abs(global_min.z), abs(global_max.z)) > 0.450:
        failures.append(f"Z envelope violation: [{global_min.z:.4f}, {global_max.z:.4f}] exceeds +-0.450")
    if not (0.84 < global_max.y < 0.89):
        failures.append(f"Y max envelope violation: {global_max.y:.4f} outside (0.84, 0.89)")

    print(
        f"AUDIT SUMMARY: states=20 | max_rod_err={max_rod_err:.2e} m | min_tire_gap={min_tire_bumper_gap*1000:.1f} mm | "
        f"bounds_x=[{global_min.x:.3f}, {global_max.x:.3f}] bounds_y=[{global_min.y:.3f}, {global_max.y:.3f}] "
        f"bounds_z=[{global_min.z:.3f}, {global_max.z:.3f}]"
    )
    if failures:
        seen = []
        for f in failures:
            key = f.split("] ")[-1].split(" (")[0]
            if key not in seen:
                seen.append(key)
        print(f"FAILURES ({len(failures)} total, {len(seen)} unique):")
        for f in failures[:40]:
            print("  -", f)
        print("UNIQUE PAIRS:", seen[:40])
        sys.exit(1)
    print("PASS: Zero overlaps across all 20 kinematic states, exact linkage, and strict envelope bounds.")


if __name__ == "__main__":
    main()
