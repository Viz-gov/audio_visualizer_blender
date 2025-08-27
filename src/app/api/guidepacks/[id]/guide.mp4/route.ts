import { NextRequest } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const filePath = path.join(process.cwd(), "storage", "guidepacks", id, "guide.mp4");
    const data = await fs.readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": "video/mp4",
        "cache-control": "no-store",
      },
    });
  } catch (err: any) {
    return new Response("Not found", { status: 404 });
  }
}

export async function HEAD(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const filePath = path.join(process.cwd(), "storage", "guidepacks", id, "guide.mp4");
    const stat = await (await import("fs/promises")).stat(filePath);
    return new Response(null, {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(stat.size),
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}


