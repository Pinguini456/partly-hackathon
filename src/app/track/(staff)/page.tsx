"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Truck,
  Wrench,
  KeyRound,
  MessageCircle,
  Paintbrush,
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

// --- Demo data -----------------------------------------------------------

const LABOUR_DAYS = 2;

type Part = { id: string; name: string; eta: string; originalEta: string };

const initialParts: Part[] = [
  { id: "headlamp", name: "Headlamp assembly", eta: "2026-08-03", originalEta: "2026-08-03" },
  { id: "bumper", name: "Front bumper cover", eta: "2026-07-29", originalEta: "2026-07-29" },
  { id: "bracket", name: "Mounting bracket", eta: "2026-07-27", originalEta: "2026-07-27" },
];

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

  function delayPart(partId: string, days: number) {
    setParts((prev) => {
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
          <section className="rounded-xl border bg-white p-6">
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
                <Paintbrush className="h-4 w-4 text-blue-600" />
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
                  return (
                    <div
                      key={part.id}
                      className={`rounded-lg border p-3 ${
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
                      done ? "border-green-200 bg-green-50" : isNext ? "border-blue-300" : "opacity-50"
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
                        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
          <section className="rounded-xl border bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Customer view</h2>

            {fromProcurement && (
              <p className="mt-1 text-xs text-blue-600">Parts basket applied: {fromProcurement}</p>
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
                activeIcon={<CheckCircle2 className="h-5 w-5 text-blue-500" />}
                label="Damage assessed"
                status={doneAt.damage_assessed ? "done" : nextManualStage?.key === "damage_assessed" ? "current" : "upcoming"}
                date={doneAt.damage_assessed ?? new Date()}
              />
              <TimelineRow
                activeIcon={<CheckCircle2 className="h-5 w-5 text-blue-500" />}
                label="Parts ordered"
                status={doneAt.parts_ordered ? "done" : nextManualStage?.key === "parts_ordered" ? "current" : "upcoming"}
                date={doneAt.parts_ordered ?? new Date()}
              />
              <TimelineRow
                activeIcon={<Truck className="h-5 w-5 text-blue-500" />}
                label="Waiting on parts"
                status={waitingOnPartsStatus}
                date={waitingOnPartsEta}
              />
              <TimelineRow
                activeIcon={<Wrench className="h-5 w-5 text-blue-500" />}
                label="In the bay"
                status={doneAt.in_bay ? "done" : nextManualStage?.key === "in_bay" ? "current" : "upcoming"}
                date={doneAt.in_bay ?? inBayEta}
              />
              <TimelineRow
                activeIcon={<KeyRound className="h-5 w-5 text-blue-500" />}
                label="Ready for pickup"
                status={doneAt.ready ? "done" : nextManualStage?.key === "ready" ? "current" : "upcoming"}
                date={doneAt.ready ?? currentReadyDate}
              />
            </div>

            <div className="mt-8 rounded-xl border bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <MessageCircle className="h-4 w-4" />
                Text messages
              </div>
              <div className="mt-3 space-y-2">
                {notifications.length === 0 && (
                  <p className="text-sm text-slate-500">No messages sent yet.</p>
                )}
                {notifications.map((n, i) => (
                  <div key={i} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100">
                    {n.text}
                    <div className="mt-1 text-[10px] text-slate-400">{n.at.toLocaleTimeString()}</div>
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
                ? "text-blue-700"
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
