import crypto from "node:crypto";
import { TOKENS } from "../config";
import type { OperatorKey } from "../data/seed";
import { computeSettlement, navAt, quoteCollateral, round6, trancheSchedule, type Propulsion } from "../finance/engine";
import { addLog, loadState, saveState, type Bond, type OracleAttestation } from "../store";
import { addr, currencyHex, fmtValue, getClient, ousg, payOusg, payUsd, submit, toRippleTime } from "./client";
import { conditionFor, fulfillmentFor, newPreimage, signAttestation } from "./conditions";

const now = () => Math.floor(Date.now() / 1000);

function getBond(id: string): Bond {
  const b = loadState().bonds.find((x) => x.id === id);
  if (!b) throw new Error("Bond introuvable");
  return b;
}

export interface NewBondInput {
  operator: OperatorKey;
  name: string;
  noradId: string;
  altitudeKm: number;
  massKg: number;
  propulsion: Propulsion;
  missionYears: number;
  /** Optional demo schedule (seconds). Clamped: first deadline 60–1800 s, spacing 10–600 s. */
  schedule?: { firstDeadlineSec?: number; trancheSpacingSec?: number };
}

const clamp = (v: number | undefined, lo: number, hi: number) =>
  v === undefined || !Number.isFinite(v) ? undefined : Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Full on-chain flow:
 * 1. Operator pays tUSD collateral to BondCustody
 * 2. Custody converts tUSD -> tOUSG with the (simulated) Ondo desk at current NAV
 * 3. Custody locks tOUSG in N Token Escrows (XLS-85), each with its own
 *    PREIMAGE-SHA-256 condition and a progressively later CancelAfter.
 */
export async function createBond(input: NewBondInput): Promise<Bond> {
  const s = loadState();
  if (!s.setupAt) throw new Error("Testnet non initialisé.");
  if (!input.operator || !(input.massKg > 0) || !(input.altitudeKm > 0)) throw new Error("Paramètres du satellite invalides.");
  // Compressed time compounds fast (60 s = 1 year): rebase the simulated NAV
  // when no bond is open and it has drifted far (≈16 min idle), so it stays
  // readable across long demo sessions without visibly jumping mid-demo.
  if (s.bonds.every((b) => b.status === "settled") && navAt(now(), s.navEpoch) > 2) {
    s.navEpoch = now();
    addLog("NAV tOUSG simulée remise à 1,00 (aucun bond ouvert).");
  }
  const quote = quoteCollateral(input);
  const id = "BND-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const createdAt = now();
  const bond: Bond = {
    id, createdAt, operator: input.operator,
    satellite: {
      name: input.name, noradId: input.noradId, altitudeKm: input.altitudeKm,
      massKg: input.massKg, propulsion: input.propulsion, missionYears: input.missionYears,
    },
    quote, collateralUsd: quote.total, navAtLock: 0, ousgTotal: 0,
    tranches: [], oracle: [], status: "active",
  };
  s.bonds.unshift(bond);
  saveState();

  await payUsd(input.operator, "custody", quote.total, `Dépôt de caution ${id}`, id);

  const nav = navAt(now(), s.navEpoch);
  const ousgTotal = round6(quote.total / nav);
  await payUsd("custody", "ondoDesk", quote.total, `Souscription tOUSG ${id} (NAV ${nav})`, id);
  await payOusg("ondoDesk", "custody", ousgTotal, `Émission tOUSG ${id}`, id);
  bond.navAtLock = nav;
  bond.ousgTotal = ousgTotal;

  // The first deadline must stay safely after the 4 EscrowCreate txs are validated (~20 s).
  const schedule = trancheSchedule(now(), {
    firstDeadlineSec: clamp(input.schedule?.firstDeadlineSec, 60, 1800),
    trancheSpacingSec: clamp(input.schedule?.trancheSpacingSec, 10, 600),
  });
  let allocated = 0;
  for (const t of schedule) {
    const isLast = t.index === schedule.length - 1;
    const amount = isLast ? round6(ousgTotal - allocated) : round6(ousgTotal * t.pct);
    allocated = round6(allocated + amount);
    const preimageHex = newPreimage(); // unique per tranche AND per satellite
    const condition = conditionFor(preimageHex);
    const { hash, sequence } = await submit("custody", {
      TransactionType: "EscrowCreate",
      Destination: addr("settlement"),
      Amount: ousg(amount),
      Condition: condition,
      CancelAfter: toRippleTime(t.cancelAfterUnix),
    }, { label: `EscrowCreate ${id} tranche ${t.index + 1}`, to: "settlement", bondId: id, amount: fmtValue(amount), currency: TOKENS.ousg.code });
    bond.tranches.push({
      index: t.index, pct: t.pct, ousg: amount, cancelAfterUnix: t.cancelAfterUnix,
      escrowSequence: sequence, condition, preimageHex, status: "locked", createTx: hash,
    });
    saveState();
  }
  addLog(`Bond ${id} verrouillé : ${schedule.length} tranches.`);
  saveState();
  return bond;
}

