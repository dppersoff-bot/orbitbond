import { NextResponse } from "next/server";

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json({ ok: true, data: await fn() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
