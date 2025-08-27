import { NextRequest } from "next/server";
import path from "path";
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

function run(cmd: string[]) {
  return new Promise<{ code: number; out: string }>((res) => {
    const p = spawn(cmd[0], cmd.slice(1), { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => res({ code: code ?? 0, out }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { dir, stylizedPath, outName = "final.mp4", audioOffsetMs = 0 } = await req.json();
    if (!dir || !stylizedPath) throw new Error("Need 'dir' and 'stylizedPath'");
    const audio = path.join(dir, "audio.wav");
    const stylizedFullPath = path.join(dir, stylizedPath);  // Resolve full path
    const out = path.join(dir, outName);

    const args = [
      resolvedFfmpeg,
      "-y",
      ...(audioOffsetMs ? ["-itsoffset", (audioOffsetMs / 1000).toString()] : []),
      "-i",
      audio,
      "-i",
      stylizedFullPath,
      "-map",
      "1:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      out,
    ];
    const r = await run(args);
    if (r.code !== 0) throw new Error(r.out);

    return new Response(JSON.stringify({ ok: true, path: out }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}


