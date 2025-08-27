import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

const resolveBinPath = (binPath: string) => {
  let resolvedPath = binPath;
  if (resolvedPath.startsWith("\\ROOT\\")) {
    resolvedPath = path.join(process.cwd(), resolvedPath.replace(/^\\ROOT\\/, ""));
  }
  return resolvedPath;
};

const resolvedFfmpeg = resolveBinPath(ffmpegPath || "");

function runFfmpeg(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const ffmpegProcess = spawn(resolvedFfmpeg, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    ffmpegProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    ffmpegProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpegProcess.on('close', (code) => {
      resolve({ 
        code: code || 0, 
        output: output + errorOutput 
      });
    });
    
    ffmpegProcess.on('error', (err) => {
      resolve({ 
        code: -1, 
        output: `Process error: ${err.message}` 
      });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const { dir, bgVideo, guideVideo, maskVideo, outputName } = await req.json();
    
    if (!dir || !bgVideo || !guideVideo || !maskVideo) {
      return new Response(JSON.stringify({ 
        error: "Missing required parameters: dir, bgVideo, guideVideo, maskVideo" 
      }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
    
    // Check if all input files exist
    const bgPath = path.join(dir, bgVideo);
    const guidePath = path.join(dir, guideVideo);
    const maskPath = path.join(dir, maskVideo);
    const outputPath = path.join(dir, outputName || "composited.mp4");
    
    try {
      await fs.access(bgPath);
      await fs.access(guidePath);
      await fs.access(maskPath);
    } catch {
      return new Response(JSON.stringify({ 
        error: "One or more input video files not found" 
      }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
    
    // FFmpeg command to composite waveform with background
    // [2:v]format=gray[mk];[1:v][mk]alphamerge[fg];[0:v][fg]overlay=shortest=1
    const ffmpegArgs = [
      "-y",  // overwrite output
      "-i", bgPath,      // background video
      "-i", guidePath,   // guide video (waveform)
      "-i", maskPath,    // mask video
      "-filter_complex", "[2:v]format=gray[mk];[1:v][mk]alphamerge[fg];[0:v][fg]overlay=shortest=1",
      "-an",             // no audio
      "-c:v", "libx264", // video codec
      "-crf", "18",      // quality
      "-preset", "medium", // encoding preset
      outputPath
    ];
    
    console.log("Running ffmpeg with args:", ffmpegArgs);
    const result = await runFfmpeg(ffmpegArgs);
    
    if (result.code !== 0) {
      return new Response(JSON.stringify({ 
        error: `FFmpeg failed with code ${result.code}: ${result.output}` 
      }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
    
    // Check if output file was created
    try {
      await fs.access(outputPath);
    } catch {
      return new Response(JSON.stringify({ 
        error: "FFmpeg completed but output file not found" 
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
