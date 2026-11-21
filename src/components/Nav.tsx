"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orbit } from "lucide-react";

const LINKS = [
  { href: "/operator", label: "Opérateur" },
  { href: "/insurer", label: "Assureur" },
  { href: "/debris", label: "Dépollution" },
  { href: "/fund", label: "Transparence" },
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-space-700 bg-space-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Orbit className="text-accent" size={20} /> OrbitBond
          <span className="ml-2 rounded border border-warn/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warn">Testnet</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className={`rounded-md px-3 py-1.5 transition ${path.startsWith(l.href) ? "bg-space-800 text-ink" : "text-muted hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
