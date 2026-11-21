"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublicState } from "@/lib/public-state";

export type Balances = Record<string, { address: string; xrp: string; tUSD: number; tOUSG: number }>;

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.data as T;
}

export function useAppState(pollMs = 4000) {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setState(await api<PublicState>("/api/state")); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { state, error, refresh };
}

export function useBalances(pollMs = 10000) {
  const [balances, setBalances] = useState<Balances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setBalances(await api<Balances>("/api/balances")); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { balances, error, refresh };
}

export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
