import assert from "node:assert/strict";
import { computeSettlement, navAt, quoteCollateral } from "../src/lib/finance/engine";

const q = quoteCollateral({ massKg: 420, altitudeKm: 550, propulsion: "electric", missionYears: 5 });
assert.equal(q.total, 866000); // 420*1500*1.0*1.1*1.25 = 866250 -> rounded to 1000s
console.log("Quote OK", q.total);

assert.equal(navAt(0, 0), 1);
assert.ok(Math.abs(navAt(60, 0) - 1.045) < 1e-9);
console.log("NAV OK");

// All released, early, NAV +4.5%
const s1 = computeSettlement({ collateralUsd: 1_000_000, navAtSettlement: 1.045, early: true, bonusReserveAvailable: 1_000_000,
  tranches: [0.25, 0.25, 0.25, 0.25].map((pct) => ({ pct, ousg: 250_000, status: "released" as const })) });
assert.equal(s1.releasedYield, 45_000);
assert.equal(s1.operatorYield, 38_250);
assert.equal(s1.cleanupYield, 6_750);
assert.equal(s1.bonus, 20_000);
assert.equal(s1.operatorTotal, 1_058_250);
// Conservation: proceeds = principal + operatorYield + cleanupYield + fee
assert.equal(s1.releasedPrincipal + s1.operatorYield + s1.cleanupYield + s1.platformFee, s1.releasedProceeds);
console.log("Scénario précoce OK");

// Two tranches forfeited, no bonus
const s2 = computeSettlement({ collateralUsd: 1_000_000, navAtSettlement: 1.1, early: false, bonusReserveAvailable: 1_000_000,
  tranches: [
    { pct: 0.25, ousg: 250_000, status: "forfeited" }, { pct: 0.25, ousg: 250_000, status: "forfeited" },
    { pct: 0.25, ousg: 250_000, status: "released" }, { pct: 0.25, ousg: 250_000, status: "released" },
  ] });
assert.equal(s2.bonus, 0);
assert.equal(s2.forfeitedProceeds, 550_000);
assert.equal(s2.cleanupTotal, 550_000 + s2.cleanupYield);
console.log("Scénario tardif OK");

// Bonus capped by the reserve, never paid from collateral
const s3 = computeSettlement({ collateralUsd: 1_000_000, navAtSettlement: 1, early: true, bonusReserveAvailable: 5_000,
  tranches: [{ pct: 1, ousg: 1_000_000, status: "released" }] });
assert.equal(s3.bonus, 5_000);
// NAV loss borne by released collateral, no yield split
const s4 = computeSettlement({ collateralUsd: 1_000_000, navAtSettlement: 0.99, early: false, bonusReserveAvailable: 0,
  tranches: [{ pct: 1, ousg: 1_000_000, status: "released" }] });
assert.equal(s4.operatorTotal, 990_000);
assert.equal(s4.cleanupYield, 0);
console.log("Plafond de bonus et perte de NAV OK\nTous les tests passent ✔");
