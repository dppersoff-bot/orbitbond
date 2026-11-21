# OrbitBond V2 — Smart Escrow (XLS-100)

The V1 escrow is unlocked by a secret split between 3 oracles (Shamir 2-of-3), rebuilt off-chain.
**V2 moves the rule on-chain**: the escrow carries a Rust/WASM finish function that only lets the bond go to the operator if **at least 2 of 3 orbital-tracking oracles** have issued a `DEORBITED` Credential to the operator.

- The 3 oracle accounts are written in the escrow's `Data` field (3 × 20-byte AccountIDs) when the Fund creates it.
- `EscrowFinish` runs the WASM: it computes the Credential ledger ID for each (operator, oracle, "DEORBITED") pair and counts the ones that exist. 0 or 1 → `tecBYTECODE_REJECTED`; 2 or 3 → the escrow is released.
- The deadline stays native: after `CancelAfter`, only `EscrowCancel` is possible and the bond returns to the Fund (escrow creator).
- No shared secret, no off-chain reconstruction: oracles are real on-chain accounts and the ledger itself enforces the quorum.

## Devnet run

Ran on the Smart Escrow devnet (`wss://wasm-devnet.dev.ripplex.io:51233`): see [`../docs/v2_devnet_output.txt`](../docs/v2_devnet_output.txt).

| Step | Result |
|---|---|
| Finish with 0 confirmations | `tecBYTECODE_REJECTED` |
| Finish with 1 of 3 (ESA) | `tecBYTECODE_REJECTED` |
| Finish with 2 of 3 (ESA + Space-Track) | `tesSUCCESS` — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/DE09093362F8574384DB8F701555EECE6DCD5A2A975D0101D822B69270EB4C7F) |
| Sat-B, no confirmation, deadline passed | `EscrowCancel` `tesSUCCESS`, bond back to the Fund — [tx](https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/4131221EA62AD367B74CF56166DF3A402E2109C1EA124E6128541AFC5D56F572) |

## Build and run

Built with [`ripple/xrpl-wasm-stdlib`](https://github.com/ripple/xrpl-wasm-stdlib) (place this folder in `examples/smart-escrows/orbitbond` and add it to `examples/Cargo.toml` workspace members):

```bash
cargo build --release --target wasm32v1-none          # → orbitbond.wasm (~3 KB)
FAUCET_HOST=wasm-devnet-faucet.dev.ripplex.io \
node tests/runSingleTest.js examples/smart-escrows/orbitbond \
  examples/target/wasm32v1-none/release/orbitbond.wasm wss://wasm-devnet.dev.ripplex.io:51233
```

`runSingleTest.js` was patched to pass `faucetHost` from `FAUCET_HOST` to `client.fundWallet` for the new devnet.

## Scope

- XRP bond on the devnet (V1 shows the tokenized T-bill + Token Escrow flow on testnet).
- Next step: split 85 / 15 and the insurer rebate inside the finish logic, and a progressive penalty based on ledger time, removing the V1 settlement account.
