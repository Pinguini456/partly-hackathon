// Assembly-vs-build-up purchasing choice for parts that are sold both as a
// complete unit and as bare components — a headlamp as one assembly or as
// lens + housing + bracket set + clips; a bumper pre-fitted or as six pieces.
// This is a third axis the basket solver in procurement.ts doesn't model:
// buying the assembly is dearer in parts and near-zero labour, building it
// up is cheaper in parts and costs bench hours instead. It isn't folded into
// buildBaskets()'s combinatorics — it's surfaced as its own decision next to
// the solver's output, the same way the OEM tree exposes it: one level down
// from the assembly node.
//
// FABRICATED: every line item, price, eta, bench-hour figure and both
// labour rates below — the partly-api dataset has no sub-assembly pricing
// or bench-time data at all. Real shops price labour off a published
// labour-time guide (e.g. Mitchell/Motor), not a flat hourly rate; treat
// these hours as directional, not a quote. The insurer labour rate in
// particular is a guess — worth checking how NZ insurers actually reimburse
// parts vs labour before asserting the direction on stage.

import { PartKey, dayMs, nextWorkingDay, eta as etaOf } from "./procurement";

export type LineItem = { name: string; price: number; eta: string };

export type PurchaseRoute = {
  key: string;
  label: string;
  subtitle: string;
  mpn?: string;
  lineItems: LineItem[];
  /** Bench hours to fit this route, fabricated — see file header. */
  benchHours: number;
};

export type AssemblyChoice = {
  partKey: PartKey;
  partName: string;
  routes: [PurchaseRoute, PurchaseRoute];
};

/** Customer-facing shop labour rate, $/hr — private-pay jobs pay this. */
export const LABOUR_RATE_PRIVATE = 115;
/** Insurer-agreed labour rate, $/hr — lower than retail, but still billable
 * revenue in a way the near-zero parts markup isn't. */
export const LABOUR_RATE_INSURANCE = 60;

export const ASSEMBLY_CHOICES: Partial<Record<PartKey, AssemblyChoice>> = {
  headlampAssembly: {
    partKey: "headlampAssembly",
    partName: "Headlamp assembly LH",
    routes: [
      {
        key: "assembly",
        label: "Complete assembly",
        subtitle: "81150-0K130 · one line item",
        mpn: "81150-0K130",
        lineItems: [{ name: "Complete assembly", price: 560, eta: "2026-07-31" }],
        benchHours: 0.5,
      },
      {
        key: "buildUp",
        label: "Build it up",
        subtitle: "Lens, housing, bracket set, 4 clips · 7 line items",
        lineItems: [
          { name: "Lens", price: 95, eta: "2026-07-28" },
          { name: "Housing", price: 140, eta: "2026-07-30" },
          { name: "Bracket set", price: 52, eta: "2026-07-29" },
          ...Array.from({ length: 4 }, (_, i) => ({
            name: `Mounting clip ${i + 1}`,
            price: 10,
            eta: "2026-07-27",
          })),
        ],
        benchHours: 2.5,
      },
    ],
  },
};

export function routeStats(route: PurchaseRoute) {
  const partsCost = route.lineItems.reduce((s, i) => s + i.price, 0);
  const arrivalEta = Math.max(...route.lineItems.map((i) => etaOf(i)));
  // Bench hours only push the date further if they'd blow a full working
  // day (8h) on their own — under that, the difference is which other jobs
  // get bumped in the bay, not when this one is ready.
  const extraDays = Math.max(0, Math.ceil((route.benchHours - 8) / 8));
  const readyDate = nextWorkingDay(new Date(arrivalEta + dayMs + extraDays * dayMs));
  return { partsCost, readyDate };
}

export function totalCostTo(route: PurchaseRoute, labourRate: number) {
  return routeStats(route).partsCost + route.benchHours * labourRate;
}

// Raw cost picks the cheaper route. But when the two are close, the
// back-order risk of more line items — each one a chance the job stalls on
// a single missing part — is the stronger argument, so private-pay lets a
// close tie fall to whichever route has fewer of them. Insurance jobs skip
// that override: the shop bills bench hours either way, so more hours just
// means more billable revenue, and here it also happens to be the cheaper
// route for the insurer, so cost and shop incentive already agree.
const RISK_TIE_THRESHOLD = 50;

export function chooseRoute(choice: AssemblyChoice, jobType: "private" | "insurance") {
  const rate = jobType === "insurance" ? LABOUR_RATE_INSURANCE : LABOUR_RATE_PRIVATE;
  const scored = choice.routes
    .map((r) => ({ r, total: totalCostTo(r, rate) }))
    .sort((a, b) => a.total - b.total);
  const [best, second] = scored;
  const useRiskTiebreak =
    jobType === "private" &&
    second.total - best.total <= RISK_TIE_THRESHOLD &&
    second.r.lineItems.length < best.r.lineItems.length;
  const chosen = useRiskTiebreak ? second.r : best.r;
  const alternative = choice.routes.find((r) => r !== chosen)!;
  return { chosen, alternative, rate };
}

export function bottomLine(choice: AssemblyChoice, jobType: "private" | "insurance") {
  const { chosen, alternative, rate } = chooseRoute(choice, jobType);
  const chosenStats = routeStats(chosen);
  const altStats = routeStats(alternative);

  if (chosen.benchHours <= alternative.benchHours) {
    // Chosen is the low-labour route (typically the assembly): the case for
    // it is the risk it avoids, not the money — spell that out.
    const partsSaved = chosenStats.partsCost - altStats.partsCost;
    const extraHours = alternative.benchHours - chosen.benchHours;
    return (
      `${alternative.label} would save $${partsSaved} in parts, but adds ${extraHours}h more bench ` +
      `time and ${alternative.lineItems.length} line items instead of ${chosen.lineItems.length} — one ` +
      `missing part holds the car exactly as long as a missing ${chosen.label.toLowerCase()}. ` +
      `Recommending ${chosen.label.toLowerCase()}.`
    );
  }

  // Chosen is the high-labour route (typically build-up): the case for it is
  // that bench hours are billable, so more of them is revenue, not cost.
  const chosenLabour = Math.round(chosen.benchHours * rate);
  const altLabour = Math.round(alternative.benchHours * rate);
  const partsSaved = altStats.partsCost - chosenStats.partsCost;
  return (
    `Bench hours are billable on this job — ${chosen.label.toLowerCase()} puts $${chosenLabour} of ` +
    `labour on the invoice instead of $${altLabour}, while parts drop $${partsSaved}. That's better for ` +
    `the shop and cheaper for whoever's paying, despite ${chosen.lineItems.length} line items' worth of ` +
    `back-order risk. Recommending ${chosen.label.toLowerCase()}.`
  );
}
