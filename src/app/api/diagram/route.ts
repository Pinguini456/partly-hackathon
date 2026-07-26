import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Serves real diagram images and walkaround frames out of the partly-api
// dataset, which lives outside /public. Params arrive from the query string,
// so they're matched against fixed allowlists rather than being joined into a
// path directly — otherwise this is a traversal hole.
const VEHICLE = "toyota-yaris-qmn16";

const ALLOWED_DIAGRAMS = new Set([
  "d256bb33-5c7b-5213-9f5f-24b6022b599d", // Headlamp
  "fa22e079-dfd4-525b-b965-26fe51fb21e8", // Front Bumper and Bumper Stay
  "6b62c100-0b70-5864-83c0-f8cccee1f3e5", // Front Bumper and Bumper Stay (reinforcement)
  "972a661c-e3fc-59e4-8b36-a976ba71627c", // Hood and Front Fender
]);

const ALLOWED_FRAMES = new Set([
  "01_0001.jpg",
  "02_0004.jpg",
  "03_0020.jpg",
  "04_0025.jpg",
  "05_0033.jpg",
]);

const DATA_ROOT = path.join(process.cwd(), "partly-api", "data");

async function send(file: string, contentType: string) {
  try {
    const buf = await readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }
}

export async function GET(request: NextRequest) {
  const diagram = request.nextUrl.searchParams.get("diagram");
  const frame = request.nextUrl.searchParams.get("frame");

  if (diagram && ALLOWED_DIAGRAMS.has(diagram)) {
    return send(
      path.join(DATA_ROOT, "vehicles", VEHICLE, "diagrams", diagram, "image.webp"),
      "image/webp",
    );
  }

  if (frame && ALLOWED_FRAMES.has(frame)) {
    return send(
      path.join(DATA_ROOT, "damage-contexts", VEHICLE, "frames", frame),
      "image/jpeg",
    );
  }

  return NextResponse.json({ error: "unknown asset" }, { status: 404 });
}
