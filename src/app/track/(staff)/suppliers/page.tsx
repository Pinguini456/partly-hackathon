"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import {
  Catalogue,
  IdentifiedPart,
  FALLBACK_PARTS,
  PartKey,
  SupplierOption,
  buildBaskets,
  buildCatalogue,
  partKeysOf,
  paretoFrontier,
  pickBestValue,
  readyDateOf,
  basketToTimelineParts,
  eta,
  dayMs,
  fmt,
  daysBetween,
} from "@/src/lib/procurement";
import { useMemo } from "react";

// Reads whatever /api/main last identified for this session; falls back to a
// small fixed demo basket if a staff member lands here cold.
function loadParts(): { parts: IdentifiedPart[]; usingFallback: boolean } {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem("partly:parts");
      if (raw) {
        const data = JSON.parse(raw) as { id: string[]; name: string[] };
        if (data.id?.length) {
          return {
            parts: data.id.map((id, i) => ({ id, name: data.name[i] ?? id })),
            usingFallback: false,
          };
        }
      }
    } catch {
      // fall through to fallback below
    }
  }
  return { parts: FALLBACK_PARTS, usingFallback: true };
}

// Recommended starting basket — same best-value logic as /procurement, so
// this screen can never disagree with the main page about the solver's
// actual output.
function defaultChosen(catalogue: Catalogue): Record<PartKey, SupplierOption> {
  const frontier = paretoFrontier(buildBaskets(catalogue, false, false));
  return pickBestValue(frontier, 850, new Date("2026-08-04")).chosen;
}

type SortMode = "best" | "cheapest" | "soonest";

