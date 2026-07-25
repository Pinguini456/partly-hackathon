import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Serves real diagram images out of the partly-api dataset, which lives
// outside /public. Both params are matched against a fixed allowlist rather
// than being joined into a path directly — they arrive from the query string,
// so treating them as path segments would be a traversal hole.
const ALLOWED: Record<string, string[]> = {
  "toyota-yaris-qmn16": ["fa9e2586-4cf1-55ab-b122-5c18857aa1ad"],
};

const DATA_ROOT = path.join(process.cwd(), "partly-api", "data", "vehicles");

export async function GET(request: NextRequest) {
  const vehicle = request.nextUrl.searchParams.get("vehicle") ?? "";
  const diagram = request.nextUrl.searchParams.get("diagram") ?? "";

  if (!ALLOWED[vehicle]?.includes(diagram)) {
    return NextResponse.json({ error: "unknown diagram" }, { status: 404 });
  }

  try {
    const file = await readFile(path.join(DATA_ROOT, vehicle, "diagrams", diagram, "image.webp"));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "diagram image not found" }, { status: 404 });
  }
}
