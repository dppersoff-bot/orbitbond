# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Modèle OrbitBond V2 (Smart Escrow XLS-100) pour le tableau de bord — mode SIMULATION.

Reproduit exactement les règles de smart-escrow-v2/runTest.js (exécuté sur le devnet Smart Escrow) :
  1. Dépôt : l'opérateur paie la caution (tEUR) au Fonds + 1 % de frais à OrbitBond.
  2. Le Fonds convertit en tBILL et crée un Smart Escrow : destination = opérateur,
     Data = les 3 comptes oracles (ESA, LeoLabs, Space-Track), CancelAfter = date limite.
  3. Les oracles émettent un Credential « DEORBITED » au nom de l'opérateur.
     La finish function WASM les compte : < 2 → tecBYTECODE_REJECTED ; ≥ 2 → libération.
  4. L'escrow paie l'opérateur directement : caution + 100 % des intérêts, + ristourne d'assurance (4 %).
  5. Date limite dépassée → EscrowCancel → tBILL au Fonds, qui répartit :
     70 % nettoyage, 30 % bonus de performance aux opérateurs conformes (au prorata de leur caution).
Les transactions réelles sont dans docs/v2_full_devnet_output.txt (affichées comme preuves).
"""
import json
import secrets
import time
from pathlib import Path

from caution import calcul_caution

MODE = "sim"
RIPPLE_EPOCH = 946684800
EXPLORER_DEVNET = "https://custom.xrpl.org/wasm-devnet.dev.ripplex.io/transactions/"

FRAIS = 0.01          # frais de dépôt OrbitBond
RISTOURNE = 0.04      # ristourne de l'assureur
PART_BONUS = 0.30     # part des cautions perdues reversée aux opérateurs conformes
SEUIL = 2             # quorum de la finish function
ORACLES = ["ESA", "LeoLabs", "Space-Track"]

_ICI = Path(__file__).resolve().parent
_ETAT = _ICI / "bonds_sim.json"
_NAV = _ICI / "nav_sim.json"
_RESERVE = _ICI / "bonus_sim.json"   # bonus de performance en attente d'un opérateur conforme


def ripple_vers_unix(t: int) -> int:
    return int(t) + RIPPLE_EPOCH


def _charger():
    return json.loads(_ETAT.read_text()) if _ETAT.exists() else {}


def _sauver(d):
    _ETAT.write_text(json.dumps(d, indent=2))


def nav() -> float:
    return json.loads(_NAV.read_text())["nav"] if _NAV.exists() else 1.0


def reserve_bonus() -> float:
    return json.loads(_RESERVE.read_text())["reserve"] if _RESERVE.exists() else 0.0


def _ecrire_reserve(v):
    _RESERVE.write_text(json.dumps({"reserve": v}))


def _hash():
    return "SIM" + secrets.token_hex(30).upper()


def _maintenant_ripple():
    return int(time.time()) - RIPPLE_EPOCH


def reinitialiser_sim():
    for f in (_ETAT, _NAV, _RESERVE):
        if f.exists():
            f.unlink()


class RefusLedger(RuntimeError):
    """Erreur renvoyée par le ledger (code tec…)."""


# ---------------------------------------------------------------- interface
def create_bond(operateur, altitude_km, masse_kg, propulsion, deadline_min):
    d = _charger()
    montant = calcul_caution(altitude_km, masse_kg, propulsion, False)
    bond_id = f"BOND-{len(d) + 1:03d}"
    d[bond_id] = {
        "bond_id": bond_id, "operateur": operateur, "montant_teur": montant,
        "frais_orbitbond": FRAIS * montant, "quantite_tbill": montant / nav(),
        "cancel_after": _maintenant_ripple() + int(deadline_min * 60),
        "credentials": [], "statut": "actif", "tx_hash": _hash(),
    }
    _sauver(d)
    return d[bond_id]


def emettre_credential(bond_id, oracle: str):
    """L'oracle émet le Credential DEORBITED au nom de l'opérateur (CredentialCreate)."""
    d = _charger()
    b = d[bond_id]
    if oracle not in b["credentials"]:
        b["credentials"].append(oracle)
    _sauver(d)
    return {"tx_hash": _hash(), "confirmations": len(b["credentials"])}


def confirm_deorbit(bond_id):
    """EscrowFinish : la finish function WASM compte les Credentials."""
    d = _charger()
    b = d[bond_id]
    if b["statut"] != "actif":
        raise RefusLedger(f"tecNO_TARGET : escrow déjà {b['statut']}")
    if _maintenant_ripple() > b["cancel_after"]:
        raise RefusLedger("tecNO_PERMISSION : date limite (CancelAfter) dépassée")
    n = len(b["credentials"])
    if n < SEUIL:
        raise RefusLedger(f"tecBYTECODE_REJECTED : {n} oracle(s) sur 3, il en faut {SEUIL}")
    valeur = b["quantite_tbill"] * nav()
    b.update(statut="débloqué", valeur_rachat=valeur, interets=valeur - b["montant_teur"],
             ristourne_assurance=RISTOURNE * b["montant_teur"], bonus_performance=reserve_bonus(),
             tx_hash_finish=_hash())
    _ecrire_reserve(0.0)
    _sauver(d)
    return bilan_operateur(bond_id)


def expire_bond(bond_id):
    """EscrowCancel puis répartition 70 % nettoyage / 30 % bonus aux opérateurs conformes."""
    d = _charger()
    b = d[bond_id]
    if b["statut"] != "actif":
        raise RefusLedger(f"tecNO_TARGET : escrow déjà {b['statut']}")
    if _maintenant_ripple() <= b["cancel_after"]:
        raise RefusLedger("tecNO_PERMISSION : date limite pas encore atteinte")
    valeur = b["quantite_tbill"] * nav()
    nettoyage, bonus = (1 - PART_BONUS) * valeur, PART_BONUS * valeur
    conformes = [x for x in d.values() if x["statut"] == "débloqué"]
    total = sum(x["montant_teur"] for x in conformes)
    for x in conformes:                      # bonus au prorata de la caution
        x["bonus_performance"] = x.get("bonus_performance", 0.0) + bonus * x["montant_teur"] / total
    if not conformes:                        # personne à récompenser pour l'instant : le bonus attend
        _ecrire_reserve(reserve_bonus() + bonus)
    b.update(statut="annulé", montant_recupere_par_le_fonds=valeur, vers_nettoyage=nettoyage,
             bonus_distribue=bonus, tx_hash_cancel=_hash())
    _sauver(d)
    return {"montant_recupere_par_le_fonds": valeur, "vers_nettoyage": nettoyage, "bonus_distribue": bonus,
            "beneficiaires": [x["operateur"] for x in conformes] or ["réserve (prochain opérateur conforme)"]}


def bilan_operateur(bond_id):
    b = _charger()[bond_id]
    v = b.get("valeur_rachat", 0.0)
    total = v + b.get("ristourne_assurance", 0.0) + b.get("bonus_performance", 0.0) - b["frais_orbitbond"]
    return {"caution": b["montant_teur"], "valeur_rachat": v, "interets": b.get("interets", 0.0),
            "ristourne_assurance": b.get("ristourne_assurance", 0.0),
            "bonus_performance": b.get("bonus_performance", 0.0), "frais_orbitbond": b["frais_orbitbond"],
            "total_operateur": total,
            # même placement, même durée que la caution (et non la valeur absolue du tBILL)
            "valeur_seul_en_tbill": v if v else b["quantite_tbill"] * nav()}


def avancer_temps(annees, taux=0.04):
    n = nav() * (1 + taux) ** annees
    _NAV.write_text(json.dumps({"nav": n}))
    return n


def etat_bonds():
    return list(_charger().values())


def sortie_demo():
    """Liens explorateur des vraies exécutions (devnet Smart Escrow, puis testnet V1)."""
    res = []
    for f in (_ICI.parent / "docs" / "v2_full_devnet_output.txt", _ICI / "v2_full_devnet_output.txt",
              _ICI.parent / "docs" / "demo_output.txt", _ICI / "demo_output.txt"):
        if not f.exists():
            continue
        reseau = "devnet Smart Escrow (V2)" if "v2" in f.name else "testnet (V1)"
        for l in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if "xrpl.org" in l and "https://" in l:
                url = l[l.index("https://"):].split()[0]
                etape = l[:l.index("https://")].strip(" :-→>|")
                if etape:
                    res.append({"réseau": reseau, "étape": etape[:110], "lien": url})
    return res
