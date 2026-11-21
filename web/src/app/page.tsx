import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Satellite, Recycle, Lock, Radar, Coins, Scale } from "lucide-react";

const STEPS = [
  { icon: Coins, title: "1. Caution", text: "L'opérateur dépose une caution en stablecoin, calculée selon le profil de risque du satellite." },
  { icon: Lock, title: "2. Verrouillage", text: "La caution est convertie en actif de trésorerie tokenisé puis verrouillée en tranches par Token Escrow (XLS-85)." },
  { icon: Radar, title: "3. Vérification", text: "À la fin de vie, au moins 2 sources orbitales indépendantes sur 3 doivent confirmer la désorbitation." },
  { icon: Scale, title: "4. Règlement", text: "Tranches libérées et rendement à l'opérateur ; tranches échues et 15 % du rendement au fonds de dépollution." },
];

const ROLES = [
  { href: "/operator", icon: Satellite, title: "Opérateur de satellites", text: "Enregistrer un satellite, déposer sa caution, suivre les tranches." },
  { href: "/insurer", icon: ShieldCheck, title: "Assureur", text: "Portefeuille, risque orbital, réserve de bonus, ristournes." },
  { href: "/debris", icon: Recycle, title: "Société de dépollution", text: "Financement disponible, missions proposées, paiements." },
  { href: "/admin", icon: Building2, title: "Administrateur OrbitBond", text: "Initialisation Testnet, oracle, échéances, règlements." },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="pt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">IXH26 · Track 2 · XRPL Applications</div>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight tracking-tight">
          Plus vous désorbitez tôt, plus vous gagnez.<br />
          <span className="text-muted">Plus vous tardez, plus ça coûte.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          OrbitBond gère les cautions environnementales des satellites sur le XRP Ledger : une infrastructure
          financière partagée, internationale et vérifiable publiquement, qui finance la dépollution orbitale.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/operator" className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-space-950 hover:bg-accent-strong">
            Ouvrir la plateforme <ArrowRight size={16} />
          </Link>
          <Link href="/fund" className="inline-flex items-center gap-2 rounded-lg border border-space-600 px-5 py-2.5 font-medium hover:bg-space-800">
            Voir la transparence on-chain
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Comment ça marche</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border border-space-700 bg-space-900/70 p-5">
              <s.icon className="text-accent" size={22} />
              <div className="mt-3 font-medium">{s.title}</div>
              <p className="mt-2 text-sm text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-space-700 bg-space-900/70 p-6">
          <h3 className="font-semibold">Pourquoi XRPL</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Ledger distribué, non contrôlé par une banque nationale.</li>
            <li>• Escrow natif sur tokens (XLS-85) : la pénalité progressive est appliquée par le ledger.</li>
            <li>• Transactions publiques et vérifiables par chaque partie, dans chaque pays.</li>
            <li>• Frais faibles, finalité en quelques secondes ; Credentials et Multisign disponibles.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-warn/30 bg-space-900/70 p-6">
          <h3 className="font-semibold text-warn">Limites assumées</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Infrastructure neutre, actifs non neutres : RLUSD et OUSG impliquent dollar, droit américain et émetteurs pouvant geler.</li>
            <li>• OUSG est réservé aux Qualified Purchasers : la démo utilise des tokens Testnet qui le simulent.</li>
            <li>• Le rendement n'est pas garanti ; les bonus viennent uniquement d'une réserve financée à part.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Choisir un espace</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {ROLES.map((r) => (
            <Link key={r.href} href={r.href} className="group rounded-xl border border-space-700 bg-space-900/70 p-5 transition hover:border-accent/60">
              <r.icon className="text-accent" size={22} />
              <div className="mt-3 font-medium group-hover:text-accent">{r.title}</div>
              <p className="mt-2 text-sm text-muted">{r.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
