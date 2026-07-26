export type SupplierType = "OEM" | "Aftermarket";

export type SupplierOption = {
    supplier: string;
    type: SupplierType;
    price: number;
    rating: number;
    shippingDays: number;
};

// Hardcoded supplier pool. Real supplier/pricing data isn't wired up yet,
// so each part gets 4 deterministic mock options drawn from this pool.
const SUPPLIER_POOL = [
    "PartsDirect NZ",
    "AutoWreckers Co",
    "OEM Direct",
    "Global Auto Parts",
    "QuickFit Supplies",
    "TradeParts Warehouse",
    "Prestige Parts Co",
    "Southern Auto Salvage",
];

// Simple deterministic PRNG (mulberry32) seeded from the part id/name so the
// same part always shows the same 4 hardcoded options on re-render, and so
// that any page can rebuild the same options for a given part without
// having to pass the option data around.
function mulberry32(seed: number) {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

export function buildOptions(seed: string): SupplierOption[] {
    const rand = mulberry32(hashString(seed));

    const suppliers = [...SUPPLIER_POOL]
        .map((s) => ({ s, sort: rand() }))
        .sort((a, b) => a.sort - b.sort)
        .slice(0, 4)
        .map((x) => x.s);

    return suppliers.map((supplier) => {
        const isOEM = rand() > 0.5;
        const basePrice = isOEM ? 180 + rand() * 220 : 55 + rand() * 150;

        return {
            supplier,
            type: isOEM ? "OEM" : "Aftermarket",
            price: Math.round(basePrice),
            rating: Math.round((3.4 + rand() * 1.6) * 10) / 10,
            shippingDays: 1 + Math.floor(rand() * 9),
        };
    });
}

export function optionKey(option: SupplierOption) {
    return option.supplier;
}
