"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    CheckCircle2,
    Circle,
    Truck,
    Wrench,
    KeyRound,
    MessageCircle,
    Clock,
} from "lucide-react";

// --- Gating-part scheduling logic -------------------------------------

const dayMs = 86400000;
const eta = (p: { eta: string }) => +new Date(p.eta);

const gatingPart = <T extends { eta: string }>(parts: T[]) =>
    parts.reduce((a, b) => (eta(a) > eta(b) ? a : b));

const readyDate = (parts: { eta: string }[], labourDays: number) =>
    new Date(eta(gatingPart(parts)) + labourDays * dayMs);

const slack = <T extends { eta: string }>(part: T, parts: T[]) => {
    const others = parts.filter((p) => p !== part);
    if (!others.length) return 0;
    return Math.max(0, (eta(gatingPart(others)) - eta(part)) / dayMs);
};

const applyDelay = <T extends { eta: string }>(part: T, parts: T[], days: number) => {
    const absorbed = Math.min(days, slack(part, parts));
    part.eta = new Date(eta(part) + days * dayMs).toISOString().slice(0, 10);
    return { slips: days - absorbed, absorbed };
};

// No supplier delivers and no shop works a weekend — roll any customer-facing
// date forward off Sat/Sun rather than doing naive calendar-day addition.
// Uses UTC accessors throughout since ISO date-only strings parse as UTC
// midnight; mixing that with local getDay()/setDate() shifts the apparent
// weekday by a day in any timezone behind UTC.
function nextWorkingDay(date: Date) {
    const d = new Date(date);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
}

// --- Setup -----------------------------------------------------------

const LABOUR_DAYS = 2;

type Part = { id: string; name: string; eta: string; originalEta: string };

type ManualStage = "damage_assessed" | "parts_ordered" | "parts_arrived" | "in_bay" | "ready";
const MANUAL_STAGES: { key: ManualStage; label: string; actionLabel: string }[] = [
    { key: "damage_assessed", label: "Damage assessed", actionLabel: "Mark Damage Assessed" },
    { key: "parts_ordered", label: "Parts ordered", actionLabel: "Mark Parts Ordered" },
    { key: "parts_arrived", label: "Parts arrived", actionLabel: "Mark Parts Arrived" },
    { key: "in_bay", label: "In the bay", actionLabel: "Mark In The Bay" },
    { key: "ready", label: "Ready for pickup", actionLabel: "Mark Ready For Pickup" },
];

