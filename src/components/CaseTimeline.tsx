"use client";

// The live job status for one case. This is a merge of two implementations
// that grew up in parallel: the data flow comes from the real order step
// (parts a repairer actually chose, with the supplier's risk-adjusted ETA),
// and the presentation — slack bars, the solver note, SMS-styled messages —
// comes from the demo timeline that had been polished separately.
//
// It lives inside the case rather than on its own route: the whole point of
// a case is that clicking it gets you everything about the job.

import { useState } from "react";
import {
    CheckCircle2,
    Circle,
    Truck,
    Wrench,
    KeyRound,
    MessageCircle,
    Clock,
    Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { dayMs, eta, fmt, nextWorkingDay, LABOUR_DAYS } from "@/src/lib/procurement";

export type TimelinePart = {
    id: string;
    name: string;
    /** Risk-adjusted arrival date, ISO date-only. */
    eta: string;
    /** What it was when the order was placed, so slip is visible. */
    originalEta: string;
};

const gatingOf = <T extends { eta: string }>(parts: T[]) =>
    parts.reduce((a, b) => (eta(a) > eta(b) ? a : b));

const readyDate = (parts: { eta: string }[], labourDays: number) =>
    new Date(eta(gatingOf(parts)) + labourDays * dayMs);

/** Days this part can slip before it starts moving the pickup date. */
const slackOf = <T extends { eta: string }>(part: T, parts: T[]) => {
    const others = parts.filter((p) => p !== part);
    if (!others.length) return 0;
    return Math.max(0, (eta(gatingOf(others)) - eta(part)) / dayMs);
};

const applyDelay = <T extends { eta: string }>(part: T, parts: T[], days: number) => {
    const absorbed = Math.min(days, slackOf(part, parts));
    part.eta = new Date(eta(part) + days * dayMs).toISOString().slice(0, 10);
    return { slips: days - absorbed, absorbed };
};

export type ManualStage =
    | "damage_assessed"
    | "parts_ordered"
    | "parts_arrived"
    | "in_bay"
    | "ready";

const MANUAL_STAGES: { key: ManualStage; label: string; actionLabel: string }[] = [
    { key: "damage_assessed", label: "Damage assessed", actionLabel: "Mark Damage Assessed" },
    { key: "parts_ordered", label: "Parts ordered", actionLabel: "Mark Parts Ordered" },
    { key: "parts_arrived", label: "Parts arrived", actionLabel: "Mark Parts Arrived" },
    { key: "in_bay", label: "In the bay", actionLabel: "Mark In The Bay" },
    { key: "ready", label: "Ready for pickup", actionLabel: "Mark Ready For Pickup" },
];

type Notification = { text: string; at: Date };
/** Staff-side record of what a delay actually did — including nothing. */
type SolverNote = { text: string; slipped: boolean; at: Date };

export function CaseTimeline({
    orderedParts,
    customerName,
    initialStage,
    onStageChange,
}: {
    orderedParts: TimelinePart[];
    customerName?: string | null;
    /** Stages up to and including this one start already done. */
    initialStage?: ManualStage;
    onStageChange?: (stage: ManualStage) => void;
}) {
    const firstName = (customerName ?? "").trim().split(/\s+/)[0] || "there";

    const [parts, setParts] = useState<TimelinePart[]>(() =>
        orderedParts.map((p) => ({ ...p })),
    );
    const [originalReadyDate] = useState(() =>
        nextWorkingDay(readyDate(orderedParts, LABOUR_DAYS)),
    );
    const [doneAt, setDoneAt] = useState<Partial<Record<ManualStage, Date>>>(() => {
        // Getting here means the damage was assessed and the parts were
        // ordered — those aren't buttons anyone still needs to press.
        const cutoff = MANUAL_STAGES.findIndex((s) => s.key === (initialStage ?? "parts_ordered"));
        const now = new Date();
        const seeded: Partial<Record<ManualStage, Date>> = {};
        MANUAL_STAGES.slice(0, cutoff + 1).forEach((s) => {
            seeded[s.key] = now;
        });
        return seeded;
    });
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [notifyOnStage, setNotifyOnStage] = useState(true);
    const [solverNote, setSolverNote] = useState<SolverNote | null>(null);

    const gating = gatingOf(parts);
    const currentReadyDate = nextWorkingDay(readyDate(parts, LABOUR_DAYS));
    const hasSlip = +currentReadyDate !== +originalReadyDate;
    const gatingDelayDays = Math.round(
        (eta(gating) - eta({ eta: gating.originalEta })) / dayMs,
    );

    const nextManualStage = MANUAL_STAGES.find((s) => !doneAt[s.key]);

    // One shared scale for the slack bars so 7d and 5d look different —
    // scaling each bar to its own slack made every part a full-width block.
    const maxOriginalSlack = Math.max(
        ...parts.map((p) => Math.round(slackOf({ ...p, eta: p.originalEta }, parts))),
        1,
    );

    // Computed outside the state updater on purpose: React updaters must be
    // pure, and in StrictMode they run twice — emitting notifications from
    // inside one made the customer thread double up.
    function delayPart(partId: string, days: number) {
        const beforeRaw = readyDate(parts, LABOUR_DAYS);
        const before = nextWorkingDay(beforeRaw);
        const next = parts.map((p) => ({ ...p }));
        const part = next.find((p) => p.id === partId)!;
        const slackBefore = Math.round(slackOf(part, next));
        const { absorbed } = applyDelay(part, next, days);
        const afterRaw = readyDate(next, LABOUR_DAYS);
        const after = nextWorkingDay(afterRaw);

        // Three distinct outcomes, and they are genuinely different things:
        // the part's own slack soaked it up; it overran its slack but the
        // extra days land on a weekend nobody was working anyway; or the
        // customer's date actually moves. Only the last one is worth a text.
        const scheduleMoved = +afterRaw !== +beforeRaw;
        const slipped = +after !== +before;

        setParts(next);

        if (scheduleMoved && !slipped) {
            setSolverNote({
                slipped: false,
                at: new Date(),
                text: `${part.name} ran ${days} day${
                    days === 1 ? "" : "s"
                } late and is gating, but those days fall over the weekend — pickup still lands on ${fmt(
                    after,
                )}. No message sent.`,
            });
            return;
        }

        if (slipped) {
            const newGating = gatingOf(next);
            const slipDays = Math.round(
                (eta(newGating) - eta({ eta: newGating.originalEta })) / dayMs,
            );
            setSolverNote({
                slipped: true,
                at: new Date(),
                text:
                    slackBefore === 0
                        ? `${part.name} was already the gating part and ran ${days} day${
                              days === 1 ? "" : "s"
                          } late — nothing else was holding the job, so pickup moves to ${fmt(
                              after,
                          )}. Customer notified.`
                        : `${part.name} overran its ${slackBefore} day${
                              slackBefore === 1 ? "" : "s"
                          } of slack — it's now the gating part. Pickup moves to ${fmt(
                              after,
                          )}. Customer notified.`,
            });
            setNotifications((prev) => [
                ...prev,
                {
                    text: `Hi ${firstName} — your ${newGating.name.toLowerCase()} is running ${slipDays} day${
                        slipDays === 1 ? "" : "s"
                    } late from the supplier, so pickup moves to ${fmt(
                        after,
                    )}. Nothing else changed. We'll text you when it's in the bay.`,
                    at: new Date(),
                },
            ]);
        } else {
            // The non-event still has to be visible, or it looks like the
            // model did nothing rather than deciding nothing needed doing.
            const remaining = Math.round(slackOf(part, next));
            setSolverNote({
                slipped: false,
                at: new Date(),
                text: `${absorbed} of ${slackBefore} day${
                    slackBefore === 1 ? "" : "s"
                } slack used on ${part.name}, ${remaining} remaining. Pickup unchanged — no message sent.`,
            });
        }
    }

    function completeManualStage(stage: ManualStage) {
        setDoneAt((prev) => ({ ...prev, [stage]: new Date() }));
        onStageChange?.(stage);

        if (!notifyOnStage) return;
        const canned: Record<ManualStage, string> = {
            damage_assessed: `Hi ${firstName}! We've assessed the damage and are putting together your job card.`,
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
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Staff panel */}
            <Card>
                <CardContent>
                    <h3 className="text-lg font-semibold text-foreground">Shop staff view</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pickup is set by whichever part runs latest. The others have room to
                        slip without moving it.
                    </p>

                    <div className="mt-5">
                        <h4 className="text-sm font-semibold text-foreground">Parts on order</h4>
                        <div className="mt-2 space-y-2">
                            {parts.map((part) => {
                                const isGating = part.id === gating.id;
                                const slipped = part.eta !== part.originalEta;
                                const partSlack = Math.round(slackOf(part, parts));
                                const originalSlack = Math.round(
                                    slackOf({ ...part, eta: part.originalEta }, parts),
                                );
                                const used = Math.max(0, originalSlack - partSlack);
                                const trackScale = maxOriginalSlack || 1;
                                // Always offer one button big enough to overrun this
                                // part's remaining slack, so every part can show both
                                // outcomes.
                                const breakingDelay = partSlack + 1;
                                return (
                                    <div
                                        key={part.id}
                                        className={`rounded-lg border p-3 transition-colors ${
                                            isGating ? "border-amber-300 bg-amber-50" : ""
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground">
                                                {part.name}{" "}
                                                {isGating ? (
                                                    <span className="text-amber-600">(gating)</span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        ({partSlack}d slack)
                                                    </span>
                                                )}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                ETA {fmt(new Date(part.eta))}
                                                {slipped && (
                                                    <span className="ml-1 text-amber-600">
                                                        (was {fmt(new Date(part.originalEta))})
                                                    </span>
                                                )}
                                            </span>
                                        </div>

                                        {/* Consumed vs remaining slack, so repeated
                                            clicks read as movement rather than an
                                            abstract number ticking down. */}
                                        <div className="mt-2 flex items-center gap-2">
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                                                <div className="flex h-full">
                                                    <div
                                                        className="h-full bg-amber-400"
                                                        style={{ width: `${(used / trackScale) * 100}%` }}
                                                    />
                                                    <div
                                                        className="h-full bg-green-500"
                                                        style={{
                                                            width: `${(partSlack / trackScale) * 100}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <span
                                                className={`w-24 shrink-0 text-right text-[10px] ${
                                                    isGating
                                                        ? "font-medium text-amber-600"
                                                        : "text-muted-foreground"
                                                }`}
                                            >
                                                {isGating
                                                    ? "no slack left"
                                                    : `${partSlack}d left${used ? ` · ${used}d used` : ""}`}
                                            </span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => delayPart(part.id, 1)}
                                            >
                                                Delay 1 day
                                            </Button>
                                            {/* Always offered, including on the gating
                                                part where it's the quickest way to show
                                                a date actually moving — a 1-day slip
                                                often just lands on the weekend. */}
                                            {breakingDelay !== 3 && (
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    onClick={() => delayPart(part.id, 3)}
                                                >
                                                    Delay 3 days
                                                </Button>
                                            )}
                                            {/* Only meaningful when it differs from the
                                                1-day button — a part with no slack
                                                already slips on 1. */}
                                            {breakingDelay > 1 && (
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    onClick={() => delayPart(part.id, breakingDelay)}
                                                    className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                                >
                                                    Delay {breakingDelay} days (overruns slack)
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {solverNote && (
                            <div
                                className={`mt-3 rounded-lg border p-3 text-xs ${
                                    solverNote.slipped
                                        ? "border-amber-300 bg-amber-50 text-amber-800"
                                        : "bg-muted text-muted-foreground"
                                }`}
                            >
                                <span className="font-medium">
                                    {solverNote.slipped ? "Date moved · " : "Absorbed · "}
                                </span>
                                {solverNote.text}
                            </div>
                        )}
                    </div>

                    <div className="mt-5 flex items-center gap-2">
                        <Checkbox
                            id="notify-on-stage"
                            checked={notifyOnStage}
                            onCheckedChange={(checked) => setNotifyOnStage(checked === true)}
                        />
                        <Label htmlFor="notify-on-stage" className="text-sm">
                            Notify customer on stage updates
                        </Label>
                    </div>

                    <div className="mt-3 space-y-3">
                        {MANUAL_STAGES.map((stage) => {
                            const done = doneAt[stage.key];
                            const isNext = nextManualStage?.key === stage.key;
                            return (
                                <div
                                    key={stage.key}
                                    className={`rounded-lg border p-4 ${
                                        done
                                            ? "border-green-200 bg-green-50"
                                            : isNext
                                              ? "border-primary"
                                              : "opacity-50"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-foreground">
                                            {stage.label}
                                        </span>
                                        {done && (
                                            <span className="text-xs text-muted-foreground">
                                                {done.toLocaleTimeString()}
                                            </span>
                                        )}
                                    </div>
                                    {isNext && (
                                        <Button
                                            onClick={() => completeManualStage(stage.key)}
                                            className="mt-3"
                                        >
                                            {stage.actionLabel}
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Customer panel */}
            <Card>
                <CardContent>
                    <h3 className="text-lg font-semibold text-foreground">
                        What {firstName === "there" ? "the customer" : firstName} sees
                    </h3>

                    <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-foreground">
                            {fmt(currentReadyDate)}
                        </span>
                        {hasSlip && (
                            <span className="text-muted-foreground line-through">
                                {fmt(originalReadyDate)}
                            </span>
                        )}
                    </div>

                    {hasSlip && (
                        <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">
                                    {gating.name} delayed {gatingDelayDays} day
                                    {gatingDelayDays === 1 ? "" : "s"}
                                </p>
                                <p className="text-xs text-amber-700">
                                    This is the part everything else waits on.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="mt-5 space-y-4">
                        <TimelineRow
                            activeIcon={<Loader2 className="h-5 w-5 animate-spin text-primary" />}
                            label="Damage assessed"
                            status={
                                doneAt.damage_assessed
                                    ? "done"
                                    : nextManualStage?.key === "damage_assessed"
                                      ? "current"
                                      : "upcoming"
                            }
                            date={doneAt.damage_assessed}
                        />
                        <TimelineRow
                            activeIcon={<Loader2 className="h-5 w-5 animate-spin text-primary" />}
                            label="Parts ordered"
                            status={
                                doneAt.parts_ordered
                                    ? "done"
                                    : nextManualStage?.key === "parts_ordered"
                                      ? "current"
                                      : "upcoming"
                            }
                            date={doneAt.parts_ordered}
                        />
                        <TimelineRow
                            activeIcon={<Truck className="h-5 w-5 text-primary" />}
                            label="Parts arrive"
                            status={waitingOnPartsStatus}
                            date={waitingOnPartsEta}
                        />
                        <TimelineRow
                            activeIcon={<Wrench className="h-5 w-5 text-primary" />}
                            label="In the bay"
                            status={
                                doneAt.in_bay
                                    ? "done"
                                    : nextManualStage?.key === "in_bay"
                                      ? "current"
                                      : "upcoming"
                            }
                            date={doneAt.in_bay ?? inBayEta}
                        />
                        <TimelineRow
                            activeIcon={<KeyRound className="h-5 w-5 text-primary" />}
                            label="Ready for pickup"
                            status={
                                doneAt.ready
                                    ? "done"
                                    : nextManualStage?.key === "ready"
                                      ? "current"
                                      : "upcoming"
                            }
                            date={doneAt.ready ?? currentReadyDate}
                        />
                    </div>

                    {/* An actual SMS thread rather than a log panel — it's
                        literally what the customer receives. */}
                    <div className="mt-8 rounded-xl border bg-muted/40 p-4">
                        <div className="flex items-center gap-2 border-b pb-2 text-sm font-medium text-muted-foreground">
                            <MessageCircle className="h-4 w-4" />
                            Messages to customer
                        </div>
                        <div className="mt-3 space-y-2">
                            {notifications.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    No messages sent yet.
                                </p>
                            )}
                            {notifications.map((n, i) => (
                                <div key={i} className="flex justify-end">
                                    <div className="max-w-[85%]">
                                        <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                                            {n.text}
                                        </div>
                                        <div className="mt-1 text-right text-[10px] text-muted-foreground">
                                            Delivered {n.at.toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
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
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : status === "current" ? (
            activeIcon
        ) : (
            <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
        );

    return (
        <div className="flex items-start gap-3">
            {icon}
            <div>
                <p
                    className={`font-medium ${
                        status === "done"
                            ? "text-muted-foreground"
                            : status === "current"
                              ? "text-primary"
                              : "text-muted-foreground/70"
                    }`}
                >
                    {label}
                </p>
                {date && <p className="text-xs text-muted-foreground">{fmt(date)}</p>}
            </div>
        </div>
    );
}
