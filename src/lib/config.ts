// Central, configurable parameters. Every coefficient here is ILLUSTRATIVE,
// not scientifically or actuarially validated.

export const NETWORK = {
  name: "XRPL Testnet",
  wss: process.env.XRPL_WSS ?? "wss://s.altnet.rippletest.net:51233",
  explorer: "https://testnet.xrpl.org",
};

export const TOKENS = {
  usd: { code: "tUSD", label: "tUSD (RLUSD simulé)" },
  ousg: { code: "tOUSG", label: "tOUSG (OUSG simulé)" },
};

export const ECONOMICS = {
  // Realized-yield split (must sum to 1 together with platformFeeOnYield).
  yieldSplit: { operator: 0.85, cleanup: 0.15 },
  // OrbitBond revenue model is NOT final: kept at 0 by default, configurable.
  platformFeeOnYield: 0,
  issuanceFeeRate: 0,
  // Early-deorbit bonus, paid ONLY from the separately funded bonus reserve.
  earlyBonusRate: 0.02,
  // Simulated tokenized-treasury yield (OUSG-like NAV accrual).
  simulatedApy: 0.045,
  navStart: 1.0,
};

export const DEMO_TIME = {
  // Compressed time for the live demo: 60 real seconds = 1 simulated year.
  secondsPerYear: 60,
  // Default bond schedule for live demo bonds (seconds from creation).
  firstDeadlineSec: 150,
  trancheSpacingSec: 60,
  tranchePcts: [0.25, 0.25, 0.25, 0.25],
};

// Collateral model coefficients (illustrative).
export const COLLATERAL_MODEL = {
  usdPerKg: 1500,
  minimum: 250_000,
  altitudeBands: [
    { maxKm: 450, factor: 0.6, label: "< 450 km (désorbitation naturelle rapide)" },
    { maxKm: 650, factor: 1.0, label: "450–650 km" },
    { maxKm: 900, factor: 1.5, label: "650–900 km (zone congestionnée)" },
    { maxKm: Infinity, factor: 2.0, label: "> 900 km (persistance longue)" },
  ],
  propulsion: {
    chemical: { factor: 1.0, label: "Chimique" },
    electric: { factor: 1.1, label: "Électrique" },
    none: { factor: 1.8, label: "Aucune" },
  } as Record<string, { factor: number; label: string }>,
  perMissionYear: 0.05,
};
