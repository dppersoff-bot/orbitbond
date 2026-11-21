import { handle } from "@/lib/api";
import { publicBond } from "@/lib/store";
import { settle } from "@/lib/xrpl/bonds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => publicBond(await settle(id)));
}
