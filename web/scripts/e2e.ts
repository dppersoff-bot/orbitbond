// End-to-end check of the 3 demo scenarios through the HTTP API (dev server must run).
// Usage: npx tsx scripts/e2e.ts [1|2|3 ...]   (default: all three, in parallel)
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

type Tranche = { index: number; cancelAfterUnix: number; status: string; createTx?: string; finishTx?: string; cancelTx?: string };
type Bond = { id: string; status: string; collateralUsd: number; tranches: Tranche[]; settlement?: Record<string, number> };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json()) as { ok: boolean; data: T; error?: string };
  if (!j.ok) throw new Error(`${path}: ${j.error}`);
  return j.data;
}
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const now = () => Math.floor(Date.now() / 1000);
const log = (sc: string, m: string) => console.log(`[S${sc} ${new Date().toLocaleTimeString("fr-FR")}] ${m}`);
async function waitUntil(sc: string, unix: number, why: string) {
  const d = unix - now();
  if (d > 0) { log(sc, `attente ${d}s (${why})`); await sleep(d); }
}

const sat = (op: string, name: string) => ({
  operator: op, name, noradId: `SIM-${Math.floor(90000 + Math.random() * 9999)}`,
  altitudeKm: 550, massKg: 300, propulsion: "electric", missionYears: 5,
});

async function scenario1() {
  // Same schedule as the Admin preset for scenario 1 (first deadline +5 min).
  const b = await api<Bond>("/api/bonds", { ...sat("opA", "AURORA-E2E-1"), schedule: { firstDeadlineSec: 300, trancheSpacingSec: 30 } });
  log("1", `bond ${b.id} créé, caution ${b.collateralUsd}`);
  await api("/api/bonds/" + b.id + "/attest", { source: 0, confirms: true });
  const v = await api<Bond>("/api/bonds/" + b.id + "/attest", { source: 1, confirms: true });
  log("1", `après 2/3 : ${v.status}, tranches ${v.tranches.map((t) => t.status).join(",")}`);
  const s = await api<Bond>("/api/bonds/" + b.id + "/settle", {});
  log("1", `réglé : ${JSON.stringify(s.settlement)}`);
  return s.id;
}

async function scenario2() {
  const b = await api<Bond>("/api/bonds", sat("opB", "KESTREL-E2E-2"));
  log("2", `bond ${b.id} créé`);
  // Confirm right after T2 expires (T3 is only 30 s later), then cancel the expired tranches.
  await waitUntil("2", b.tranches[1].cancelAfterUnix + 6, "échéance T2");
  await api("/api/bonds/" + b.id + "/attest", { source: 1, confirms: true });
  await api<Bond>("/api/bonds/" + b.id + "/attest", { source: 2, confirms: true });
  await api("/api/process", { bondId: b.id });
  const v = (await api<{ bonds: Bond[] }>("/api/state")).bonds.find((x) => x.id === b.id)!;
  log("2", `tranches ${v.tranches.map((t) => t.status).join(",")}`);
  const s = await api<Bond>("/api/bonds/" + b.id + "/settle", {});
  log("2", `réglé : ${JSON.stringify(s.settlement)}`);
  return s.id;
}

async function scenario3() {
  const b = await api<Bond>("/api/bonds", sat("opC", "MERIDIAN-E2E-3"));
  log("3", `bond ${b.id} créé`);
  await waitUntil("3", b.tranches[3].cancelAfterUnix + 12, "échéance T4");
  const p = await api<Bond>("/api/process", { bondId: b.id });
  void p;
  const s = await api<Bond>("/api/bonds/" + b.id + "/settle", {});
  log("3", `réglé : ${JSON.stringify(s.settlement)}`);
  return s.id;
}

async function main() {
  const which = process.argv.slice(2);
  const run = (n: string) => which.length === 0 || which.includes(n);
  // Start the slow scenarios first so their clocks run while scenario 1 completes.
  const jobs: Promise<string>[] = [];
  if (run("3")) jobs.push(scenario3());
  if (run("2")) { await sleep(run("3") ? 20 : 0); jobs.push(scenario2()); }
  if (run("1")) { await sleep(run("2") || run("3") ? 20 : 0); jobs.push(scenario1()); }
  const ids = await Promise.all(jobs);

  const st = await api<{ txs: { hash: string; type: string; label: string; result: string; bondId?: string }[] }>("/api/state");
  let bad = 0;
  for (const id of ids) {
    const txs = st.txs.filter((t) => t.bondId === id).reverse();
    console.log(`\n== ${id} : ${txs.length} transactions`);
    for (const t of txs) {
      if (t.result !== "tesSUCCESS") bad++;
      console.log(`${t.result.padEnd(11)} ${t.type.padEnd(13)} ${t.hash}  ${t.label}`);
    }
  }
  console.log(bad ? `\n${bad} transaction(s) en échec` : "\nToutes les transactions sont tesSUCCESS ✔");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