const SOURCES: OracleAttestation["source"][] = ["ESA (simulé)", "Space-Track (simulé)", "LeoLabs (simulé)"];

/** A simulated source signs its observation. 2-of-3 agreement => verified. */
export async function attest(bondId: string, sourceIdx: number, confirms: boolean) {
  const b = getBond(bondId);
  const source = SOURCES[sourceIdx];
  const at = now();
  const payload = JSON.stringify({ bond: b.id, norad: b.satellite.noradId, event: "DISPOSAL_CONFIRMED", confirms, at });
  const { signature, publicKey } = signAttestation(source, payload);
  b.oracle = b.oracle.filter((o) => o.source !== source);
  b.oracle.push({ source, confirms, signature, publicKey, at });
  addLog(`Oracle ${source} : ${confirms ? "désorbitation confirmée" : "non confirmée"} (${b.id})`);
  saveState();
  const yes = b.oracle.filter((o) => o.confirms).length;
  if (yes >= 2 && !b.verifiedAt) {
    b.verifiedAt = at;
    b.status = "verified";
    addLog(`Consensus 2/3 atteint pour ${b.id} → libération des tranches éligibles.`);
    saveState();
    await releaseEligible(b);
  }
  return b;
}

/** Reveal each non-expired tranche's fulfillment via EscrowFinish. */
async function releaseEligible(b: Bond) {
  const ledgerNow = now();
  for (const t of b.tranches) {
    if (t.status !== "locked") continue;
    if (t.cancelAfterUnix <= ledgerNow + 5) continue; // expired or too close: will be cancelled
    const { hash } = await submit("settlement", {
      TransactionType: "EscrowFinish",
      Owner: addr("custody"),
      OfferSequence: t.escrowSequence,
      Condition: t.condition,
      Fulfillment: fulfillmentFor(t.preimageHex),
    }, { label: `EscrowFinish ${b.id} tranche ${t.index + 1}`, to: "settlement", bondId: b.id, amount: fmtValue(t.ousg), currency: TOKENS.ousg.code });
    t.status = "released";
    t.finishTx = hash;
    saveState();
  }
  await maybeResolve(b);
}

/** Cancel every expired tranche; forfeited tOUSG goes to the cleanup fund. */
export async function processDeadlines(bondId?: string) {
  const s = loadState();
  const client = await getClient();
  // Use the validated ledger close time: CancelAfter is checked against it.
  const li = await client.request({ command: "ledger", ledger_index: "validated" });
  const ledgerUnix = (li.result.ledger.close_time as number) + 946684800;
  const bonds = s.bonds.filter((b) => (!bondId || b.id === bondId) && (b.status === "active" || b.status === "verified"));
  for (const b of bonds) {
    for (const t of b.tranches) {
      if (t.status !== "locked" || ledgerUnix <= t.cancelAfterUnix) continue;
      const { hash } = await submit("custody", {
        TransactionType: "EscrowCancel",
        Owner: addr("custody"),
        OfferSequence: t.escrowSequence,
      }, { label: `EscrowCancel ${b.id} tranche ${t.index + 1} (échéance dépassée)`, bondId: b.id, amount: fmtValue(t.ousg), currency: TOKENS.ousg.code });
      t.status = "forfeited";
      t.cancelTx = hash;
      saveState();
      await payOusg("custody", "cleanupFund", t.ousg, `Tranche confisquée ${b.id}#${t.index + 1} → Fonds de dépollution`, b.id);
    }
    await maybeResolve(b);
  }
}

async function maybeResolve(b: Bond) {
  if (b.tranches.every((t) => t.status !== "locked") && b.status !== "settled") {
    b.status = "resolved";
    saveState();
  }
}

async function usdBalance(key: "bonusReserve"): Promise<number> {
  const client = await getClient();
  const r = await client.request({ command: "account_lines", account: addr(key), peer: addr("issuerUsd") });
  const line = r.result.lines.find((l) => l.currency === currencyHex(TOKENS.usd.code));
  return line ? Number(line.balance) : 0;
}

const g = globalThis as unknown as { __settling?: Set<string> };

/**
 * Redeem released + forfeited tOUSG at current NAV and distribute every bucket.
 * Safe against double clicks (in-flight lock) and retries after a failure:
 * the breakdown is frozen on the first attempt and each payment runs once.
 */
