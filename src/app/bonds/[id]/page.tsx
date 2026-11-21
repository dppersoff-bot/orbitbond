"use client";
import { use } from "react";
import Link from "next/link";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Badge, Button, Card, Countdown, PageHeader, SimNote, Stat, TxLink, numFmt, usdFmt } from "@/components/ui";
import { api, useAppState, useNow } from "@/components/useAppState";
import { OPERATORS } from "@/lib/data/seed";
import { COLLATERAL_MODEL, ECONOMICS } from "@/lib/config";
import type { PublicBond } from "@/lib/store";

const SOURCES = ["ESA (simulé)", "Space-Track (simulé)", "LeoLabs (simulé)"];

export default function BondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state, refresh } = useAppState(3000);
  const now = useNow();
  const b = state?.bonds.find((x) => x.id === id);
  if (!state) return <p className="text-muted">Chargement…</p>;
  if (!b) return <p className="text-muted">Bond introuvable. <Link className="text-accent" href="/operator">Retour</Link></p>;

  const txs = state.txs.filter((t) => t.bondId === b.id).slice().reverse();
  const yes = b.oracle.filter((o) => o.confirms).length;
  const navGain = (state.nav - b.navAtLock) * b.tranches.filter((t) => t.status !== "forfeited").reduce((a, t) => a + t.ousg, 0);
  const act = async (fn: () => Promise<unknown>) => { await fn(); await refresh(); };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Environmental bond · ${OPERATORS[b.operator].name}`} title={`${b.satellite.name} — ${b.id}`}>
        NORAD {b.satellite.noradId} (simulé) · {b.satellite.altitudeKm} km · {b.satellite.massKg} kg · propulsion {(COLLATERAL_MODEL.propulsion[b.satellite.propulsion]?.label ?? b.satellite.propulsion).toLowerCase()}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Caution déposée" value={usdFmt(b.collateralUsd)} hint="tUSD → tOUSG" />
        <Stat label="tOUSG verrouillés à l'origine" value={numFmt(b.ousgTotal, 0)} hint={`NAV au verrouillage ${b.navAtLock.toFixed(4)}`} tone="accent" />
        <Stat label="Rendement latent" value={usdFmt(b.status === "settled" ? 0 : navGain)} hint={`NAV actuelle ${state.nav.toFixed(4)} — non réalisé`} tone="ok" />
        <Stat label="Statut" value={<Badge status={b.status} />} hint={b.verifiedAt ? `Vérifié à ${new Date(b.verifiedAt * 1000).toLocaleTimeString("fr-FR")}` : "En attente de vérification"} />
      </div>

      <Card title="Chronologie et tranches d'escrow" subtitle="Chaque tranche est un Token Escrow distinct. Après son échéance (CancelAfter), le ledger interdit sa libération : elle ne peut plus qu'être annulée et confisquée.">
        <Timeline b={b} now={now} />
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {b.tranches.map((t) => (
            <div key={t.index} className="rounded-lg border border-space-700 bg-space-800/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Tranche {t.index + 1} · {t.pct * 100} %</span><Badge status={t.status} />
              </div>
              <div className="mt-2 text-xs text-muted">{numFmt(t.ousg, 2)} tOUSG</div>
              <div className="mt-1 text-xs text-muted">Échéance {new Date(t.cancelAfterUnix * 1000).toLocaleTimeString("fr-FR")} · {t.status === "locked" ? <Countdown target={t.cancelAfterUnix} now={now} /> : "—"}</div>
              <div className="mt-2 break-all font-mono text-[10px] text-muted" title="Condition PREIMAGE-SHA-256">cond. {t.condition.slice(8, 24)}…</div>
              <div className="mt-2 space-y-1 text-xs">
                <div>Create <TxLink hash={t.createTx} /></div>
                {t.finishTx && <div>Finish <TxLink hash={t.finishTx} /></div>}
                {t.cancelTx && <div>Cancel <TxLink hash={t.cancelTx} /></div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Oracle orbital 2-sur-3 (simulation)" subtitle="Chaque source signe son attestation (Ed25519). Au 2ᵉ accord, le service révèle la fulfillment de chaque tranche encore valide et soumet EscrowFinish.">
          <div className="space-y-2">
            {SOURCES.map((src, i) => {
              const a = b.oracle.find((o) => o.source === src);
              return (
                <div key={src} className="flex items-center justify-between rounded-lg border border-space-700 bg-space-800/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    {!a ? <CircleDashed size={16} className="text-muted" /> : a.confirms ? <CheckCircle2 size={16} className="text-ok" /> : <XCircle size={16} className="text-danger" />}
                    {src}
                    {a && <span className="font-mono text-[10px] text-muted">sig {a.signature.slice(0, 10)}…</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={!!b.verifiedAt || b.status === "settled"} onClick={() => act(() => api(`/api/bonds/${b.id}/attest`, { source: i, confirms: true }))}>Confirme</Button>
                    <Button variant="danger" disabled={!!b.verifiedAt || b.status === "settled"} onClick={() => act(() => api(`/api/bonds/${b.id}/attest`, { source: i, confirms: false }))}>Infirme</Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-sm">Consensus : <span className={yes >= 2 ? "text-ok" : "text-warn"}>{yes}/3</span> {yes >= 2 ? "— désorbitation vérifiée" : "— 2 confirmations requises"}</div>
        </Card>

        <Card title="Actions de règlement" subtitle="Les échéances se traitent par EscrowCancel ; le règlement rachète les tOUSG et distribue chaque poste séparément.">
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" disabled={b.status === "settled" || b.status === "resolved"} onClick={() => act(() => api("/api/process", { bondId: b.id }))}>Traiter les échéances dépassées</Button>
            <Button disabled={b.status !== "resolved"} onClick={() => act(() => api(`/api/bonds/${b.id}/settle`, {}))}>Régler le bond</Button>
          </div>
          <SimNote>Temps compressé : 1 minute réelle = 1 an de rendement simulé ({ECONOMICS.simulatedApy * 100} %/an). Les échéances d&apos;escrow sont, elles, réelles sur le ledger.</SimNote>
          {b.settlement && <SettlementView s={b.settlement} />}
        </Card>
      </div>

      <Card title="Transactions XRPL de ce bond" subtitle="Toutes vérifiables sur l'explorateur Testnet.">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Heure</th><th>Type</th><th>Description</th><th>Montant</th><th>Hash</th></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.hash} className="border-t border-space-700">
                <td className="py-2 text-xs text-muted">{new Date(t.time * 1000).toLocaleTimeString("fr-FR")}</td>
                <td className="font-mono text-xs">{t.type}</td><td>{t.label}</td>
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

function Timeline({ b, now }: { b: PublicBond; now: number }) {
  const start = b.createdAt;
  const end = b.tranches[b.tranches.length - 1].cancelAfterUnix + 30;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%`;
  return (
    <div className="relative mt-2 h-16">
      <div className="absolute left-0 right-0 top-7 h-1 rounded bg-space-700" />
      <div className="absolute top-7 h-1 rounded bg-accent/60" style={{ left: 0, width: pos(Math.min(now, end)) }} />
      <Marker left="0%" label="Dépôt" color="bg-accent" />
      {b.tranches.map((t) => (
        <Marker key={t.index} left={pos(t.cancelAfterUnix)} label={`T${t.index + 1}`}
          color={t.status === "released" ? "bg-ok" : t.status === "forfeited" ? "bg-danger" : "bg-warn"} />
      ))}
      {b.verifiedAt && <Marker left={pos(b.verifiedAt)} label="Vérifié" color="bg-ok" top />}
      {b.status !== "settled" && <div className="absolute top-4 h-7 w-px bg-ink" style={{ left: pos(now) }}><span className="absolute -top-4 -translate-x-1/2 text-[10px] text-ink">maintenant</span></div>}
    </div>
  );
}

