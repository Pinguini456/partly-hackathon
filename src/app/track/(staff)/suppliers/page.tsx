"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import {
  CATALOGUE,
  PART_KEYS,
  PartKey,
  SupplierOption,
  Hotspot,
  VEHICLE,
  NEIGHBOUR_HOTSPOTS,
  UNCONFIRMED_PARTS,
  recommendedBasket,
  readyDateOf,
  basketToTimelineParts,
  eta,
  dayMs,
  fmt,
  daysBetween,
} from "@/src/lib/procurement";

type SortMode = "best" | "cheapest" | "soonest";

function pct(n: number, total: number) {
  return `${(n / total) * 100}%`;
}

function DiagramPane({ hotspot }: { hotspot: Hotspot }) {
  const { diagramWidth: W, diagramHeight: H } = VEHICLE;

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- served from the
          partly-api dataset via a route handler, not a static/optimisable asset */}
      <img
        src={`/api/diagram?vehicle=${VEHICLE.slug}&diagram=${VEHICLE.diagramId}`}
        alt={`OEM diagram, callout ${hotspot.code}`}
        className="block w-full"
      />

      {NEIGHBOUR_HOTSPOTS.map(({ label, hotspot: n }) => (
        <div
          key={n.code}
          title={label}
          className="absolute rounded-sm border border-slate-400/70"
          style={{
            left: pct(n.x1, W),
            top: pct(n.y1, H),
            width: pct(n.x2 - n.x1, W),
            height: pct(n.y2 - n.y1, H),
          }}
        />
      ))}

      <div
        className="absolute rounded-sm border-2 border-indigo-500 bg-indigo-500/15 ring-2 ring-indigo-500/30"
        style={{
          left: pct(hotspot.x1, W),
          top: pct(hotspot.y1, H),
          width: pct(hotspot.x2 - hotspot.x1, W),
          height: pct(hotspot.y2 - hotspot.y1, H),
        }}
      />

      <span className="absolute bottom-2 right-2 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500">
        Real OEM diagram · {VEHICLE.label}
      </span>
    </div>
  );
}

