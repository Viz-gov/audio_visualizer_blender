import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

const resolveBinPath = (binPath: string) => {
  let resolvedPath = binPath;
  if (resolvedPath.startsWith("\\ROOT\\")) {
    resolvedPath = path.join(process.cwd(), resolvedPath.replace(/^\\ROOT\\/, ""));
  }
  return resolvedPath;
};

function runBlenderCommand(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    // Default Blender path for Windows - user can override with env var
    const blenderPath = process.env.BLENDER_PATH || "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe";
    const resolvedBlenderPath = resolveBinPath(blenderPath);
    
    const blenderProcess = spawn(resolvedBlenderPath, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    blenderProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    blenderProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    blenderProcess.on('close', (code) => {
      resolve({ 
        code: code || 0, 
        output: output + errorOutput 
      });
    });
    
    blenderProcess.on('error', (err) => {
      resolve({ 
        code: -1, 
        output: `Process error: ${err.message}` 
      });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const { dir, style, fps, width, height } = await req.json();
    
    if (!dir) {
      return new Response(JSON.stringify({ error: "Missing 'dir' parameter" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
    
    // Check if features.json exists
    const featuresPath = path.join(dir, "features.json");
    try {
      await fs.access(featuresPath);
    } catch {
      return new Response(JSON.stringify({ error: "features.json not found in directory" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
    
    // Create the Blender script content - using a static script that works
    const blenderScript = `# blender_bg_from_features.py
import json, os, sys, math

def _argv_after_double_dash():
    if "--" in sys.argv:
        i = sys.argv.index("--")
        return sys.argv[i+1:]
    return []

args = _argv_after_double_dash()
DIR = None
STYLE = "neon"
FPS = 30
W = 1920
H = 1080

# parse args
i = 0
while i < len(args):
    k = args[i]
    if k == "--dir":
        DIR = args[i+1]; i += 2; continue
    i += 1

if not DIR:
    print("ERROR: missing --dir /absolute/path/to/guidepack")
    sys.exit(2)

import bpy

# Load features.json
feat_path = os.path.join(DIR, "features.json")
with open(feat_path, "r", encoding="utf-8") as f:
    feat = json.load(f)

fps = FPS
n_frames = int(feat.get("n_frames", 0))
env_peak = feat.get("env_peak", [])
if not n_frames or not env_peak:
    print("ERROR: features.json missing n_frames/env_peak")
    sys.exit(3)

env_peak = env_peak[:n_frames]

# Scene setup
scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE_NEXT'

# EEVEE settings for Blender 4.5
if hasattr(scn, 'eevee'):
    # Try to set bloom if available
    try:
        scn.eevee.use_bloom = True
        scn.eevee.bloom_intensity = 0.05
        scn.eevee.bloom_radius = 6.5
        scn.eevee.bloom_threshold = 0.6
    except:
        pass
    
    # Try to set GTAO if available
    try:
        scn.eevee.use_gtao = True
        scn.eevee.gtao_factor = 0.6
    except:
        pass

scn.render.resolution_x = W
scn.render.resolution_y = H
scn.render.resolution_percentage = 100
scn.render.fps = fps
scn.frame_start = 1
scn.frame_end = n_frames

# World setup
world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scn.world = world
world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes):
    wn.nodes.remove(n)
out = wn.nodes.new("ShaderNodeOutputWorld")
bg = wn.nodes.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.0,0.0,0.0,1.0)
bg.inputs["Strength"].default_value = 1.0
wn.links.new(bg.outputs["Background"], out.inputs["Surface"])

# Delete default objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False, confirm=False)

# Camera
bpy.ops.object.camera_add(enter_editmode=False, align='VIEW', location=(0, -3, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.active_object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.0
scn.camera = cam

# Plane
bpy.ops.mesh.primitive_plane_add(size=2.0, enter_editmode=False, location=(0,0,0))
plane = bpy.context.active_object

# Material
mat = bpy.data.materials.new("BG_Mat")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)

out = nt.nodes.new("ShaderNodeOutputMaterial")
em = nt.nodes.new("ShaderNodeEmission")
em.location = (400, 0)

noise = nt.nodes.new("ShaderNodeTexNoise")
noise.location = (-600, 0)
noise.inputs["Scale"].default_value = 6.0
noise.inputs["Detail"].default_value = 2.0
noise.inputs["Roughness"].default_value = 0.45

# Use a second noise texture instead of Musgrave (which was removed in Blender 4.5)
noise2 = nt.nodes.new("ShaderNodeTexNoise")
noise2.location = (-600, -220)
noise2.inputs["Scale"].default_value = 3.0
noise2.inputs["Detail"].default_value = 4.0
noise2.inputs["Roughness"].default_value = 0.6

amp_val = nt.nodes.new("ShaderNodeValue")
amp_val.name = "AMP"
amp_val.label = "AMP"
amp_val.outputs[0].default_value = 0.0

mix = nt.nodes.new("ShaderNodeMixRGB")
mix.blend_type = 'ADD'
mix.inputs["Fac"].default_value = 0.5
mix.location = (-250, -60)
nt.links.new(noise.outputs["Fac"], mix.inputs[1])
nt.links.new(noise2.outputs["Fac"], mix.inputs[2])

ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.interpolation = 'EASE'
ramp.color_ramp.elements[0].position = 0.25
ramp.color_ramp.elements[0].color = (0,0,0,1)
ramp.color_ramp.elements[1].position = 0.9
if STYLE == "mono":
    ramp.color_ramp.elements[1].color = (1,1,1,1)
else:
    ramp.color_ramp.elements[1].color = (0.55,0.75,1.0,1)

ramp.location = (-40, -60)

mult_amp = nt.nodes.new("ShaderNodeMath")
mult_amp.operation = 'MULTIPLY'
mult_amp.location = (160, -60)

mult_strength = nt.nodes.new("ShaderNodeMath")
mult_strength.operation = 'MULTIPLY'
mult_strength.location = (200, 120)

base_strength = nt.nodes.new("ShaderNodeValue")
base_strength.label = "BASE_STRENGTH"
base_strength.outputs[0].default_value = 2.0

nt.links.new(mix.outputs["Color"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], mult_amp.inputs[0])
nt.links.new(amp_val.outputs[0], mult_amp.inputs[1])

nt.links.new(mult_amp.outputs[0], em.inputs["Color"])
nt.links.new(base_strength.outputs[0], mult_strength.inputs[0])
nt.links.new(amp_val.outputs[0], mult_strength.inputs[1])
nt.links.new(mult_strength.outputs[0], em.inputs["Strength"])
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

# Animate noise
for tex in (noise, noise2):
    if "W" in tex.inputs:
        drv = tex.inputs["W"].driver_add("default_value").driver
        drv.type = 'SCRIPTED'
        var = drv.variables.new()
        var.name = "f"
        var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'SCENE'
        var.targets[0].id = scn
        var.targets[0].data_path = "frame_current"
        drv.expression = "(f / %d) * 0.25" % fps

# Assign material
if plane.data.materials:
    plane.data.materials[0] = mat
else:
    plane.data.materials.append(mat)

# Keyframe AMP from env_peak
for f in range(1, n_frames+1):
    v = float(env_peak[f-1])
    v = max(0.0, min(1.0, v))
    amp_val.outputs[0].default_value = v
    amp_val.outputs[0].keyframe_insert("default_value", frame=f)

# Output settings
scn.render.image_settings.file_format = 'FFMPEG'
scn.render.ffmpeg.format = 'MPEG4'
scn.render.ffmpeg.codec = 'H264'
scn.render.ffmpeg.constant_rate_factor = 'MEDIUM'
scn.render.ffmpeg.gopsize = fps
scn.render.ffmpeg.max_b_frames = 2
scn.render.use_file_extension = True
scn.render.filepath = os.path.join(DIR, "bg_blender.mp4")

print(f"Rendering {n_frames} frames at {fps} fps to {scn.render.filepath} ...")
bpy.ops.render.render(animation=True)
print("Done.")
`;

    // Write the script to a temporary file
    const scriptPath = path.join(dir, "temp_blender_script.py");
    await fs.writeFile(scriptPath, blenderScript, "utf8");
    
    // Run Blender with the script - exactly like the working PowerShell command
    const blenderArgs = [
      "-b",  // background mode
      "-P", scriptPath,  // run script
      "--",  // separator for script arguments
      "--dir", dir
    ];
    
    console.log("Running Blender with args:", blenderArgs);
    console.log("Blender script content:", blenderScript);
    
    const result = await runBlenderCommand(blenderArgs);
    console.log("Blender result:", result);
    
    // Clean up temporary script
    try {
      await fs.unlink(scriptPath);
    } catch {}
    
    if (result.code !== 0) {
      console.error("Blender failed:", result);
      return new Response(JSON.stringify({ 
        error: `Blender failed with code ${result.code}: ${result.output}` 
      }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
    
    // Check if output file was created
    const outputPath = path.join(dir, "bg_blender.mp4");
    try {
      await fs.access(outputPath);
    } catch {
      return new Response(JSON.stringify({ 
        error: "Blender completed but output file not found" 
      }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      output: result.output,
      outputPath: outputPath
    }), { 
      headers: { "content-type": "application/json" }
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: String(error?.message || error) 
    }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
