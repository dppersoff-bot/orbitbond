# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Émission des tokens de test tEUR (TEU) et tBILL (TBL) + conversions au prix de la NAV.

Usage : python tokens.py  (configure l'émetteur, les trustlines et distribue des tEUR aux opérateurs)
"""
from xrpl.models.requests import GenericRequest
from xrpl.models.transactions import AccountSet, AccountSetAsfFlag, Payment, TrustSet

from config import TBILL, TEUR, address, client, wallet
from ledger import amt, submit
from nav import get_nav

TRUSTLINES = {
    "FUND": [TEUR, TBILL],
    "SETTLEMENT": [TEUR, TBILL],
    "OPERATOR_A": [TEUR],
    "OPERATOR_B": [TEUR],
    "CLEANUP": [TEUR],
    "INSURER": [TEUR],
}
OPERATOR_FUNDING = 2_000_000  # tEUR distribués à chaque opérateur
INSURER_FUNDING = 1_000_000   # tEUR de l'assureur (réserve pour les ristournes)


def token_escrow_enabled() -> bool:
    """Vérifie que l'amendment TokenEscrow (XLS-85) est actif sur le réseau."""
    res = client().request(GenericRequest.from_dict({"method": "feature", "feature": "TokenEscrow"})).result
    return any(isinstance(v, dict) and v.get("enabled") for v in res.values())


def setup_tokens() -> None:
    lock_flag = getattr(AccountSetAsfFlag, "ASF_ALLOW_TRUSTLINE_LOCKING", None)
    if lock_flag is None:
        raise RuntimeError("xrpl-py trop ancien pour Token Escrow : pip install -U xrpl-py")
    print(f"  Amendment TokenEscrow actif : {token_escrow_enabled()}")

    issuer = wallet("ISSUER")
    r = submit(AccountSet(account=issuer.address, set_flag=AccountSetAsfFlag.ASF_DEFAULT_RIPPLE), issuer)
    print(f"  DefaultRipple activé         {r['lien']}")
    r = submit(AccountSet(account=issuer.address, set_flag=lock_flag), issuer)
    print(f"  AllowTrustLineLocking activé {r['lien']}")

    for role, currencies in TRUSTLINES.items():
        w = wallet(role)
        for cur in currencies:
            submit(TrustSet(account=w.address, limit_amount=amt(cur, 1e12)), w)
        print(f"  Trustlines {role:10s} → {', '.join(currencies)}")

    for role in ("OPERATOR_A", "OPERATOR_B"):
        r = submit(Payment(account=issuer.address, destination=address(role),
                           amount=amt(TEUR, OPERATOR_FUNDING)), issuer)
        print(f"  {OPERATOR_FUNDING:,} tEUR → {role}  {r['lien']}")
    setup_insurer()


def setup_insurer() -> None:
    """Trustline + réserve de tEUR pour le compte Assureur (peut être lancé seul)."""
    ins, issuer = wallet("INSURER"), wallet("ISSUER")
    submit(TrustSet(account=ins.address, limit_amount=amt(TEUR, 1e12)), ins)
    r = submit(Payment(account=issuer.address, destination=ins.address,
                       amount=amt(TEUR, INSURER_FUNDING)), issuer)
    print(f"  Assureur : trustline + {INSURER_FUNDING:,} tEUR  {r['lien']}")


def buy_tbill(role: str, montant_teur: float) -> tuple[float, list]:
    """Souscription : `role` envoie des tEUR à l'émetteur, qui lui renvoie montant / NAV tBILL."""
    w, issuer = wallet(role), wallet("ISSUER")
    qty = round(montant_teur / get_nav(), 6)
    r1 = submit(Payment(account=w.address, destination=issuer.address, amount=amt(TEUR, montant_teur)), w)
    r2 = submit(Payment(account=issuer.address, destination=w.address, amount=amt(TBILL, qty)), issuer)
    return qty, [r1, r2]


def redeem_tbill(role: str, qty: float) -> tuple[float, list]:
    """Rachat : `role` renvoie ses tBILL à l'émetteur, qui lui paie quantité × NAV en tEUR."""
    w, issuer = wallet(role), wallet("ISSUER")
    value = round(qty * get_nav(), 6)
    r1 = submit(Payment(account=w.address, destination=issuer.address, amount=amt(TBILL, qty)), w)
    r2 = submit(Payment(account=issuer.address, destination=w.address, amount=amt(TEUR, value)), issuer)
    return value, [r1, r2]


if __name__ == "__main__":
    setup_tokens()
