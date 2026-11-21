import fs from "node:fs";
import path from "node:path";
import type { OperatorKey } from "./data/seed";
import type { CollateralQuote, Propulsion, SettlementBreakdown } from "./finance/engine";

export const ACCOUNT_KEYS = [
  "issuerUsd", "issuerOusg", "ondoDesk", "custody", "settlement", "cleanupFund",
  "bonusReserve", "revenue", "insurer", "debris", "opA", "opB", "opC",
] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

export const ACCOUNT_LABELS: Record<AccountKey, string> = {
  issuerUsd: "Émetteur tUSD (simule Ripple/RLUSD)",
  issuerOusg: "Émetteur tOUSG (simule Ondo/OUSG)",
  ondoDesk: "Desk émission/rachat (simule Ondo)",
  custody: "BondCustody (source des escrows)",
  settlement: "Settlement (destination des escrows)",
  cleanupFund: "Fonds de dépollution orbitale",
  bonusReserve: "Réserve de bonus (financée par assureurs)",
  revenue: "Revenus OrbitBond",
  insurer: "Assureur — Helix Space Underwriters",
  debris: "Dépollution — Vespera Orbital Cleanup",
  opA: "Opérateur — Aurora Orbital Systems",
  opB: "Opérateur — Kestrel Space Networks",
  opC: "Opérateur — Meridian SatCom",
};

export interface TxRecord {
  hash: string;
  type: string;
  label: string;
  from: AccountKey;
  to?: AccountKey;
  amount?: string;
  currency?: string;
  bondId?: string;
  time: number;
  result: string;
}

export interface Tranche {
  index: number;
  pct: number;
  ousg: number;
  cancelAfterUnix: number;
  escrowSequence?: number;
  condition: string;
  preimageHex: string; // SECRET — never sent to the browser
  status: "locked" | "released" | "forfeited";
  createTx?: string;
  finishTx?: string;
  cancelTx?: string;
}

export interface OracleAttestation {
  source: "ESA (simulé)" | "Space-Track (simulé)" | "LeoLabs (simulé)";
  confirms: boolean;
  signature: string;
  publicKey: string;
  at: number;
}

export interface Bond {
  id: string;
  createdAt: number;
  operator: OperatorKey;
  satellite: {
    name: string;
    noradId: string;
    altitudeKm: number;
    massKg: number;
    propulsion: Propulsion;
    missionYears: number;
  };
  quote: CollateralQuote;
  collateralUsd: number;
  navAtLock: number;
  ousgTotal: number;
  tranches: Tranche[];
  oracle: OracleAttestation[];
  verifiedAt?: number;
  status: "active" | "verified" | "resolved" | "settled";
  settlement?: SettlementBreakdown & { navAtSettlement: number; settledAt: number };
  /** Breakdown frozen at the first settlement attempt + completed payment steps (retry-safe). */
  settlementDraft?: SettlementBreakdown & { navAtSettlement: number; settledAt: number };
  settleSteps?: string[];
}

export interface AppState {
  wallets: Partial<Record<AccountKey, { address: string; seed: string }>>;
  setupAt?: number;
  /** Completed setup steps, so an interrupted `npm run setup` resumes safely. */
  setupSteps?: string[];
  navEpoch: number;
  bonds: Bond[];
  txs: TxRecord[];
  log: string[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "state.json");

const g = globalThis as unknown as { __obState?: AppState };

export function loadState(): AppState {
  if (g.__obState) return g.__obState;
  if (fs.existsSync(FILE)) {
    g.__obState = JSON.parse(fs.readFileSync(FILE, "utf8")) as AppState;
  } else {
    g.__obState = { wallets: {}, navEpoch: Math.floor(Date.now() / 1000), bonds: [], txs: [], log: [] };
  }
  return g.__obState;
}

export function saveState() {
  const s = loadState();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function addLog(msg: string) {
  const s = loadState();
  s.log.unshift(`${new Date().toLocaleTimeString("fr-FR")} — ${msg}`);
  s.log = s.log.slice(0, 200);
}

export function resetState() {
  g.__obState = { wallets: {}, navEpoch: Math.floor(Date.now() / 1000), bonds: [], txs: [], log: [] };
  saveState();
}

/** Bond as sent to the browser: secrets stripped. */
export function publicBond(b: Bond) {
  return { ...b, tranches: b.tranches.map(({ preimageHex: _p, ...t }) => t) };
}
export type PublicBond = ReturnType<typeof publicBond>;
