// The hero case: one vehicle (the Yaris) where we have genuinely rich data
// rather than seeded mock suppliers — real OEM part numbers, real diagram
// hotspots, the damage model's own prediction and confidence, the
// walkaround frames it cited, and modelled delivery reliability.
//
// This deliberately does NOT get generalised to every vehicle. Other cases
// fall back to the deterministic mock supplier pool and render through the
// exact same UI, so the flow feels identical — this one just has more
// underneath it.

import { CATALOGUE, PART_KEYS, PartKey, VEHICLE, UNCONFIRMED_PARTS, dayMs } from "./procurement";
import type { SupplierOption } from "./supplierOptions";

export const HERO_SLUG = VEHICLE.slug;

export function isHeroCase(vehicleSlug: string | null | undefined) {
    return vehicleSlug === HERO_SLUG;
}

/**
 * Ties a catalogue entry to whatever the model named the part. Deliberately
 * strict: a real run on this vehicle returns eight parts, and only three of
 * them are the ones we curated reliability data for. Matching loosely would
 * hand "Front Bumper Cover Retainer" the bumper cover's $340 OEM price —
 * anything that isn't a confident match falls back to the generic pool
 * instead, which is the honest outcome.
 */
const MATCHERS: { key: PartKey; test: (name: string) => boolean }[] = [
    {
        key: "headlampAssembly",
        test: (n) => /head\s?la?mp|headlight/.test(n) && n.includes("assembly"),
    },
    { key: "reinforcementBar", test: (n) => n.includes("reinforcement") },
    {
        key: "bumperCover",
        test: (n) =>
            n.includes("bumper cover") && !n.includes("retainer") && !n.includes("bracket"),
    },
];

export function matchPartKey(partName: string): PartKey | null {
    const name = partName.toLowerCase();
    for (const { key, test } of MATCHERS) {
        if (test(name)) return key;
    }
    return null;
}

function daysFromNow(iso: string): number {
    const target = +new Date(iso);
    const today = +new Date(new Date().toISOString().slice(0, 10));
    return Math.max(1, Math.round((target - today) / dayMs));
}

/**
 * Reliability history is a better quality signal than a star rating, but the
 * UI still shows stars — so derive one from the on-time rate, discounted by
 * fitment returns, rather than showing two unrelated numbers.
 */
function ratingFrom(onTimeRate: number, returnRate?: number): number {
    const adjusted = onTimeRate - (returnRate ?? 0) * 2;
    return Math.round(Math.max(1, Math.min(5, adjusted * 5)) * 10) / 10;
}

/**
 * The rich supplier options for a hero-case part, in the shape the ordinary
 * /parts and /order screens already understand. Returns null for anything
 * we don't have curated data for, and the caller falls back to buildOptions.
 */
export function heroOptionsFor(
    vehicleSlug: string | null | undefined,
    partName: string,
): SupplierOption[] | null {
    if (!isHeroCase(vehicleSlug)) return null;

    const key = matchPartKey(partName);
    if (!key) return null;

    return CATALOGUE[key].options.map((o) => ({
        supplier: `${o.company}${o.speed === "express" ? " (express)" : ""}`,
        type: o.oem ? "OEM" : "Aftermarket",
        price: o.price,
        rating: ratingFrom(o.onTimeRate, o.returnRate),
        // Scheduled against the risk-adjusted date, never the promise.
        shippingDays: daysFromNow(o.eta),
        promisedDays: daysFromNow(o.promisedEta),
        onTimeRate: o.onTimeRate,
        orderCount: o.orderCount,
        returnRate: o.returnRate,
    }));
}

export type HeroPartDetail = {
    mpn: string;
    diagramName: string;
    predicted: { rawName: string; action: string; severity: string; confidence: string };
    frames: string[];
};

/** What the damage model said about this part, and which frames it cited. */
export function heroDetailFor(
    vehicleSlug: string | null | undefined,
    partName: string,
): HeroPartDetail | null {
    if (!isHeroCase(vehicleSlug)) return null;
    const key = matchPartKey(partName);
    if (!key) return null;

    const entry = CATALOGUE[key];
    return {
        mpn: entry.mpn,
        diagramName: entry.diagramName,
        predicted: entry.predicted,
        frames: entry.frames,
    };
}

/**
 * Low-confidence predictions the catalogue marks not-orderable. Surfaced as
 * a visible decision rather than silently ordered or silently dropped —
 * a repairer would rather see "we weren't sure about this one".
 */
export function heroUnconfirmedParts(vehicleSlug: string | null | undefined) {
    return isHeroCase(vehicleSlug) ? UNCONFIRMED_PARTS : [];
}

export { PART_KEYS };
