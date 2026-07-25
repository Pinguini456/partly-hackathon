import {NextRequest, NextResponse} from "next/server";
import sharp from "sharp";

const VIN_API = "/api/vin";
const SPEECH_API = "/api/speech_to_text";
const IDENTIFY_API = "/api/identify-parts"
const PARTLY_API_URL = process.env.PARTLY_API || "http://localhost:8420";

interface Part {
    id: string;
    name: string;
    hotspot: {diagram_id: string, x1: number, y1: number, x2: number, y2: number, code: string};
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

function polygonsToSvgPath(masks: { x: number; y: number }[][]) {
    return masks
        .map(poly => `<polygon points="${poly.map(p => `${p.x},${p.y}`).join(" ")}" />`)
        .join("");
}

async function getPartMask(slug: string, diagramId: string, code: string) {
    const res = await fetch(`${PARTLY_API_URL}/vehicles/${slug}/diagrams/${diagramId}/annotations`);
    if (!res.ok) throw new Error(`Failed to fetch annotations: ${res.status}`);
    const data = await res.json();
    const obj = data.objects?.find((o: any) => o.code === code);
    if (!obj?.future_masks?.length) return null;
    return obj.future_masks as { x: number; y: number }[][]; // array of polygons
}

async function highlightPart(id: string, slug: string) {
    const part = await getPartById(id, slug);
    if (part.error || !part.hotspot) {
        throw new Error(`No hotspot for part ${id}: ${part.error ?? "missing hotspot"}`);
    }

    const { diagram_id, code } = part.hotspot;

    const [imageRes, masks] = await Promise.all([
        fetch(`${PARTLY_API_URL}/vehicles/${slug}/diagrams/${diagram_id}/image`),
        getPartMask(slug, diagram_id, String(code)),
    ]);
    if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.status}`);
    if (!masks) throw new Error(`No mask found for code ${code} in diagram ${diagram_id}`);

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const baseImage = sharp(imageBuffer).ensureAlpha();
    const { width, height } = await baseImage.metadata();
    if (!width || !height) throw new Error("Could not read image dimensions");

    const polys = polygonsToSvgPath(masks);

    const darknessAlpha = await sharp(imageBuffer)
        .greyscale()
        .negate()
        .raw()
        .toBuffer();

    const polygonMaskSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="black"/>
        <g fill="white">${polys}</g>
      </svg>`;
    const polygonAlpha = await sharp(Buffer.from(polygonMaskSvg))
        .resize(width, height)
        .greyscale()
        .raw()
        .toBuffer();

    const combinedAlpha = Buffer.alloc(width * height);
    for (let i = 0; i < combinedAlpha.length; i++) {
        combinedAlpha[i] = Math.round((darknessAlpha[i] * polygonAlpha[i]) / 255);
    }

    const colorLayer = await sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 150, b: 0 } },
    })
        .joinChannel(combinedAlpha, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();

    return (await baseImage
        .composite([
            { input: colorLayer, top: 0, left: 0, blend: "over" },
        ])
        .webp()
        .toBuffer()).toString("base64");
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
                hotspot: assemblies[key].hotspot,
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

            webp = await Promise.all(
                partsIds.map(async (p, i) => {
                    const res = await highlightPart(p, make as string)
                    const contentType = "image/webp";
                    return `data:${contentType};base64,${res}`;
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