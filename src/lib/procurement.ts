// Single source of truth for the procurement optimiser, shared by
// /track/procurement and /track/suppliers so the two screens can never
// compute a different "solver output" for the same basket.
//
// WHAT IS REAL vs FABRICATED
// --------------------------
// Real, straight from the partly-api dataset (toyota-yaris-qmn16):
//   part names, part numbers, callout codes, diagram id, and the hotspot
//   pixel coordinates used to highlight callouts on the real diagram image.
// Fabricated (the dataset has no such fields at all):
//   suppliers, prices, delivery dates, and delivery-performance history.
//
// Reliability is modelled as promisedEta (what the supplier quotes) vs eta
// (the risk-adjusted date they actually hit, derived from delivery history).
// The solver schedules on `eta`, never the promise — a supplier that promises
// early and misses is not actually early.

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

// --- The real vehicle + diagram these parts come from ---------------------

export const VEHICLE = {
  slug: "toyota-yaris-qmn16",
  label: "Toyota Yaris 2023",
  plate: "MKJ482",
  diagramId: "fa9e2586-4cf1-55ab-b122-5c18857aa1ad",
  diagramWidth: 1592,
  diagramHeight: 1099,
};

export type Hotspot = { x1: number; y1: number; x2: number; y2: number; code: string };

// Other real callouts on the same diagram — rendered unhighlighted so the
// repairer can spot adjacent hardware they also need.
export const NEIGHBOUR_HOTSPOTS: { label: string; hotspot: Hotspot }[] = [
  {
    label: "Headlamp Bracket No.1 - Left",
    hotspot: { x1: 661, y1: 797, x2: 728, y2: 818, code: "53234A" },
  },
  {
    label: "Front Bumper Lower Arm - Left",
    hotspot: { x1: 478, y1: 420, x2: 545, y2: 441, code: "52144M" },
  },
];

export type Speed = "ground" | "standard" | "express" | "air";

export type SupplierOption = {
  company: string;
  oem: boolean;
  speed: Speed;
  price: number;
  /** What the supplier quotes. */
  promisedEta: string;
  /** Risk-adjusted date from delivery history — what the solver schedules on. */
  eta: string;
  /** Share of past orders delivered by the promised date. */
  onTimeRate: number;
  orderCount: number;
  /** Aftermarket only: share of orders sent back for fitment problems. */
  returnRate?: number;
};

export type PartKey = "bumperArm" | "headlampBracket" | "fenderExtension";

export const CATALOGUE: Record<
  PartKey,
  { name: string; partNumber: string; hotspot: Hotspot; options: SupplierOption[] }
> = {
  bumperArm: {
    name: "Front Bumper Lower Arm - Right",
    partNumber: "52143K",
    hotspot: { x1: 304, y1: 321, x2: 371, y2: 342, code: "52143K" },
    options: [
      {
        company: "BNT Auckland",
        oem: true,
        speed: "ground",
        price: 160,
        promisedEta: "2026-08-03",
        eta: "2026-08-03",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "BNT Auckland",
        oem: true,
        speed: "express",
        price: 210,
        promisedEta: "2026-07-30",
        eta: "2026-07-31",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "Kiwi Panel Supply",
        oem: true,
        speed: "ground",
        price: 140,
        promisedEta: "2026-07-31",
        eta: "2026-08-05",
        onTimeRate: 0.68,
        orderCount: 95,
      },
      {
        company: "Whangarei Auto",
        oem: false,
        speed: "ground",
        price: 98,
        promisedEta: "2026-08-05",
        eta: "2026-08-06",
        onTimeRate: 0.91,
        orderCount: 210,
        returnRate: 0.04,
      },
    ],
  },
  headlampBracket: {
    name: "Headlamp Bracket No.1 - Right",
    partNumber: "53233A",
    hotspot: { x1: 323, y1: 583, x2: 390, y2: 604, code: "53233A" },
    options: [
      {
        company: "Southern Parts Co",
        oem: true,
        speed: "ground",
        price: 300,
        promisedEta: "2026-07-29",
        eta: "2026-07-31",
        onTimeRate: 0.94,
        orderCount: 512,
      },
      {
        company: "Southern Parts Co",
        oem: true,
        speed: "express",
        price: 460,
        promisedEta: "2026-07-28",
        eta: "2026-07-29",
        onTimeRate: 0.97,
        orderCount: 512,
      },
      {
        company: "Southern Parts Co",
        oem: true,
        speed: "air",
        price: 560,
        promisedEta: "2026-07-27",
        eta: "2026-07-28",
        onTimeRate: 0.98,
        orderCount: 512,
      },
    ],
  },
  fenderExtension: {
    name: "Front Fender Extension - Right",
    partNumber: "53813C",
    hotspot: { x1: 931, y1: 185, x2: 998, y2: 206, code: "53813C" },
    options: [
      {
        company: "BNT Auckland",
        oem: true,
        speed: "ground",
        price: 110,
        promisedEta: "2026-07-29",
        eta: "2026-07-30",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "North Shore Toyota",
        oem: true,
        speed: "standard",
        price: 130,
        promisedEta: "2026-07-28",
        eta: "2026-07-28",
        onTimeRate: 0.97,
        orderCount: 180,
      },
      {
        company: "Whangarei Auto",
        oem: false,
        speed: "ground",
        price: 85,
        promisedEta: "2026-07-27",
        eta: "2026-07-28",
        onTimeRate: 0.9,
        orderCount: 210,
        returnRate: 0.04,
      },
    ],
  },
};

