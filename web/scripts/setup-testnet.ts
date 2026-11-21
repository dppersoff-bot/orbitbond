// Usage: npm run setup — creates & configures all Testnet accounts (≈2–4 min).
import { setupTestnet } from "../src/lib/xrpl/setup";
import { getClient } from "../src/lib/xrpl/client";

setupTestnet((m) => console.log("•", m))
  .then(async () => { (await getClient()).disconnect(); console.log("OK — lancez `npm run dev`."); })
  .catch((e) => { console.error("ÉCHEC :", e); process.exit(1); });
