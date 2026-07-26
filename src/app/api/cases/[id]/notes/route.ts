import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

// Appends a note rather than overwriting - the case file is a running
// record a mechanic can add findings to at any point, not a one-shot form.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await req.json().catch(() => ({ text: "" }));

  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Note text is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("inspections")
    .select("notes")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message ?? "Case not found" }, { status: 404 });
  }

  const notes = Array.isArray(existing.notes) ? existing.notes : [];
  const updatedNotes = [...notes, { text: String(text).trim(), at: new Date().toISOString() }];

  const { data, error } = await supabase
    .from("inspections")
    .update({ notes: updatedNotes })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
