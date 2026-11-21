// GÃ©nÃ©rÃ© avec l'aide de Claude (Anthropic) â€” assistant de code IA, hackathon IXH26. Relu et testÃ© par l'Ã©quipe Nexora.
// OrbitBond V2 â€” scÃ©nario de dÃ©mo sur le devnet Smart Escrow (XLS-100).
const xrpl = require("xrpl")

const EXPLORER = "https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/"
const CRED = xrpl.convertStringToHex("DEORBITED")
const line = (t) => console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`)
const link = (r) => EXPLORER + r.result.hash
const code = (r) => r.result.meta.TransactionResult

async function test(ctx) {
  const { client, deploy, finish, submit, fundWallet, finishEscrow, expectEscrowConsumed, getLedgerCloseTime } = ctx
  const fund = ctx.sourceWallet          // Fonds OrbitBond : crÃ©e les escrows
  const opA = ctx.destWallet             // Sat-A : dÃ©sorbite Ã  temps

  line("0. Comptes : Fonds, opÃ©rateurs, 3 oracles de suivi orbital")
  const oracles = [await fundWallet(), await fundWallet(), await fundWallet()]
  const opB = await fundWallet()
  const names = ["ESA", "LeoLabs", "Space-Track"]
  console.log(`   Fonds        ${fund.address}`)
  console.log(`   OpÃ©rateur A  ${opA.address}`)
  console.log(`   OpÃ©rateur B  ${opB.address}`)
  oracles.forEach((o, i) => console.log(`   Oracle ${names[i].padEnd(11)} ${o.address}`))
  const data = oracles.map((o) => Buffer.from(xrpl.decodeAccountID(o.address)).toString("hex")).join("").toUpperCase()

  line("1. Le Fonds crÃ©e le Smart Escrow de Sat-A (code Rust/WASM : 2 oracles sur 3)")
  const a = await deploy(fund, opA, finish, { Amount: xrpl.xrpToDrops(50), Data: data, cancelAfterOffset: 1800 })
  console.log(`   Escrow Sat-A crÃ©Ã© (sÃ©quence ${a.sequence}) â€” les 3 oracles sont inscrits dans le champ Data`)

  line("2. DÃ©bloquer sans aucune confirmation â†’ refusÃ© par le code de l'escrow")
  let r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence, expect: "tecBYTECODE_REJECTED" })
  console.log(`   ${code(r)}  ${link(r)}`)

  line("3. L'oracle ESA certifie la rentrÃ©e (Credential DEORBITED) â€” 1 oracle sur 3")
  r = await submit({ TransactionType: "CredentialCreate", Account: oracles[0].address, Subject: opA.address, CredentialType: CRED }, oracles[0])
  console.log(`   CredentialCreate ESA  ${link(r)}`)
  r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence, expect: "tecBYTECODE_REJECTED" })
  console.log(`   DÃ©blocage avec 1/3 â†’ ${code(r)}  ${link(r)}`)

  line("4. L'oracle Space-Track confirme â€” 2 oracles sur 3 â†’ la caution est libÃ©rÃ©e")
  r = await submit({ TransactionType: "CredentialCreate", Account: oracles[2].address, Subject: opA.address, CredentialType: CRED }, oracles[2])
  console.log(`   CredentialCreate Space-Track  ${link(r)}`)
  r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence })
  expectEscrowConsumed(r, "escrow Sat-A")
  console.log(`   DÃ©blocage avec 2/3 â†’ ${code(r)} : 50 XRP versÃ©s Ã  l'opÃ©rateur A  ${link(r)}`)

  line("5. Sat-B : aucune confirmation, la date limite passe â†’ la caution revient au Fonds")
  const b = await deploy(fund, opB, finish, { Amount: xrpl.xrpToDrops(75), Data: data, cancelAfterOffset: 25 })
  r = await finishEscrow(ctx, opB, { Owner: fund.address, OfferSequence: b.sequence, expect: ["tecBYTECODE_REJECTED", "tecNO_PERMISSION"] })
  console.log(`   Tentative de dÃ©blocage de Sat-B â†’ ${code(r)}`)
  const cancelAfter = (await client.request({ command: "ledger_entry", escrow: { owner: fund.address, seq: b.sequence } })).result.node.CancelAfter
  while ((await getLedgerCloseTime(client)) <= cancelAfter) {
    console.log("   â€¦ attente de la date limite (heure du ledger)")
    await new Promise((res) => setTimeout(res, 4000))
  }
  r = await submit({ TransactionType: "EscrowCancel", Account: fund.address, Owner: fund.address, OfferSequence: b.sequence }, fund)
  console.log(`   EscrowCancel â†’ ${code(r)} : 75 XRP retournÃ©s au Fonds  ${link(r)}`)
  if (code(r) !== "tesSUCCESS") process.exit(1)

  line("TerminÃ© : la rÃ¨gle Â« 2 oracles sur 3 Â» est vÃ©rifiÃ©e par le ledger lui-mÃªme")
}

module.exports = { test }

