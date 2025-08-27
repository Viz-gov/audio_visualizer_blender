# blender_bg_from_features_eevee45.py
# Blender 4.5+ compatible background generator (EEVEE Next GPU)
# Usage:
#   blender -b -P blender_bg_from_features_eevee45.py -- --dir "/abs/path/to/guidepack" --style neon --fps 30 --width 1920 --height 1080

import json, os, sys, math

def _argv_after_double_dash():
    if "--" in sys.argv:
        i = sys.argv.index("--")
        return sys.argv[i+1:]
    return []

args = _argv_after_double_dash()
DIR = None
STYLE = "neon"
FPS = None
W, H = 1920, 1080

i = 0
while i < len(args):
    k = args[i]
    if k == "--dir": DIR = args[i+1]; i+=2; continue
    if k == "--style": STYLE = args[i+1]; i+=2; continue
    if k == "--fps": FPS = int(args[i+1]); i+=2; continue
    if k == "--width": W = int(args[i+1]); i+=2; continue
    if k == "--height": H = int(args[i+1]); i+=2; continue
    i += 1

if not DIR:
    print("Missing --dir")
    sys.exit(2)

import bpy

# Load features.json
feat_path = os.path.join(DIR, "features.json")
with open(feat_path, "r", encoding="utf-8") as f:
    feat = json.load(f)

fps = FPS or int(feat.get("fps",30))
n_frames = int(feat.get("n_frames",0))
env_peak = feat.get("env_peak", [])
if not n_frames or not env_peak:
    print("features.json missing data")
    sys.exit(3)
env_peak = env_peak[:n_frames]

# Scene
scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE_NEXT'
scn.render.resolution_x = W
scn.render.resolution_y = H
scn.render.fps = fps
scn.frame_start = 1
scn.frame_end = n_frames

# World = black
world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scn.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
out = wn.nodes.new("ShaderNodeOutputWorld")
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0,0,0,1)
wn.links.new(bg.outputs["Background"], out.inputs["Surface"])

# Delete objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Camera
bpy.ops.object.camera_add(location=(0,-3,0), rotation=(math.radians(90),0,0))
cam = bpy.context.active_object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.0
scn.camera = cam

# Plane
bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0,0,0))
plane = bpy.context.active_object

# Material with noise + emission
mat = bpy.data.materials.new("BGMat"); mat.use_nodes=True
nt = mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission"); em.location=(400,0)
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.location=(-400,0)
noise.inputs["Scale"].default_value=6.0; noise.inputs["Detail"].default_value=2.0; noise.inputs["Roughness"].default_value=0.5

ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location=(-150,0)
ramp.color_ramp.elements[0].position=0.2; ramp.color_ramp.elements[0].color=(0,0,0,1)
ramp.color_ramp.elements[1].position=0.8
if STYLE=="mono":
    ramp.color_ramp.elements[1].color=(1,1,1,1)
else:
    ramp.color_ramp.elements[1].color=(0.5,0.7,1,1)

amp_val = nt.nodes.new("ShaderNodeValue"); amp_val.name="AMP"; amp_val.outputs[0].default_value=0.0
mult_amp = nt.nodes.new("ShaderNodeMath"); mult_amp.operation="MULTIPLY"; mult_amp.location=(100,0)
base_strength = nt.nodes.new("ShaderNodeValue"); base_strength.outputs[0].default_value=2.0
mult_strength = nt.nodes.new("ShaderNodeMath"); mult_strength.operation="MULTIPLY"; mult_strength.location=(200,100)

nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], mult_amp.inputs[0])
nt.links.new(amp_val.outputs[0], mult_amp.inputs[1])
nt.links.new(mult_amp.outputs[0], em.inputs["Color"])
nt.links.new(base_strength.outputs[0], mult_strength.inputs[0])
nt.links.new(amp_val.outputs[0], mult_strength.inputs[1])
nt.links.new(mult_strength.outputs[0], em.inputs["Strength"])
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

if plane.data.materials: plane.data.materials[0] = mat
else: plane.data.materials.append(mat)

# Keyframe AMP values
for f in range(1, n_frames+1):
    v = float(env_peak[f-1]); v = max(0.0, min(1.0, v))
    amp_val.outputs[0].default_value = v
    amp_val.outputs[0].keyframe_insert("default_value", frame=f)

# Output settings
scn.render.image_settings.file_format = 'FFMPEG'
scn.render.ffmpeg.format = 'MPEG4'
scn.render.ffmpeg.codec = 'H264'
scn.render.ffmpeg.constant_rate_factor = 'MEDIUM'
scn.render.filepath = os.path.join(DIR,"bg_blender.mp4")

print(f"Rendering {n_frames} frames at {fps}fps with EEVEE Next...")
bpy.ops.render.render(animation=True)
print("Done.")
