# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Petits utilitaires XRPL : soumission, montants de tokens, temps du ledger, soldes."""
import time

from xrpl.models.amounts import IssuedCurrencyAmount
from xrpl.models.requests import AccountLines, Ledger
from xrpl.transaction import submit_and_wait

from config import address, client, link


def fmt(value: float) -> str:
    """Montant IOU en chaîne, 6 décimales max."""
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def amt(currency: str, value: float) -> IssuedCurrencyAmount:
    return IssuedCurrencyAmount(currency=currency, issuer=address("ISSUER"), value=fmt(value))


def submit(tx, wallet, check: bool = True) -> dict:
    """Signe, soumet et attend la validation. Renvoie code, hash, Sequence et lien explorateur."""
    name = type(tx).__name__
    try:
        result = submit_and_wait(tx, client(), wallet).result
    except Exception as exc:  # xrpl-py lève une exception pour les échecs (tec*, tem*...)
        if check:
            raise RuntimeError(f"{name} refusé : {exc}") from exc
        return {"ok": False, "code": str(exc), "hash": None, "lien": None}
    code = result.get("meta", {}).get("TransactionResult")
    tx_hash = result.get("hash")
    tx_json = result.get("tx_json", result)
    out = {"ok": code == "tesSUCCESS", "code": code, "hash": tx_hash,
           "sequence": tx_json.get("Sequence"), "lien": link(tx_hash)}
    if check and not out["ok"]:
        raise RuntimeError(f"{name} refusé : {code} — {out['lien']}")
    return out


def ledger_time() -> int:
    """Heure de clôture du dernier ledger validé (temps Ripple)."""
    return client().request(Ledger(ledger_index="validated")).result["ledger"]["close_time"]


def wait_until(ripple_time: int, poll: int = 5) -> None:
    """Attend que le ledger ait dépassé ripple_time (c'est lui qui fait foi, pas l'horloge du PC)."""
    while (now := ledger_time()) <= ripple_time:
        print(f"   … encore ~{ripple_time - now + 1} s avant la date limite (heure du ledger)")
        time.sleep(poll)


def balances(role: str) -> dict:
    lines = client().request(AccountLines(account=address(role))).result.get("lines", [])
    return {l["currency"]: float(l["balance"]) for l in lines if l["account"] == address("ISSUER")}
