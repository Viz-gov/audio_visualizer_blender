import { NextRequest } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import ffprobeStatic from "ffprobe-static";
import { spawn } from "child_process";
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
const resolvedFfprobe = resolveBinPath(ffprobeStatic.path || "");

function run(cmd: string[], cwd?: string) {
  return new Promise<{ code: number; out: string }>((res) => {
    const p = spawn(cmd[0], cmd.slice(1), { cwd, windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => res({ code: code ?? 0, out }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { dir } = await req.json();
    if (!dir) throw new Error("Missing 'dir'");

    const mask = path.join(dir, "mask.mp4");
    const guide = path.join(dir, "guide.mp4");
    await fs.access(mask);
    await fs.access(guide);

    const probe = async (p: string) => {
      const r = await run([resolvedFfprobe, "-v", "error", "-show_streams", "-of", "json", p]);
      const parsed = JSON.parse(r.out);
      return parsed.streams?.[0];
    };
    const ms = await probe(mask);
    const gs = await probe(guide);

    if (!ms || !gs) throw new Error("ffprobe returned no streams");
    if (ms.width !== gs.width || ms.height !== gs.height) throw new Error("Mask/guide dimensions differ");
    const fpsMask = eval(ms.r_frame_rate);
    const fpsGuide = eval(gs.r_frame_rate);
    if (Math.abs(fpsMask - fpsGuide) > 0.01) throw new Error(`FPS mismatch: mask ${fpsMask} vs guide ${fpsGuide}`);

    const r = await run([
      resolvedFfmpeg,
      "-v",
      "error",
      "-i",
      mask,
      "-vf",
      "fps=2,format=gray,signalstats",
      "-f",
      "null",
      "-",
    ]);

    const lines = r.out.split(/\r?\n/);
    let nonBinaryFrames = 0;
    for (const L of lines) {
      const mMin = L.match(/YMIN:(\d+)/);
      const mMax = L.match(/YMAX:(\d+)/);
      if (mMin && mMax) {
        const ymin = Number(mMin[1]);
        const ymax = Number(mMax[1]);
        const ok = ymin <= 1 && ymax >= 254;
        if (!ok) nonBinaryFrames++;
      }
    }

    const ok = nonBinaryFrames === 0;
    return new Response(
      JSON.stringify({ ok, dims: { w: ms.width, h: ms.height }, fps: fpsMask, sampled_non_binary_frames: nonBinaryFrames }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}


