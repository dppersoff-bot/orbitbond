"use client";
import { useEffect, useState } from "react";
import { OPERATORS, type OperatorKey } from "@/lib/data/seed";

export function useOperator(): [OperatorKey, (k: OperatorKey) => void] {
  const [op, setOp] = useState<OperatorKey>("opA");
  useEffect(() => {
    try { const v = localStorage.getItem("ob-operator") as OperatorKey | null; if (v && v in OPERATORS) setOp(v); } catch {}
  }, []);
  const set = (k: OperatorKey) => { setOp(k); try { localStorage.setItem("ob-operator", k); } catch {} };
  return [op, set];
}

export function OperatorPicker({ value, onChange }: { value: OperatorKey; onChange: (k: OperatorKey) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-space-700 bg-space-900 p-1 text-sm">
      {(Object.keys(OPERATORS) as OperatorKey[]).map((k) => (
        <button key={k} onClick={() => onChange(k)}
          className={`rounded-md px-3 py-1.5 transition ${value === k ? "bg-space-700 text-ink" : "text-muted hover:text-ink"}`}>
          {OPERATORS[k].name}
        </button>
      ))}
    </div>
  );
}
