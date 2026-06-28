"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  mobile?: boolean;
}

const navItems = [
  { label: "Home", href: "/home" },
  { label: "Markets", href: "/market" },
  { label: "Execution", href: "/execution" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
];

export default function Sidebar({ mobile }: Props) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <nav className="flex h-16 items-center justify-around text-sm">
        {navItems.slice(0, 5).map((item) => {
          const active = pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2 py-2 transition hover:opacity-75 ${
                active ? "text-emerald-300" : "text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="h-full w-full space-y-6 p-6">
      <Link
        href="/dashboard"
        className="block text-xl font-bold text-white transition hover:opacity-75"
      >
        2KQuant
      </Link>

      <nav className="space-y-2 text-slate-400">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-slate-800/70 hover:opacity-75 ${
                active
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-slate-400"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