export default function SupplierDrilldownPage() {
  const router = useRouter();
  const [chosen, setChosen] = useState<Record<PartKey, SupplierOption>>(
    () => recommendedBasket().chosen,
  );
  const [selectedPart, setSelectedPart] = useState<PartKey>(PART_KEYS[0]);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [oemOnly, setOemOnly] = useState(false);

  const currentReadyDate = readyDateOf(chosen);
  const gating = PART_KEYS.reduce((a, b) => (eta(chosen[a]) > eta(chosen[b]) ? a : b));
  const totalCost = PART_KEYS.reduce((s, k) => s + chosen[k].price, 0);

  const part = CATALOGUE[selectedPart];
  const isGating = selectedPart === gating;
  const othersGatingEta = Math.max(
    ...PART_KEYS.filter((k) => k !== selectedPart).map((k) => eta(chosen[k])),
  );
  const slackDays = isGating
    ? 0
    : Math.max(0, Math.round((othersGatingEta - eta(chosen[selectedPart])) / dayMs));

  const rows = part.options.map((option) => {
    const newReadyDate = readyDateOf({ ...chosen, [selectedPart]: option });
    return {
      option,
      blocked: oemOnly && !option.oem,
      isChosen:
        option.company === chosen[selectedPart].company &&
        option.speed === chosen[selectedPart].speed,
      costDelta: option.price - chosen[selectedPart].price,
      newReadyDate,
      dateDeltaDays: daysBetween(newReadyDate, currentReadyDate),
    };
  });

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

  function applyBasket() {
    sessionStorage.setItem(
      "partly:chosenBasket",
      JSON.stringify({
        parts: basketToTimelineParts({
          chosen,
          cost: totalCost,
          readyDate: currentReadyDate,
          gatingPart: gating,
        }),
        label: `Supplier picks — $${totalCost}, ready ${fmt(currentReadyDate)}`,
      }),
    );
    router.push("/track");
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Supplier detail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scheduling uses each supplier&apos;s delivery history, not their promise — a supplier
            that promises early and misses is not actually early.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {(
              [
                ["best", "Best"],
                ["cheapest", "Cheapest"],
                ["soonest", "Soonest"],
              ] as [SortMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  sortMode === mode
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={oemOnly}
              onChange={(e) => setOemOnly(e.target.checked)}
            />
            OEM only
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left rail — parts on this job */}
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Parts on this job
          </p>
          <div className="space-y-1">
            {PART_KEYS.map((key) => {
              const active = key === selectedPart;
              const partIsGating = key === gating;
              const others = Math.max(
                ...PART_KEYS.filter((k) => k !== key).map((k) => eta(chosen[k])),
              );
              const slack = partIsGating
                ? 0
                : Math.max(0, Math.round((others - eta(chosen[key])) / dayMs));
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPart(key)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-indigo-600" : "hover:bg-slate-50"
                  }`}
                >
                  <p className={`text-sm font-medium ${active ? "text-white" : "text-slate-900"}`}>
                    {CATALOGUE[key].name}
                  </p>
                  <p
                    className={`text-xs ${
                      active
                        ? "text-indigo-100"
                        : partIsGating
                          ? "text-amber-600"
                          : "text-slate-500"
                    }`}
                  >
                    {partIsGating ? "Gating" : `${slack}d slack`} · ${chosen[key].price}
                  </p>
                </button>
              );
            })}

            {UNCONFIRMED_PARTS.map((p) => (
              <div key={p.name} className="rounded-lg px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-amber-600">Unconfirmed · ${p.estimate}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* Right pane — selected part detail */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{part.name}</h2>
          <p className="text-sm text-slate-500">
            {part.partNumber} · callout {part.hotspot.code} ·{" "}
            {isGating ? (
              <span className="text-amber-600">gating, no slack</span>
            ) : (
              <span className="text-green-600">{slackDays}d slack</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {isGating
              ? "Every day here is a day on the car."
              : `Anything landing before ${fmt(new Date(othersGatingEta))} is equally good.`}
          </p>

          <div className="mt-4">
            <DiagramPane hotspot={part.hotspot} />
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {sorted.map((row) => {
              const { option, blocked, isChosen, costDelta, newReadyDate, dateDeltaDays } = row;
              const absCost = Math.abs(costDelta);
              const costWord =
                costDelta > 0
                  ? `$${absCost} more`
                  : costDelta < 0
                    ? `$${absCost} less`
                    : "same price";

              let verdict: string;
              if (isChosen) verdict = "Chosen";
              else if (blocked) verdict = "Blocked by OEM-only";
              else if (dateDeltaDays !== 0)
                verdict = `${costWord} → pickup ${fmt(newReadyDate)} (${Math.abs(dateDeltaDays)} day${
                  Math.abs(dateDeltaDays) === 1 ? "" : "s"
                } ${dateDeltaDays < 0 ? "sooner" : "later"})`;
              else verdict = `${costWord}, no date benefit`;

              const noBenefit = !isChosen && !blocked && dateDeltaDays === 0 && costDelta > 0;
              const slipsPromise = option.eta !== option.promisedEta;

              return (
                <button
                  key={option.company + option.speed}
                  onClick={() =>
                    !blocked && !isChosen && setChosen((p) => ({ ...p, [selectedPart]: option }))
                  }
                  disabled={blocked}
                  className={`flex w-full items-start justify-between gap-4 py-3 text-left transition-colors ${
                    blocked
                      ? "cursor-not-allowed opacity-40"
                      : noBenefit
                        ? "opacity-60 hover:opacity-90"
                        : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {option.company} · {option.oem ? "OEM" : "aftermarket"}
                      {blocked && <Lock className="ml-1 inline h-3 w-3 text-slate-400" />}
                    </p>
                    <p className="text-xs text-slate-500">
                      {option.speed} · promised {fmt(new Date(option.promisedEta))}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        option.returnRate || slipsPromise ? "text-amber-600" : "text-green-600"
                      }`}
                    >
                      {option.returnRate
                        ? `${Math.round(option.returnRate * 100)}% returned for fitment issues`
                        : slipsPromise
                          ? `On time ${Math.round(option.onTimeRate * 100)}% · expect ${fmt(new Date(option.eta))}`
                          : `On time ${Math.round(option.onTimeRate * 100)}% across ${option.orderCount} orders`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900">${option.price}</p>
                    <p
                      className={`text-xs ${
                        isChosen
                          ? "font-medium text-indigo-600"
                          : blocked
                            ? "text-slate-400"
                            : "text-slate-500"
                      }`}
                    >
                      {verdict}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-lg font-bold text-slate-900">${totalCost}</p>
          <p className="text-sm text-slate-600">Ready {fmt(currentReadyDate)}</p>
        </div>
        <button
          onClick={applyBasket}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Apply this basket
        </button>
      </div>
    </main>
  );
}
