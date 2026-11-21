// Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
// OrbitBond V2 complète (option B) sur le devnet Smart Escrow :
//   caution en tBILL (bons du Trésor tokenisés) + Token Escrow + Smart Escrow « 2 oracles sur 3 »
//   → l'escrow paie l'opérateur DIRECTEMENT (personne ne touche la caution au passage)
//   → ristourne de l'assureur, bonus de performance prélevé sur les cautions perdues, 70 % au nettoyage.
const xrpl = require("xrpl")

const EXPLORER = "https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/"
const CRED = xrpl.convertStringToHex("DEORBITED")
const NAV_5Y = Number((1.04 ** 5).toFixed(8))        // tBILL à 4 %/an pendant 5 ans
const FEE = 0.01, REBATE = 0.04, BONUS_SHARE = 0.30   // frais de dépôt, ristourne, part bonus des cautions perdues
const fmt = (v) => Number(v.toFixed(6)).toString()
const eur = (v) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const line = (t) => console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`)
const link = (r) => EXPLORER + r.result.hash
const code = (r) => r.result.meta.TransactionResult

async function test(ctx) {
  const { client, deploy, finish, submit, fundWallet, finishEscrow, expectEscrowConsumed, getLedgerCloseTime } = ctx
  const ok = (r, label) => { if (code(r) !== "tesSUCCESS") { console.error(`${label} : ${code(r)}`); process.exit(1) } return r }
  const tx = async (t, w, label) => ok(await submit(t, w), label)

  line("0. Comptes (devnet Smart Escrow)")
  const fund = ctx.sourceWallet, opA = ctx.destWallet
  const [opB, issuer, insurer, cleanup, orbitbond, ...oracles] = []
    .concat(await Promise.all([fundWallet(), fundWallet(), fundWallet(), fundWallet(), fundWallet()]))
    .concat(await Promise.all([fundWallet(), fundWallet(), fundWallet()]))
  const roles = { "Fonds": fund, "Opérateur A (Sat-A)": opA, "Opérateur B (Sat-B)": opB, "Émetteur tEUR/tBILL": issuer,
    "Assureur": insurer, "Nettoyage": cleanup, "OrbitBond": orbitbond,
    "Oracle ESA": oracles[0], "Oracle LeoLabs": oracles[1], "Oracle Space-Track": oracles[2] }
  for (const [k, w] of Object.entries(roles)) console.log(`   ${k.padEnd(22)} ${w.address}`)
  const TEU = (v) => ({ currency: "TEU", issuer: issuer.address, value: fmt(v) })
  const TBL = (v) => ({ currency: "TBL", issuer: issuer.address, value: fmt(v) })

  line("1. Émetteur : tEUR (stablecoin) et tBILL (bons du Trésor), escrow de tokens autorisé")
  await tx({ TransactionType: "AccountSet", Account: issuer.address, SetFlag: 8 }, issuer, "DefaultRipple")
  let r = await tx({ TransactionType: "AccountSet", Account: issuer.address, SetFlag: 17 }, issuer, "AllowTrustLineLocking")
  console.log(`   AllowTrustLineLocking  ${link(r)}`)
  const lines = [[fund, ["TEU", "TBL"]], [opA, ["TEU", "TBL"]], [opB, ["TEU", "TBL"]],
    [insurer, ["TEU"]], [cleanup, ["TEU"]], [orbitbond, ["TEU"]]]
  await Promise.all(lines.map(async ([w, curs]) => {
    for (const c of curs) await tx({ TransactionType: "TrustSet", Account: w.address,
      LimitAmount: { currency: c, issuer: issuer.address, value: "1000000000" } }, w, "TrustSet")
  }))
  for (const w of [opA, opB, insurer])
    await tx({ TransactionType: "Payment", Account: issuer.address, Destination: w.address, Amount: TEU(1_000_000) }, issuer, "Distribution")
  console.log("   Trustlines ouvertes, 1 000 000 tEUR distribués aux opérateurs et à l'assureur")

  const data = oracles.map((o) => Buffer.from(xrpl.decodeAccountID(o.address)).toString("hex")).join("").toUpperCase()

  async function createBond(op, bond, deadlineSec, label) {
    await tx({ TransactionType: "Payment", Account: op.address, Destination: fund.address, Amount: TEU(bond) }, op, "Dépôt")
    const f = await tx({ TransactionType: "Payment", Account: op.address, Destination: orbitbond.address, Amount: TEU(bond * FEE) }, op, "Frais")
    await tx({ TransactionType: "Payment", Account: fund.address, Destination: issuer.address, Amount: TEU(bond) }, fund, "Souscription")
    await tx({ TransactionType: "Payment", Account: issuer.address, Destination: fund.address, Amount: TBL(bond) }, issuer, "tBILL")
    const e = await deploy(fund, op, finish, { Amount: TBL(bond), Data: data, cancelAfterOffset: deadlineSec })
    console.log(`   ${label} : caution ${eur(bond)} tEUR → ${eur(bond)} tBILL en Smart Escrow (séq. ${e.sequence}), frais OrbitBond ${eur(bond * FEE)} tEUR  ${link(f)}`)
    return e
  }

  line("2. Dépôt des cautions : placées en tBILL et bloquées dans le Smart Escrow (destination = opérateur)")
  const bondA = 50_000, bondB = 75_000
  const b = await createBond(opB, bondB, 120, "Sat-B (5 kg, 650 km, sans propulsion)")
  const a = await createBond(opA, bondA, 3600, "Sat-A (300 kg, 550 km, propulsion)  ")

  line(`3. Cinq ans passent : le tBILL vaut ${NAV_5Y.toFixed(4)} tEUR (4 %/an)`)

  line("4. Sat-A redescend : les oracles certifient la rentrée, le Smart Escrow compte les confirmations")
  r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence, expect: "tecBYTECODE_REJECTED" })
  console.log(`   0 oracle sur 3  → ${code(r)}  ${link(r)}`)
  r = await tx({ TransactionType: "CredentialCreate", Account: oracles[0].address, Subject: opA.address, CredentialType: CRED }, oracles[0], "Credential ESA")
  console.log(`   ESA certifie (Credential DEORBITED)  ${link(r)}`)
  r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence, expect: "tecBYTECODE_REJECTED" })
  console.log(`   1 oracle sur 3  → ${code(r)}  ${link(r)}`)
  r = await tx({ TransactionType: "CredentialCreate", Account: oracles[2].address, Subject: opA.address, CredentialType: CRED }, oracles[2], "Credential Space-Track")
  console.log(`   Space-Track certifie (Credential DEORBITED)  ${link(r)}`)
  r = await finishEscrow(ctx, opA, { Owner: fund.address, OfferSequence: a.sequence })
  expectEscrowConsumed(r, "escrow Sat-A")
  console.log(`   2 oracles sur 3 → ${code(r)} : ${eur(bondA)} tBILL versés DIRECTEMENT à l'opérateur A  ${link(r)}`)

  line("5. L'opérateur A récupère sa caution + 100 % des intérêts, et sa ristourne d'assurance")
  const valueA = bondA * NAV_5Y
  await tx({ TransactionType: "Payment", Account: opA.address, Destination: issuer.address, Amount: TBL(bondA) }, opA, "Rachat A")
  r = await tx({ TransactionType: "Payment", Account: issuer.address, Destination: opA.address, Amount: TEU(valueA) }, issuer, "Rachat A tEUR")
  console.log(`   Rachat des tBILL : ${eur(valueA)} tEUR (dont ${eur(valueA - bondA)} d'intérêts)  ${link(r)}`)
  const rebate = REBATE * bondA
  r = await tx({ TransactionType: "Payment", Account: insurer.address, Destination: opA.address, Amount: TEU(rebate) }, insurer, "Ristourne")
  console.log(`   Ristourne de l'assureur : ${eur(rebate)} tEUR  ${link(r)}`)

  line("6. Sat-B reste en orbite : déblocage refusé, puis la date limite passe")
  r = await finishEscrow(ctx, opB, { Owner: fund.address, OfferSequence: b.sequence, expect: ["tecBYTECODE_REJECTED", "tecNO_PERMISSION"] })
  console.log(`   Tentative de déblocage de Sat-B → ${code(r)}`)
  const cancelAfter = (await client.request({ command: "ledger_entry", escrow: { owner: fund.address, seq: b.sequence } })).result.node.CancelAfter
  while ((await getLedgerCloseTime(client)) <= cancelAfter) {
    console.log("   … attente de la date limite (heure du ledger)")
    await new Promise((res) => setTimeout(res, 5000))
  }
  r = await tx({ TransactionType: "EscrowCancel", Account: fund.address, Owner: fund.address, OfferSequence: b.sequence }, fund, "EscrowCancel")
  console.log(`   EscrowCancel → ${eur(bondB)} tBILL reviennent au Fonds  ${link(r)}`)

  line("7. Le Fonds répartit la caution perdue : 70 % nettoyage, 30 % bonus de performance pour Sat-A")
  const valueB = bondB * NAV_5Y
  await tx({ TransactionType: "Payment", Account: fund.address, Destination: issuer.address, Amount: TBL(bondB) }, fund, "Rachat B")
  await tx({ TransactionType: "Payment", Account: issuer.address, Destination: fund.address, Amount: TEU(valueB) }, issuer, "Rachat B tEUR")
  const toClean = valueB * (1 - BONUS_SHARE), bonus = valueB * BONUS_SHARE
  r = await tx({ TransactionType: "Payment", Account: fund.address, Destination: cleanup.address, Amount: TEU(toClean) }, fund, "Nettoyage")
  console.log(`   Nettoyage : ${eur(toClean)} tEUR  ${link(r)}`)
  r = await tx({ TransactionType: "Payment", Account: fund.address, Destination: opA.address, Amount: TEU(bonus) }, fund, "Bonus")
  console.log(`   Bonus de performance → opérateur A : ${eur(bonus)} tEUR  ${link(r)}`)

  line("8. Bilan")
  const totalA = valueA + rebate + bonus - bondA * FEE
  console.log(`   Opérateur A : caution ${eur(bondA)} → récupère ${eur(totalA)} tEUR net (+${eur(totalA - bondA)})`)
  console.log(`                 seul en bons du Trésor, il aurait eu ${eur(valueA)} tEUR`)
  console.log(`   Opérateur B : perd sa caution de ${eur(bondB)} tEUR`)
  console.log(`   Nettoyage   : ${eur(toClean)} tEUR   |   OrbitBond : ${eur((bondA + bondB) * FEE)} tEUR de frais de dépôt`)
  console.log("   La règle « 2 oracles sur 3 » est vérifiée par le ledger, et l'escrow paie l'opérateur sans intermédiaire.")
}

module.exports = { test }
