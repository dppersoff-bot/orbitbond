# OrbitBond V2 — full flow on the Smart Escrow devnet (XLS-100 + Token Escrow)

V2 is the complete OrbitBond flow, with the release rule enforced by a **Smart Escrow**:

1. The operator deposits its bond in tEUR and pays a **1 % deposit fee** to OrbitBond.
2. The Fund converts the bond into **tBILL** (tokenized T-bills, ~4 %/year) and locks it in a **Token Escrow that carries a Rust/WASM finish function**. The 3 oracle accounts (ESA, LeoLabs, Space-Track) are written in the escrow's `Data` field.
3. When the satellite re-enters, oracles issue a `DEORBITED` **Credential** to the operator. The WASM counts them: 0 or 1 → `tecBYTECODE_REJECTED`; **2 of 3 → released**.
4. **The escrow pays the operator directly** (destination = operator): nobody holds the bond in between. The operator redeems its tBILL: bond + **100 % of the yield**, plus an **insurance rebate** (4 %).
5. If the deadline (`CancelAfter`) passes without quorum, `EscrowCancel` returns the tBILL to the Fund (escrow creator), which splits the forfeited value: **70 % debris removal, 30 % performance bonus** for operators that deorbited on time.

## Devnet run (`wss://wasm-devnet.dev.ripplex.io:51233`)

Full log: [`../docs/v2_full_devnet_output.txt`](../docs/v2_full_devnet_output.txt).

| Step | Result |
|---|---|
| Sat-A bond: 50,000 tBILL in Smart Escrow | `tesSUCCESS` |
| Finish with 0 then 1 oracle confirmation | `tecBYTECODE_REJECTED` (twice) |
| Finish with 2 of 3 confirmations | `tesSUCCESS` — 50,000 tBILL paid directly to operator A — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/1A84DA5B14ECB8C51BEA2447E2BCF410B5C913779162B7B7DC48C71A29BBDF77) |
| Operator A redeems tBILL after 5 years at 4 % | 60,832.65 tEUR (10,832.64 interest) |
| Insurance rebate | 2,000 tEUR — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/7E8C6B756822685016C2030EA3E3771ABA375303E3AA213E57789253AD0DEB33) |
| Sat-B: no quorum, deadline passed | `EscrowCancel` — 75,000 tBILL back to the Fund — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/B20D51F4FCCCB526CAB362E524117ED116452998866F08192108E458686321D6) |
| Forfeited value split | 63,874.28 tEUR to debris removal, 27,374.69 tEUR performance bonus to operator A — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/078E1B103693E9BF8B4AC5C777D8B58F19CBD4EBECD5C2B5DD3C01DD65341CBE) |
| **Operator A net** | **89,707.34 tEUR for a 50,000 bond** (T-bills alone: 60,832.65) |

The bonus is large in this demo because the cohort has 2 satellites and one of them abandons (50 %). With a realistic 10–17 % abandonment rate, the operator earns 25–29 % over 5 years versus 21.7 % in T-bills alone (see the forecast in the project docs).

## Files

- `src/lib.rs` — the finish function (2-of-3 oracle quorum via Credentials).
- `runTest.js` — full V2 scenario (above).
- `runTest_quorum.js` — minimal quorum-only scenario in XRP.

## Build and run

Built with [`ripple/xrpl-wasm-stdlib`](https://github.com/ripple/xrpl-wasm-stdlib): place this folder in `examples/smart-escrows/orbitbond` and add it to `examples/Cargo.toml` workspace members.

```bash
cargo build --release --target wasm32v1-none          # → orbitbond.wasm (~3 KB)
FAUCET_HOST=wasm-devnet-faucet.dev.ripplex.io \
node tests/runSingleTest.js examples/smart-escrows/orbitbond \
  examples/target/wasm32v1-none/release/orbitbond.wasm wss://wasm-devnet.dev.ripplex.io:51233
```

`tests/runSingleTest.js` was patched to pass `faucetHost` from `FAUCET_HOST` to `client.fundWallet` (the devnet moved to `wasm-devnet.dev.ripplex.io` with release 9).

## Known limits

- A finish function only answers yes/no: the redemption, the rebate and the forfeited-bond split are separate payments (Fund = to be a regulator multisig).
- The T-bill yield is simulated by the test issuer's redemption price.
