import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

// The full record - everything captured for this vehicle from intake
// onward, revisitable at any time.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow, error } = await supabase.from("inspections").select("*").eq("id", id).single();
  if (error || !caseRow) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  const { data: files } = await supabase
    .from("inspection_files")
    .select("id, filename, path, created_at")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  const filesWithUrls = (files ?? []).map((f) => {
    const { data: pub } = supabase.storage.from("inspection-files").getPublicUrl(f.path);
    return { ...f, url: pub.publicUrl };
  });

  return NextResponse.json({ case: caseRow, files: filesWithUrls });
}

const PATCHABLE_FIELDS = [
  "vehicle_slug",
  "transcript",
  "summary",
  "parts",
  "basket",
  "status",
  "customer_name",
  "customer_contact",
];

// Partial update - used both by the intake flow (filling in vehicle/parts
// once analysis finishes) and by the procurement screens (writing back the
// chosen basket + status against this exact case).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const updates = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in updates) patch[key] = updates[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("inspections").update(patch).eq("id", id).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
