// Single source of truth for the procurement optimiser, shared by
// /procurement and /procurement/suppliers so the two screens can never
// compute a different "solver output" for the same basket.
//
// The catalogue below is fabricated — the real partly-api dataset has no
// supplier/price/lead-time fields at all — but every date in it lands on a
// weekday, since no supplier delivers on a weekend.

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
export type PartKey = "headlamp" | "bumper" | "bracket";

export const CATALOGUE: Record<PartKey, { name: string; partNumber: string; options: SupplierOption[] }> = {
  headlamp: {
    name: "Headlamp assembly LH",
    partNumber: "81150-0K130",
    options: [
      { company: "Southern Parts Co", oem: true, speed: "air", price: 560, eta: "2026-07-29" },
      { company: "Southern Parts Co", oem: true, speed: "express", price: 460, eta: "2026-08-04" },
      { company: "Southern Parts Co", oem: true, speed: "standard", price: 380, eta: "2026-08-07" },
      { company: "Southern Parts Co", oem: true, speed: "ground", price: 300, eta: "2026-08-10" },
    ],
  },
  bumper: {
    name: "Front bumper cover",
    partNumber: "52119-0K921",
    options: [
      { company: "Whangarei Auto", oem: false, speed: "express", price: 260, eta: "2026-07-30" },
      { company: "BNT Auckland", oem: true, speed: "standard", price: 210, eta: "2026-07-31" },
      { company: "BNT Auckland", oem: true, speed: "ground", price: 160, eta: "2026-08-03" },
    ],
  },
  bracket: {
    name: "Mounting bracket",
    partNumber: "52535-0K900",
    options: [
      { company: "North Shore Toyota", oem: true, speed: "standard", price: 150, eta: "2026-07-27" },
      { company: "Whangarei Auto", oem: false, speed: "ground", price: 110, eta: "2026-07-28" },
      { company: "BNT Auckland", oem: true, speed: "standard", price: 130, eta: "2026-07-31" },
    ],
  },
};

export const PART_KEYS = Object.keys(CATALOGUE) as PartKey[];

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
