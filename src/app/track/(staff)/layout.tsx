"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/track", label: "Timeline" },
  { href: "/track/procurement", label: "Procurement" },
  { href: "/track/suppliers", label: "Supplier detail" },
];

export default function TrackJobLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex-1 bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl gap-1 px-8 pt-4">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                  active
                    ? "border border-b-0 border-slate-200 bg-slate-50 text-slate-900"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
