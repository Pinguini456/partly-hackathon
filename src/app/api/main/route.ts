import { NextRequest, NextResponse } from "next/server";

const VIN_API = "/api/vin";
const SPEECH_API = "/api/speech_to_text";

async function fileToBase64(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return buffer.toString("base64");
}

function absoluteUrl(req: NextRequest, path: string) {
    if (path.startsWith("http")) return path;
    return new URL(path, req.nextUrl.origin).toString();
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const files = formData.getAll("files") as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
        }

        const images = files.filter((f) => f.type.startsWith("image/"));
        const videos = files.filter((f) => f.type.startsWith("video/"));

        let make: string | null = null;
        let imagesChecked = 0;

        for (const image of images) {
            imagesChecked++;
            const imageBase64 = await fileToBase64(image);

            try {
                const vinRes = await fetch(absoluteUrl(req, VIN_API), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageBase64,
                        mimeType: image.type,
                    }),
                });

                const vinData = await vinRes.json();

                if (vinData.description) {
                    make = vinData.description;
                    break;
                }
            } catch (err) {
                console.error("VIN lookup failed", err);
            }
        }

        const transcripts: { fileName: string; text?: string; error?: string }[] = [];

        for (const video of videos) {
            try {
               const speechFormData = new FormData();
               speechFormData.append("video", video, video.name);

               const speechRes = await fetch(absoluteUrl(req, SPEECH_API), {
                   method: "POST",
                   body: speechFormData,
               });

               const speechData = await speechRes.json();

               transcripts.push({
                   fileName: video.name,
                   text: speechData.text,
                   error: speechData.error,
               });
            } catch (err) {
                console.error("speech to text failed: ", err);
                transcripts.push({ fileName: video.name, error: "transcript failed" });
            }
        }
        console.log(transcripts);
        console.log(make);


        return null;
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Upload processing failed" }, { status: 500 });
    }
}