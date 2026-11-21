"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, PageHeader, SimNote, usdFmt } from "@/components/ui";
import { OperatorPicker, useOperator } from "@/components/OperatorPicker";
import { api, useAppState } from "@/components/useAppState";
import { COLLATERAL_MODEL, DEMO_TIME, ECONOMICS } from "@/lib/config";
import { quoteCollateral, type Propulsion } from "@/lib/finance/engine";
import type { PublicBond } from "@/lib/store";

const input = "w-full rounded-lg border border-space-600 bg-space-800 px-3 py-2 text-sm outline-none focus:border-accent";

export default function RegisterPage() {
  const router = useRouter();
  const [op, setOp] = useOperator();
  const { state } = useAppState(10000);
  const [f, setF] = useState({
    name: "AURORA-4", noradId: "SIM-" + Math.floor(90400 + Math.random() * 500),
    altitudeKm: 560, massKg: 480, propulsion: "electric" as Propulsion, missionYears: 5,
  });
  const q = useMemo(() => quoteCollateral(f), [f]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nouveau satellite" title="Enregistrer un satellite et déposer sa caution">
        La caution est calculée selon le profil de risque, convertie en tOUSG puis verrouillée en {DEMO_TIME.tranchePcts.length} tranches d&apos;escrow
        aux échéances progressives.
      </PageHeader>
      <OperatorPicker value={op} onChange={setOp} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Caractéristiques" className="lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-muted">Nom<input className={input} value={f.name} onChange={set("name")} /></label>
            <label className="text-xs text-muted">NORAD ID (simulé)<input className={input} value={f.noradId} onChange={set("noradId")} /></label>
            <label className="text-xs text-muted">Altitude orbitale (km)<input type="number" className={input} value={f.altitudeKm} onChange={set("altitudeKm")} /></label>
            <label className="text-xs text-muted">Masse (kg)<input type="number" className={input} value={f.massKg} onChange={set("massKg")} /></label>
            <label className="text-xs text-muted">Propulsion
              <select className={input} value={f.propulsion} onChange={set("propulsion")}>
                <option value="chemical">Chimique</option><option value="electric">Électrique</option><option value="none">Aucune</option>
              </select>
            </label>
            <label className="text-xs text-muted">Durée de mission (années)<input type="number" className={input} value={f.missionYears} onChange={set("missionYears")} /></label>
          </div>
        </Card>
        <Card title="Caution proposée" subtitle="Coefficients illustratifs, non validés scientifiquement" className="lg:col-span-2">
          <dl className="space-y-2 text-sm">
            <Row k={`Base (${f.massKg} kg × ${COLLATERAL_MODEL.usdPerKg} $/kg)`} v={usdFmt(q.base)} />
            <Row k={`Altitude — ${q.altitudeLabel}`} v={`× ${q.altitudeFactor}`} />
            <Row k="Propulsion" v={`× ${q.propulsionFactor}`} />
            <Row k="Durée de mission" v={`× ${q.durationFactor}`} />
            <div className="border-t border-space-700 pt-2"><Row k="Caution" v={<span className="text-lg font-semibold text-accent">{usdFmt(q.total)}</span>} /></div>
          </dl>
          <div className="mt-4 space-y-1 text-xs text-muted">
            <div>Tranches : {DEMO_TIME.tranchePcts.map((p) => `${p * 100} %`).join(" · ")}</div>
            <div>Échéances démo : T1 à +{DEMO_TIME.firstDeadlineSec}s, puis toutes les {DEMO_TIME.trancheSpacingSec}s</div>
            <div>Rendement réalisé : {ECONOMICS.yieldSplit.operator * 100} % opérateur · {ECONOMICS.yieldSplit.cleanup * 100} % dépollution</div>
            <div>Bonus anticipé : {ECONOMICS.earlyBonusRate * 100} % de la caution, plafonné par la réserve</div>
          </div>
          <div className="mt-5">
            <Button disabled={!state?.initialized} onClick={async () => {
              const b = await api<PublicBond>("/api/bonds", { operator: op, ...f });
              router.push(`/bonds/${b.id}`);
            }}>Déposer la caution et verrouiller sur XRPL</Button>
            {!state?.initialized && <SimNote>Le Testnet n&apos;est pas initialisé : allez d&apos;abord dans Admin.</SimNote>}
            <SimNote>≈ 7 transactions Testnet (≈ 30 s) : dépôt, souscription, émission tOUSG, 4 EscrowCreate.</SimNote>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
