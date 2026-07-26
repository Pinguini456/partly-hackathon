"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Circle,
  Truck,
  Wrench,
  KeyRound,
  MessageCircle,
  Paintbrush,
  Clock,
} from "lucide-react";
import { basketToTimelineParts, recommendedBasket, VEHICLE } from "@/src/lib/procurement";

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

// --- Demo data -----------------------------------------------------------

const LABOUR_DAYS = 2;

type Part = { id: string; name: string; eta: string; originalEta: string };

// Single source of truth: the same solver output the Procurement and Supplier
// Detail tabs render. Hardcoding a second parts list here meant the tabs
// disagreed about which part was gating for the same job.
const initialParts: Part[] = basketToTimelineParts(recommendedBasket());

type ManualStage = "damage_assessed" | "parts_ordered" | "in_bay" | "ready";
const MANUAL_STAGES: { key: ManualStage; label: string; actionLabel: string }[] = [
  { key: "damage_assessed", label: "Damage assessed", actionLabel: "Mark Damage Assessed" },
  { key: "parts_ordered", label: "Parts ordered", actionLabel: "Mark Parts Ordered" },
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

function decodePaintCode(plate: string) {
  const codes = [
    { code: "PWP", name: "Pearl White" },
    { code: "S3T", name: "Sterling Silver" },
    { code: "TAN", name: "Titanium Grey" },
    { code: "R51", name: "Fiery Red" },
    { code: "K23", name: "Phantom Black" },
  ];
  const idx = plate.length ? plate.charCodeAt(plate.length - 1) % codes.length : 0;
  return codes[idx];
}

type Notification = { text: string; at: Date };
/** Staff-side log of what a delay actually did — including when it did nothing. */
type SolverNote = { text: string; slipped: boolean; at: Date };

export default function TimelinePage() {
  const [plate, setPlate] = useState("MKJ482");
  const [parts, setParts] = useState<Part[]>(initialParts);
  const [originalReadyDate, setOriginalReadyDate] = useState(() =>
    nextWorkingDay(readyDate(initialParts, LABOUR_DAYS)),
  );
  const [doneAt, setDoneAt] = useState<Partial<Record<ManualStage, Date>>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifyOnStage, setNotifyOnStage] = useState(true);
  const [fromProcurement, setFromProcurement] = useState<string | null>(null);
  const [solverNote, setSolverNote] = useState<SolverNote | null>(null);

  // Pick up a basket applied on /procurement, if any, as the new baseline promise.
  useEffect(() => {
    const raw = sessionStorage.getItem("partly:chosenBasket");
    if (!raw) return;
    try {
      const basket = JSON.parse(raw) as { parts: Part[]; label: string };
      if (basket?.parts?.length) {
        setParts(basket.parts);
        setOriginalReadyDate(nextWorkingDay(readyDate(basket.parts, LABOUR_DAYS)));
        setFromProcurement(basket.label);
      }
    } catch {
      // ignore malformed/stale sessionStorage content
    } finally {
      sessionStorage.removeItem("partly:chosenBasket");
    }
  }, []);

  const gating = gatingPart(parts);
  const currentReadyDate = nextWorkingDay(readyDate(parts, LABOUR_DAYS));
  const hasSlip = +currentReadyDate !== +originalReadyDate;
  const gatingDelayDays = Math.round(
    (eta(gating) - eta({ eta: gating.originalEta })) / dayMs,
  );

  const nextManualStage = MANUAL_STAGES.find((s) => !doneAt[s.key]);

  // Shared scale for the slack bars, so they're comparable across parts.
  const maxOriginalSlack = Math.max(
    ...parts.map((p) => Math.round(slack({ ...p, eta: p.originalEta }, parts))),
    1,
  );

  // Computed outside any state updater: React updaters must be pure, and in
  // StrictMode they run twice — emitting notifications from inside one made
  // the customer thread double up.
  function delayPart(partId: string, days: number) {
    const before = nextWorkingDay(readyDate(parts, LABOUR_DAYS));
    const next = parts.map((p) => ({ ...p }));
    const part = next.find((p) => p.id === partId)!;
    const slackBefore = Math.round(slack(part, next));
    const { absorbed } = applyDelay(part, next, days);
    const after = nextWorkingDay(readyDate(next, LABOUR_DAYS));
    const slipped = +after !== +before;

    setParts(next);

    if (slipped) {
      const newGating = gatingPart(next);
      const slipDays = Math.round(
        (eta(newGating) - eta({ eta: newGating.originalEta })) / dayMs,
      );
      setSolverNote({
        slipped: true,
        at: new Date(),
        text: `${part.name} overran its ${slackBefore} day${slackBefore === 1 ? "" : "s"} of slack — it's now the gating part. Pickup moves to ${fmt(after)}. Customer notified.`,
      });
      setNotifications((prev) => [
        ...prev,
        {
          text: `Hi Sam — your ${newGating.name.toLowerCase()} is running ${slipDays} day${
            slipDays === 1 ? "" : "s"
          } late from the supplier, so pickup moves to ${fmt(
            after,
          )}. Nothing else changed. We'll text you when it's in the bay.`,
          at: new Date(),
        },
      ]);
    } else {
      // The non-event still has to be visible, or the model looks like it did
      // nothing rather than deciding nothing needed doing.
      const remaining = Math.round(slack(part, next));
      setSolverNote({
        slipped: false,
        at: new Date(),
        text: `${absorbed} of ${slackBefore} day${slackBefore === 1 ? "" : "s"} slack used on ${part.name}, ${remaining} remaining. Pickup unchanged — no message sent.`,
      });
    }
  }

  function completeManualStage(stage: ManualStage) {
    setDoneAt((prev) => ({ ...prev, [stage]: new Date() }));

    if (!notifyOnStage) return;
    const canned: Record<ManualStage, string> = {
      damage_assessed:
        "Hi! We've assessed the damage and are putting together your job card.",
      parts_ordered: "Good news — the parts needed for your repair have been ordered.",
      in_bay: "Your vehicle is now in the workshop and repairs have started.",
      ready: "🎉 Your vehicle is ready for pickup!",
    };
    setNotifications((prev) => [...prev, { text: canned[stage], at: new Date() }]);
  }

  const waitingOnPartsStatus: "done" | "current" | "upcoming" = doneAt.in_bay
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
          Pickup date is computed from whichever part has the latest ETA (the &quot;gating
          part&quot;). Delaying a part only moves the date if it&apos;s the one everything else
          is waiting on.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {/* Staff panel */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Shop staff view</h2>

            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4">
              <label className="text-sm font-medium text-slate-700">
                Number plate <span className="font-normal text-slate-400">(read from the walkaround video)</span>
              </label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-semibold uppercase text-slate-900"
              />
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <Paintbrush className="h-4 w-4 text-indigo-600" />
                Paint code for painter:{" "}
                <span className="font-semibold text-slate-900">
                  {decodePaintCode(plate).code} — {decodePaintCode(plate).name}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Looked up via the plate → VIN → paint code, so nobody has to dig through the OEM lookup.
              </p>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700">Parts on order</h3>
              <div className="mt-2 space-y-2">
                {parts.map((part) => {
                  const isGating = part.id === gating.id;
                  const slipped = part.eta !== part.originalEta;
                  const partSlack = Math.round(slack(part, parts));
                  const originalSlack = Math.round(
                    slack({ ...part, eta: part.originalEta }, parts),
                  );
                  const used = Math.max(0, originalSlack - partSlack);
                  // Bars share one scale (the largest original slack on the
                  // job) so 7d and 5d look different — scaling each bar to its
                  // own slack made every part render as a full-width block.
                  const trackScale = maxOriginalSlack || 1;
                  // Always offer one button big enough to overrun this part's
                  // remaining slack, so every part can demonstrate both outcomes.
                  const breakingDelay = partSlack + 1;
                  return (
                    <div
                      key={part.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isGating ? "border-amber-300 bg-amber-50" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">
                          {part.name}{" "}
                          {isGating ? (
                            <span className="text-amber-600">(gating)</span>
                          ) : (
                            <span className="text-slate-400">({partSlack}d slack)</span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">
                          ETA {fmt(new Date(part.eta))}
                          {slipped && (
                            <span className="ml-1 text-amber-600">
                              (was {fmt(new Date(part.originalEta))})
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Slack bar — consumed vs remaining, so repeated clicks
                          are legible rather than an abstract number changing. */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div className="flex h-full">
                            <div
                              className="h-full bg-amber-400"
                              style={{ width: `${(used / trackScale) * 100}%` }}
                            />
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${(partSlack / trackScale) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`w-24 shrink-0 text-right text-[10px] ${
                            isGating ? "font-medium text-amber-600" : "text-slate-400"
                          }`}
                        >
                          {isGating
                            ? "no slack left"
                            : `${partSlack}d left${used ? ` · ${used}d used` : ""}`}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => delayPart(part.id, 1)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          Delay 1 day
                        </button>
                        {/* The middle case: big enough to visibly eat slack,
                            small enough that a slack-rich part still absorbs. */}
                        {breakingDelay > 3 && (
                          <button
                            onClick={() => delayPart(part.id, 3)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Delay 3 days
                          </button>
                        )}
                        {/* Only meaningful when it differs from the 1-day
                            button — a part with no slack already slips on 1. */}
                        {breakingDelay > 1 && (
                          <button
                            onClick={() => delayPart(part.id, breakingDelay)}
                            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                          >
                            Delay {breakingDelay} days
                            <span className="ml-1 font-normal text-amber-600">
                              (overruns slack)
                            </span>
                          </button>
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
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <span className="font-medium">
                    {solverNote.slipped ? "Date moved · " : "Absorbed · "}
                  </span>
                  {solverNote.text}
                </div>
              )}
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
            <p className="text-sm text-slate-500">
              {plate} · {VEHICLE.label}
            </p>

            {fromProcurement && (
              <p className="mt-1 text-xs text-indigo-600">Parts basket applied: {fromProcurement}</p>
            )}

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
                  <p className="text-xs text-amber-700">This is the part everything else waits on.</p>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <TimelineRow
                activeIcon={<Loader2 className="h-5 w-5 animate-spin text-indigo-500" />}
                label="Damage assessed"
                status={doneAt.damage_assessed ? "done" : nextManualStage?.key === "damage_assessed" ? "current" : "upcoming"}
                date={doneAt.damage_assessed}
              />
              <TimelineRow
                activeIcon={<Loader2 className="h-5 w-5 animate-spin text-indigo-500" />}
                label="Parts ordered"
                status={doneAt.parts_ordered ? "done" : nextManualStage?.key === "parts_ordered" ? "current" : "upcoming"}
                date={doneAt.parts_ordered}
              />
              <TimelineRow
                activeIcon={<Truck className="h-5 w-5 text-indigo-500" />}
                label="Parts arrive"
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

            {/* Styled as an actual SMS thread rather than a dark log panel —
                it's what the customer literally receives. */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-600">
                <MessageCircle className="h-4 w-4" />
                Messages to customer
              </div>
              <div className="mt-3 space-y-2">
                {notifications.length === 0 && (
                  <p className="text-sm text-slate-400">No messages sent yet.</p>
                )}
                {notifications.map((n, i) => (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white">
                        {n.text}
                      </div>
                      <div className="mt-1 text-right text-[10px] text-slate-400">
                        Delivered {n.at.toLocaleTimeString()}
                      </div>
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
