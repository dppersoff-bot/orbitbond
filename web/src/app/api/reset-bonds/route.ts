import { handle } from "@/lib/api";
import { addLog, loadState, saveState } from "@/lib/store";

export const dynamic = "force-dynamic";
// Clears the demo history in the app (on-ledger history stays on Testnet).
export async function POST() {
  return handle(async () => {
    const s = loadState();
    s.bonds = []; s.txs = s.txs.filter((t) => !t.bondId);
    addLog("Historique des bonds de démo effacé (le ledger, lui, garde tout).");
    saveState();
    return true;
  });
}