function fmt(date: Date) {
    return date.toLocaleDateString("en-NZ", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
}

type Notification = { text: string; at: Date };

export default function RepairTimelinePage() {
    const router = useRouter();

    const [parts, setParts] = useState<Part[] | null>(null);
    const [missing, setMissing] = useState(false);
    const [originalReadyDate, setOriginalReadyDate] = useState<Date | null>(null);
    const [doneAt, setDoneAt] = useState<Partial<Record<ManualStage, Date>>>({});
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [notifyOnStage, setNotifyOnStage] = useState(true);

    // Pull in whatever the order page just placed. Damage assessment and
    // parts-ordering already happened to get here, so both stages start done.
    useEffect(() => {
        const raw = sessionStorage.getItem("partly:orderedParts");
        if (!raw) {
            setMissing(true);
            return;
        }
        try {
            const orderedParts: Part[] = JSON.parse(raw);
            if (!orderedParts.length) {
                setMissing(true);
                return;
            }
            setParts(orderedParts);
            setOriginalReadyDate(nextWorkingDay(readyDate(orderedParts, LABOUR_DAYS)));
            const now = new Date();
            setDoneAt({ damage_assessed: now, parts_ordered: now });
            setNotifications([
                {
                    text: "Hi! We've assessed the damage and are putting together your job card.",
                    at: now,
                },
                {
                    text: "Good news — the parts needed for your repair have been ordered.",
                    at: now,
                },
            ]);
        } catch {
            setMissing(true);
        }
    }, []);

    if (missing) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
                <div>
                    <p className="text-slate-500">
                        No order found. Place an order first to see its live repair timeline.
                    </p>
                    <button
                        onClick={() => router.push("/order")}
                        className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
                    >
                        Back to order
                    </button>
                </div>
            </main>
        );
    }

    if (!parts || !originalReadyDate) return null;

    const gating = gatingPart(parts);
    const currentReadyDate = nextWorkingDay(readyDate(parts, LABOUR_DAYS));
    const hasSlip = +currentReadyDate !== +originalReadyDate;
    const gatingDelayDays = Math.round(
        (eta(gating) - eta({ eta: gating.originalEta })) / dayMs,
    );

    const nextManualStage = MANUAL_STAGES.find((s) => !doneAt[s.key]);

    function delayPart(partId: string, days: number) {
        setParts((prev) => {
            if (!prev) return prev;
            const before = nextWorkingDay(readyDate(prev, LABOUR_DAYS));
            const next = prev.map((p) => ({ ...p }));
            const part = next.find((p) => p.id === partId)!;
            applyDelay(part, next, days);
            const after = nextWorkingDay(readyDate(next, LABOUR_DAYS));

            if (+after !== +before) {
                const newGating = gatingPart(next);
                const slipDays = Math.round(
                    (eta(newGating) - eta({ eta: newGating.originalEta })) / dayMs,
                );
                setNotifications((prevN) => [
                    ...prevN,
                    {
                        text: `Hi Sam — your ${newGating.name.toLowerCase()} is running ${slipDays} day${
                            slipDays === 1 ? "" : "s"
                        } late from the supplier, so pickup moves to ${fmt(
                            after,
                        )}. Nothing else changed. We'll text you when it's in the bay.`,
                        at: new Date(),
                    },
                ]);
            }

            return next;
        });
    }

    function completeManualStage(stage: ManualStage) {
        setDoneAt((prev) => ({ ...prev, [stage]: new Date() }));

        if (!notifyOnStage) return;
        const canned: Record<ManualStage, string> = {
            damage_assessed:
                "Hi! We've assessed the damage and are putting together your job card.",
            parts_ordered: "Good news — the parts needed for your repair have been ordered.",
            parts_arrived:
                "All your parts have arrived at the shop — your vehicle is next in for the bay.",
            in_bay: "Your vehicle is now in the workshop and repairs have started.",
            ready: "🎉 Your vehicle is ready for pickup!",
        };
        setNotifications((prev) => [...prev, { text: canned[stage], at: new Date() }]);
    }

    const waitingOnPartsStatus: "done" | "current" | "upcoming" = doneAt.parts_arrived
        ? "done"
        : doneAt.parts_ordered
            ? "current"
            : "upcoming";

    const waitingOnPartsEta = nextWorkingDay(new Date(eta(gating)));
    const inBayEta = nextWorkingDay(new Date(eta(gating) + dayMs));

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-8 py-10">
                <h1 className="text-2xl font-semibold text-slate-900">Live Repair Timeline</h1>
                <p className="mt-1 text-slate-500">
                    Pickup date is set by whichever part is running latest — the others have room to
                    run a little late too, without pushing pickup back.
                </p>

                <div className="mt-8 grid gap-6 md:grid-cols-2">
                    {/* Staff panel */}
                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-900">Shop staff view</h2>

                        <div className="mt-5">
                            <h3 className="text-sm font-semibold text-slate-700">Parts on order</h3>
                            <div className="mt-2 space-y-2">
                                {parts.map((part) => {
                                    const isGating = part.id === gating.id;
                                    const slipped = part.eta !== part.originalEta;
                                    const partSlack = Math.round(slack(part, parts));
                                    return (
                                        <div
                                            key={part.id}
                                            className={`rounded-lg border p-3 ${
                                                isGating ? "border-amber-300 bg-amber-50" : "border-slate-200"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            {part.name}
                          </span>
                                                    {isGating ? (
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Sets the pickup date
                            </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Can run {partSlack}d late, no impact
                            </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-500">
                          ETA {fmt(new Date(part.eta))}
                                                    {slipped && (
                                                        <span className="ml-1 text-amber-600">
                              (was {fmt(new Date(part.originalEta))})
                            </span>
                                                    )}
                        </span>
                                            </div>
                                            <div className="mt-2 flex gap-2">
                                                <button
                                                    onClick={() => delayPart(part.id, 1)}
                                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                                >
                                                    Delay 1 day
                                                </button>
                                                <button
                                                    onClick={() => delayPart(part.id, 3)}
                                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                                >
                                                    Delay 3 days
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={notifyOnStage}
                                onChange={(e) => setNotifyOnStage(e.target.checked)}
                            />
                            Notify customer on stage updates
                        </label>

                        <div className="mt-3 space-y-3">
                            {MANUAL_STAGES.map((stage) => {
                                const done = doneAt[stage.key];
                                const isNext = nextManualStage?.key === stage.key;
                                return (
                                    <div
                                        key={stage.key}
                                        className={`rounded-lg border p-4 ${
                                            done ? "border-green-200 bg-green-50" : isNext ? "border-indigo-300" : "opacity-50"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-slate-900">{stage.label}</span>
                                            {done && (
                                                <span className="text-xs text-slate-500">{done.toLocaleTimeString()}</span>
                                            )}
                                        </div>
                                        {isNext && (
                                            <button
                                                onClick={() => completeManualStage(stage.key)}
                                                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                            >
                                                {stage.actionLabel}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Customer panel */}
                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-900">Customer view</h2>

                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-slate-900">{fmt(currentReadyDate)}</span>
                            {hasSlip && (
                                <span className="text-slate-400 line-through">{fmt(originalReadyDate)}</span>
                            )}
                        </div>

                        {hasSlip && (
                            <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                <div>
                                    <p className="text-sm font-medium text-amber-800">
                                        {gating.name} delayed {gatingDelayDays} day{gatingDelayDays === 1 ? "" : "s"}
                                    </p>
                                    <p className="text-xs text-amber-700">
                                        Everything else is on track — pickup moves with this part.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="mt-5 space-y-4">
                            <TimelineRow
                                activeIcon={<CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                                label="Damage assessed"
                                status={doneAt.damage_assessed ? "done" : nextManualStage?.key === "damage_assessed" ? "current" : "upcoming"}
                                date={doneAt.damage_assessed ?? new Date()}
                            />
                            <TimelineRow
                                activeIcon={<CheckCircle2 className="h-5 w-5 text-indigo-500" />}
                                label="Parts ordered"
                                status={doneAt.parts_ordered ? "done" : nextManualStage?.key === "parts_ordered" ? "current" : "upcoming"}
                                date={doneAt.parts_ordered ?? new Date()}
                            />
                            <TimelineRow
                                activeIcon={<Truck className="h-5 w-5 text-indigo-500" />}
                                label="Waiting on parts"
                                status={waitingOnPartsStatus}
                                date={waitingOnPartsEta}
                            />
                            <TimelineRow
                                activeIcon={<Wrench className="h-5 w-5 text-indigo-500" />}
                                label="In the bay"
                                status={doneAt.in_bay ? "done" : nextManualStage?.key === "in_bay" ? "current" : "upcoming"}
                                date={doneAt.in_bay ?? inBayEta}
                            />
                            <TimelineRow
                                activeIcon={<KeyRound className="h-5 w-5 text-indigo-500" />}
                                label="Ready for pickup"
                                status={doneAt.ready ? "done" : nextManualStage?.key === "ready" ? "current" : "upcoming"}
                                date={doneAt.ready ?? currentReadyDate}
                            />
                        </div>

                        <div className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                <MessageCircle className="h-4 w-4 text-indigo-600" />
                                Text messages
                            </div>
                            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                                {notifications.length === 0 && (
                                    <p className="text-sm text-slate-500">No messages sent yet.</p>
                                )}
                                {notifications.map((n, i) => (
                                    <div
                                        key={i}
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                    >
                                        {n.text}
                                        <div className="mt-1 text-[10px] text-slate-400">
                                            {n.at.toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function TimelineRow({
                         activeIcon,
                         label,
                         status,
                         date,
                     }: {
    activeIcon: React.ReactNode;
    label: string;
    status: "done" | "current" | "upcoming";
    date?: Date;
}) {
    const icon =
        status === "done" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : status === "current" ? (
            activeIcon
        ) : (
            <Circle className="h-5 w-5 shrink-0 text-slate-300" />
        );

    return (
        <div className="flex items-start gap-3">
            {icon}
            <div>
                <p
                    className={`font-medium ${
                        status === "done"
                            ? "text-slate-500"
                            : status === "current"
                                ? "text-indigo-700"
                                : "text-slate-400"
                    }`}
                >
                    {label}
                </p>
                {date && <p className="text-xs text-slate-500">{fmt(date)}</p>}
            </div>
        </div>
    );
}