export async function settle(bondId: string) {
  g.__settling ??= new Set();
  if (g.__settling.has(bondId)) throw new Error("Règlement déjà en cours pour ce bond.");
  g.__settling.add(bondId);
  try {
    return await settleOnce(bondId);
  } finally {
    g.__settling.delete(bondId);
  }
}

async function settleOnce(bondId: string) {
  const s = loadState();
  const b = getBond(bondId);
  if (b.status === "settled") return b;
  if (b.status !== "resolved") throw new Error("Toutes les tranches doivent être libérées ou confisquées avant le règlement.");

  if (!b.settlementDraft) {
    const nav = navAt(now(), s.navEpoch);
    const early = !!b.verifiedAt && b.verifiedAt < b.tranches[0].cancelAfterUnix && b.tranches.every((t) => t.status === "released");
    const bonusAvail = early ? await usdBalance("bonusReserve") : 0;
    const br = computeSettlement({
      collateralUsd: b.collateralUsd,
      tranches: b.tranches.map((t) => ({ pct: t.pct, ousg: t.ousg, status: t.status as "released" | "forfeited" })),
      navAtSettlement: nav,
      early,
      bonusReserveAvailable: bonusAvail,
    });
    b.settlementDraft = { ...br, navAtSettlement: nav, settledAt: 0 };
    b.settleSteps = [];
    saveState();
  }
  const br = b.settlementDraft;
  const nav = br.navAtSettlement;
  const step = async (id: string, fn: () => Promise<unknown>) => {
    if (b.settleSteps!.includes(id)) return;
    await fn();
    b.settleSteps!.push(id);
    saveState();
  };
  const relOusg = round6(b.tranches.filter((t) => t.status === "released").reduce((a, t) => a + t.ousg, 0));
  const forOusg = round6(b.tranches.filter((t) => t.status === "forfeited").reduce((a, t) => a + t.ousg, 0));

  if (relOusg > 0) {
    await step("redeem", () => payOusg("settlement", "ondoDesk", relOusg, `Rachat tOUSG ${b.id} (NAV ${nav})`, b.id));
    await step("proceeds", () => payUsd("ondoDesk", "settlement", br.releasedProceeds, `Produit du rachat ${b.id}`, b.id));
    await step("operator", () => payUsd("settlement", b.operator, round6(br.operatorTotal - br.bonus), `Restitution caution + 85% rendement → opérateur ${b.id}`, b.id));
    if (br.cleanupYield > 0) await step("cleanupYield", () => payUsd("settlement", "cleanupFund", br.cleanupYield, `15% du rendement → Fonds de dépollution ${b.id}`, b.id));
    if (br.platformFee > 0) await step("fee", () => payUsd("settlement", "revenue", br.platformFee, `Frais OrbitBond ${b.id}`, b.id));
  }
  if (forOusg > 0) {
    await step("redeemForfeited", () => payOusg("cleanupFund", "ondoDesk", forOusg, `Rachat tOUSG confisqués ${b.id}`, b.id));
    await step("forfeitedProceeds", () => payUsd("ondoDesk", "cleanupFund", br.forfeitedProceeds, `Produit des tranches confisquées ${b.id}`, b.id));
  }
  if (br.bonus > 0) await step("bonus", () => payUsd("bonusReserve", b.operator, br.bonus, `Bonus désorbitation anticipée ${b.id}`, b.id));

  b.settlement = { ...br, settledAt: now() };
  b.status = "settled";
  addLog(`Règlement ${b.id} terminé.`);
  saveState();
  return b;
}

export async function balances() {
  const s = loadState();
  const client = await getClient();
  const out: Record<string, { address: string; xrp: string; tUSD: number; tOUSG: number }> = {};
  await Promise.all(Object.entries(s.wallets).map(async ([k, w]) => {
    const [info, lines] = await Promise.all([
      client.request({ command: "account_info", account: w!.address, ledger_index: "validated" }).catch(() => null),
      client.request({ command: "account_lines", account: w!.address, ledger_index: "validated" }).catch(() => null),
    ]);
    let tUSD = 0, tOUSG = 0;
    for (const l of lines?.result.lines ?? []) {
      if (l.currency === currencyHex(TOKENS.usd.code)) tUSD += Number(l.balance);
      if (l.currency === currencyHex(TOKENS.ousg.code)) tOUSG += Number(l.balance);
    }
    out[k] = {
      address: w!.address,
      xrp: info ? (Number(info.result.account_data.Balance) / 1e6).toFixed(2) : "?",
      tUSD: Math.abs(tUSD), tOUSG: Math.abs(tOUSG),
    };
  }));
  return out;
}
