"use client";
import Link from "next/link";
import { useState } from "react";
import { AddrLink, Badge, Button, Card, PageHeader, SimNote, numFmt, usdFmt } from "@/components/ui";
import { api, useAppState, useBalances } from "@/components/useAppState";
import { OPERATORS, type OperatorKey } from "@/lib/data/seed";
import { DEMO_TIME } from "@/lib/config";
import type { PublicBond } from "@/lib/store";

const PRESETS: { op: OperatorKey; name: string; norad: string; alt: number; mass: number; prop: string; scenario: string }[] = [
  { op: "opA", name: "AURORA-5", norad: "SIM-90415", alt: 540, mass: 450, prop: "electric", scenario: "Scénario 1 — désorbitation anticipée" },
  { op: "opB", name: "KESTREL-11", norad: "SIM-90711", alt: 780, mass: 900, prop: "chemical", scenario: "Scénario 2 — désorbitation tardive" },
  { op: "opC", name: "MERIDIAN-6", norad: "SIM-90306", alt: 950, mass: 700, prop: "none", scenario: "Scénario 3 — abandon" },
];

export default function AdminPage() {
  const { state, refresh } = useAppState();
  const { balances, error: balErr, refresh: refreshBal } = useBalances();
  const [steps, setSteps] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Console administrateur" title="Supervision OrbitBond">
        Initialisation du Testnet, comptes, scénarios de démonstration, oracle et règlements.
      </PageHeader>

      <Card title="1. Initialisation du Testnet" subtitle="Crée 13 comptes via le faucet, configure les émetteurs (RequireAuth, AllowTrustLineLocking), les trustlines, les autorisations KYC simulées et la distribution initiale. ≈ 2 à 4 minutes."
        right={state?.initialized ? <Badge status="verified" /> : null}>
        {state?.initialized ? (
          <p className="text-sm text-ok">Initialisé le {new Date(state.setupAt! * 1000).toLocaleString("fr-FR")}.</p>
        ) : (
          <Button onClick={async () => { setSteps(["Initialisation en cours… (ne fermez pas la page)"]); setSteps(await api<string[]>("/api/setup", {})); await refresh(); await refreshBal(); }}>
            Initialiser le Testnet
          </Button>
        )}
        {steps.length > 0 && <ul className="mt-3 space-y-0.5 font-mono text-xs text-muted">{steps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      </Card>

      <Card title="2. Scénarios de démonstration" subtitle={`Échéances : T1 à +${DEMO_TIME.firstDeadlineSec}s puis +${DEMO_TIME.trancheSpacingSec}s par tranche.`}>
        <div className="grid gap-4 md:grid-cols-3">
          {PRESETS.map((p) => (
            <div key={p.name} className="rounded-lg border border-space-700 bg-space-800/50 p-4 text-sm">
              <div className="font-medium">{p.scenario}</div>
              <div className="mt-1 text-xs text-muted">{OPERATORS[p.op].name} · {p.name} · {p.alt} km · {p.mass} kg</div>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-muted">
                {p.op === "opA" && <><li>Créer le bond</li><li>Sur la page du bond : 2 sources « Confirme » tout de suite</li><li>Les 4 tranches sont libérées → Régler (bonus inclus)</li></>}
                {p.op === "opB" && <><li>Créer le bond</li><li>Attendre l&apos;échéance de T2 (≈ 3,5 min)</li><li>« Traiter les échéances » → T1, T2 confisquées</li><li>2 sources « Confirme » → T3, T4 libérées → Régler</li></>}
                {p.op === "opC" && <><li>Créer le bond</li><li>Ne rien confirmer ; attendre la dernière échéance (≈ 5,5 min)</li><li>« Traiter les échéances » → tout confisqué → Régler</li></>}
              </ol>
              <div className="mt-3">
                <Button variant="ghost" disabled={!state?.initialized} onClick={async () => {
                  const b = await api<PublicBond>("/api/bonds", { operator: p.op, name: p.name, noradId: p.norad, altitudeKm: p.alt, massKg: p.mass, propulsion: p.prop, missionYears: 5 });
                  window.location.href = `/bonds/${b.id}`;
                }}>Créer le bond</Button>
              </div>
            </div>
          ))}
        </div>
        <SimNote>Astuce pitch : lancez les scénarios 2 et 3 au début de la présentation pour que leurs échéances tombent pendant la démo.</SimNote>
      </Card>

      <Card title="3. Bonds" right={<div className="flex gap-2">
        <Button variant="ghost" onClick={async () => { await api("/api/process", {}); await refresh(); }}>Traiter toutes les échéances</Button>
        <Button variant="danger" onClick={async () => { if (confirm("Effacer l'historique des bonds de démo dans l'app ?")) { await api("/api/reset-bonds", {}); await refresh(); } }}>Réinitialiser la démo</Button>
      </div>}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Bond</th><th>Opérateur</th><th>Satellite</th><th>Caution</th><th>Oracle</th><th>Tranches</th><th>Statut</th></tr></thead>
          <tbody>
            {(state?.bonds ?? []).map((b) => (
              <tr key={b.id} className="border-t border-space-700">
                <td className="py-2"><Link className="font-mono text-accent hover:underline" href={`/bonds/${b.id}`}>{b.id}</Link></td>
                <td>{OPERATORS[b.operator].name}</td><td>{b.satellite.name}</td>
                <td className="tabular-nums">{usdFmt(b.collateralUsd)}</td>
                <td>{b.oracle.filter((o) => o.confirms).length}/3</td>
                <td className="space-x-1">{b.tranches.map((t) => <Badge key={t.index} status={t.status} />)}</td>
                <td><Badge status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="4. Comptes XRPL et soldes" subtitle="Lus en direct sur le ledger validé." className="lg:col-span-2">
          {balErr && <p className="text-xs text-danger">{balErr}</p>}
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Compte</th><th>Adresse</th><th>XRP</th><th>tUSD</th><th>tOUSG</th></tr></thead>
            <tbody>
              {Object.entries(state?.accounts ?? {}).map(([k, a]) => (
                <tr key={k} className="border-t border-space-700">
                  <td className="py-2">{a.label}</td><td><AddrLink address={a.address} /></td>
                  <td className="tabular-nums text-xs">{balances?.[k]?.xrp ?? "—"}</td>
                  <td className="tabular-nums text-xs">{balances?.[k] ? numFmt(balances[k].tUSD, 0) : "—"}{k === "issuerUsd" && " (émis)"}</td>
                  <td className="tabular-nums text-xs">{balances?.[k] ? numFmt(balances[k].tOUSG, 0) : "—"}{k === "issuerOusg" && " (émis)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Journal">
          <ul className="max-h-[520px] space-y-1 overflow-auto font-mono text-[11px] text-muted">
            {(state?.log ?? []).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
