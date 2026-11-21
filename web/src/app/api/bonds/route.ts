import { handle } from "@/lib/api";
import { publicBond } from "@/lib/store";
import { createBond, type NewBondInput } from "@/lib/xrpl/bonds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: Request) {
  const body = (await req.json()) as NewBondInput;
  return handle(async () => publicBond(await createBond(body)));
}