function Marker({ left, label, color, top }: { left: string; label: string; color: string; top?: boolean }) {
  return (
    <div className="absolute" style={{ left }}>
      <div className={`absolute top-[22px] h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-4 ring-space-900 ${color}`} />
      <span className={`absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted ${top ? "top-0" : "top-10"}`}>{label}</span>
    </div>
  );
}

function SettlementView({ s }: { s: NonNullable<PublicBond["settlement"]> }) {
  const rows: [string, number, string?][] = [
    ["Principal libéré (restitué)", s.releasedPrincipal],
    ["Rendement réalisé sur tranches libérées", s.releasedYield],
    ["→ part opérateur (85 %)", s.operatorYield, "text-ok"],
    ["→ part dépollution (15 %)", s.cleanupYield, "text-accent"],
    ["Frais OrbitBond", s.platformFee],
    ["Bonus anticipé (réserve séparée)", s.bonus, "text-ok"],
    ["Tranches confisquées → dépollution", s.forfeitedProceeds, "text-danger"],
  ];
  return (
    <div className="mt-5 rounded-lg border border-space-700 p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-muted">Règlement · NAV {s.navAtSettlement.toFixed(4)}</div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v, c]) => (
          <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className={`tabular-nums ${c ?? ""}`}>{usdFmt(v)}</dd></div>
        ))}
        <div className="flex justify-between border-t border-space-700 pt-2 font-medium"><dt>Total opérateur</dt><dd className="tabular-nums text-ok">{usdFmt(s.operatorTotal)}</dd></div>
        <div className="flex justify-between font-medium"><dt>Total fonds de dépollution</dt><dd className="tabular-nums text-accent">{usdFmt(s.cleanupTotal)}</dd></div>
      </dl>
    </div>
  );
}
