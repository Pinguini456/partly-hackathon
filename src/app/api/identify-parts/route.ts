import { NextRequest, NextResponse } from "next/server";
import {GoogleGenAI} from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const PARTLY_API_URL = process.env.PARTLY_API || "http://localhost:8420";

interface Assembly {
    id: string;
    manufacturer_part_number: string;
    std_note: string;
    quantity: number;
    description: string;
    display_name: string;
    is_orderable: boolean;
    is_generic?: boolean;
    hotspot?: {
        diagram_id: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        code: string;
    };
    sub_assembly_ids?: { id: string; oem: boolean; hca: boolean }[];
}

async function getParts(slug: string): Promise<Assembly[]> {
    const res = await fetch(`${PARTLY_API_URL}/vehicles/${slug}/assemblies`);

    if (!res.ok) {
        throw new Error(`Failed to fetch assemblies: ${res.status}`);
    }

    const data = await res.json();

    const assemblies = data.assemblies ?? {};

    const parts: Assembly[] = [];

    for (const key in assemblies) {
        parts.push({ id: key, ...assemblies[key] });
    }

    return parts;
}

// No OEM catalogue for this vehicle (the brief's own "low coverage" edge
// case - special editions, rare imports). Rather than fail the job, ask the
// same model to read likely damaged parts straight off the transcript, with
// no catalogue to constrain it. These come back as free-text names with no
// part number or diagram - main/route.ts skips the diagram-highlight step
// for them rather than treating this as a failure.
async function identifyFreeform(transcription: string): Promise<string[]> {
    const res = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{
            text: `A repairer described damage to a vehicle we have no parts catalogue for. From this transcript, list the specific parts that likely need replacing or repair. Return only a plain list, one part per line, no numbering, no extra commentary:\n\n${transcription}`,
        }],
    });

    return (res.text ?? "")
        .split("\n")
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean);
}

export async function POST(req: NextRequest) {
    const {transcription, make} = await req.json();

    if (!transcription || !make) {
        return NextResponse.json({error: "Missing strings"}, {status: 400});
    }

    let parts: Assembly[];

    try {
        parts = await getParts(make);
    } catch (err) {
        console.log("No catalogue for", make, "- falling back to freeform identification:", err);
        try {
            const names = await identifyFreeform(transcription);
            return NextResponse.json({ freeform: true, parts: names });
        } catch (freeformErr) {
            console.log(freeformErr);
            return NextResponse.json({ error: "Failed to identify parts" }, { status: 500 });
        }
    }

    const relevantParts = parts.filter((p) => p.is_orderable);

    const partsContext = relevantParts
        .map((p, i) => `${i}: ${p.display_name}`)
        .join('\n');

    try {
        const res = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [{ text: `Here is the list of parts for this vehicle:\n\n${partsContext}\n\nReturn the indexes (the numbers before the colon) of the parts needed according to the transcript provided:\n\n${transcription}\n\nReturn only the numbers separated by a forward-slash.` }],
        });

        const indexes = (res.text ?? "").split("/").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));

        const matchedParts = indexes.map((i) => relevantParts[i]).filter(Boolean);

        const partIds = matchedParts.map((p) => p.id);

        const result = partIds.join("/");

        return NextResponse.json({ description: result });
    } catch (err) {
        console.log(err);
        return NextResponse.json({ error: "Failed to find parts"});
    }

}