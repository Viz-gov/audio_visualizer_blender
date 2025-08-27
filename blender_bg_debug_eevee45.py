# blender_bg_debug_eevee45.py
# Blender 4.5+ EEVEE Next — OBVIOUS debug background (magenta + animated stripes)
# Usage:
#   blender -b -P blender_bg_debug_eevee45.py -- --dir "/abs/path/to/guidepack" --fps 30 --width 1920 --height 1080

import json, os, sys, math
def _argv_after_double_dash():
    if "--" in sys.argv:
        i = sys.argv.index("--")
        return sys.argv[i+1:]
    return []
args = _argv_after_double_dash()
DIR=None; FPS=None; W,H=1920,1080
i=0
while i<len(args):
    k=args[i]
    if k=="--dir": DIR=args[i+1]; i+=2; continue
    if k=="--fps": FPS=int(args[i+1]); i+=2; continue
    if k=="--width": W=int(args[i+1]); i+=2; continue
    if k=="--height": H=int(args[i+1]); i+=2; continue
    i+=1
if not DIR: print("Missing --dir"); sys.exit(2)

import bpy
feat_path = os.path.join(DIR,"features.json")
with open(feat_path,"r",encoding="utf-8") as f: feat=json.load(f)
fps = FPS or int(feat.get("fps",30))
n_frames = int(feat.get("n_frames",0))
env_peak = feat.get("env_peak",[])[:n_frames]
if not n_frames or not env_peak: print("features.json missing data"); sys.exit(3)

scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE_NEXT'
scn.render.resolution_x = W; scn.render.resolution_y = H; scn.render.fps = fps
scn.frame_start = 1; scn.frame_end = n_frames

# World black
world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scn.world = world; world.use_nodes=True
wn = world.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
wout = wn.nodes.new("ShaderNodeOutputWorld")
wbg = wn.nodes.new("ShaderNodeBackground"); wbg.inputs["Color"].default_value=(0,0,0,1)
wn.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

# Clear scene
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

# Camera ortho
bpy.ops.object.camera_add(location=(0,-3,0), rotation=(math.radians(90),0,0))
cam=bpy.context.active_object; cam.data.type='ORTHO'; cam.data.ortho_scale=2.0
scn.camera=cam

# Plane
bpy.ops.mesh.primitive_plane_add(size=2.0,location=(0,0,0))
plane=bpy.context.active_object

# Material: hot magenta base + white moving stripes; brightness tied to AMP
mat=bpy.data.materials.new("DBG"); mat.use_nodes=True
nt=mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
mout=nt.nodes.new("ShaderNodeOutputMaterial")
em=nt.nodes.new("ShaderNodeEmission"); em.location=(400,0)

# Base magenta color
base = nt.nodes.new("ShaderNodeRGB")
base.outputs["Color"].default_value=(1.0, 0.1, 0.8, 1.0)  # hot magenta

# Wave stripes moving over time
wave = nt.nodes.new("ShaderNodeTexWave"); wave.location=(-450,-120)
wave.inputs["Scale"].default_value=8.0
wave.inputs["Distortion"].default_value=0.0
wave.inputs["Detail"].default_value=0.0
# Animate phase with driver on "Phase Offset"
drv = wave.inputs["Phase Offset"].driver_add("default_value").driver
drv.type='SCRIPTED'
var = drv.variables.new(); var.name="f"; var.type='SINGLE_PROP'
var.targets[0].id_type='SCENE'; var.targets[0].id=scn; var.targets[0].data_path="frame_current"
drv.expression = "(f/%d)*2.0" % fps

# Mix magenta with stripes (stripes bright)
mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type='ADD'; mix.inputs["Fac"].default_value=1.0
nt.links.new(base.outputs["Color"], mix.inputs[1])
nt.links.new(wave.outputs["Color"], mix.inputs[2])

# AMP value node (keyframed)
amp = nt.nodes.new("ShaderNodeValue"); amp.name="AMP"; amp.outputs[0].default_value=0.0

# Emission color/strength
nt.links.new(mix.outputs["Color"], em.inputs["Color"])
str_mul = nt.nodes.new("ShaderNodeMath"); str_mul.operation='MULTIPLY'; str_mul.location=(200,120)
base_strength = nt.nodes.new("ShaderNodeValue"); base_strength.outputs[0].default_value = 5.0  # very bright
nt.links.new(base_strength.outputs[0], str_mul.inputs[0])
nt.links.new(amp.outputs[0], str_mul.inputs[1])
nt.links.new(str_mul.outputs[0], em.inputs["Strength"])
nt.links.new(em.outputs["Emission"], mout.inputs["Surface"])

# Assign
if plane.data.materials: plane.data.materials[0]=mat
else: plane.data.materials.append(mat)

# Keyframe AMP per frame (exaggerated)
for f in range(1, n_frames+1):
    v = float(env_peak[f-1]); v = max(0.0, min(1.0, v))
    v = v*2.5 + 0.25  # boost so it's obviously visible
    amp.outputs[0].default_value = v
    amp.outputs[0].keyframe_insert("default_value", frame=f)

# Output
scn.render.image_settings.file_format='FFMPEG'
scn.render.ffmpeg.format='MPEG4'
scn.render.ffmpeg.codec='H264'
scn.render.ffmpeg.constant_rate_factor='MEDIUM'
scn.render.filepath=os.path.join(DIR, "bg_blender.mp4")

print(f"Rendering {n_frames} frames at {fps}fps (DEBUG) ...")
bpy.ops.render.render(animation=True)
print("Done.")
