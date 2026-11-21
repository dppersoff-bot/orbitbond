import { handle } from "@/lib/api";
import { processDeadlines } from "@/lib/xrpl/bonds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: Request) {
  const { bondId } = (await req.json().catch(() => ({}))) as { bondId?: string };
  return handle(async () => { await processDeadlines(bondId); return true; });
}
