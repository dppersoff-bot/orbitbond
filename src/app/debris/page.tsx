"use client";
import { AddrLink, Button, Card, PageHeader, SimNote, Stat, usdFmt } from "@/components/ui";
import { api, useAppState, useBalances } from "@/components/useAppState";
import { CLEANUP_MISSIONS, DEBRIS_COMPANIES } from "@/lib/data/seed";

export default function DebrisPage() {
  const { state } = useAppState();
  const { balances, refresh } = useBalances();
  const co = DEBRIS_COMPANIES.vespera;
  const fund = balances?.cleanupFund?.tUSD ?? 0;
  const mine = CLEANUP_MISSIONS.filter((m) => m.provider === "vespera");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Espace dépollution orbitale" title={co.name}>
        Financement disponible, missions proposées et paiements reçus. Société fictive — aucun partenariat réel implicite.
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Financement disponible (fonds commun)" value={usdFmt(fund)} hint={<AddrLink address={state?.accounts.cleanupFund?.address} />} tone="accent" />
        <Stat label="Missions ouvertes" value={CLEANUP_MISSIONS.length} />
        <Stat label="Paiements reçus (tUSD)" value={balances?.debris ? usdFmt(balances.debris.tUSD) : "—"} hint={<AddrLink address={state?.accounts.debris?.address} />} />
        <Stat label="Adhésion" value={co.membership} hint="Tarification non décidée" />
      </div>

      <Card title="Opportunités de mission" subtitle="Coûts estimés simulés. Le paiement intervient après validation de la mission.">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Mission</th><th>Cible</th><th>Orbite</th><th>Prestataire</th><th>Coût estimé</th><th>Couverture par le fonds</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {CLEANUP_MISSIONS.map((m) => (
              <tr key={m.id} className="border-t border-space-700">
                <td className="py-2 font-mono text-xs">{m.id}</td><td>{m.target}</td><td>{m.orbit}</td>
                <td>{DEBRIS_COMPANIES[m.provider as keyof typeof DEBRIS_COMPANIES].name}</td>
                <td className="tabular-nums">{usdFmt(m.estCost)}</td>
                <td className="tabular-nums">{Math.min(100, (fund / m.estCost) * 100).toFixed(0)} %</td>
                <td>{m.status}</td>
                <td>{m.provider === "vespera" && (
                  <Button variant="ghost" disabled={fund < 50_000} onClick={async () => { await api("/api/pay-mission", { missionId: m.id, amount: Math.min(fund, m.estCost * 0.1) }); await refresh(); }}>
                    Payer jalon 10 %
                  </Button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SimNote>{mine.length} mission(s) proposée(s) par {co.name}. L&apos;adhésion premium donne accès aux analyses, jamais à un droit automatique sur les fonds ou les contrats.</SimNote>
      </Card>

      <Card title="Services premium (modèle d'adhésion envisagé)">
        <ul className="grid gap-2 text-sm text-muted md:grid-cols-2">
          <li>• Analyses orbitales et cartographie des débris</li>
          <li>• Identification d&apos;opportunités de mission</li>
          <li>• Informations de risque avancées</li>
          <li>• Outils d&apos;appel d&apos;offres et de gestion de projet</li>
        </ul>
      </Card>
    </div>
  );
}
