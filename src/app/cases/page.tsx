"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Car, User } from "lucide-react";

type CaseListItem = {
  id: string;
  status: string;
  vehicle_slug: string | null;
  customer_name: string | null;
  created_at: string;
  thumbnail: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  analysing: "Analysing",
  parts_identified: "Parts identified",
  basket_chosen: "Basket chosen",
  damage_assessed: "Damage assessed",
  parts_ordered: "Parts ordered",
  in_bay: "In the bay",
  ready: "Ready for pickup",
};

function vehicleLabel(slug: string | null) {
  if (!slug) return "Vehicle pending";
  const words = slug.split("-").slice(0, -1);
  if (!words.length) return slug;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cases")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setCases(data.cases ?? []);
      })
      .catch(() => setError("Failed to load cases"));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Cases</h1>
            <p className="mt-1 text-slate-500">Every job in the shop, at a glance.</p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New case
          </Link>
        </div>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!cases && !error && <p className="mt-6 text-slate-500">Loading...</p>}
        {cases && cases.length === 0 && (
          <p className="mt-6 text-slate-500">No cases yet - start one from the upload page.</p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cases?.map((c) => (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-40 items-center justify-center overflow-hidden bg-slate-100">
                {c.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.thumbnail}
                    alt={vehicleLabel(c.vehicle_slug)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Car className="h-10 w-10 text-slate-300" />
                )}
              </div>
              <div className="p-4">
                <p className="font-semibold text-slate-900">{vehicleLabel(c.vehicle_slug)}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                  <User className="h-3.5 w-3.5" />
                  {c.customer_name || "No customer name"}
                </p>
                <span className="mt-3 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
