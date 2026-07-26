// Single source of truth for the procurement optimiser, shared by
// /procurement and /procurement/suppliers so the two screens can never
// compute a different "solver output" for the same basket.
//
// The supplier/price/lead-time data is fabricated per part — the real
// partly-api dataset has no supplier/price/lead-time fields at all — but
// it's generated deterministically from the part id, so the same part
// always shows the same options across reloads, and every date lands on
// a weekday since no supplier delivers on a weekend.

export const dayMs = 86400000;

export function eta(p: { eta: string }) {
  return +new Date(p.eta);
}

// All date math here is calendar-day arithmetic on UTC-midnight timestamps
// (ISO date-only strings parse as UTC midnight), using UTC accessors
// throughout so day-of-week and day-counting never depend on the viewer's
// local timezone.
export function nextWorkingDay(date: Date) {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

export function fmt(date: Date) {
  return date.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((+a - +b) / dayMs);
}

export const LABOUR_DAYS = 2;

export type Speed = "ground" | "standard" | "express" | "air";
export type SupplierOption = {
  company: string;
  oem: boolean;
  speed: Speed;
  price: number;
  eta: string;
};
export type PartKey = string;
export type CatalogueEntry = { name: string; partNumber: string; options: SupplierOption[] };
export type Catalogue = Record<PartKey, CatalogueEntry>;

// What a part looks like coming out of /api/identify-parts, before it's
// been dressed up with fabricated supplier options.
export type IdentifiedPart = { id: string; name: string; partNumber?: string };

// --- deterministic supplier generation, seeded per part id/name ---------

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

const SUPPLIER_NAMES = [
  "Southern Parts Co",
  "Whangarei Auto",
  "BNT Auckland",
  "North Shore Toyota",
  "Christchurch Auto Salvage",
  "Prestige Parts NZ",
];

// Fixed shape (OEM at all four speeds, aftermarket at two) so every
// (oemOnly, groundOnly) combination — in particular insurance mode, which
// forces both — always has at least one valid option per part. Only the
// price/eta/company details are randomised; the category coverage isn't.
function generateOptionsForPart(part: IdentifiedPart, today: Date): SupplierOption[] {
  const rand = mulberry32(hashString(part.id || part.name));
  const pickCompany = () => SUPPLIER_NAMES[Math.floor(rand() * SUPPLIER_NAMES.length)];
  const basePrice = 60 + Math.round(rand() * 400);
  const jitterPrice = (p: number) => Math.max(20, Math.round(p * (0.9 + rand() * 0.2)));
  const dateFrom = (leadDays: number) =>
    nextWorkingDay(new Date(+today + (leadDays + Math.floor(rand() * 3)) * dayMs))
      .toISOString()
      .slice(0, 10);

  return [
    { company: pickCompany(), oem: true, speed: "air", price: jitterPrice(basePrice * 1.5), eta: dateFrom(3) },
    { company: pickCompany(), oem: true, speed: "express", price: jitterPrice(basePrice * 1.2), eta: dateFrom(6) },
    { company: pickCompany(), oem: true, speed: "standard", price: jitterPrice(basePrice), eta: dateFrom(9) },
    { company: pickCompany(), oem: true, speed: "ground", price: jitterPrice(basePrice * 0.85), eta: dateFrom(12) },
    { company: pickCompany(), oem: false, speed: "express", price: jitterPrice(basePrice * 0.6), eta: dateFrom(5) },
    { company: pickCompany(), oem: false, speed: "ground", price: jitterPrice(basePrice * 0.4), eta: dateFrom(10) },
  ];
}

// Build a catalogue from whatever parts were actually identified for this
// case. `today` is injectable so demo dates can be pinned for a rehearsal.
export function buildCatalogue(parts: IdentifiedPart[], today: Date = new Date()): Catalogue {
  const catalogue: Catalogue = {};
  parts.forEach((part) => {
    if (!part.id) return;
    catalogue[part.id] = {
      name: part.name,
      partNumber: part.partNumber ?? "—",
      options: generateOptionsForPart(part, today),
    };
  });
  return catalogue;
}

export function partKeysOf(catalogue: Catalogue): PartKey[] {
  return Object.keys(catalogue);
}

// Small fixed fixture, kept only as a fallback so /procurement and
// /procurement/suppliers still render something sensible if a staff member
// lands on them without having run an inspection through / first (a cold
// link, a refresh mid-demo, rehearsing the procurement screens in isolation).
export const FALLBACK_PARTS: IdentifiedPart[] = [
  { id: "headlamp", name: "Headlamp assembly LH", partNumber: "81150-0K130" },
  { id: "bumper", name: "Front bumper cover", partNumber: "52119-0K921" },
  { id: "bracket", name: "Mounting bracket", partNumber: "52535-0K900" },
];

export type Basket = {
  chosen: Record<PartKey, SupplierOption>;
  cost: number;
  readyDate: Date;
  gatingPart: PartKey;
};

function gatingKeyOf(chosen: Record<PartKey, SupplierOption>, partKeys: PartKey[]): PartKey {
  return partKeys.reduce((a, b) => (eta(chosen[a]) > eta(chosen[b]) ? a : b));
}

export function readyDateOf(chosen: Record<PartKey, SupplierOption>, catalogue: Catalogue): Date {
  const partKeys = partKeysOf(catalogue);
  return nextWorkingDay(new Date(eta(chosen[gatingKeyOf(chosen, partKeys)]) + LABOUR_DAYS * dayMs));
}

export function buildBaskets(catalogue: Catalogue, oemOnly: boolean, groundOnly: boolean): Basket[] {
  const partKeys = partKeysOf(catalogue);
  const options = partKeys.map((key) => ({
    key,
    opts: catalogue[key].options.filter(
      (o) => (!oemOnly || o.oem) && (!groundOnly || o.speed === "ground" || o.speed === "standard"),
    ),
  }));

  const baskets: Basket[] = [];

  function recurse(i: number, chosen: Partial<Record<PartKey, SupplierOption>>) {
    if (i === options.length) {
      const full = chosen as Record<PartKey, SupplierOption>;
      const cost = partKeys.reduce((s, k) => s + full[k].price, 0);
      const gatingPart = gatingKeyOf(full, partKeys);
      const readyDate = nextWorkingDay(new Date(eta(full[gatingPart]) + LABOUR_DAYS * dayMs));
      baskets.push({ chosen: full, cost, readyDate, gatingPart });
      return;
    }
    for (const opt of options[i].opts) {
      recurse(i + 1, { ...chosen, [options[i].key]: opt });
    }
  }
  recurse(0, {});
  return baskets;
}

export function paretoFrontier(baskets: Basket[]): Basket[] {
  const dominates = (a: Basket, b: Basket) =>
    a.cost <= b.cost &&
    +a.readyDate <= +b.readyDate &&
    (a.cost < b.cost || +a.readyDate < +b.readyDate);
  return baskets
    .filter((b) => !baskets.some((o) => dominates(o, b)))
    .sort((a, b) => a.cost - b.cost);
}

export function pickBestValue(frontier: Basket[], budget: number, target: Date): Basket {
  const affordable = frontier.filter((b) => b.cost <= budget);
  if (affordable.length) return affordable.reduce((a, b) => (+a.readyDate <= +b.readyDate ? a : b));
  return frontier.reduce((a, b) => {
    const lateA = Math.max(0, daysBetween(a.readyDate, target));
    const lateB = Math.max(0, daysBetween(b.readyDate, target));
    if (lateA !== lateB) return lateA < lateB ? a : b;
    return a.cost < b.cost ? a : b;
  });
}

// What would it cost/take to express the part currently gating this basket,
// ignoring the ground-freight restriction just for that one part?
export function expressOverride(basket: Basket, catalogue: Catalogue): Basket {
  const partKeys = partKeysOf(catalogue);
  const key = basket.gatingPart;
  const fastestOem = catalogue[key].options
    .filter((o) => o.oem)
    .reduce((a, b) => (eta(a) < eta(b) ? a : b));
  const chosen = { ...basket.chosen, [key]: fastestOem };
  const gatingPart = gatingKeyOf(chosen, partKeys);
  const cost = partKeys.reduce((s, k) => s + chosen[k].price, 0);
  const readyDate = nextWorkingDay(new Date(eta(chosen[gatingPart]) + LABOUR_DAYS * dayMs));
  return { chosen, cost, readyDate, gatingPart };
}

export function basketToTimelineParts(basket: Basket, catalogue: Catalogue) {
  return partKeysOf(catalogue).map((key) => ({
    id: key,
    name: catalogue[key].name,
    eta: basket.chosen[key].eta,
    originalEta: basket.chosen[key].eta,
  }));
}
