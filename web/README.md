# OrbitBond — IXH26 (Team Nexora)

Satellite environmental bonds secured on the XRP Ledger (Testnet).

## Quick start

**Windows : double-cliquez `DEMARRER.bat`** (installe Node.js si besoin, les dépendances, configure le Testnet et ouvre le site).

### Manual (Windows / macOS / Linux)

```bash
npm install
npm run setup   # creates + configures 13 Testnet accounts (2–4 min, once)
npm run dev     # http://localhost:3000
```

You can also initialize from the **Admin** page instead of `npm run setup`.
Wallet seeds and app state live in `.data/` (git-ignored — never commit it).

## Demo scenarios (Admin page)

| Scenario | Steps |
| --- | --- |
| 1 — Early deorbit | Create bond → 2 oracle sources "Confirme" → all tranches released → Settle (bonus) |
| 2 — Late deorbit | Create bond → wait past T2 (~3.5 min) → "Traiter les échéances" → confirm → Settle |
| 3 — Abandonment | Create bond → wait past T4 (~5.5 min) → "Traiter les échéances" → Settle |

Tip: start scenarios 2 and 3 at the beginning of the pitch.


## Checks

```bash
npm test                      # finance engine unit tests
npx tsx scripts/e2e.ts        # with `npm run dev` running: the 3 scenarios end-to-end via the API (~7 min)
npx tsx scripts/e2e.ts 1      # scenario 1 only (~1 min)
npx tsx scripts/balances.ts   # on-ledger balances of all 13 accounts (no secrets printed)
```

`npm run setup` is resumable: faucet calls retry with backoff, each on-chain step is recorded in `.data/state.json`
and skipped on re-run. Transactions are re-submitted with the same signed blob after a dropped WebSocket, so they
can never be applied twice. Settlement is likewise idempotent (double clicks / retries are safe).

## On-chain flow

1. Operator pays `tUSD` (simulated RLUSD) to `custody`.
2. `custody` subscribes `tOUSG` (simulated OUSG) from the simulated Ondo desk at the current NAV.
3. `custody` locks `tOUSG` in 4 **Token Escrows (XLS-85)**: one PREIMAGE-SHA-256 condition per tranche, progressive `CancelAfter`.
4. 2-of-3 simulated oracle sources sign attestations → fulfillments revealed → `EscrowFinish` to `settlement`.
5. Expired tranches → `EscrowCancel` → forfeited `tOUSG` sent to the cleanup fund.
6. Settlement redeems `tOUSG` at NAV and pays principal + 85% yield to the operator, 15% to the cleanup fund, bonus from the separately funded reserve.

`tOUSG` issuer uses `RequireAuth` (simulated KYC whitelist) and `AllowTrustLineLocking` (required for token escrow).

## Structure

```
src/lib/config.ts          all configurable parameters (illustrative)
src/lib/finance/engine.ts  collateral, NAV, settlement buckets (pure, tested)
src/lib/xrpl/              client, setup, bonds (escrow/oracle/settlement), crypto-conditions
src/lib/data/seed.ts       fictional organizations, satellites, missions
src/app/                   pages + API routes
scripts/                   setup-testnet.ts, test-finance.ts (npm test)
```

## Disclaimer

Fictional organizations and NORAD IDs. `tUSD`/`tOUSG` are Testnet tokens simulating RLUSD/OUSG; no affiliation with Ripple, Ondo Finance or any operator. Real OUSG is restricted to Qualified Purchasers. Financial coefficients are illustrative.
