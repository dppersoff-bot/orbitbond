// FICTIONAL demo data. No real company, satellite or NORAD ID is represented.
// Any resemblance to real organizations is unintended; no partnership implied.
import type { Propulsion } from "../finance/engine";

export type OperatorKey = "opA" | "opB" | "opC";

export const OPERATORS: Record<OperatorKey, { name: string; country: string; insurer: string }> = {
  opA: { name: "Aurora Orbital Systems", country: "France", insurer: "helix" },
  opB: { name: "Kestrel Space Networks", country: "Canada", insurer: "atlas" },
  opC: { name: "Meridian SatCom", country: "Italie", insurer: "helix" },
};

export const INSURERS = {
  helix: { name: "Helix Space Underwriters", country: "Royaume-Uni", rebateRate: 0.08 },
  atlas: { name: "Atlas Orbital Re", country: "Suisse", rebateRate: 0.05 },
};

export const DEBRIS_COMPANIES = {
  vespera: { name: "Vespera Orbital Cleanup", country: "Japon", membership: "Premium (simulé)" },
  nimbus: { name: "Nimbus Debris Removal", country: "Royaume-Uni", membership: "Standard (simulé)" },
};

export type SatStatus = "operational" | "end_of_life" | "deorbiting" | "deorbited" | "abandoned";

export interface SeedSatellite {
  id: string;
  name: string;
  noradId: string; // SIMULATED identifier
  operator: OperatorKey;
  altitudeKm: number;
  massKg: number;
  propulsion: Propulsion;
  launchDate: string;
  missionEnd: string;
  disposalDeadline: string;
  status: SatStatus;
  annualPremium: number;
  collisionRisk: "faible" | "modéré" | "élevé";
}

export const SEED_SATELLITES: SeedSatellite[] = [
  { id: "sat-aos-1", name: "AURORA-1", noradId: "SIM-90011", operator: "opA", altitudeKm: 550, massKg: 420, propulsion: "electric", launchDate: "2022-03-14", missionEnd: "2027-03-14", disposalDeadline: "2028-03-14", status: "operational", annualPremium: 380_000, collisionRisk: "faible" },
  { id: "sat-aos-2", name: "AURORA-2", noradId: "SIM-90012", operator: "opA", altitudeKm: 780, massKg: 950, propulsion: "chemical", launchDate: "2019-06-02", missionEnd: "2026-06-02", disposalDeadline: "2027-06-02", status: "end_of_life", annualPremium: 910_000, collisionRisk: "modéré" },
  { id: "sat-ksn-1", name: "KESTREL-7", noradId: "SIM-90071", operator: "opB", altitudeKm: 1150, massKg: 1300, propulsion: "chemical", launchDate: "2018-11-20", missionEnd: "2026-11-20", disposalDeadline: "2027-11-20", status: "deorbiting", annualPremium: 1_450_000, collisionRisk: "élevé" },
  { id: "sat-ksn-2", name: "KESTREL-9", noradId: "SIM-90079", operator: "opB", altitudeKm: 500, massKg: 260, propulsion: "none", launchDate: "2021-01-08", missionEnd: "2025-01-08", disposalDeadline: "2026-01-08", status: "abandoned", annualPremium: 240_000, collisionRisk: "modéré" },
  { id: "sat-msc-1", name: "MERIDIAN-3", noradId: "SIM-90303", operator: "opC", altitudeKm: 620, massKg: 610, propulsion: "electric", launchDate: "2020-09-30", missionEnd: "2025-09-30", disposalDeadline: "2026-09-30", status: "deorbited", annualPremium: 520_000, collisionRisk: "faible" },
];

export const CLEANUP_MISSIONS = [
  { id: "mis-01", target: "KESTREL-9 (SIM-90079)", orbit: "500 km, LEO", provider: "vespera", estCost: 3_200_000, status: "Proposée" },
  { id: "mis-02", target: "Étage supérieur inconnu (SIM-DEB-112)", orbit: "840 km, SSO", provider: "nimbus", estCost: 5_800_000, status: "En évaluation" },
  { id: "mis-03", target: "Débris de fragmentation (SIM-DEB-207)", orbit: "960 km, LEO", provider: "vespera", estCost: 7_400_000, status: "Ouverte aux offres" },
];
