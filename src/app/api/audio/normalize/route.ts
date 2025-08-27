import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import * as mm from "music-metadata";

// Normalize paths; handle Turbopack's virtual "\\ROOT\\" prefix on Windows by remapping to CWD
function fixToolPath(p: string | undefined | null): string {
  if (!p) return "";
  let out = p as string;
  if (out.startsWith("\\ROOT\\")) {
    out = path.join(process.cwd(), out.replace(/^\\ROOT\\/, ""));
  }
  return out;
}

const resolvedFfmpeg = fixToolPath(ffmpegPath as unknown as string);
const resolvedFfprobe = fixToolPath(ffprobeStatic.path as unknown as string);
ffmpeg.setFfmpegPath(resolvedFfmpeg);
ffmpeg.setFfprobePath(resolvedFfprobe);

const ROOT = process.env.GUIDEPACK_DIR || path.resolve(process.cwd(), "storage/guidepacks");

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!resolvedFfmpeg) throw new Error("ffmpeg path not resolved");
    if (!resolvedFfprobe) throw new Error("ffprobe path not resolved");
    await fs.access(resolvedFfmpeg);
    await fs.access(resolvedFfprobe);
    const contentType = req.headers.get("content-type") || "";
    let mp3Path: string;

    if (contentType.includes("application/json")) {
      const { filePath } = await req.json();
      if (!filePath) throw new Error("Missing filePath");
      mp3Path = filePath;
    } else {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) throw new Error("Missing file");
      const buf = Buffer.from(await file.arrayBuffer());
      const tmpDir = path.join(ROOT, "_tmp");
      await fs.mkdir(tmpDir, { recursive: true });
      mp3Path = path.join(tmpDir, `${Date.now()}-${file.name}`);
      await fs.writeFile(mp3Path, buf);
    }

    const id = uuidv4();
    const dir = path.join(ROOT, id);
    await fs.mkdir(dir, { recursive: true });
    const wavOut = path.join(dir, "audio.wav");
    const metaOut = path.join(dir, "meta.json");

    let tags: any = {};
    try {
      const m = await mm.parseFile(mp3Path, { duration: true });
      tags = {
        has_id3: !!m.common.title || !!m.common.artist || !!m.common.album,
        title: m.common.title || null,
        artist: m.common.artist || null,
        album: m.common.album || null,
        encoder: m.format.encoder || null,
        bitrate_kbps: m.format.bitrate ? Math.round(m.format.bitrate / 1000) : null,
      };
    } catch {
      // ignore tag parsing errors
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(mp3Path)
        .noVideo()
        .audioChannels(2)
        .audioFrequency(48000)
        .audioCodec("pcm_s16le")
        .outputOptions(["-map_metadata", "-1"])
        .on("error", (err) => reject(new Error(`ffmpeg transcode failed: ${err?.message || err}`)))
        .on("end", () => resolve())
        .save(wavOut);
    });

    const probe = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(wavOut, (err, data) => (err ? reject(new Error(`ffprobe failed: ${err?.message || err}`)) : resolve(data)));
    });

    const stream = probe.streams.find((s: any) => s.codec_type === "audio") || {};
    const format = probe.format || {};
    const meta = {
      ...tags,
      duration_s: format.duration ? Number(format.duration) : null,
      sample_rate: stream.sample_rate ? Number(stream.sample_rate) : 48000,
      channels: stream.channels || 2,
      path_audio_wav: wavOut,
      id,
      dir,
    };

    await fs.writeFile(metaOut, JSON.stringify(meta, null, 2), "utf8");

    return new Response(JSON.stringify({ id, dir, audioWav: wavOut, meta }, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("/api/audio/normalize error:", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 });
  }
}


