// Usage: npx tsx scripts/balances.ts — prints on-ledger balances of every account (no secrets).
import { balances } from "../src/lib/xrpl/bonds";
import { getClient } from "../src/lib/xrpl/client";
balances().then(async (b) => {
  for (const [k, v] of Object.entries(b)) console.log(k.padEnd(13), v.address, "XRP", v.xrp.padStart(8), "tUSD", String(v.tUSD).padStart(14), "tOUSG", v.tOUSG);
  (await getClient()).disconnect();
});
