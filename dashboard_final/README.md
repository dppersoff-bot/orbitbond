# OrbitBond — anti-debris bonds on the XRP Ledger

> **"We don't slow down the space race, we protect it."**
> Team **Nexora** · IXH26 Italian XRPL Hackathon, Bari · Track 2: XRPL Applications

OrbitBond turns the obligation to deorbit a satellite into a **yield-bearing bond enforced by the XRP Ledger**.
Before launch, a satellite operator deposits a bond. It is invested in tokenized T-bills and locked in a native XRPL escrow.
If the satellite deorbits on time (confirmed by 2 of 3 orbital-tracking oracles), the operator gets back its bond, the yield and an insurance premium rebate. If it does not, the bond and its yield go to a debris-removal fund.

> **Two versions.** **V1** (XRPL testnet, features live on mainnet): Token Escrow + crypto-condition, the 2-of-3 rule is enforced off-ledger with Shamir secret sharing, yield split 85 / 15.
> **V2** (Smart Escrow devnet, XLS-100): the ledger itself checks that 2 of 3 oracles issued a `DEORBITED` Credential (Rust/WASM finish function); 100 % of the yield to the operator, 1 % deposit fee, forfeited bonds split 70 % debris removal / 30 % performance bonus. See [V2](#v2--smart-escrow-xls-100-full-flow-on-devnet).

## The problem

- Space debris is growing fast: more than 36,000 tracked objects larger than 10 cm, and ESA reports a sharp degradation of the orbital environment.
- Deorbit rules exist (e.g. the FCC 5-year rule in low Earth orbit), but **nothing financially guarantees that operators follow them**. An operator that abandons a dead satellite pays nothing, and if it goes bankrupt, nobody pays for the clean-up.
- Research backing: a ~$200k orbital-use bond was proposed in *Nature Communications*; a UCL simulation shows bonds reduce abandoned satellites by 10.7 % to 18.6 %.

## How it works

1. **Risk-based bond**: `200,000 × f_altitude × f_mass × f_propulsion × f_history`, bounded to [5,000 ; 1,000,000].
2. **Deposit and investment**: the operator pays the bond in a euro stablecoin; the Fund converts it into a tokenized T-bill (tBILL, ~4 %/year).
3. **Lock**: the Fund creates an XRPL **Token Escrow** (XLS-85) with a crypto-condition (`PREIMAGE-SHA-256`) and a `CancelAfter` deadline. No `FinishAfter`: money leaves as soon as the deorbit is proven.
4. **Oracles 2 of 3**: the condition's secret is split with **Shamir secret sharing** between 3 oracles and then erased. Any 2 shares rebuild it; a single share is useless.
5. **On time** → `EscrowFinish`: bond + 85 % of the yield to the operator, 15 % to debris removal, plus an insurance rebate.
6. **Too late** → after the deadline (ledger time), `EscrowCancel` returns the bond and its yield to the Fund, which finances removal.

**Why the operator joins**: the bond costs nothing (it earns yield), it pays off (insurance rebate, 20 % lower bond on the next launch with the *Fast Deorbiter* track record), and it will eventually be required (regulation, public procurement).

**Why XRPL**: 100 % native features, no smart contract to maintain for years: Token Escrow, crypto-conditions, trust lines, and real-world assets already live on XRPL (tokenized T-bills, MiCA-compliant euro stablecoin).

## Demo results (XRPL testnet)

| | |
|---|---|
| **Sat-A** — 300 kg, 550 km, propulsion | bond 50,000 tEUR, 5 years at 4 % → 10,832.65 interest |
| Operator receives | 59,207.75 (bond + 85 %) + 2,000 insurance rebate = **61,207.75 tEUR** |
| *Same money in T-bills alone* | *60,832.64 tEUR* |
| Debris removal receives | 1,624.90 tEUR |
| **Sat-B** — 5 kg, 650 km, no propulsion | bond 75,000 tEUR, stays in orbit → Fund recovers ≈ 91,249 tEUR |
| **Cheating attempt** | fake secret or a single oracle share → `tecCRYPTOCONDITION_ERROR` (rejected by the ledger) |

Testnet transactions:
- [EscrowFinish (Sat-A)](https://testnet.xrpl.org/transactions/14B4FC60323AFC22796D5C68DE1DFF9C1CF6970AF31307BC9A415977110314EE)
- [Insurance rebate](https://testnet.xrpl.org/transactions/63C8AE0D6C18A33F5B20E8F99C2393A937BDE0540FBE6C6BC74EBE575FEB718D)
- [EscrowCancel (Sat-B)](https://testnet.xrpl.org/transactions/E5194A02545388C9FE0E979943BBB44599DCCE2EBECD4E1A8DF4FCCBA55663C9)

Full run log: [`docs/demo_output.txt`](docs/demo_output.txt).

## Architecture

| Account | Role |
|---|---|
| Issuer | Issues `TEU` (test euro) and `TBL` (test T-bill). Flags: DefaultRipple + AllowTrustLineLocking |
| Fund | Receives bonds, buys tBILL, **creates the escrows** (an `EscrowCancel` always returns funds to the creator) |
| Settlement | Escrow destination: redeems tBILL and splits 85 / 15 |
| Operators A and B | Sat-A deorbits on time, Sat-B stays in orbit |
| Cleanup | Receives 15 % of the yield |
| Insurer | Pays the premium rebate |

| File | Content |
|---|---|
| `bond.py` | Core API: `create_bond`, `confirm_deorbit`, `expire_bond`, `tentative_triche`, `etat_bonds` |
| `caution.py` | Bond formula + unit tests |
| `shamir.py` | Shamir 2-of-3 secret sharing over the prime field 2^521 − 1 |
| `nav.py` | Simulated T-bill yield (`nav.json`) |
| `tokens.py` | Issuer setup, trust lines, tBILL subscription / redemption |
| `accounts.py` | Testnet accounts via faucet (seeds in `.env`, never printed) |
| `ledger.py` | Submit-and-wait, ledger time, deadline waiting |
| `cli_demo.py` | Full end-to-end scenario |

## Run it

```bash
pip install -r requirements.txt
python caution.py              # unit tests of the bond formula
python cli_demo.py --setup     # first run: faucet accounts + tokens
python cli_demo.py             # full scenario (≈ 10 min on a busy testnet)
```

Requires Python 3.11+ and `xrpl-py` with Token Escrow support. Seeds are stored in `.env` (git-ignored, see `.env.example`).

## V2 — Smart Escrow (XLS-100), full flow on devnet

The complete bond runs on the Smart Escrow devnet: the bond is held in **tBILL inside a Token Escrow that carries a Rust/WASM finish function**. It is released **directly to the operator** only when **2 of 3 orbital-tracking oracles** have issued a `DEORBITED` Credential (0 or 1 → `tecBYTECODE_REJECTED`). The operator keeps 100 % of the yield and gets an insurance rebate; a forfeited bond goes 70 % to debris removal and 30 % as a performance bonus to on-time operators. OrbitBond earns a 1 % deposit fee and never holds the bond. Details: [`smart-escrow-v2/`](smart-escrow-v2/), log: [`docs/v2_full_devnet_output.txt`](docs/v2_full_devnet_output.txt).

## Known limitations (MVP)

- Oracles, the T-bill conversion and the yield are simulated.
- V1: the settlement account that splits 85 / 15 is a trust point. V2 removes it (direct payout from the Smart Escrow), but XLS-100 is only live on a devnet today.
- The dashboard is a local simulation of the V2 rules; the real transactions are in `docs/`.
- In production, the token issuer must allow escrow (AllowTrustLineLocking), and tokenized T-bills such as OUSG are restricted to qualified purchasers.

## Roadmap

- Common pool for insurers' sponsorship and forfeited bonds in a **Single Asset Vault (XLS-65)**.
- Fund as a 2-of-3 multisig (regulators + insurer).
- Atomic settlement with **Batch** (XLS-56), fees sponsored for small operators with **Sponsor** (XLS-68).
- Go-to-market: Europe first (mandatory space insurance), then the US through FCC regulation, then Japan.

## AI disclosure

Claude (Anthropic) was used for ideation, documentation, to generate the Python XRPL code (V1) and the simulation dashboard (`dashboard/`: orbital decay, radar oracles, Monte-Carlo, Streamlit). The code was reviewed and run by the team (XRPL testnet, Smart Escrow devnet). Each AI-generated file starts with a header comment saying so.

## License

MIT

## Simulation dashboard — `dashboard/`

Streamlit app (Python) that simulates the full V2 model with the exact rules of the devnet run, and shows the real devnet transactions as proofs.

| Tab | What it shows |
|---|---|
| Satellites | risk-based bond for Sat-A (300 kg, 550 km, propulsion → 50,000) and Sat-B (5 kg, 650 km, no propulsion → 75,000), 1 % fee |
| Orbit | orbital decay with atmospheric drag (exponential atmosphere) + deorbit burn, animated |
| Oracles | noisy radar measurements for ESA, LeoLabs, Space-Track; Credentials; EscrowFinish rejected at 0 or 1 confirmation (`tecBYTECODE_REJECTED`), accepted at 2 |
| Pool | Monte-Carlo: a compliant operator earns ~25–31 % over 5 years vs 21.7 % in T-bills alone (abandonment 0–17 %); the clean-up fund never goes negative |
| On-chain | bond states, OrbitBond revenue, links to the real devnet / testnet transactions |

Demo result (same as the devnet): Sat-A receives 60,832.65 + 2,000 rebate + 27,374.69 performance bonus − 500 fee = **89,707.34 tEUR**; Sat-B's 91,248.97 go 63,874.28 to clean-up and 27,374.69 to Sat-A.

```bash
cd dashboard && pip install -r requirements.txt && streamlit run app.py
```

## Web app (demo) — `web/`

The full demo web app (Next.js + xrpl.js, XRPL Testnet: Token Escrow per tranche, 2-of-3 oracle panel,
settlement buckets, transparency, insurer and debris-removal pages) lives in [`web/`](web/).
Windows: double-click `web/DEMARRER.bat`. Otherwise: `cd web && npm install && npm run setup && npm run dev`.
See [`web/README.md`](web/README.md).
