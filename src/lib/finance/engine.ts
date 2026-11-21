import { COLLATERAL_MODEL, DEMO_TIME, ECONOMICS } from "../config";

export type Propulsion = "chemical" | "electric" | "none";

export interface SatelliteSpec {
  massKg: number;
  altitudeKm: number;
  propulsion: Propulsion;
  missionYears: number;
}

export interface CollateralQuote {
  base: number;
  altitudeFactor: number;
  altitudeLabel: string;
  propulsionFactor: number;
  durationFactor: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Risk-based collateral (illustrative coefficients, see config). */
export function quoteCollateral(s: SatelliteSpec): CollateralQuote {
  const m = COLLATERAL_MODEL;
  const band = m.altitudeBands.find((b) => s.altitudeKm < b.maxKm)!;
  const prop = m.propulsion[s.propulsion] ?? m.propulsion.none;
  const base = s.massKg * m.usdPerKg;
  const durationFactor = 1 + m.perMissionYear * Math.max(0, s.missionYears);
  const raw = base * band.factor * prop.factor * durationFactor;
  const total = Math.max(m.minimum, Math.round(raw / 1000) * 1000);
  return {
    base,
    altitudeFactor: band.factor,
    altitudeLabel: band.label,
    propulsionFactor: prop.factor,
    durationFactor: round2(durationFactor),
    total,
  };
}

/** Simulated NAV per tOUSG token, compounding in compressed demo time. */
export function navAt(unixSec: number, navEpochUnix: number): number {
  const years = Math.max(0, unixSec - navEpochUnix) / DEMO_TIME.secondsPerYear;
  return round6(ECONOMICS.navStart * Math.pow(1 + ECONOMICS.simulatedApy, years));
}

export interface TrancheResult {
  pct: number;
  ousg: number;
  status: "released" | "forfeited";
}

export interface SettlementInput {
  collateralUsd: number;
  tranches: TrancheResult[];
  navAtSettlement: number;
  early: boolean;
  bonusReserveAvailable: number;
}

/** Every bucket is kept separate: principal, yield, bonus, penalty, fees. */
export interface SettlementBreakdown {
  releasedPrincipal: number;
  releasedProceeds: number;
  releasedYield: number;
  operatorYield: number;
  cleanupYield: number;
  platformFee: number;
  forfeitedPrincipal: number;
  forfeitedProceeds: number;
  bonus: number;
  operatorTotal: number;
  cleanupTotal: number;
}

export function computeSettlement(i: SettlementInput): SettlementBreakdown {
  const rel = i.tranches.filter((t) => t.status === "released");
  const forf = i.tranches.filter((t) => t.status === "forfeited");
  const releasedPrincipal = round2(rel.reduce((a, t) => a + t.pct * i.collateralUsd, 0));
  const releasedProceeds = round2(rel.reduce((a, t) => a + t.ousg * i.navAtSettlement, 0));
  const forfeitedPrincipal = round2(forf.reduce((a, t) => a + t.pct * i.collateralUsd, 0));
  const forfeitedProceeds = round2(forf.reduce((a, t) => a + t.ousg * i.navAtSettlement, 0));

  // Yield is only split if it is positive and realized. A NAV loss is borne by
  // the released collateral: XRPL does not guarantee principal.
  const releasedYield = round2(releasedProceeds - releasedPrincipal);
  const positiveYield = Math.max(0, releasedYield);
  const platformFee = round2(positiveYield * ECONOMICS.platformFeeOnYield);
  const distributable = positiveYield - platformFee;
  const operatorYield = round2(distributable * ECONOMICS.yieldSplit.operator);
  const cleanupYield = round2(distributable - operatorYield);

  // Bonus: only if early, and capped by the separately funded reserve.
  const bonus = i.early
    ? round2(Math.min(i.collateralUsd * ECONOMICS.earlyBonusRate, i.bonusReserveAvailable))
    : 0;

  const operatorBase = releasedYield >= 0 ? releasedPrincipal : releasedProceeds;
  return {
    releasedPrincipal,
    releasedProceeds,
    releasedYield,
    operatorYield,
    cleanupYield,
    platformFee,
    forfeitedPrincipal,
    forfeitedProceeds,
    bonus,
    operatorTotal: round2(operatorBase + operatorYield + bonus),
    cleanupTotal: round2(cleanupYield + forfeitedProceeds),
  };
}

/** Deadlines of each tranche (unix seconds), progressively later. */
export function trancheSchedule(createdUnix: number) {
  return DEMO_TIME.tranchePcts.map((pct, idx) => ({
    index: idx,
    pct,
    cancelAfterUnix: createdUnix + DEMO_TIME.firstDeadlineSec + idx * DEMO_TIME.trancheSpacingSec,
  }));
}

export const fmtUsd = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
