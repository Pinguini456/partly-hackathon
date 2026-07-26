import {
  AssemblyChoice,
  PurchaseRoute,
  bottomLine,
  chooseRoute,
  routeStats,
} from "@/src/lib/assemblyOptions";
import { fmt } from "@/src/lib/procurement";
import { Info } from "lucide-react";

function RouteCard({ route, isChosen }: { route: PurchaseRoute; isChosen: boolean }) {
  const { partsCost, readyDate } = routeStats(route);
  return (
    <div
      className={`rounded-lg border p-4 ${
        isChosen ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"
      }`}
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          isChosen ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {isChosen ? "Chosen" : "Alternative"}
      </span>
      <p className="mt-2 font-semibold text-slate-900">{route.label}</p>
      <p className="text-xs text-slate-500">{route.subtitle}</p>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Parts</dt>
          <dd className="font-medium text-slate-900">${partsCost}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Bench time</dt>
          <dd className="font-medium text-slate-900">{route.benchHours}h</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Lands</dt>
          <dd className="font-medium text-slate-900">{fmt(readyDate)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AssemblyChoiceCard({
  choice,
  jobType,
  isGatingPart,
  slackDays,
}: {
  choice: AssemblyChoice;
  jobType: "private" | "insurance";
  isGatingPart: boolean;
  slackDays: number;
}) {
  const { chosen, alternative } = chooseRoute(choice, jobType);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-semibold text-slate-900">{choice.partName}</p>
      <p className="text-sm text-slate-500">
        Two ways to buy it ·{" "}
        {isGatingPart ? (
          <span className="text-amber-600">gating part, 0 days slack</span>
        ) : (
          `${slackDays} day${slackDays === 1 ? "" : "s"} slack`
        )}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <RouteCard route={chosen} isChosen />
        <RouteCard route={alternative} isChosen={false} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs text-slate-600">{bottomLine(choice, jobType)}</p>
      </div>
    </div>
  );
}
