import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const filePath = path.join(process.cwd(), "storage", "guidepacks", id, "final.mp4");
    const data = await fs.readFile(filePath);
    return new Response(data, {
      headers: { "content-type": "video/mp4" },
    });
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 404 });
  }
}

export async function HEAD(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params;
    const filePath = path.join(process.cwd(), "storage", "guidepacks", id, "final.mp4");
    await fs.access(filePath);
    return new Response(null, { status: 200 });
  } catch (e: any) {
    return new Response(null, { status: 404 });
  }
}
