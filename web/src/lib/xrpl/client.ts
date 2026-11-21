import { Client, Wallet, type SubmittableTransaction, type IssuedCurrencyAmount } from "xrpl";
import { NETWORK, TOKENS } from "../config";
import { addLog, loadState, saveState, type AccountKey, type TxRecord } from "../store";

const g = globalThis as unknown as {
  __xrplClient?: Client;
  __xrplConnecting?: Promise<void>;
  __locks?: Map<string, Promise<unknown>>;
};

export async function getClient(): Promise<Client> {
  if (!g.__xrplClient) {
    g.__xrplClient = new Client(NETWORK.wss, { connectionTimeout: 20000, timeout: 30000 });
    g.__xrplClient.on("error", () => undefined); // never crash the process on socket errors
  }
  const c = g.__xrplClient;
  if (!c.isConnected()) {
    // Share one in-flight connect() between concurrent callers.
    g.__xrplConnecting ??= c.connect().finally(() => { g.__xrplConnecting = undefined; });
    await g.__xrplConnecting;
  }
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(e: unknown): boolean {
  const m = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`;
  return /NotConnected|Disconnected|Timeout|timed out|socket|ECONNRESET|websocket|Connection/i.test(m);
}

/** Run a read-only request, reconnecting on transient socket failures. */
export async function withRetry<T>(fn: (c: Client) => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn(await getClient());
    } catch (e) {
      if (i >= tries - 1 || !isTransient(e)) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

/**
 * Submit an already-signed blob until a validated outcome is known.
 * Re-submitting the SAME signed blob is idempotent (same Sequence, same hash),
 * so a dropped connection can never cause a double payment.
 */
async function submitSignedReliably(blob: string, hash: string) {
  for (let i = 0; ; i++) {
    try {
      const c = await getClient();
      // The tx may already be validated (connection dropped after submission).
      const known = await c.request({ command: "tx", transaction: hash }).catch(() => null);
      if (known?.result.validated) return known;
      return await c.submitAndWait(blob);
    } catch (e) {
      if (i >= 5 || !isTransient(e)) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

/** 3–20 char codes must be hex-encoded on XRPL (40 hex chars). */
export function currencyHex(code: string): string {
  if (code.length === 3) return code;
  return Buffer.from(code, "ascii").toString("hex").toUpperCase().padEnd(40, "0");
}

export function wallet(key: AccountKey): Wallet {
  const w = loadState().wallets[key];
  if (!w) throw new Error(`Compte ${key} non initialisé — lancez l'initialisation Testnet.`);
  return Wallet.fromSeed(w.seed);
}
export const addr = (key: AccountKey) => wallet(key).classicAddress;

export function usd(value: number): IssuedCurrencyAmount {
  return { currency: currencyHex(TOKENS.usd.code), issuer: addr("issuerUsd"), value: fmtValue(value) };
}
export function ousg(value: number): IssuedCurrencyAmount {
  return { currency: currencyHex(TOKENS.ousg.code), issuer: addr("issuerOusg"), value: fmtValue(value) };
}
/** IOU values: max 15 significant digits. */
export function fmtValue(v: number): string {
  return Number(v.toPrecision(15)).toFixed(6).replace(/\.?0+$/, "");
}

/** Serialize transactions per account so Sequence numbers never collide. */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  g.__locks ??= new Map();
  const prev = g.__locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  g.__locks.set(key, next);
  return next;
}

export interface SubmitMeta {
  label: string;
  to?: AccountKey;
  bondId?: string;
  amount?: string;
  currency?: string;
}

export async function submit(
  from: AccountKey,
  tx: Record<string, unknown>,
  meta: SubmitMeta,
): Promise<{ hash: string; sequence: number }> {
  return withLock(from, async () => {
    const w = wallet(from);
    const prepared = await withRetry((c) => c.autofill({ ...tx, Account: w.classicAddress } as SubmittableTransaction));
    const signed = w.sign(prepared);
    const res = await submitSignedReliably(signed.tx_blob, signed.hash);
    const meta0 = res.result.meta;
    const code = typeof meta0 === "object" && meta0 ? (meta0 as { TransactionResult: string }).TransactionResult : "unknown";
    const rec: TxRecord = {
      hash: signed.hash,
      type: String(tx.TransactionType),
      label: meta.label,
      from,
      to: meta.to,
      amount: meta.amount,
      currency: meta.currency,
      bondId: meta.bondId,
      time: Math.floor(Date.now() / 1000),
      result: code,
    };
    const s = loadState();
    s.txs.unshift(rec);
    addLog(`${rec.type} ${code} — ${meta.label}`);
    saveState();
    if (code !== "tesSUCCESS") throw new Error(`${meta.label} : ${code} (tx ${signed.hash})`);
    return { hash: signed.hash, sequence: prepared.Sequence as number };
  });
}

export async function payUsd(from: AccountKey, to: AccountKey, value: number, label: string, bondId?: string) {
  return submit(from, { TransactionType: "Payment", Destination: addr(to), Amount: usd(value) },
    { label, to, bondId, amount: fmtValue(value), currency: TOKENS.usd.code });
}
export async function payOusg(from: AccountKey, to: AccountKey, value: number, label: string, bondId?: string) {
  return submit(from, { TransactionType: "Payment", Destination: addr(to), Amount: ousg(value) },
    { label, to, bondId, amount: fmtValue(value), currency: TOKENS.ousg.code });
}

/** Unix seconds -> XRPL "Ripple epoch" seconds. */
export const toRippleTime = (unix: number) => unix - 946684800;

export const explorerTx = (hash: string) => `${NETWORK.explorer}/transactions/${hash}`;
export const explorerAccount = (a: string) => `${NETWORK.explorer}/accounts/${a}`;
