"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

type Part = { id: string; name: string; eta: string; originalEta: string };
type Option = { label: string; cost: number; readyDateISO: string; parts: Part[] };
type ChoicePayload = { recommended: Option; alternative: Option };

const dayMs = 86400000;

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function daysBetween(aISO: string, bISO: string) {
  return Math.round((+new Date(aISO) - +new Date(bISO)) / dayMs);
}

// The default reply time if the customer doesn't respond — the job keeps
// moving on the recommended option rather than stalling on a phone call.
const DEFAULT_DEADLINE = "4:00pm today";

export default function ChooseBasketPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<ChoicePayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("partly:customerChoice");
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setChoice(JSON.parse(raw));
    } catch {
      setMissing(true);
    }
  }, []);

  function choose(option: Option) {
    sessionStorage.setItem(
      "partly:chosenBasket",
      JSON.stringify({
        parts: option.parts,
        label: `Customer chose: ${option.label} — $${option.cost}, ready ${fmt(option.readyDateISO)}`,
      }),
    );
    sessionStorage.removeItem("partly:customerChoice");
    router.push("/track");
  }

  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
        <p className="text-slate-500">
          No pending choice found. Go to the procurement page and click &quot;Send to customer to
          choose&quot;.
        </p>
      </main>
    );
  }

  if (!choice) return null;

  const { recommended, alternative } = choice;
  const dateDiff = daysBetween(alternative.readyDateISO, recommended.readyDateISO);
  const costDiff = alternative.cost - recommended.cost;

  const altDescription =
    dateDiff < 0
      ? `Pay $${costDiff} more, get it back ${Math.abs(dateDiff)} day${Math.abs(dateDiff) === 1 ? "" : "s"} sooner.`
      : dateDiff > 0
        ? `Save $${Math.abs(costDiff)}, but costs you ${dateDiff} extra day${dateDiff === 1 ? "" : "s"} without the car.`
        : `Same date, ${costDiff < 0 ? "saves" : "costs"} $${Math.abs(costDiff)}.`;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold text-slate-900">Your repair — how would you like it handled?</h1>
        <p className="mt-2 text-slate-500">Two options for finishing your repair.</p>

        <div className="mt-8 space-y-4">
          <button
            onClick={() => choose(recommended)}
            className="block w-full rounded-xl border-2 border-indigo-500 bg-indigo-50 p-6 text-left hover:bg-indigo-100"
          >
            <span className="inline-block rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
              This is what we&apos;d pick
            </span>
            <p className="mt-3 text-3xl font-bold text-slate-900">${recommended.cost}</p>
            <p className="text-slate-600">Ready {fmt(recommended.readyDateISO)}</p>
          </button>

          <button
            onClick={() => choose(alternative)}
            className="block w-full rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-3xl font-bold text-slate-900">${alternative.cost}</p>
            <p className="text-slate-600">Ready {fmt(alternative.readyDateISO)}</p>
            <p className="mt-2 text-sm text-slate-500">{altDescription}</p>
          </button>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-lg border border-dashed border-slate-300 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-500">
            If we don&apos;t hear back by <strong>{DEFAULT_DEADLINE}</strong>, we&apos;ll go with
            our pick above so the job keeps moving.
          </p>
        </div>

        <button
          onClick={() => choose(recommended)}
          className="mt-3 text-xs text-slate-400 underline hover:text-slate-600"
        >
          Simulate: no reply by {DEFAULT_DEADLINE}
        </button>
      </div>
    </main>
  );
}
