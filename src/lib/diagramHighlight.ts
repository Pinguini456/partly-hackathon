// Renders an OEM diagram with one callout picked out in orange and the rest
// dimmed back. Lifted out of /api/main so the catalogue search can generate
// the same image when a mechanic adds a part by hand — a part added late
// should look identical to one the model found, or the list reads as two
// different kinds of thing.

import sharp from "sharp";
import { readAssemblies, readAnnotations, readDiagramImage } from "./localCatalogue";

export type Hotspot = {
    diagram_id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    code: string;
};

export type CataloguePart = {
    id: string;
    name: string;
    hotspot?: Hotspot;
    error?: string;
};

function polygonsToSvgPath(masks: { x: number; y: number }[][]) {
    return masks
        .map((poly) => `<polygon points="${poly.map((p) => `${p.x},${p.y}`).join(" ")}" />`)
        .join("");
}

async function getPartMask(slug: string, diagramId: string, code: string) {
    const data = await readAnnotations(slug, diagramId);
    const obj = data.objects?.find((o: { code?: string }) => o.code === code);
    if (!obj?.future_masks?.length) return null;
    return obj.future_masks as { x: number; y: number }[][];
}

export async function getPartById(id: string, slug: string): Promise<CataloguePart> {
    const data = await readAssemblies(slug);
    const assemblies = data.assemblies ?? {};

    for (const key in assemblies) {
        if (key === id) {
            return {
                id: key,
                name: assemblies[key].display_name,
                hotspot: assemblies[key].hotspot,
            };
        }
    }

    return { id, name: "", error: "Couldn't find assembly" };
}

export async function highlightPart(id: string, slug: string): Promise<string> {
    const part = await getPartById(id, slug);
    if (part.error || !part.hotspot) {
        throw new Error(`No hotspot for part ${id}: ${part.error ?? "missing hotspot"}`);
    }

    const { diagram_id, code } = part.hotspot;

    const [imageBuffer, masks] = await Promise.all([
        readDiagramImage(slug, diagram_id),
        getPartMask(slug, diagram_id, String(code)),
    ]);
    if (!masks) throw new Error(`No mask found for code ${code} in diagram ${diagram_id}`);

    const baseImage = sharp(imageBuffer).ensureAlpha();
    const { width, height } = await baseImage.metadata();
    if (!width || !height) throw new Error("Could not read image dimensions");

    const polys = polygonsToSvgPath(masks);

    const darknessAlpha = await sharp(imageBuffer).greyscale().negate().raw().toBuffer();

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

    return (
        await baseImage.composite([{ input: colorLayer, top: 0, left: 0, blend: "over" }]).webp().toBuffer()
    ).toString("base64");
}

/** Same data URL shape /api/main returns, so both paths are interchangeable. */
export async function highlightPartDataUrl(id: string, slug: string): Promise<string> {
    return `data:image/webp;base64,${await highlightPart(id, slug)}`;
}
