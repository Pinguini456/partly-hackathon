"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ImageOff,
  Package,
  Star,
  Truck,
} from "lucide-react";
import { WorkflowSteps } from "@/src/components/WorkflowSteps";
import {
  buildOptions,
  optionKey,
  SupplierOption,
} from "@/src/lib/supplierOptions";

type PartsResponse = {
  id: string[];
  name: string[];
  image: string[];
};

type Part = {
  id: string;
  name: string;
  image: string;
};

type SortKey = "price" | "rating" | "shipping";
type SortDirection = "asc" | "desc";

export default function PartsPage() {
  const router = useRouter();

  const [parts, setParts] = useState<Part[] | null>(null);
  const [missing, setMissing] = useState(false);

  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    const raw = sessionStorage.getItem("partly:parts");
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      const data: PartsResponse = JSON.parse(raw);
      const zipped: Part[] = data.id.map((id, i) => ({
        id,
        name: data.name[i] ?? id,
        image: data.image[i] ?? "",
      }));
      setParts(zipped);
      setActivePartId(zipped[0]?.id ?? null);
    } catch {
      setMissing(true);
    }

    const rawSelections = sessionStorage.getItem("partly:selections");
    if (rawSelections) {
      try {
        setSelections(JSON.parse(rawSelections));
      } catch {
        // Ignore malformed/stale selection data.
      }
    }
  }, []);

  // Keep chosen suppliers in sessionStorage so they survive navigating to
  // the order page (and back) without needing to re-select anything.
  useEffect(() => {
    sessionStorage.setItem("partly:selections", JSON.stringify(selections));
  }, [selections]);

  const optionsByPart = useMemo(() => {
    const map: Record<string, SupplierOption[]> = {};
    parts?.forEach((part) => {
      map[part.id] = buildOptions(part.id || part.name);
    });
    return map;
  }, [parts]);

  const activePart = parts?.find((p) => p.id === activePartId) ?? null;
  const activeOptions = activePart ? optionsByPart[activePart.id] ?? [] : [];

  const sortedOptions = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...activeOptions].sort((a, b) => {
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "rating") return (a.rating - b.rating) * dir;
      return (a.shippingDays - b.shippingDays) * dir;
    });
  }, [activeOptions, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function selectOption(partId: string, supplier: string) {
    setSelections((prev) => ({ ...prev, [partId]: supplier }));
  }

  if (missing) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
          <div>
            <p className="text-slate-500">
              No parts data found. Go back and analyse an inspection first.
            </p>
            <button
                onClick={() => router.push("/")}
                className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
            >
              Back to upload
            </button>
          </div>
        </main>
    );
  }

  if (!parts) return null;

  const selectedCount = Object.keys(selections).length;
  const orderTotal = parts.reduce((sum, part) => {
    const chosen = selections[part.id];
    if (!chosen) return sum;
    const option = optionsByPart[part.id]?.find((o) => o.supplier === chosen);
    return sum + (option?.price ?? 0);
  }, 0);

  return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-8 py-6">
            <button
                onClick={() => router.push("/")}
                className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to upload
            </button>
            <h1 className="text-3xl font-semibold text-slate-900">Select Parts</h1>
            <p className="mt-2 text-slate-600">
              Choose a supplier for each identified part.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-8 pt-10">
          <WorkflowSteps current={3} />
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-8 pb-10 md:grid-cols-[260px_1fr]">
          {/* Left: parts list */}
          <aside className="h-fit rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="px-2 pb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Identified parts
            </h2>
            <div className="space-y-1">
              {parts.map((part) => {
                const isActive = part.id === activePartId;
                const isChosen = Boolean(selections[part.id]);
                return (
                    <button
                        key={part.id}
                        onClick={() => setActivePartId(part.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                            isActive
                                ? "bg-indigo-50 text-indigo-700"
                                : "text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                        {part.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={part.image}
                                alt={part.name}
                                className="h-full w-full object-contain"
                            />
                        ) : (
                            <Package className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <span className="flex-1 truncate text-sm font-medium">
                    {part.name}
                  </span>
                      {isChosen && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      )}
                    </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-3">
              <p className="text-xs text-slate-500">
                {selectedCount} of {parts.length} parts selected
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                ${orderTotal}
              </p>
            </div>

            <button
                onClick={() => router.push("/order")}
                disabled={selectedCount === 0}
                className="mt-4 w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              Proceed to Order
            </button>
          </aside>

          {/* Right: active part + options */}
          <section>
            {activePart && (
                <>
                  <div className="flex flex-col items-center rounded-xl border bg-white p-6 shadow-sm">
                    <div className="flex h-80 w-full max-w-xl items-center justify-center overflow-hidden rounded-lg sm:h-[28rem]">
                      {activePart.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                              src={activePart.image}
                              alt={activePart.name}
                              className="h-full w-full object-contain"
                          />
                      ) : (
                          <ImageOff className="h-12 w-12 text-slate-300" />
                      )}
                    </div>
                    <div className="mt-5 text-center">
                      <p className="text-sm text-slate-500">Part needed</p>
                      <h2 className="text-2xl font-semibold text-slate-900">
                        {activePart.name}
                      </h2>
                      {selections[activePart.id] && (
                          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Ordering from {selections[activePart.id]}
                          </p>
                      )}
                    </div>
                  </div>

                  {/* Sort controls */}
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <ArrowUpDown className="h-4 w-4" />
                  Sort by
                </span>
                    {(
                        [
                          { key: "price", label: "Price" },
                          { key: "rating", label: "Store rating" },
                          { key: "shipping", label: "Shipping time" },
                        ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => toggleSort(key)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                                sortKey === key
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                            }`}
                        >
                          {label}
                          {sortKey === key && (sortDirection === "asc" ? " ↑" : " ↓")}
                        </button>
                    ))}
                  </div>

                  {/* Options */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {sortedOptions.map((option) => {
                      const isSelected = selections[activePart.id] === option.supplier;
                      return (
                          <button
                              key={optionKey(option)}
                              onClick={() => selectOption(activePart.id, option.supplier)}
                              className={`rounded-xl border-2 p-5 text-left shadow-sm transition ${
                                  isSelected
                                      ? "border-indigo-600 bg-indigo-50"
                                      : "border-slate-200 bg-white hover:border-indigo-300"
                              }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {option.supplier}
                                </p>
                                <span
                                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                        option.type === "OEM"
                                            ? "bg-indigo-100 text-indigo-700"
                                            : "bg-amber-100 text-amber-700"
                                    }`}
                                >
                            {option.type}
                          </span>
                              </div>
                              {isSelected && (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />
                              )}
                            </div>

                            <p className="mt-4 text-2xl font-bold text-slate-900">
                              ${option.price}
                            </p>

                            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {option.rating.toFixed(1)}
                        </span>
                              <span className="flex items-center gap-1">
                          <Truck className="h-4 w-4 text-slate-400" />
                                {option.shippingDays} day
                                {option.shippingDays === 1 ? "" : "s"}
                        </span>
                            </div>
                          </button>
                      );
                    })}
                  </div>
                </>
            )}
          </section>
        </div>
      </main>
  );
}