export default function SupplierDrilldownPage() {
  const router = useRouter();
  const [{ parts, usingFallback }] = useState(loadParts);
  const catalogue = useMemo(() => buildCatalogue(parts), [parts]);
  const partKeys = useMemo(() => partKeysOf(catalogue), [catalogue]);
  const [chosen, setChosen] = useState<Record<PartKey, SupplierOption>>(() => defaultChosen(catalogue));
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [oemOnly, setOemOnly] = useState(false);

  const currentReadyDate = readyDateOf(chosen, catalogue);
  const gating = partKeys.reduce((a, b) => (eta(chosen[a]) > eta(chosen[b]) ? a : b));
  const totalCost = partKeys.reduce((s, k) => s + chosen[k].price, 0);

  function selectOption(part: PartKey, option: SupplierOption) {
    setChosen((prev) => ({ ...prev, [part]: option }));
  }

  function applyBasket() {
    sessionStorage.setItem(
      "partly:chosenBasket",
      JSON.stringify({
        parts: basketToTimelineParts(
          { chosen, cost: totalCost, readyDate: currentReadyDate, gatingPart: gating },
          catalogue,
        ),
        label: `Supplier picks — $${totalCost}, ready ${fmt(currentReadyDate)}`,
      }),
    );
    router.push("/track");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Supplier detail</h1>
        <p className="mt-1 text-slate-500">
          The solver already picked one supplier per part. This shows why, and lets you override
          it. Every delta is the effect on the whole job&apos;s pickup date, not just this part
          arriving earlier — a part with slack doesn&apos;t get the car home sooner.
        </p>
        {usingFallback && (
          <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Showing demo parts — no inspection found in this session yet.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <div className="flex items-center gap-1 rounded-md border p-1">
            {(
              [
                ["best", "Best for this part"],
                ["cheapest", "Cheapest"],
                ["soonest", "Soonest"],
              ] as [SortMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  sortMode === mode ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={oemOnly} onChange={(e) => setOemOnly(e.target.checked)} />
            OEM only <span className="text-slate-400">(constraint, not a sort)</span>
          </label>
        </div>

        <div className="mt-4 space-y-6">
          {partKeys.map((partKey) => {
            const part = catalogue[partKey];
            const isGating = partKey === gating;
            const others = partKeys.filter((k) => k !== partKey);
            const othersGatingEta = others.length
              ? Math.max(...others.map((k) => eta(chosen[k])))
              : -Infinity;
            const slackDays = isGating
              ? 0
              : Math.max(0, Math.round((othersGatingEta - eta(chosen[partKey])) / dayMs));

            type Row = {
              option: SupplierOption;
              blocked: boolean;
              isChosen: boolean;
              costDelta: number;
              newReadyDate: Date;
              dateDeltaDays: number;
            };
            const rows: Row[] = part.options.map((option) => {
              const hypothetical = { ...chosen, [partKey]: option };
              const newReadyDate = readyDateOf(hypothetical, catalogue);
              return {
                option,
                blocked: oemOnly && !option.oem,
                isChosen:
                  option.company === chosen[partKey].company && option.speed === chosen[partKey].speed,
                costDelta: option.price - chosen[partKey].price,
                newReadyDate,
                dateDeltaDays: daysBetween(newReadyDate, currentReadyDate),
              };
            });

            // Chosen row always pinned first; the rest sorted by the active mode.
            const chosenRow = rows.find((r) => r.isChosen)!;
            const rest = rows.filter((r) => !r.isChosen);
            rest.sort((a, b) => {
              if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
              if (sortMode === "cheapest") return a.option.price - b.option.price;
              if (sortMode === "soonest") return eta(a.option) - eta(b.option);
              const aBenefit = a.dateDeltaDays < 0 ? 0 : 1;
              const bBenefit = b.dateDeltaDays < 0 ? 0 : 1;
              if (aBenefit !== bBenefit) return aBenefit - bBenefit;
              return a.option.price - b.option.price;
            });
            const sorted = [chosenRow, ...rest];

            return (
              <div key={partKey} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{part.name}</h2>
                    <p className="text-xs text-slate-500">{part.partNumber}</p>
                  </div>
                  {isGating ? (
                    <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Gating part
                    </span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {slackDays}d slack
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {isGating
                    ? "No slack — every day here is a day on the car."
                    : `Anything landing before ${fmt(new Date(othersGatingEta))} is equally good.`}
                </p>

                <div className="mt-3 divide-y">
                  {sorted.map((row) => {
                    const { option, blocked, isChosen, costDelta, newReadyDate, dateDeltaDays } = row;
                    const absCost = Math.abs(costDelta);
                    const costWord = costDelta > 0 ? `$${absCost} more` : costDelta < 0 ? `$${absCost} less` : "same price";

                    let description: string;
                    if (isChosen) description = "Chosen";
                    else if (blocked) description = "Blocked by OEM-only";
                    else if (dateDeltaDays !== 0)
                      description = `${costWord} → pickup ${fmt(newReadyDate)} (${Math.abs(dateDeltaDays)} day${
                        Math.abs(dateDeltaDays) === 1 ? "" : "s"
                      } ${dateDeltaDays < 0 ? "sooner" : "later"})`;
                    else description = `${costWord}, no date benefit`;

                    const noBenefit = !isChosen && !blocked && dateDeltaDays === 0 && costDelta > 0;

                    return (
                      <button
                        key={option.company + option.speed}
                        onClick={() => !blocked && !isChosen && selectOption(partKey, option)}
                        disabled={blocked}
                        className={`flex w-full items-center justify-between py-3 text-left ${
                          blocked
                            ? "cursor-not-allowed opacity-40"
                            : noBenefit
                              ? "opacity-50 hover:opacity-80"
                              : "hover:bg-slate-50"
                        } ${isChosen ? "bg-indigo-50" : ""}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {option.company} · {option.oem ? "OEM" : "aftermarket"}
                            {blocked && <Lock className="ml-1 inline h-3 w-3 text-slate-400" />}
                          </p>
                          <p className="text-xs text-slate-500">
                            {option.speed} · {fmt(new Date(option.eta))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">${option.price}</p>
                          <p
                            className={`text-xs ${
                              isChosen ? "font-medium text-indigo-600" : blocked ? "text-slate-400" : "text-slate-500"
                            }`}
                          >
                            {description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-lg font-bold text-slate-900">${totalCost}</p>
            <p className="text-sm text-slate-600">Ready {fmt(currentReadyDate)}</p>
          </div>
          <button
            onClick={applyBasket}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply this basket
          </button>
        </div>
      </div>
    </main>
  );
}
