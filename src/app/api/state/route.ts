import { handle } from "@/lib/api";
import { publicState } from "@/lib/public-state";

export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => publicState());
}
