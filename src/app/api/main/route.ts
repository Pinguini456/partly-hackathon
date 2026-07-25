import { NextRequest, NextResponse } from "next/server";

const VIN_API = "/api/vin";
const SPEECH_API = "/api/speech_to_text";
const IDENTIFY_API = "/api/identify-parts"
const PARTLY_API_URL = process.env.PARTLY_API || "http://localhost:8420";

interface Part {
    id: string;
    name: string;
    diagram_id: string,
    error?: string;
}

async function fileToBase64(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return buffer.toString("base64");
}

function absoluteUrl(req: NextRequest, path: string) {
    if (path.startsWith("http")) return path;
    return new URL(path, req.nextUrl.origin).toString();
}

async function getPartById(id: string, slug: string): Promise<Part> {
    const res = await fetch(`${PARTLY_API_URL}/vehicles/${slug}/assemblies`);

    if (!res.ok) {
        throw new Error(`Failed to fetch assemblies: ${res.status}`);
    }

    const data = await res.json();

    const assemblies = data.assemblies ?? {};

    for (const key in assemblies) {
        if (key === id) {
            return {
                id: key,
                name: assemblies[key].display_name,
                diagram_id: assemblies[key].hotspot.diagram_id,
            } as Part;
        }
    }

    return {error: "Couldn't find assembly"} as Part;
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

        let names: string[] = [];
        let webp: string[] = [];
        let partsIds: string[] = [];


        try {
            const partsRes = await fetch(absoluteUrl(req, IDENTIFY_API), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcription: transcripts[0]?.text, make }),
            });



            const partsIdRes = await partsRes.json();
            const partsIdStr: string = partsIdRes.description;
            partsIds = partsIdStr.split("/");

            names = await Promise.all(
                partsIds.map(async (p) => {
                    const res = await getPartById(p, make as string)

                    return res.name;
                }
            ));

            const diagram_ids = await Promise.all(
                partsIds.map(async (p) => {
                    const res= await getPartById(p, make as string);
                    return res.diagram_id;
                })
            )

            webp = await Promise.all(
                partsIds.map(async (p, i) => {
                    const res = await fetch(`${PARTLY_API_URL}/vehicles/${make}/diagrams/${diagram_ids[i]}/image`)
                    if (!res.ok) {
                        throw new Error(`Failed to fetch image: ${res.status} ${make} ${diagram_ids[i]}`);
                    }
                    const arrBuffer = await res.arrayBuffer();
                    const base64 = Buffer.from(arrBuffer).toString("base64");
                    const contentType = res.headers.get("content-type") ?? "image/webp";
                    return `data:${contentType};base64,${base64}`;
                })
            );
        } catch (err) {
            console.error(err);
            return NextResponse.json({ error: "Failed to fetch part" });
        }


        return NextResponse.json({
            id: partsIds,
            name: names,
            image: webp,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Upload processing failed" }, { status: 500 });
    }
}