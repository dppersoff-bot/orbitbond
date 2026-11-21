# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Cœur OrbitBond : création, déblocage (oracles 2/3), expiration et état des cautions.

Règles clés :
- C'est le FONDS qui crée l'escrow : un EscrowCancel rend l'argent au créateur, donc au Fonds.
- Pas de FinishAfter : seulement Condition (secret des oracles) + CancelAfter (date limite).
- Le secret n'est jamais stocké : seules ses 3 parts Shamir existent (oracles.json simule les 3 oracles).
"""
import hashlib
import os
from datetime import datetime, timedelta, timezone

from xrpl.models.transactions import EscrowCancel, EscrowCreate, EscrowFinish, Payment
from xrpl.utils import datetime_to_ripple_time, ripple_time_to_datetime

from caution import calcul_caution
from config import (BASE, BONDS_FILE, CLEANUP_SHARE, INSURER_REBATE_RATE, OPERATOR_SHARE, TBILL, TEUR, address,
                    link, read_json, wallet, write_json)
from ledger import amt, ledger_time, submit, wait_until
from nav import get_nav
from shamir import combine, split
from tokens import buy_tbill, redeem_tbill

ORACLES_FILE = BASE / "oracles.json"   # simule le stockage privé des 3 oracles (gitignoré)


# ---------- crypto-condition PREIMAGE-SHA-256 ----------
def fulfillment_of(preimage: bytes) -> str:
    return ("A0228020" + preimage.hex()).upper()


def condition_of(preimage: bytes) -> str:
    return ("A0258020" + hashlib.sha256(preimage).hexdigest() + "810120").upper()


# ---------- état ----------
def _bonds() -> dict:
    return read_json(BONDS_FILE, {})


def _save(bonds: dict) -> None:
    write_json(BONDS_FILE, bonds)


def _role(operateur: str) -> str:
    op = operateur.upper()
    return op if op.startswith("OPERATOR_") else f"OPERATOR_{op[-1]}"


# ---------- API (contrat d'interface avec le rôle B) ----------
def create_bond(operateur: str, altitude_km: float, masse_kg: float, propulsion: bool,
                deadline_min: int, fast_deorbiter: bool = False, geo: bool = False,
                satellite: str | None = None) -> dict:
    role = _role(operateur)
    montant = calcul_caution(altitude_km, masse_kg, propulsion, fast_deorbiter, geo)
    op = wallet(role)
    txs = {}

    # 1. Dépôt de la caution : opérateur → Fonds (tEUR)
    txs["depot"] = submit(Payment(account=op.address, destination=address("FUND"),
                                  amount=amt(TEUR, montant)), op)["hash"]
    # 2. Placement : le Fonds convertit en tBILL (fonds de bons du Trésor tokenisés)
    nav_depot = get_nav()
    qty, conv = buy_tbill("FUND", montant)
    txs["conversion"] = [r["hash"] for r in conv]

    # 3. Secret des oracles : preimage → condition, puis découpage Shamir 2/3
    preimage = os.urandom(32)
    condition = condition_of(preimage)
    parts = split(preimage)
    del preimage  # le secret complet n'existe plus nulle part

    # 4. Escrow créé par le Fonds, destination = compte de règlement
    cancel_dt = datetime.now(timezone.utc) + timedelta(minutes=deadline_min)
    cancel_after = datetime_to_ripple_time(cancel_dt)
    fund = wallet("FUND")
    r = submit(EscrowCreate(account=fund.address, amount=amt(TBILL, qty),
                            destination=address("SETTLEMENT"), condition=condition,
                            cancel_after=cancel_after), fund)
    txs["escrow_create"] = r["hash"]

    bonds = _bonds()
    bond_id = f"BOND-{len(bonds) + 1:03d}"
    bonds[bond_id] = {
        "bond_id": bond_id, "satellite": satellite or f"Sat-{role[-1]}", "operateur": role,
        "adresse_operateur": address(role), "altitude_km": altitude_km, "masse_kg": masse_kg,
        "propulsion": propulsion, "montant_teur": montant, "quantite_tbill": qty,
        "nav_depot": nav_depot, "owner": fund.address, "offer_sequence": r["sequence"],
        "condition": condition, "cancel_after": cancel_after,
        "date_limite": cancel_dt.isoformat(timespec="seconds"), "statut": "actif", "txs": txs,
    }
    _save(bonds)
    oracles = read_json(ORACLES_FILE, {})
    oracles[bond_id] = parts
    write_json(ORACLES_FILE, oracles)

    return {"bond_id": bond_id, "montant_teur": montant, "quantite_tbill": qty,
            "offer_sequence": r["sequence"], "tx_hash": r["hash"], "lien": r["lien"],
            "cancel_after": cancel_after, "parts_oracles": parts}


def parts_oracles(bond_id: str) -> list[str]:
    """Pour la démo : récupère les 3 parts détenues par les oracles simulés."""
    return read_json(ORACLES_FILE, {})[bond_id]


def _finish(bond: dict, fulfillment: str) -> dict:
    settle = wallet("SETTLEMENT")
    return submit(EscrowFinish(account=settle.address, owner=bond["owner"],
                               offer_sequence=bond["offer_sequence"],
                               condition=bond["condition"], fulfillment=fulfillment),
                  settle, check=False)


def confirm_deorbit(bond_id: str, parts: list) -> dict:
    """2 oracles sur 3 révèlent leurs parts → EscrowFinish → rachat → partage 85/15."""
    bonds = _bonds()
    bond = bonds[bond_id]
    fulfillment = fulfillment_of(combine(parts))
    r = _finish(bond, fulfillment)          # c'est le LEDGER qui vérifie le secret
    if not r["ok"]:
        return {"ok": False, "code": r["code"], "message": "Déblocage refusé par le ledger"}

    # Rachat des tBILL au prix actuel, puis partage des intérêts
    valeur, conv = redeem_tbill("SETTLEMENT", bond["quantite_tbill"])
    interets = max(valeur - bond["montant_teur"], 0.0)
    montant_op = round(min(valeur, bond["montant_teur"]) + OPERATOR_SHARE * interets, 6)
    montant_clean = round(valeur - montant_op, 6)

    settle = wallet("SETTLEMENT")
    p_op = submit(Payment(account=settle.address, destination=bond["adresse_operateur"],
                          amount=amt(TEUR, montant_op)), settle)
    p_cl = None
    if montant_clean > 0:
        p_cl = submit(Payment(account=settle.address, destination=address("CLEANUP"),
                              amount=amt(TEUR, montant_clean)), settle)

    # Ristourne d'assurance : l'assureur récompense la désorbitation à temps
    ins = wallet("INSURER")
    ristourne = round(INSURER_REBATE_RATE * bond["montant_teur"], 6)
    p_ins = submit(Payment(account=ins.address, destination=bond["adresse_operateur"],
                           amount=amt(TEUR, ristourne)), ins)

    bond.update(statut="debloque", valeur_finale=valeur, interets=round(interets, 6),
                montant_operateur=montant_op, montant_nettoyage=montant_clean,
                ristourne_assurance=ristourne)
    bond["txs"].update(escrow_finish=r["hash"], rachat=[c["hash"] for c in conv],
                       paiement_operateur=p_op["hash"],
                       paiement_nettoyage=p_cl["hash"] if p_cl else None,
                       ristourne_assurance=p_ins["hash"])
    _save(bonds)
    return {"ok": True, "tx_hash_finish": r["hash"], "montant_operateur": montant_op,
            "montant_nettoyage": montant_clean, "interets": round(interets, 6),
            "ristourne_assurance": ristourne,
            "total_operateur": round(montant_op + ristourne, 6),
            "valeur_seul_en_tbill": valeur,
            "liens": {"finish": r["lien"], "operateur": p_op["lien"],
                      "nettoyage": p_cl["lien"] if p_cl else None, "assurance": p_ins["lien"]}}


def tentative_triche(bond_id: str) -> dict:
    """Démo : débloquer sans le vrai secret (faux secret, puis une seule part) → refusé."""
    bond = _bonds()[bond_id]
    faux = _finish(bond, fulfillment_of(os.urandom(32)))
    une_part = _finish(bond, fulfillment_of(combine(parts_oracles(bond_id)[:1])))
    return {"faux_secret": faux["code"], "une_seule_part": une_part["code"]}


def expire_bond(bond_id: str) -> dict:
    """Après la date limite (heure du ledger) : EscrowCancel → caution + intérêts au Fonds."""
    bonds = _bonds()
    bond = bonds[bond_id]
    wait_until(bond["cancel_after"])
    fund = wallet("FUND")
    r = submit(EscrowCancel(account=fund.address, owner=bond["owner"],
                            offer_sequence=bond["offer_sequence"]), fund)
    valeur = round(bond["quantite_tbill"] * get_nav(), 6)
    bond.update(statut="annule", valeur_recuperee_teur=valeur)
    bond["txs"]["escrow_cancel"] = r["hash"]
    _save(bonds)
    return {"tx_hash_cancel": r["hash"], "lien": r["lien"],
            "montant_recupere_par_le_fonds": bond["quantite_tbill"],
            "valeur_teur": valeur}


def etat_bonds() -> list[dict]:
    """Liste des cautions pour l'affichage Streamlit (lit uniquement bonds.json + nav.json)."""
    nav = get_nav()
    out = []
    for b in _bonds().values():
        valeur = round(b["quantite_tbill"] * nav, 2)
        out.append({
            **{k: b[k] for k in ("bond_id", "satellite", "operateur", "statut",
                                 "montant_teur", "quantite_tbill", "date_limite")},
            "valeur_actuelle_teur": valeur if b["statut"] == "actif" else b.get("valeur_finale",
                                                                                b.get("valeur_recuperee_teur")),
            "interets_courus": round(max(valeur - b["montant_teur"], 0), 2) if b["statut"] == "actif" else b.get("interets"),
            "montant_operateur": b.get("montant_operateur"),
            "montant_nettoyage": b.get("montant_nettoyage"),
            "ristourne_assurance": b.get("ristourne_assurance"),
            "liens": {k: (link(v) if isinstance(v, str) else [link(x) for x in v] if v else None)
                      for k, v in b["txs"].items()},
        })
    return out


def secondes_restantes(bond_id: str) -> int:
    return _bonds()[bond_id]["cancel_after"] - ledger_time()
