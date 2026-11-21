import { handle } from "@/lib/api";
import { balances } from "@/lib/xrpl/bonds";

export const dynamic = "force-dynamic";
export async function GET() {
  return handle(balances);
}