export const PART_KEYS = Object.keys(CATALOGUE) as PartKey[];

// Vision-only find from the walkaround that hasn't been confirmed against the
// catalogue yet — surfaced as a decision rather than silently ordered.
export const UNCONFIRMED_PARTS = [
  { name: "Washer nozzle", note: "Seen in walkaround, not confirmed", estimate: 12 },
];

export type Basket = {
  chosen: Record<PartKey, SupplierOption>;
  cost: number;
  readyDate: Date;
  gatingPart: PartKey;
};

function gatingKeyOf(chosen: Record<PartKey, SupplierOption>): PartKey {
  return PART_KEYS.reduce((a, b) => (eta(chosen[a]) > eta(chosen[b]) ? a : b));
}

export function readyDateOf(chosen: Record<PartKey, SupplierOption>): Date {
  return nextWorkingDay(new Date(eta(chosen[gatingKeyOf(chosen)]) + LABOUR_DAYS * dayMs));
}

export function buildBaskets(oemOnly: boolean, groundOnly: boolean): Basket[] {
  const options = PART_KEYS.map((key) => ({
    key,
    opts: CATALOGUE[key].options.filter(
      (o) => (!oemOnly || o.oem) && (!groundOnly || o.speed === "ground" || o.speed === "standard"),
    ),
  }));

  const baskets: Basket[] = [];

  function recurse(i: number, chosen: Partial<Record<PartKey, SupplierOption>>) {
    if (i === options.length) {
      const full = chosen as Record<PartKey, SupplierOption>;
      const cost = PART_KEYS.reduce((s, k) => s + full[k].price, 0);
      const gatingPart = gatingKeyOf(full);
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
export function expressOverride(basket: Basket): Basket {
  const key = basket.gatingPart;
  const fastestOem = CATALOGUE[key].options
    .filter((o) => o.oem)
    .reduce((a, b) => (eta(a) < eta(b) ? a : b));
  const chosen = { ...basket.chosen, [key]: fastestOem };
  const gatingPart = gatingKeyOf(chosen);
  const cost = PART_KEYS.reduce((s, k) => s + chosen[k].price, 0);
  const readyDate = nextWorkingDay(new Date(eta(chosen[gatingPart]) + LABOUR_DAYS * dayMs));
  return { chosen, cost, readyDate, gatingPart };
}

export function basketToTimelineParts(basket: Basket) {
  return PART_KEYS.map((key) => ({
    id: key,
    name: CATALOGUE[key].name,
    eta: basket.chosen[key].eta,
    originalEta: basket.chosen[key].eta,
  }));
}

/** The solver's recommended basket — the starting point on both screens. */
export function recommendedBasket(oemOnly = false, groundOnly = false, budget = 850) {
  return pickBestValue(
    paretoFrontier(buildBaskets(oemOnly, groundOnly)),
    budget,
    new Date("2026-08-04"),
  );
}
