"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Star, Store, Truck } from "lucide-react";
import { WorkflowSteps } from "@/src/components/WorkflowSteps";
import { buildOptions, SupplierOption } from "@/src/lib/supplierOptions";

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

type OrderLine = {
    part: Part;
    option: SupplierOption;
};

export default function OrderPage() {
    const router = useRouter();

    const [parts, setParts] = useState<Part[] | null>(null);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [missing, setMissing] = useState(false);
    const [sendImagesToInsurer, setSendImagesToInsurer] = useState(false);

    useEffect(() => {
        const rawParts = sessionStorage.getItem("partly:parts");
        const rawSelections = sessionStorage.getItem("partly:selections");

        if (!rawParts || !rawSelections) {
            setMissing(true);
            return;
        }

        try {
            const data: PartsResponse = JSON.parse(rawParts);
            const zipped: Part[] = data.id.map((id, i) => ({
                id,
                name: data.name[i] ?? id,
                image: data.image[i] ?? "",
            }));
            const sel: Record<string, string> = JSON.parse(rawSelections);

            setParts(zipped);
            setSelections(sel);
        } catch {
            setMissing(true);
        }
    }, []);

    // Rebuild each part's supplier options from the same deterministic
    // generator used on the parts page, then keep only the parts that
    // actually have a chosen supplier.
    const orderLines = useMemo<OrderLine[]>(() => {
        if (!parts) return [];

        return parts
            .filter((part) => Boolean(selections[part.id]))
            .map((part) => {
                const options = buildOptions(part.id || part.name);
                const option = options.find(
                    (o) => o.supplier === selections[part.id]
                );
                return option ? { part, option } : null;
            })
            .filter((line): line is OrderLine => line !== null);
    }, [parts, selections]);

    const groupedByStore = useMemo(() => {
        const groups: Record<string, OrderLine[]> = {};
        orderLines.forEach((line) => {
            const store = line.option.supplier;
            if (!groups[store]) groups[store] = [];
            groups[store].push(line);
        });
        return groups;
    }, [orderLines]);

    const orderTotal = orderLines.reduce(
        (sum, line) => sum + line.option.price,
        0
    );

    // Each store ships its items together, so a store's shipping time is the
    // slowest item in that store, and the whole order's shipping time is
    // whichever store takes the longest.
    const storeShippingDays = Object.fromEntries(
        Object.entries(groupedByStore).map(([store, lines]) => [
            store,
            Math.max(...lines.map((l) => l.option.shippingDays)),
        ])
    );

    const orderShippingDays = Object.values(storeShippingDays).length
        ? Math.max(...Object.values(storeShippingDays))
        : 0;

    // Each part's ETA is estimated from its supplier's shipping time, counted
    // from the moment the order is placed. The timeline page uses this to
    // compute pickup date, so both start out equal (no slip yet).
    function placeOrder() {
        const dayMs = 86400000;
        const orderedParts = orderLines.map(({ part, option }) => {
            const etaISO = new Date(Date.now() + option.shippingDays * dayMs)
                .toISOString()
                .slice(0, 10);
            return { id: part.id, name: part.name, eta: etaISO, originalEta: etaISO };
        });
        sessionStorage.setItem("partly:orderedParts", JSON.stringify(orderedParts));
        router.push("/repair-timeline");
    }

    if (missing) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
                <div>
                    <p className="text-slate-500">
                        No order data found. Go back and select parts first.
                    </p>
                    <button
                        onClick={() => router.push("/parts")}
                        className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
                    >
                        Back to parts
                    </button>
                </div>
            </main>
        );
    }

    if (!parts) return null;

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <header className="border-b bg-white">
                <div className="mx-auto max-w-6xl px-8 py-6">
                    <button
                        onClick={() => router.push("/parts")}
                        className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to parts
                    </button>
                    <h1 className="text-3xl font-semibold text-slate-900">Order</h1>
                    <p className="mt-2 text-slate-600">
                        Review your order, organised by store.
                    </p>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-8 pt-10">
                <WorkflowSteps current={4} />
            </div>

            <div className="mx-auto max-w-6xl px-8 pb-10">
                {orderLines.length === 0 ? (
                    <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
                        <p className="text-slate-500">
                            No parts selected yet. Go back and choose a supplier for
                            at least one part.
                        </p>
                        <button
                            onClick={() => router.push("/parts")}
                            className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
                        >
                            Choose parts
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
                        {/* Left: order lines grouped by store */}
                        <div className="space-y-6">
                            {Object.entries(groupedByStore).map(([store, lines]) => {
                                const storeTotal = lines.reduce(
                                    (sum, l) => sum + l.option.price,
                                    0
                                );
                                return (
                                    <section
                                        key={store}
                                        className="rounded-xl border bg-white p-6 shadow-sm"
                                    >
                                        <div className="flex items-center justify-between border-b pb-4">
                                            <div className="flex items-center gap-2">
                                                <Store className="h-5 w-5 text-indigo-600" />
                                                <h2 className="text-lg font-semibold text-slate-900">
                                                    {store}
                                                </h2>
                                            </div>
                                            <span className="text-sm text-slate-500">
                          {lines.length} item{lines.length === 1 ? "" : "s"}
                        </span>
                                        </div>

                                        <div className="mt-4 space-y-4">
                                            {lines.map(({ part, option }) => (
                                                <div
                                                    key={part.id}
                                                    className="flex items-center justify-between gap-4"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-100">
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
                                                        <div>
                                                            <p className="font-medium text-slate-900">
                                                                {part.name}
                                                            </p>
                                                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                    <span
                                        className={`rounded-full px-2 py-0.5 font-medium ${
                                            option.type === "OEM"
                                                ? "bg-indigo-100 text-indigo-700"
                                                : "bg-amber-100 text-amber-700"
                                        }`}
                                    >
                                      {option.type}
                                    </span>
                                                                <span className="flex items-center gap-1">
                                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                                                    {option.rating.toFixed(1)}
                                    </span>
                                                                <span className="flex items-center gap-1">
                                      <Truck className="h-3.5 w-3.5" />
                                                                    {option.shippingDays} day
                                                                    {option.shippingDays === 1 ? "" : "s"}
                                    </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="font-semibold text-slate-900">
                                                        ${option.price}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
                            <span className="flex items-center gap-1 text-slate-500">
                              <Truck className="h-4 w-4" />
                              Shipping time
                            </span>
                                            <span className="font-semibold text-slate-900">
                              {storeShippingDays[store]} day
                                                {storeShippingDays[store] === 1 ? "" : "s"}
                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-sm">
                                            <span className="text-slate-500">Store subtotal</span>
                                            <span className="font-semibold text-slate-900">
                              ${storeTotal}
                            </span>
                                        </div>
                                    </section>
                                );
                            })}
                        </div>

                        {/* Right: order summary */}
                        <aside className="h-fit rounded-xl border bg-white p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Order summary
                            </h2>

                            <div className="mt-4 space-y-2 text-sm text-slate-600">
                                <div className="flex items-center justify-between">
                                    <span>Parts</span>
                                    <span>{orderLines.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Stores</span>
                                    <span>{Object.keys(groupedByStore).length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5" />
                        Shipping time
                      </span>
                                    <span>
                        {orderShippingDays} day
                                        {orderShippingDays === 1 ? "" : "s"}
                      </span>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t pt-4">
                                <span className="font-medium text-slate-900">Total</span>
                                <span className="text-xl font-bold text-slate-900">
                      ${orderTotal}
                    </span>
                            </div>

                            <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={sendImagesToInsurer}
                                    onChange={(e) =>
                                        setSendImagesToInsurer(e.target.checked)
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Send images to insurer
                            </label>

                            <button
                                type="button"
                                onClick={placeOrder}
                                className="mt-6 w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
                            >
                                Place Order
                            </button>

                            <button
                                onClick={() => router.push("/parts")}
                                className="mt-3 w-full rounded-lg border border-slate-200 py-3 font-medium text-slate-700 hover:border-indigo-300"
                            >
                                Change Parts
                            </button>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}