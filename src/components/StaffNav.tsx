"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Deliberately two entries. There's no separate "tracking" tab: a job's
// live status lives inside its own case, so the only way in is through the
// case list — click a case, get everything about it.
const LINKS = [
  { href: "/", label: "New case" },
  { href: "/cases", label: "Cases" },
];

// A route "owns" a nav link if it's that link's href or a sub-route of it —
// so /track/procurement still highlights "Orders".
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function StaffNav() {
  const pathname = usePathname();

  return (
    // Sticky comes from main; the full-bleed row (no mx-auto/max-w) is this
    // branch's change — the logo sits hard-left instead of the whole
    // logo+links group floating centred with empty gutters either side.
    <nav className="sticky top-0 z-50 border-b bg-slate-900">
      <div className="flex items-center gap-1 px-8 py-3 text-sm">
        <span className="mr-6 flex items-center gap-2 font-semibold text-white">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Repair Copilot
        </span>
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}