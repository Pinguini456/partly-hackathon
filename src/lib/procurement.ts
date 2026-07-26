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

// --- The real vehicle these parts come from -------------------------------

export const VEHICLE = {
  slug: "toyota-yaris-qmn16",
  label: "Toyota Yaris 2023",
  plate: "MKJ482",
  // Every diagram in this dataset is 1592x1099 at scale 1.0, so hotspot pixel
  // coords map straight onto the rendered image.
  diagramWidth: 1592,
  diagramHeight: 1099,
};

export type Hotspot = { x1: number; y1: number; x2: number; y2: number; code: string };

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

export type PartKey = "bumperCover" | "headlampAssembly" | "reinforcementBar";

export type PartEntry = {
  /** OEM description, real. */
  name: string;
  /** Manufacturer part number, real (tokenised in this dataset). */
  mpn: string;
  /** Diagram this part is called out on, real. */
  diagramId: string;
  diagramName: string;
  hotspot: Hotspot;
  /** What the damage model said, real: raw name, action, severity, confidence. */
  predicted: { rawName: string; action: string; severity: string; confidence: string };
  /** Walkaround frames the damage model cited for this part, real. */
  frames: string[];
  options: SupplierOption[];
};

export const CATALOGUE: Record<PartKey, PartEntry> = {
  headlampAssembly: {
    name: "Headlamp Assembly - Right",
    mpn: "R0FV7PSWS0:80ZE3V3VAMNR2VE0",
    diagramId: "d256bb33-5c7b-5213-9f5f-24b6022b599d",
    diagramName: "Headlamp",
    hotspot: { x1: 702, y1: 958, x2: 802, y2: 980, code: "81110" },
    predicted: {
      rawName: "Right Front Headlamp Assembly",
      action: "replacement",
      severity: "severe",
      confidence: "high",
    },
    frames: ["01_0001.jpg", "05_0033.jpg", "04_0025.jpg", "02_0004.jpg"],
    options: [
      {
        company: "Southern Parts Co",
        oem: true,
        speed: "ground",
        price: 520,
        promisedEta: "2026-07-29",
        eta: "2026-07-31",
        onTimeRate: 0.94,
        orderCount: 512,
      },
      {
        company: "Southern Parts Co",
        oem: true,
        speed: "express",
        price: 680,
        promisedEta: "2026-07-28",
        eta: "2026-07-29",
        onTimeRate: 0.97,
        orderCount: 512,
      },
      {
        company: "Whangarei Auto",
        oem: false,
        speed: "ground",
        price: 310,
        promisedEta: "2026-07-27",
        eta: "2026-07-28",
        onTimeRate: 0.9,
        orderCount: 210,
        returnRate: 0.04,
      },
    ],
  },
  bumperCover: {
    name: "Front Bumper Cover",
    mpn: "R0FV7PSWS0:9MYY3VKJ5DC8GTP2",
    diagramId: "fa22e079-dfd4-525b-b965-26fe51fb21e8",
    diagramName: "Front Bumper and Bumper Stay",
    hotspot: { x1: 1038, y1: 608, x2: 1105, y2: 629, code: "52119A" },
    predicted: {
      rawName: "Front Bumper Cover",
      action: "replacement",
      severity: "severe",
      confidence: "high",
    },
    frames: ["01_0001.jpg", "02_0004.jpg", "03_0020.jpg"],
    options: [
      {
        company: "BNT Auckland",
        oem: true,
        speed: "ground",
        price: 340,
        promisedEta: "2026-08-03",
        eta: "2026-08-03",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "BNT Auckland",
        oem: true,
        speed: "express",
        price: 410,
        promisedEta: "2026-07-30",
        eta: "2026-07-31",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "Kiwi Panel Supply",
        oem: true,
        speed: "ground",
        price: 315,
        promisedEta: "2026-07-31",
        eta: "2026-08-05",
        onTimeRate: 0.68,
        orderCount: 95,
      },
      {
        company: "Whangarei Auto",
        oem: false,
        speed: "ground",
        price: 240,
        promisedEta: "2026-08-05",
        eta: "2026-08-06",
        onTimeRate: 0.91,
        orderCount: 210,
        returnRate: 0.04,
      },
    ],
  },
  reinforcementBar: {
    name: "Front Bumper Reinforcement",
    mpn: "R0FV7PSWS0:9MYY3V3T5CMR4VY0",
    diagramId: "6b62c100-0b70-5864-83c0-f8cccee1f3e5",
    diagramName: "Front Bumper and Bumper Stay",
    hotspot: { x1: 1286, y1: 462, x2: 1353, y2: 483, code: "52131A" },
    predicted: {
      rawName: "Front Bumper Reinforcement Bar",
      action: "replacement",
      severity: "moderate",
      confidence: "high",
    },
    frames: ["01_0001.jpg", "04_0025.jpg"],
    options: [
      {
        company: "BNT Auckland",
        oem: true,
        speed: "ground",
        price: 185,
        promisedEta: "2026-07-29",
        eta: "2026-07-30",
        onTimeRate: 0.96,
        orderCount: 340,
      },
      {
        company: "North Shore Toyota",
        oem: true,
        speed: "standard",
        price: 220,
        promisedEta: "2026-07-28",
        eta: "2026-07-28",
        onTimeRate: 0.97,
        orderCount: 180,
      },
      {
        company: "Whangarei Auto",
        oem: false,
        speed: "ground",
        price: 140,
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

// Real low-confidence prediction the damage model flagged but couldn't tie to
// a frame, and which the catalogue marks is_orderable=false — carried through
// as a decision rather than silently ordered.
export const UNCONFIRMED_PARTS = [
  {
    name: "Pin Hold Clip",
    predictedAs: "Front Bumper Clip",
    mpn: "R0FV7PSWS0:9GWEFTVJ5MM82V60",
    reason: "Low match confidence, not orderable in catalogue",
  },
];

/** Default budget/target for the demo job, in the units the catalogue uses. */
export const DEFAULT_BUDGET = 1200;
export const DEFAULT_TARGET = "2026-08-03";

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
export function recommendedBasket(oemOnly = false, groundOnly = false, budget = DEFAULT_BUDGET) {
  return pickBestValue(
    paretoFrontier(buildBaskets(oemOnly, groundOnly)),
    budget,
    new Date(DEFAULT_TARGET),
  );
}
