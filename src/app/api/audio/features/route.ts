import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import wav from "node-wav";

export const runtime = "nodejs";

function percentile(arr: Float32Array, p: number) {
  const a = Array.from(arr).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 1;
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[idx] || 1;
}

export async function POST(req: NextRequest) {
  try {
    const { dir, fps: fpsIn } = await req.json();
    if (!dir) throw new Error("Missing 'dir' (path to guidepack folder)");
    const fps = Number(fpsIn) || 30;

    const wavPath = path.join(dir, "audio.wav");
    const buf = await fs.readFile(wavPath);
    const decoded = wav.decode(buf);
    const sr = decoded.sampleRate;
    const channels: Float32Array[] = decoded.channelData as any;
    if (!channels?.length) throw new Error("WAV decode returned no channels");

    // Mix to mono
    let y = channels[0];
    if (channels.length > 1) {
      const n = channels[0].length;
      y = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let c = 0; c < channels.length; c++) sum += channels[c][i] || 0;
        y[i] = sum / channels.length;
      }
    }

    // Frame grid (frame-centered)
    const spf = Math.round(sr / fps);
    const nFrames = Math.ceil(y.length / spf);
    const half = Math.floor(spf / 2);

    const envRms = new Float32Array(nFrames);
    const envPeak = new Float32Array(nFrames);

    for (let i = 0; i < nFrames; i++) {
      const center = i * spf + Math.floor(spf / 2);
      const start = Math.max(0, center - half);
      const end = Math.min(y.length, center + half);
      let sumSq = 0;
      let peak = 0;
      for (let k = start; k < end; k++) {
        const v = y[k];
        sumSq += v * v;
        const a = v >= 0 ? v : -v;
        if (a > peak) peak = a;
      }
      const len = Math.max(1, end - start);
      envRms[i] = Math.sqrt(sumSq / len);
      envPeak[i] = peak;
    }

    // Robust normalization to 0..1 using p99
    const p99r = percentile(envRms, 99);
    const p99p = percentile(envPeak, 99);
    for (let i = 0; i < nFrames; i++) {
      envRms[i] = Math.min(1, envRms[i] / (p99r || 1e-6));
      envPeak[i] = Math.min(1, envPeak[i] / (p99p || 1e-6));
    }

    const duration_s = y.length / sr;

    const features = {
      fps,
      hop_s: 1 / fps,
      n_frames: nFrames,
      duration_s,
      timecode_start_s: 0,
      env_rms: Array.from(envRms).map((v) => Number(v.toFixed(6))),
      env_peak: Array.from(envPeak).map((v) => Number(v.toFixed(6))),
    };

    const outPath = path.join(dir, "features.json");
    await fs.writeFile(outPath, JSON.stringify(features, null, 2), "utf8");

    return new Response(
      JSON.stringify({ ok: true, path: outPath, fps, n_frames: nFrames, duration_s }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
    });
  }
}


