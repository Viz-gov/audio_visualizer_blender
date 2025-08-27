import { NextRequest } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

export const runtime = "nodejs";

type Features = { fps: number; n_frames: number; env_peak: number[] };

export async function POST(req: NextRequest) {
  try {
    const { dir, width, height, fps: fpsIn, windowSec, inflatePx } = await req.json();
    if (!dir) throw new Error("Missing 'dir'");
    const W = Math.max(640, Number(width) || 1280);
    const H = Math.max(360, Number(height) || 720);
    const inflate = Math.max(1, Number(inflatePx) || Math.round(H * 0.02));

    // Resolve ffmpeg path (Windows Turbopack ROOT handling)
    const toolPath = (ffmpegPath as unknown as string) || "";
    let ffpath = toolPath;
    if (ffpath.startsWith("\\ROOT\\")) {
      ffpath = path.join(process.cwd(), ffpath.replace(/^\\ROOT\\/, ""));
    }
    await fs.access(ffpath);

    // Sanity check features presence and fps
    const featPath = path.join(dir, "features.json");
    const raw = await fs.readFile(featPath, "utf8");
    const feat: Features = JSON.parse(raw);
    const fps = Number(fpsIn) || feat.fps || 30;

    const audioIn = path.join(dir, "audio.wav");
    await fs.access(audioIn);
    const outMp4 = path.join(dir, "mask.mp4");

    // Build a white corridor around the waveform using ffmpeg filters:
    // 1) showwaves draws a thin white line on black
    // 2) boxblur inflates line thickness (acts like dilation)
    // 3) lut thresholds to binary black/white
    // 4) scale to the requested WxH and enforce fps/pix_fmt
    const threshold = 8; // post-blur threshold for binarization (0..255)
    const blur = Math.max(1, Math.round(inflate / 2));
    const filter = `showwaves=s=${W}x${H}:mode=line:colors=white,format=gray,boxblur=${blur}:1,lut=y='if(gte(val,${threshold}),255,0)'`;

    const args = [
      "-y",
      "-i", audioIn,
      "-filter_complex", filter,
      "-r", String(fps),
      "-an",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-crf", "14",
      "-preset", "medium",
      outMp4,
    ];

    const ff = spawn(ffpath, args, { stdio: ["ignore", "pipe", "pipe"] });
    ff.stdout.on("data", () => {});
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d.toString(); });
    const code: number = await new Promise((res) => ff.on("close", res as any));
    if (code !== 0) {
      throw new Error(`ffmpeg failed: ${ffErr}`);
    }

    const id = path.basename(dir);
    const url = `/api/guidepacks/${id}/mask.mp4`;
    return new Response(JSON.stringify({ ok: true, path: outMp4, url, fps, width: W, height: H }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}


