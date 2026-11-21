import { ACCOUNT_LABELS, loadState, publicBond } from "./store";
import { navAt } from "./finance/engine";

export function publicState() {
  const s = loadState();
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    initialized: !!s.setupAt,
    setupAt: s.setupAt ?? null,
    nav: s.setupAt ? navAt(nowSec, s.navEpoch) : 1,
    now: nowSec,
    accounts: Object.fromEntries(
      Object.entries(s.wallets).map(([k, w]) => [k, { address: w!.address, label: ACCOUNT_LABELS[k as keyof typeof ACCOUNT_LABELS] }]),
    ),
    bonds: s.bonds.map(publicBond),
    txs: s.txs.slice(0, 300),
    log: s.log.slice(0, 60),
  };
}
export type PublicState = ReturnType<typeof publicState>;
