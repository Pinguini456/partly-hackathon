"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  CATALOGUE,
  PART_KEYS,
  Basket,
  buildBaskets,
  paretoFrontier,
  pickBestValue,
  expressOverride,
  basketToTimelineParts,
  fmt,
  daysBetween,
} from "@/src/lib/procurement";

export default function ProcurementPage() {
  const router = useRouter();
  const [targetDate, setTargetDate] = useState("2026-08-04");
  const [budget, setBudget] = useState(850);
  const [manualOemOnly, setManualOemOnly] = useState(false);
  const [jobType, setJobType] = useState<"private" | "insurance">("private");

  const [expressRequested, setExpressRequested] = useState(false);

  const oemOnly = jobType === "insurance" ? true : manualOemOnly;
  const groundOnly = jobType === "insurance";

  const allBaskets = useMemo(() => buildBaskets(oemOnly, groundOnly), [oemOnly, groundOnly]);
  const frontier = useMemo(() => paretoFrontier(allBaskets), [allBaskets]);

  const target = new Date(targetDate);

  const cheapest = frontier[0];
  const fastestOut = frontier.reduce((a, b) => (+a.readyDate <= +b.readyDate ? a : b));
  const bestValue = pickBestValue(frontier, budget, target);

  const feasible = frontier.some((b) => b.cost <= budget && +b.readyDate <= +target);
  const bindingPart = CATALOGUE[fastestOut.gatingPart].name;

  // Always compare both modes, regardless of which one is currently toggled,
  // so the quote line under the toggle is a live claim, not a static one.
  const privateFrontier = useMemo(() => paretoFrontier(buildBaskets(manualOemOnly, false)), [manualOemOnly]);
  const insuranceFrontier = useMemo(() => paretoFrontier(buildBaskets(true, true)), []);
  const privateBest = pickBestValue(privateFrontier, budget, target);
  const insuranceBest = pickBestValue(insuranceFrontier, budget, target);
  const modeCostDelta = privateBest.cost - insuranceBest.cost;
  const modeDaysDelta = daysBetween(insuranceBest.readyDate, privateBest.readyDate);

  // Under insurance, is the ground-freight rule (not a part) actually the
  // thing costing days? Compare against expressing the current gating part.
  const expressScenario = expressOverride(fastestOut);
  const policyIsBinding =
    jobType === "insurance" && +expressScenario.readyDate < +fastestOut.readyDate;

  function applyBasket(basket: Basket, label: string) {
    sessionStorage.setItem(
      "partly:chosenBasket",
      JSON.stringify({
        parts: basketToTimelineParts(basket),
        label: `${label} — $${basket.cost}, ready ${fmt(basket.readyDate)}`,
      }),
    );
    router.push("/timeline");
  }

  function sendToCustomer() {
    const option = (basket: Basket, label: string) => ({
      label,
      cost: basket.cost,
      readyDateISO: basket.readyDate.toISOString(),
      parts: basketToTimelineParts(basket),
    });
    sessionStorage.setItem(
      "partly:customerChoice",
      JSON.stringify({
        recommended: option(bestValue, "Best value"),
        alternative: option(cheapest, "Cheapest"),
      }),
    );
    router.push("/procurement/choose");
  }

  const rawPresets = [
    { key: "cheapest", label: "Cheapest", basket: cheapest },
    { key: "best_value", label: "Best value", basket: bestValue, highlight: true },
    { key: "fastest_out", label: "Fastest out", basket: fastestOut },
  ];
  const seenSignatures = new Set<string>();
  const presets = rawPresets.filter(({ basket }) => {
    const sig = `${basket.cost}|${+basket.readyDate}`;
    if (seenSignatures.has(sig)) return false;
    seenSignatures.add(sig);
    return true;
  });
  const gridCols =
    presets.length === 1 ? "md:grid-cols-1" : presets.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Procurement</h1>
          <a href="/procurement/suppliers" className="text-sm font-medium text-blue-600 hover:underline">
            View supplier detail →
          </a>
        </div>
        <p className="mt-1 text-slate-500">
          Constraints apply to the whole basket, not each part — the solver decides per part
          which supplier to use.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-sm">
          <span className="text-slate-500">Out by</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="rounded-md border px-2 py-1 font-medium text-slate-900"
          />
          <span className="text-slate-500">under</span>
          <div className="flex items-center rounded-md border px-2 py-1 font-medium text-slate-900">
            $
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="ml-1 w-20 outline-none"
            />
          </div>
          <label className="ml-2 flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={oemOnly}
              disabled={jobType === "insurance"}
              onChange={(e) => setManualOemOnly(e.target.checked)}
            />
            OEM only {jobType === "insurance" && <span className="text-slate-400">(locked)</span>}
          </label>

          <div className="ml-auto flex items-center gap-1 rounded-md border p-1 text-xs">
            <button
              onClick={() => {
                setJobType("private");
                setExpressRequested(false);
              }}
              className={`rounded px-2 py-1 ${jobType === "private" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            >
              Private pay
            </button>
            <button
              onClick={() => {
                setJobType("insurance");
                setExpressRequested(false);
              }}
              className={`rounded px-2 py-1 ${jobType === "insurance" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            >
              Insurance
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Private pay gets {fmt(privateBest.readyDate)} at ${privateBest.cost}; insurance gets{" "}
          {fmt(insuranceBest.readyDate)} at ${insuranceBest.cost}. The policy{" "}
          {modeCostDelta > 0 ? `saves $${modeCostDelta}` : `costs $${-modeCostDelta} more`} and{" "}
          {modeDaysDelta > 0
            ? `costs ${modeDaysDelta} day${modeDaysDelta === 1 ? "" : "s"} in the bay`
            : `saves ${-modeDaysDelta} day${-modeDaysDelta === 1 ? "" : "s"}`}
          .
        </p>

        {jobType === "private" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-600">
              Send {fmt(bestValue.readyDate)} at ${bestValue.cost}, or {fmt(cheapest.readyDate)} at $
              {cheapest.cost}, to the customer to choose.
            </p>
            <button
              onClick={sendToCustomer}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Send to customer to choose
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <p className="text-sm text-slate-600">
              Insurer policy: OEM, ground freight, no express without approval. The customer isn&apos;t
              choosing this one — pick a basket below and apply it.
            </p>
          </div>
        )}

        {!feasible && policyIsBinding && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                Insurer&apos;s ground-freight policy is the binding constraint. Express on the{" "}
                <strong>{CATALOGUE[fastestOut.gatingPart].name.toLowerCase()}</strong> would hit{" "}
                {fmt(expressScenario.readyDate)} for ${expressScenario.cost - fastestOut.cost} more.
              </p>
              {expressRequested ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Express approval requested — awaiting insurer response.
                </p>
              ) : (
                <button
                  onClick={() => setExpressRequested(true)}
                  className="mt-2 rounded-md border border-amber-400 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Request express approval
                </button>
              )}
            </div>
          </div>
        )}

        {!feasible && !policyIsBinding && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Nothing meets both. The <strong>{bindingPart}</strong> is the binding constraint —
              every basket below is limited by it, not by the other {PART_KEYS.length - 1} parts.
            </p>
          </div>
        )}

        <div className={`mt-6 grid gap-4 ${gridCols}`}>
          {presets.map(({ key, label, basket, highlight }) => {
            const lateDays = daysBetween(basket.readyDate, target);
            const overBudget = basket.cost - budget;
            return (
              <div
                key={key}
                className={`rounded-xl border bg-white p-5 ${
                  highlight ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"
                }`}
              >
                {highlight ? (
                  <span className="mb-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    Best value
                  </span>
                ) : (
                  <p className="text-sm text-slate-500">{label}</p>
                )}
                <p className="mt-1 text-2xl font-bold text-slate-900">${basket.cost}</p>
                <p className="text-sm text-slate-600">{fmt(basket.readyDate)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      lateDays <= 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {lateDays <= 0 ? "On target date" : `${lateDays} day${lateDays === 1 ? "" : "s"} late`}
                  </span>
                  {overBudget > 0 && (
                    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      ${overBudget} over
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {PART_KEYS.map(
                    (k) => `${CATALOGUE[k].name}: ${basket.chosen[k].company} (${basket.chosen[k].speed})`,
                  ).join(" · ")}
                </p>
                <button
                  onClick={() => applyBasket(basket, label)}
                  className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Apply
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          {allBaskets.length} baskets evaluated, {frontier.length} on the Pareto frontier (
          {presets.length} shown above). Everything else was worse on both cost and date.
        </p>
      </div>
    </main>
  );
}
