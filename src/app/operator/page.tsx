"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Card, Countdown, PageHeader, SimNote, Stat, TxLink, numFmt, usdFmt } from "@/components/ui";
import { OperatorPicker, useOperator } from "@/components/OperatorPicker";
import { useAppState, useBalances, useNow } from "@/components/useAppState";
import { OPERATORS, SEED_SATELLITES } from "@/lib/data/seed";
import { quoteCollateral } from "@/lib/finance/engine";

export default function OperatorPage() {
  const [op, setOp] = useOperator();
  const { state } = useAppState();
  const { balances } = useBalances();
  const now = useNow();
  const bonds = (state?.bonds ?? []).filter((b) => b.operator === op);
  const seeds = SEED_SATELLITES.filter((s) => s.operator === op);
  const locked = bonds.reduce((a, b) => a + b.tranches.filter((t) => t.status === "locked").reduce((x, t) => x + t.ousg, 0), 0);
  const nav = state?.nav ?? 1;
  const accrued = bonds.filter((b) => b.status !== "settled")
    .reduce((a, b) => a + b.tranches.filter((t) => t.status !== "forfeited").reduce((x, t) => x + t.ousg * (nav - b.navAtLock), 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Espace opérateur" title={OPERATORS[op].name}>
        Cautions environnementales, tranches verrouillées sur XRPL et statut de conformité de vos satellites.
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <OperatorPicker value={op} onChange={setOp} />
        <Link href="/operator/register" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-space-950 hover:bg-accent-strong">
          <Plus size={16} /> Enregistrer un satellite
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Solde tUSD (on-chain)" value={balances?.[op] ? usdFmt(balances[op].tUSD) : "—"} />
        <Stat label="tOUSG en escrow" value={numFmt(locked, 0)} hint={`NAV simulée ${nav.toFixed(4)}`} tone="accent" />
        <Stat label="Rendement latent (non réalisé)" value={usdFmt(accrued)} hint="Estimation, non réalisée" tone="ok" />
        <Stat label="Bonds live" value={bonds.length} hint={`${bonds.filter((b) => b.status === "settled").length} réglés`} />
      </div>

      <Card title="Bonds on-chain (XRPL Testnet)" subtitle="Créés depuis cette démo — chaque étape est une transaction réelle sur le Testnet.">
        {bonds.length === 0 ? (
          <p className="text-sm text-muted">Aucun bond live. Enregistrez un satellite pour créer une caution verrouillée par escrow.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr><th className="py-2">Bond</th><th>Satellite</th><th>Caution</th><th>Tranches</th><th>Prochaine échéance</th><th>Statut</th><th>Dépôt</th></tr>
            </thead>
            <tbody>
              {bonds.map((b) => {
                const next = b.tranches.find((t) => t.status === "locked");
                return (
                  <tr key={b.id} className="border-t border-space-700">
                    <td className="py-2.5"><Link className="font-mono text-accent hover:underline" href={`/bonds/${b.id}`}>{b.id}</Link></td>
                    <td>{b.satellite.name} <span className="text-xs text-muted">{b.satellite.noradId}</span></td>
                    <td className="tabular-nums">{usdFmt(b.collateralUsd)}</td>
                    <td className="space-x-1">{b.tranches.map((t) => <Badge key={t.index} status={t.status} />)}</td>
                    <td>{next ? <Countdown target={next.cancelAfterUnix} now={now} /> : "—"}</td>
                    <td><Badge status={b.status} /></td>
                    <td><TxLink hash={state?.txs.find((t) => t.bondId === b.id && t.label.startsWith("Dépôt"))?.hash} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Flotte (données simulées)" subtitle="Profil de risque et caution indicative selon le modèle illustratif.">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr><th className="py-2">Satellite</th><th>NORAD (simulé)</th><th>Altitude</th><th>Masse</th><th>Propulsion</th><th>Échéance d&apos;élimination</th><th>Caution indicative</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {seeds.map((s) => {
              const years = (new Date(s.missionEnd).getTime() - new Date(s.launchDate).getTime()) / 3.156e10;
              const q = quoteCollateral({ massKg: s.massKg, altitudeKm: s.altitudeKm, propulsion: s.propulsion, missionYears: years });
              return (
                <tr key={s.id} className="border-t border-space-700">
                  <td className="py-2.5 font-medium">{s.name}</td>
                  <td className="font-mono text-xs text-muted">{s.noradId}</td>
                  <td>{s.altitudeKm} km</td><td>{s.massKg} kg</td>
                  <td className="capitalize">{s.propulsion === "none" ? "aucune" : s.propulsion === "electric" ? "électrique" : "chimique"}</td>
                  <td>{new Date(s.disposalDeadline).toLocaleDateString("fr-FR")}</td>
                  <td className="tabular-nums">{usdFmt(q.total)}</td>
                  <td><Badge status={s.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <SimNote>Les satellites de la flotte sont fictifs et non adossés à des escrows ; seuls les « bonds on-chain » ci-dessus le sont.</SimNote>
      </Card>
    </div>
  );
}
