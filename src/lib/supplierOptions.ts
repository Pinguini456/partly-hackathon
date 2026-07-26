export type SupplierType = "OEM" | "Aftermarket";

export type SupplierOption = {
    supplier: string;
    type: SupplierType;
    price: number;
    rating: number;
    /** Risk-adjusted days to arrive — what we actually schedule against. */
    shippingDays: number;

    // --- Reliability enrichment -------------------------------------------
    // Only present on the hero case, where we model delivery history rather
    // than taking the supplier's quote at face value. Everything downstream
    // treats these as optional so ordinary cases render unchanged.

    /** What the supplier quotes, when it differs from the risk-adjusted date. */
    promisedDays?: number;
    /** Share of past orders that landed by the promised date. */
    onTimeRate?: number;
    orderCount?: number;
    /** Aftermarket only: share of orders sent back for fitment problems. */
    returnRate?: number;
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

// --- "Best overall" ------------------------------------------------------
//
// Sorting one axis at a time makes the repairer do the trade-off in their
// head: cheapest is slow, fastest is dear, and neither column tells you
// whether the supplier actually delivers when they say they will. This
// scores every axis at once on a common 0..1 scale and says why it picked
// what it picked.
//
// Weights are deliberately price-led — a panel shop's margin is in the
// parts bill — but delivery reliability can override a small price win,
// because a part that misses its date holds the whole car.

const WEIGHTS = { price: 0.4, shipping: 0.3, quality: 0.3 };

/** Maps a value to 0..1 within the set's range; 1 is always "better". */
function normalise(value: number, min: number, max: number, lowerIsBetter: boolean) {
    if (max === min) return 1;
    const t = (value - min) / (max - min);
    return lowerIsBetter ? 1 - t : t;
}

export type ScoredOption = {
    option: SupplierOption;
    score: number;
    /** Plain-English case for this option, shown on the recommended card. */
    reason: string;
};

export function scoreOptions(options: SupplierOption[]): ScoredOption[] {
    if (!options.length) return [];

    const prices = options.map((o) => o.price);
    const ships = options.map((o) => o.shippingDays);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minShip = Math.min(...ships);
    const maxShip = Math.max(...ships);

    return options
        .map((option) => {
            const priceScore = normalise(option.price, minPrice, maxPrice, true);
            const shipScore = normalise(option.shippingDays, minShip, maxShip, true);

            // Quality is the star rating, but where we have real delivery
            // history it carries more signal than a rating out of 5 — a
            // supplier that hits its date 96% of the time over 340 orders is
            // a different proposition to one at 68% over 95.
            let qualityScore = option.rating / 5;
            if (option.onTimeRate != null) {
                qualityScore = option.onTimeRate;
                if (option.returnRate != null) {
                    // Fitment returns cost a second trip to the bay, so they
                    // bite harder than the raw percentage suggests.
                    qualityScore -= option.returnRate * 2;
                }
            }
            qualityScore = Math.max(0, Math.min(1, qualityScore));

            const score =
                priceScore * WEIGHTS.price +
                shipScore * WEIGHTS.shipping +
                qualityScore * WEIGHTS.quality;

            return { option, score, reason: buildReason(option, options) };
        })
        .sort((a, b) => b.score - a.score);
}

export function bestOverall(options: SupplierOption[]): ScoredOption | null {
    return scoreOptions(options)[0] ?? null;
}

function buildReason(option: SupplierOption, all: SupplierOption[]): string {
    const cheapest = Math.min(...all.map((o) => o.price));
    const fastest = Math.min(...all.map((o) => o.shippingDays));
    const bits: string[] = [];

    if (option.price === cheapest) bits.push("cheapest on the list");
    else bits.push(`$${option.price - cheapest} over the cheapest`);

    if (option.shippingDays === fastest) bits.push("arrives soonest");
    else bits.push(`${option.shippingDays - fastest}d behind the fastest`);

    if (option.onTimeRate != null) {
        bits.push(
            `hits its date ${Math.round(option.onTimeRate * 100)}% of the time over ${option.orderCount} orders`,
        );
    } else {
        bits.push(`rated ${option.rating.toFixed(1)}`);
    }

    if (option.returnRate != null) {
        bits.push(`${Math.round(option.returnRate * 100)}% come back for fitment`);
    }

    return bits.join(" · ");
}
