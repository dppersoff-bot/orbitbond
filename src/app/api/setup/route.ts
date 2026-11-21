import { handle } from "@/lib/api";
import { setupTestnet } from "@/lib/xrpl/setup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  return handle(async () => {
    const steps: string[] = [];
    await setupTestnet((m) => steps.push(m));
    return steps;
  });
}
