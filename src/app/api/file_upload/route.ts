import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

const ALLOWED_PREFIXES = ["image/", "video/"];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const inspectionIdField = formData.get("inspection_id");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
    return NextResponse.json(
      { error: "only image/* or video/* uploads are allowed" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  let inspectionId = typeof inspectionIdField === "string" ? inspectionIdField : null;
  if (!inspectionId) {
    const { data, error } = await supabase
      .from("inspections")
      .insert({ status: "uploaded" })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inspectionId = data.id;
  }

  const path = `${inspectionId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("inspection-files")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: fileRow, error: insertError } = await supabase
    .from("inspection_files")
    .insert({ inspection_id: inspectionId, filename: file.name, path })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: publicUrl } = supabase.storage.from("inspection-files").getPublicUrl(path);

  return NextResponse.json(
    { inspection_id: inspectionId, file: fileRow, url: publicUrl.publicUrl },
    { status: 201 },
  );
}
