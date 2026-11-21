import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "OrbitBond — Environmental bonds for satellites",
  description: "Satellite environmental bonds secured on the XRP Ledger (IXH26 demo).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-7xl px-6 pb-10 text-[11px] text-muted">
          Démonstration IXH26 — XRPL Testnet. Organisations, satellites et identifiants NORAD fictifs (données
          simulées). tUSD et tOUSG sont des tokens de test qui simulent RLUSD et OUSG ; aucune affiliation avec
          Ripple, Ondo Finance, Astroscale, ClearSpace ou les opérateurs cités. Le véritable OUSG est réservé aux
          Qualified Purchasers. Coefficients financiers illustratifs, non validés.
        </footer>
      </body>
    </html>
  );
}
