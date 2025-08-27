import { NextRequest } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

export const runtime = "nodejs";

// simple easing (kept in case we later bring back frame-based rendering)
const smooth = (arr: number[], k = 0.2) => {
  const out = new Float32Array(arr.length);
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] ?? 0;
    prev = prev + k * (v - prev);
    out[i] = prev;
  }
  return Array.from(out);
};

type Features = {
  fps: number;
  n_frames: number;
  duration_s: number;
  env_peak: number[];
  env_rms?: number[];
};

export async function POST(req: NextRequest) {
  try {
    const { dir, width, height, fps: fpsIn, crf: crfIn, preset: presetIn } = await req.json();
    if (!dir) throw new Error("Missing 'dir'");
    const W = Math.max(640, Number(width) || 1280);
    const H = Math.max(360, Number(height) || 720);
    const toolPath = (ffmpegPath as unknown as string) || "";
    let ffpath = toolPath;
    if (ffpath.startsWith("\\ROOT\\")) {
      ffpath = path.join(process.cwd(), ffpath.replace(/^\\ROOT\\/, ""));
    }
    await fs.access(ffpath);

    // Validate features exist (optional sanity check)
    const featPath = path.join(dir, "features.json");
    const raw = await fs.readFile(featPath, "utf8");
    const feat: Features = JSON.parse(raw);
    const fps = Number(fpsIn) || feat.fps || 30;
    const crf = Math.min(35, Math.max(18, Number(crfIn) || 28));
    const preset = String(presetIn || "veryfast");

    const outMp4 = path.join(dir, "guide.mp4");
    const audioIn = path.join(dir, "audio.wav");

    // Use ffmpeg's showwaves to draw a white waveform on black background at desired resolution
    // Force yuv420p for compatibility and set output fps to requested value
    const args = [
      "-y",
      "-i", audioIn,
      "-filter_complex",
      `showwaves=s=${W}x${H}:mode=line:colors=white,format=yuv420p`,
      "-r", String(fps),
      "-an",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-profile:v", "high",
      "-level", "4.2",
      "-crf", String(crf),
      "-preset", preset,
      outMp4,
    ];

    const ff = spawn(ffpath, args, { stdio: ["ignore", "pipe", "pipe"] });
    ff.stdout.on("data", () => {});
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d.toString(); });

    const exitCode: number = await new Promise((res) => ff.on("close", res as any));
    if (exitCode !== 0) {
      throw new Error(`ffmpeg failed (code ${exitCode}):\n${ffErr}`);
    }

    const id = path.basename(dir);
    const url = `/api/guidepacks/${id}/guide.mp4`;
    return new Response(JSON.stringify({ ok: true, path: outMp4, url, fps, width: W, height: H, crf, preset }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500 });
  }
}


