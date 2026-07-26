import {NextRequest, NextResponse} from "next/server";
import { getPartById, highlightPart } from "@/src/lib/diagramHighlight";

const VIN_API = "/api/vin";
const SPEECH_API = "/api/speech_to_text";
const IDENTIFY_API = "/api/identify-parts"

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

        // An explicit vehicle from the case form wins over plate detection:
        // the walkaround frames often don't show a readable plate, and a
        // repairer standing at the car already knows what it is.
        const vehicleOverride = formData.get("vehicleSlug");
        let make: string | null =
            typeof vehicleOverride === "string" && vehicleOverride ? vehicleOverride : null;

        for (const image of images) {
            if (make) break;
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
        let freeform = false;

        try {
            const partsRes = await fetch(absoluteUrl(req, IDENTIFY_API), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcription: transcripts[0]?.text, make }),
            });

            const partsIdRes = await partsRes.json();

            if (partsIdRes.freeform) {
                // No OEM catalogue for this vehicle (or no plate read) - no
                // assembly ids and no diagrams to highlight, just the part
                // names the model read off the transcript directly.
                freeform = true;
                const freeformNames: string[] = partsIdRes.parts ?? [];
                partsIds = freeformNames.map((_, i) => `freeform-${i}`);
                names = freeformNames;
                webp = freeformNames.map(() => "");
            } else {
                const partsIdStr: string = partsIdRes.description ?? "";
                partsIds = partsIdStr ? partsIdStr.split("/") : [];

                names = await Promise.all(
                    partsIds.map(async (p) => {
                            const res = await getPartById(p, make as string)

                            return res.name;
                        }
                    ));

                // Some assemblies map to the same display name (e.g. left/right
                // variants) — keep only the first occurrence of each name so the
                // customer doesn't see the same part listed twice.
                const seenNames = new Set<string>();
                const dedupedIndices = names
                    .map((name, i) => ({ name, i }))
                    .filter(({ name }) => {
                        if (seenNames.has(name)) return false;
                        seenNames.add(name);
                        return true;
                    })
                    .map(({ i }) => i);

                partsIds = dedupedIndices.map((i) => partsIds[i]);
                names = dedupedIndices.map((i) => names[i]);

                webp = await Promise.all(
                    partsIds.map(async (p) => {
                        const res = await highlightPart(p, make as string)
                        const contentType = "image/webp";
                        return `data:${contentType};base64,${res}`;
                    })
                );
            }
        } catch (err) {
            console.error(err);
            return NextResponse.json({ error: "Failed to fetch part" });
        }


        return NextResponse.json({
            id: partsIds,
            name: names,
            image: webp,
            vehicle: make,
            freeform,
            transcript: transcripts[0]?.text ?? null,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Upload processing failed" }, { status: 500 });
    }
}