// Lets a mechanic reviewing the identified-parts list add something the
// model missed — searched against the same OEM catalogue the model matched
// against, so a hand-added part carries a real part number and a real
// diagram rather than being a free-text row that nothing downstream can
// price or order.

import { NextRequest, NextResponse } from "next/server";
import { readAssemblies } from "@/src/lib/localCatalogue";
import { highlightPartDataUrl } from "@/src/lib/diagramHighlight";

type Assembly = {
    display_name?: string;
    manufacturer_part_number?: string;
    is_orderable?: boolean;
    hotspot?: { diagram_id: string };
};

const MAX_RESULTS = 12;

/** Search this vehicle's orderable parts by name. */
export async function GET(req: NextRequest) {
    const slug = req.nextUrl.searchParams.get("slug");
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (q.length < 2) return NextResponse.json({ results: [] });

    let data: { assemblies?: Record<string, Assembly> };
    try {
        data = await readAssemblies(slug);
    } catch {
        // No catalogue for this vehicle — the caller falls back to plain text.
        return NextResponse.json({ results: [], noCatalogue: true });
    }

    const assemblies = data.assemblies ?? {};
    const terms = q.split(/\s+/).filter(Boolean);

    // Several assembly ids share one display name (left/right variants of the
    // same trim, mostly). Showing the same words three times reads as broken,
    // so the first of each name wins — same rule /api/main applies.
    const seen = new Set<string>();
    const matches: { id: string; name: string; mpn?: string }[] = [];
    for (const id in assemblies) {
        const a = assemblies[id];
        if (!a.is_orderable || !a.display_name) continue;
        const name = a.display_name.toLowerCase();
        // Every word has to appear somewhere, so "left headlamp" doesn't
        // match every part with "left" in the name.
        if (!terms.every((t) => name.includes(t))) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        matches.push({ id, name: a.display_name, mpn: a.manufacturer_part_number });
    }

    // "headlamp" should surface the headlamp before the headlamp bracket:
    // rank a name that starts with the query first, then shortest name, which
    // is a good proxy for "the part itself" over "a fitting for the part".
    matches.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.length - b.name.length;
    });

    return NextResponse.json({ results: matches.slice(0, MAX_RESULTS) });
}

/** Render the highlighted diagram for one chosen part. */
export async function POST(req: NextRequest) {
    const { slug, id } = await req.json().catch(() => ({}));
    if (!slug || !id) return NextResponse.json({ error: "Missing slug or id" }, { status: 400 });

    try {
        return NextResponse.json({ image: await highlightPartDataUrl(id, slug) });
    } catch (err) {
        // A part with no diagram callout is still a legitimate part — return
        // it without an image rather than refusing to add it.
        console.error("highlight failed", err);
        return NextResponse.json({ image: "" });
    }
}
