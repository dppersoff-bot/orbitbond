import { handle } from "@/lib/api";
import { publicBond } from "@/lib/store";
import { attest } from "@/lib/xrpl/bonds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { source, confirms } = (await req.json()) as { source: number; confirms: boolean };
  return handle(async () => publicBond(await attest(id, source, confirms)));
}
