import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

// Create a case the moment intake starts - before analysis, before we know
// the vehicle - so a slow or interrupted upload still leaves something real
// and resumable.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { customer_name, customer_contact } = body ?? {};

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inspections")
    .insert({
      status: "uploaded",
      customer_name: customer_name ?? null,
      customer_contact: customer_contact ?? null,
      notes: [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// Minimal listing for the case list - thumbnail, vehicle, customer, status.
export async function GET() {
  const supabase = await createClient();

  const { data: cases, error } = await supabase
    .from("inspections")
    .select("id, status, vehicle_slug, customer_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (cases ?? []).map((c) => c.id);
  const thumbnails: Record<string, string> = {};

  if (ids.length) {
    const { data: files } = await supabase
      .from("inspection_files")
      .select("inspection_id, path, filename, created_at")
      .in("inspection_id", ids)
      .order("created_at", { ascending: true });

    (files ?? []).forEach((f) => {
      if (thumbnails[f.inspection_id]) return;
      const isImage = /\.(jpe?g|png|webp|gif)$/i.test(f.filename ?? "");
      if (!isImage) return;
      const { data: pub } = supabase.storage.from("inspection-files").getPublicUrl(f.path);
      thumbnails[f.inspection_id] = pub.publicUrl;
    });
  }

  const withThumbnails = (cases ?? []).map((c) => ({
    ...c,
    thumbnail: thumbnails[c.id] ?? null,
  }));

  return NextResponse.json({ cases: withThumbnails });
}
