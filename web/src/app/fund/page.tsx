"use client";
import { AddrLink, Card, PageHeader, SimNote, Stat, TxLink, numFmt, usdFmt } from "@/components/ui";
import { useAppState, useBalances } from "@/components/useAppState";

export default function FundPage() {
  const { state } = useAppState();
  const { balances } = useBalances();
  const bonds = state?.bonds ?? [];
  const nav = state?.nav ?? 1;
  const settled = bonds.filter((b) => b.settlement);

  // Separate buckets — never double-counted.
  const lockedPrincipal = bonds.reduce((a, b) => a + b.tranches.filter((t) => t.status === "locked").reduce((x, t) => x + t.pct * b.collateralUsd, 0), 0);
  const unrealized = bonds.filter((b) => !b.settlement).reduce((a, b) => a + b.tranches.filter((t) => t.status !== "forfeited").reduce((x, t) => x + t.ousg * (nav - b.navAtLock), 0), 0);
  const sum = (f: (s: NonNullable<(typeof bonds)[number]["settlement"]>) => number) => settled.reduce((a, b) => a + f(b.settlement!), 0);
  const buckets = [
    { k: "Principal verrouillé (escrow)", v: lockedPrincipal },
    { k: "Rendement latent (non réalisé)", v: unrealized },
    { k: "Rendement réalisé", v: sum((s) => s.releasedYield) },
    { k: "Principal restitué aux opérateurs", v: sum((s) => s.releasedPrincipal) },
    { k: "Rendement versé aux opérateurs", v: sum((s) => s.operatorYield) },
    { k: "Bonus versés (réserve séparée)", v: sum((s) => s.bonus) },
    { k: "Pénalités / tranches confisquées", v: sum((s) => s.forfeitedProceeds) },
    { k: "Allocations au fonds de dépollution", v: sum((s) => s.cleanupTotal) },
    { k: "Revenus OrbitBond", v: sum((s) => s.platformFee) },
  ];
  const cleanupTxs = (state?.txs ?? []).filter((t) => t.to === "cleanupFund" || t.from === "cleanupFund" || t.to === "bonusReserve" || t.from === "bonusReserve");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transparence publique" title="Fonds communs et flux vérifiables">
        Soldes lus directement sur le XRP Ledger. N&apos;importe quelle partie, dans n&apos;importe quel pays, peut vérifier ces comptes sur l&apos;explorateur.
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Fonds de dépollution (tUSD)" value={balances?.cleanupFund ? usdFmt(balances.cleanupFund.tUSD) : "—"} hint={<AddrLink address={state?.accounts.cleanupFund?.address} />} tone="accent" />
        <Stat label="Fonds de dépollution (tOUSG en attente)" value={balances?.cleanupFund ? numFmt(balances.cleanupFund.tOUSG, 0) : "—"} hint="Tranches confisquées non encore rachetées" />
        <Stat label="Réserve de bonus" value={balances?.bonusReserve ? usdFmt(balances.bonusReserve.tUSD) : "—"} hint={<AddrLink address={state?.accounts.bonusReserve?.address} />} tone="ok" />
        <Stat label="Revenus OrbitBond" value={balances?.revenue ? usdFmt(balances.revenue.tUSD) : "—"} hint="Modèle de revenus non finalisé (0 % par défaut)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Comptabilité par poste" subtitle="Les 9 catégories sont tenues séparément : aucun fonds n'est compté deux fois.">
          <dl className="space-y-2 text-sm">
            {buckets.map((b) => (
              <div key={b.k} className="flex justify-between border-b border-space-700/60 pb-1.5"><dt className="text-muted">{b.k}</dt><dd className="tabular-nums">{usdFmt(b.v)}</dd></div>
            ))}
          </dl>
          <SimNote>Les dépenses opérationnelles ne sont pas modélisées dans la démo.</SimNote>
        </Card>
        <Card title="Répartition des règlements" subtitle="Où est allé l'argent de chaque bond réglé.">
          {settled.length === 0 ? <p className="text-sm text-muted">Aucun bond réglé pour l&apos;instant.</p> : (
            <div className="space-y-4">
              {settled.map((b) => {
                const s = b.settlement!;
                const parts = [
                  { k: "Opérateur", v: s.operatorTotal - s.bonus, c: "bg-ok" },
                  { k: "Bonus", v: s.bonus, c: "bg-ok/50" },
                  { k: "Dépollution", v: s.cleanupTotal, c: "bg-accent" },
                ];
                const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
                return (
                  <div key={b.id}>
                    <div className="mb-1 flex justify-between text-xs"><span>{b.id} · {b.satellite.name}</span><span className="text-muted">{usdFmt(tot)}</span></div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-space-700">
                      {parts.map((p) => <div key={p.k} className={p.c} style={{ width: `${(p.v / tot) * 100}%` }} title={`${p.k} ${usdFmt(p.v)}`} />)}
                    </div>
                    <div className="mt-1 flex gap-4 text-[11px] text-muted">{parts.map((p) => <span key={p.k}>{p.k} {usdFmt(p.v)}</span>)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Flux du fonds de dépollution et de la réserve de bonus">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Heure</th><th>Description</th><th>Montant</th><th>Hash</th></tr></thead>
          <tbody>
            {cleanupTxs.map((t) => (
              <tr key={t.hash} className="border-t border-space-700">
                <td className="py-2 text-xs text-muted">{new Date(t.time * 1000).toLocaleTimeString("fr-FR")}</td>
                <td>{t.label}</td>
                <td className="tabular-nums text-xs">{t.amount ? `${numFmt(Number(t.amount))} ${t.currency}` : "—"}</td>
                <td><TxLink hash={t.hash} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
