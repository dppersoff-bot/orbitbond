import { AccountSetAsfFlags, TrustSetFlags, Wallet } from "xrpl";
import { TOKENS } from "../config";
import { ACCOUNT_KEYS, addLog, loadState, saveState, type AccountKey } from "../store";
import { addr, currencyHex, getClient, payOusg, payUsd, submit } from "./client";

const OUSG_HOLDERS: AccountKey[] = ["ondoDesk", "custody", "settlement", "cleanupFund"];

async function fundAll(progress: (m: string) => void) {
  const client = await getClient();
  const s = loadState();
  const missing = ACCOUNT_KEYS.filter((k) => !s.wallets[k]);
  // Faucet sequentially, with exponential backoff on rate limiting (HTTP 429).
  // Each wallet is persisted as soon as it is funded, so a re-run resumes.
  for (const k of missing) {
    for (let attempt = 0; ; attempt++) {
      try {
        const { wallet } = await client.fundWallet(Wallet.generate());
        s.wallets[k] = { address: wallet.classicAddress, seed: wallet.seed! };
        saveState();
        progress(`Compte financé : ${k} → ${wallet.classicAddress}`);
        break;
      } catch (e) {
        if (attempt >= 7) throw e;
        const wait = Math.min(60, 5 * 2 ** attempt);
        progress(`Faucet indisponible (${(e as Error).message.slice(0, 60)}…) — nouvel essai dans ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export async function setupTestnet(progress: (m: string) => void = () => {}) {
  await fundAll(progress);
  const s = loadState();
  if (s.setupAt) { progress("Déjà initialisé."); return; }
  s.setupSteps ??= [];

  /** Each on-chain step runs once; a re-run skips the ones already validated. */
  const step = async (id: string, fn: () => Promise<unknown>) => {
    if (s.setupSteps!.includes(id)) return;
    await fn();
    s.setupSteps!.push(id);
    saveState();
  };
  const set = (k: AccountKey, flag: number, label: string) =>
    step(`flag:${k}:${flag}`, () => submit(k, { TransactionType: "AccountSet", SetFlag: flag }, { label }));

  // 1. Issuer configuration (flags must be set BEFORE any trust line exists for RequireAuth)
  await Promise.all([
    set("issuerUsd", AccountSetAsfFlags.asfDefaultRipple, "tUSD : DefaultRipple"),
    (async () => {
      await set("issuerOusg", AccountSetAsfFlags.asfDefaultRipple, "tOUSG : DefaultRipple");
      await set("issuerOusg", AccountSetAsfFlags.asfRequireAuth, "tOUSG : RequireAuth (porteurs autorisés uniquement)");
      await set("issuerOusg", AccountSetAsfFlags.asfAllowTrustLineLocking, "tOUSG : AllowTrustLineLocking (XLS-85)");
    })(),
  ]);
  progress("Émetteurs configurés.");

  // 2. Trust lines
  const holders = ACCOUNT_KEYS.filter((k) => k !== "issuerUsd" && k !== "issuerOusg");
  await Promise.all(holders.map(async (k) => {
    await step(`trust:usd:${k}`, () => submit(k, {
      TransactionType: "TrustSet",
      LimitAmount: { currency: currencyHex(TOKENS.usd.code), issuer: addr("issuerUsd"), value: "1000000000000" },
    }, { label: `Trustline tUSD — ${k}` }));
    if (OUSG_HOLDERS.includes(k)) {
      await step(`trust:ousg:${k}`, () => submit(k, {
        TransactionType: "TrustSet",
        LimitAmount: { currency: currencyHex(TOKENS.ousg.code), issuer: addr("issuerOusg"), value: "1000000000000" },
      }, { label: `Trustline tOUSG — ${k}` }));
    }
  }));
  progress("Trustlines créées.");

  // 3. Issuer authorizes tOUSG holders (simulates Ondo KYC/whitelist)
  for (const k of OUSG_HOLDERS) {
    await step(`auth:${k}`, () => submit("issuerOusg", {
      TransactionType: "TrustSet",
      Flags: TrustSetFlags.tfSetfAuth,
      LimitAmount: { currency: currencyHex(TOKENS.ousg.code), issuer: addr(k), value: "0" },
    }, { label: `Autorisation tOUSG (KYC simulé) — ${k}` }));
  }
  progress("Porteurs tOUSG autorisés.");

  // 4. Initial distribution
  await Promise.all([
    step("dist:opA", () => payUsd("issuerUsd", "opA", 20_000_000, "Émission tUSD → Aurora")),
    step("dist:opB", () => payUsd("issuerUsd", "opB", 20_000_000, "Émission tUSD → Kestrel")),
    step("dist:opC", () => payUsd("issuerUsd", "opC", 20_000_000, "Émission tUSD → Meridian")),
    step("dist:insurer", () => payUsd("issuerUsd", "insurer", 5_000_000, "Émission tUSD → Helix (assureur)")),
    step("dist:deskUsd", () => payUsd("issuerUsd", "ondoDesk", 200_000_000, "Liquidité de rachat tUSD → Desk")),
    step("dist:deskOusg", () => payOusg("issuerOusg", "ondoDesk", 200_000_000, "Inventaire tOUSG → Desk")),
  ]);
  progress("Distribution initiale effectuée.");

  // 5. Insurer funds the bonus reserve (separately financed, never collateral)
  await step("reserve", () => payUsd("insurer", "bonusReserve", 1_000_000, "Contribution assureur → Réserve de bonus"));

  s.setupAt = Math.floor(Date.now() / 1000);
  s.navEpoch = s.setupAt;
  addLog("Initialisation Testnet terminée.");
  saveState();
  progress("Initialisation terminée ✔");
}
