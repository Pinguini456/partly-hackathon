"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Only rendered on staff-facing screens. Customer-facing views (/choose, the
// customer half of /track) deliberately don't get this bar — it would break
// the illusion that they're a separate audience, not the internal tool.
const STAFF_ROUTES = ["/", "/track", "/track/procurement", "/track/suppliers"];

const LINKS = [
  { href: "/", label: "Upload" },
  { href: "/track", label: "Track Job" },
];

// A route "owns" a nav link if it's that link's href or a sub-route of it —
// so /track/procurement still highlights "Track Job".
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function StaffNav() {
  const pathname = usePathname();
  if (!STAFF_ROUTES.includes(pathname)) return null;

  return (
    <nav className="border-b bg-slate-900">
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
