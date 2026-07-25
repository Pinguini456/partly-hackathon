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



export async function POST(req: NextRequest) {
    const {transcription, make} = await req.json();

    if (!transcription || !make) {
        return NextResponse.json({error: "Missing strings"}, {status: 400});
    }

    let parts: Assembly[];

    try {
        parts = await getParts(make);
    } catch (err) {
        console.log(err);
        return NextResponse.json({ error: "Failed to fetch parts" }, { status: 500 });
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