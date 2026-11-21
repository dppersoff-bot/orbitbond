"use client";
import { Badge, Card, PageHeader, SimNote, Stat, TxLink, usdFmt } from "@/components/ui";
import { useAppState, useBalances } from "@/components/useAppState";
import { INSURERS, OPERATORS, SEED_SATELLITES } from "@/lib/data/seed";

export default function InsurerPage() {
  const { state } = useAppState();
  const { balances } = useBalances();
  const ins = INSURERS.helix;
  const insuredOps = Object.entries(OPERATORS).filter(([, o]) => o.insurer === "helix").map(([k]) => k);
  const sats = SEED_SATELLITES.filter((s) => insuredOps.includes(s.operator));
  const bonds = (state?.bonds ?? []).filter((b) => insuredOps.includes(b.operator));
  const premiums = sats.reduce((a, s) => a + s.annualPremium, 0);
  const compliant = sats.filter((s) => s.status === "deorbited").length;
  const contribution = (state?.txs ?? []).filter((t) => t.from === "insurer" && t.to === "bonusReserve");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Espace assureur" title={ins.name}>
        Portefeuille assuré, risque orbital, conformité et participation au programme pionnier (réserve de bonus).
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Primes annuelles du portefeuille" value={usdFmt(premiums)} hint="Données simulées" />
        <Stat label="Satellites conformes" value={`${compliant}/${sats.length}`} hint="Désorbités dans les délais" tone="ok" />
        <Stat label="Contribution à la réserve de bonus" value={usdFmt(contribution.reduce((a, t) => a + Number(t.amount ?? 0), 0))} hint={contribution[0] ? <TxLink hash={contribution[0].hash} /> : "—"} tone="accent" />
        <Stat label="Solde assureur (tUSD)" value={balances?.insurer ? usdFmt(balances.insurer.tUSD) : "—"} />
      </div>

      <Card title="Portefeuille assuré" subtitle={`Ristourne de prime proposée aux opérateurs conformes : ${ins.rebateRate * 100} % (simulée).`}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Satellite</th><th>Opérateur</th><th>Altitude</th><th>Risque collision</th><th>Prime annuelle</th><th>Ristourne si conforme</th><th>Statut</th></tr></thead>
          <tbody>
            {sats.map((s) => (
              <tr key={s.id} className="border-t border-space-700">
                <td className="py-2 font-medium">{s.name}</td><td>{OPERATORS[s.operator].name}</td><td>{s.altitudeKm} km</td>
                <td className={s.collisionRisk === "élevé" ? "text-danger" : s.collisionRisk === "modéré" ? "text-warn" : "text-ok"}>{s.collisionRisk}</td>
                <td className="tabular-nums">{usdFmt(s.annualPremium)}</td>
                <td className="tabular-nums">{usdFmt(s.annualPremium * ins.rebateRate)}</td>
                <td><Badge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Bonds on-chain des opérateurs assurés">
        {bonds.length === 0 ? <p className="text-sm text-muted">Aucun bond live pour les opérateurs assurés.</p> : (
          <ul className="space-y-2 text-sm">
            {bonds.map((b) => (
              <li key={b.id} className="flex items-center justify-between border-b border-space-700 pb-2">
                <span>{b.id} · {b.satellite.name} · {OPERATORS[b.operator].name}</span>
                <span className="flex items-center gap-2">{usdFmt(b.collateralUsd)} <Badge status={b.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Bénéfices potentiels — hypothèses">
        <ul className="space-y-1.5 text-sm text-muted">
          <li>• Moins de satellites abandonnés → exposition réduite aux sinistres de collision (à valider actuariellement).</li>
          <li>• Les cautions vérifiées on-chain donnent un signal de conformité objectif pour la tarification.</li>
          <li>• Le financement de la réserve de bonus est un coût marketing, pas un rendement garanti.</li>
        </ul>
        <SimNote>Aucune réduction de sinistres ni de primes n&apos;est présumée : ce sont des hypothèses nécessitant une validation actuarielle.</SimNote>
      </Card>
    </div>
  );
}
