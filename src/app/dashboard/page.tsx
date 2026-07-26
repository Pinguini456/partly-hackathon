"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    CheckCircle2,
    Clock,
    KeyRound,
    Package,
    Plus,
    Trash2,
    Truck,
    Wrench,
} from "lucide-react";
import { deleteOrder, listOrders, ManualStage, StoredOrder } from "@/src/lib/orderStore";

// Same gating-part scheduling logic used on the order and timeline pages —
// duplicated here (rather than imported) so this card view stays a cheap,
// read-only projection and never needs to touch simulation state.
const dayMs = 86400000;
const LABOUR_DAYS = 2;

function nextWorkingDay(date: Date) {
    const d = new Date(date);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
}

function fmt(date: Date) {
    return date.toLocaleDateString("en-NZ", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
}

function readyDateFor(order: StoredOrder): Date {
    const gatingEta = Math.max(...order.parts.map((p) => +new Date(p.eta)));
    return nextWorkingDay(new Date(gatingEta + LABOUR_DAYS * dayMs));
}

const STAGE_ORDER: ManualStage[] = [
    "damage_assessed",
    "parts_ordered",
    "parts_arrived",
    "in_bay",
    "ready",
];

const STAGE_META: Record<
    ManualStage,
    { label: string; icon: React.ReactNode; className: string }
> = {
    damage_assessed: {
        label: "Damage assessed",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        className: "bg-slate-100 text-slate-600",
    },
    parts_ordered: {
        label: "Parts ordered",
        icon: <Package className="h-3.5 w-3.5" />,
        className: "bg-slate-100 text-slate-600",
    },
    parts_arrived: {
        label: "Parts arrived",
        icon: <Truck className="h-3.5 w-3.5" />,
        className: "bg-indigo-100 text-indigo-700",
    },
    in_bay: {
        label: "In the bay",
        icon: <Wrench className="h-3.5 w-3.5" />,
        className: "bg-indigo-100 text-indigo-700",
    },
    ready: {
        label: "Ready for pickup",
        icon: <KeyRound className="h-3.5 w-3.5" />,
        className: "bg-green-100 text-green-700",
    },
};

// Last stage with a timestamp, in stage order — i.e. what the order is
// *currently* at, not just whichever key happens to be set.
function currentStage(order: StoredOrder): ManualStage | null {
    let current: ManualStage | null = null;
    for (const stage of STAGE_ORDER) {
        if (order.doneAt[stage]) current = stage;
    }
    return current;
}

export default function DashboardPage() {
    const router = useRouter();
    const [orders, setOrders] = useState<StoredOrder[] | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    useEffect(() => {
        setOrders(listOrders());
    }, []);

    function handleDelete(id: string) {
        deleteOrder(id);
        setOrders((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
        setConfirmingId(null);
    }

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <header className="border-b bg-white">
                <div className="mx-auto max-w-6xl px-8 py-6">
                    <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-8 py-10">
                <div className="mb-6 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        {orders === null
                            ? "Loading…"
                            : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/track")}
                            className="text-sm text-slate-500 hover:text-indigo-600"
                        >
                            Staff orders board →
                        </button>
                        <button
                            onClick={() => router.push("/")}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            <Plus className="h-4 w-4" />
                            New inspection
                        </button>
                    </div>
                </div>

                {orders !== null && orders.length === 0 && (
                    <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
                        <Package className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-4 text-slate-500">
                            No orders yet. Upload an inspection to create your first one.
                        </p>
                        <button
                            onClick={() => router.push("/")}
                            className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
                        >
                            Start an inspection
                        </button>
                    </div>
                )}

                {orders !== null && orders.length > 0 && (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {orders.map((order) => {
                            const stage = currentStage(order);
                            const meta = stage ? STAGE_META[stage] : null;
                            const readyDate = readyDateFor(order);
                            const originalReadyDate = new Date(order.originalReadyDate);
                            const slipped = +readyDate !== +originalReadyDate;
                            const partNames = order.parts.map((p) => p.name);
                            const shownParts = partNames.slice(0, 3);
                            const extraCount = partNames.length - shownParts.length;
                            const confirming = confirmingId === order.id;

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => router.push(`/repair-timeline?order=${order.id}`)}
                                    className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-slate-900">
                                                {order.vehicleLabel}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Order #{order.id.replace(/-/g, "").slice(0, 8).toUpperCase()} ·{" "}
                                                {new Date(order.createdAt).toLocaleDateString("en-NZ", {
                                                    day: "numeric",
                                                    month: "short",
                                                })}
                                            </p>
                                        </div>

                                        {confirming ? (
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex shrink-0 items-center gap-1"
                                            >
                                                <button
                                                    onClick={() => handleDelete(order.id)}
                                                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                                                >
                                                    Delete
                                                </button>
                                                <button
                                                    onClick={() => setConfirmingId(null)}
                                                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmingId(order.id);
                                                }}
                                                aria-label="Delete order"
                                                className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    {meta && (
                                        <span
                                            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
                                        >
                                            {meta.icon}
                                            {meta.label}
                                        </span>
                                    )}

                                    <div className="mt-4 space-y-1.5">
                                        {shownParts.map((name, i) => (
                                            <div
                                                key={`${name}-${i}`}
                                                className="flex items-center gap-2 text-sm text-slate-600"
                                            >
                                                <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                <span className="truncate">{name}</span>
                                            </div>
                                        ))}
                                        {extraCount > 0 && (
                                            <p className="pl-5 text-xs text-slate-400">
                                                +{extraCount} more part{extraCount === 1 ? "" : "s"}
                                            </p>
                                        )}
                                        {partNames.length === 0 && (
                                            <p className="text-sm text-slate-400">No parts on this order.</p>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span className={slipped ? "font-medium text-amber-600" : ""}>
                                                {fmt(readyDate)}
                                            </span>
                                            {slipped && (
                                                <span className="text-slate-400 line-through">
                                                    {fmt(originalReadyDate)}
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-semibold text-slate-900">${order.total}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
