import { handle } from "@/lib/api";
import { payUsd } from "@/lib/xrpl/client";
import { CLEANUP_MISSIONS } from "@/lib/data/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Simulates a validated cleanup milestone paid from the common fund.
export async function POST(req: Request) {
  const { missionId, amount } = (await req.json()) as { missionId: string; amount: number };
  const m = CLEANUP_MISSIONS.find((x) => x.id === missionId);
  return handle(async () => {
    if (!m) throw new Error("Mission inconnue");
    return payUsd("cleanupFund", "debris", amount, `Paiement jalon validé ${m.id} — ${m.target}`);
  });
}
