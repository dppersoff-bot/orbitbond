# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Pont entre le tableau de bord (rôle B) et le cœur XRPL (rôle A).

- Si le paquet `orbitbond` du rôle A est importable : on utilise les vraies fonctions (testnet).
- Sinon : mode SIMULATION, même interface, mêmes règles (Shamir 2/3, condition SHA-256,
  pas de déblocage après la date limite, pas d'annulation avant), sans transaction réelle.
Pour forcer le mode simulé : variable d'environnement ORBITBOND_MODE=sim
"""
import hashlib
import json
import os
import secrets
import time
from pathlib import Path

RIPPLE_EPOCH = 946684800
EXPLORER = "https://testnet.xrpl.org/transactions/"

MODE = "sim"
ERREUR_IMPORT = None
_reel = {}


def _dossier_role_a():
    """Cherche le dossier du rôle A (celui qui contient bond.py)."""
    cands = [os.environ.get("ORBITBOND_PATH", "")]
    ici = Path(__file__).resolve().parent
    cands += [ici.parent / "orbitbond", ici.parent / "OrbitBond" / "orbitbond",
              Path.home() / "Documents" / "OrbitBond" / "orbitbond",
              Path.home() / "OneDrive" / "Documents" / "OrbitBond" / "orbitbond"]
    for c in cands:
        if c and (Path(c) / "bond.py").exists():
            return Path(c).resolve()
    return None


DOSSIER_A = _dossier_role_a()

if os.environ.get("ORBITBOND_MODE", "auto") != "sim" and DOSSIER_A:
    try:
        import sys
        sys.path.insert(0, str(DOSSIER_A))
        os.chdir(DOSSIER_A)          # le code du rôle A lit .env, bonds.json et nav.json ici
        import bond as _bond  # noqa: E402
        import nav as _nav    # noqa: E402
        _reel = {
            "create_bond": _bond.create_bond,
            "confirm_deorbit": _bond.confirm_deorbit,
            "expire_bond": _bond.expire_bond,
            "etat_bonds": _bond.etat_bonds,
            "avancer_temps": _nav.avancer_temps,
        }
        if hasattr(_bond, "calcul_caution"):
            _reel["calcul_caution"] = _bond.calcul_caution
        MODE = "xrpl"
    except Exception as e:
        ERREUR_IMPORT = repr(e)


def sortie_demo():
    """Liens explorateur trouvés dans demo_output.txt du rôle A (preuves testnet)."""
    cands = [Path(__file__).resolve().with_name("demo_output.txt")]
    if DOSSIER_A:
        cands.insert(0, DOSSIER_A / "demo_output.txt")
    f = next((c for c in cands if c.exists()), None)
    if f is None:
        return []
    lignes = f.read_text(encoding="utf-8", errors="replace").splitlines()
    res, contexte = [], ""
    for l in lignes:
        if "testnet.xrpl.org" in l:
            url = l[l.index("https://"):].split()[0]
            avant = l[:l.index("https://")].strip(" :-→>|") or contexte
            res.append({"étape": avant[:90], "lien": url})
        elif l.strip():
            contexte = l.strip()
    return res


from caution import calcul_caution as _calcul_local  # noqa: E402


def ripple_vers_unix(t: int) -> int:
    return int(t) + RIPPLE_EPOCH


def lien(tx_hash: str) -> str:
    return EXPLORER + tx_hash if tx_hash else ""


# ---------------------------------------------------------------- mode simulé
_P = 2 ** 521 - 1
TAUX_RISTOURNE = 0.04   # comme INSURER_REBATE_RATE du rôle A
_ETAT = Path(__file__).with_name("bonds_sim.json")
_NAV = Path(__file__).with_name("nav_sim.json")


def _charger():
    return json.loads(_ETAT.read_text()) if _ETAT.exists() else {}


def _sauver(d):
    _ETAT.write_text(json.dumps(d, indent=2))


def _nav_lire():
    return json.loads(_NAV.read_text())["nav"] if _NAV.exists() else 1.0


def _faux_hash():
    return "SIM" + secrets.token_hex(30).upper()


def _shamir_split(secret: int, n=3, k=2):
    a1 = secrets.randbelow(_P)
    return [f"{x}-{(secret + a1 * x) % _P:x}" for x in range(1, n + 1)]


def _shamir_join(parts):
    pts = [(int(p.split("-")[0]), int(p.split("-")[1], 16)) for p in parts]
    s = 0
    for i, (xi, yi) in enumerate(pts):
        num, den = 1, 1
        for j, (xj, _) in enumerate(pts):
            if i != j:
                num = num * (-xj) % _P
                den = den * (xi - xj) % _P
        s = (s + yi * num * pow(den, -1, _P)) % _P
    return s


def _sim_create(operateur, altitude_km, masse_kg, propulsion, deadline_min):
    d = _charger()
    montant = _calcul_local(altitude_km, masse_kg, propulsion, False)
    nav = _nav_lire()
    preimage = secrets.token_bytes(32)
    condition = ("A0258020" + hashlib.sha256(preimage).hexdigest() + "810120").upper()
    parts = _shamir_split(int.from_bytes(preimage, "big"))
    del preimage
    bond_id = f"BOND-{len(d) + 1:03d}"
    cancel_after = int(time.time()) - RIPPLE_EPOCH + deadline_min * 60
    tx = _faux_hash()
    d[bond_id] = {"bond_id": bond_id, "operateur": operateur, "montant_teur": montant,
                  "quantite_tbill": montant / nav, "nav_depot": nav, "condition": condition,
                  "offer_sequence": 1000 + len(d), "tx_hash": tx, "cancel_after": cancel_after,
                  "statut": "actif", "liens": {"create": lien(tx)}}
    _sauver(d)
    return {**d[bond_id], "parts_oracles": parts}


def _sim_confirm(bond_id, parts):
    d = _charger()
    b = d[bond_id]
    if b["statut"] != "actif":
        raise RuntimeError(f"tecNO_TARGET : escrow {bond_id} déjà {b['statut']}")
    if time.time() - RIPPLE_EPOCH > b["cancel_after"]:
        raise RuntimeError("tecNO_PERMISSION : date limite (CancelAfter) dépassée")
    if len(parts) < 2:
        raise RuntimeError("tecCRYPTOCONDITION_ERROR : une seule part, secret non reconstructible")
    try:
        preimage = _shamir_join(parts[:2]).to_bytes(32, "big")
        cond = ("A0258020" + hashlib.sha256(preimage).hexdigest() + "810120").upper()
    except (OverflowError, ValueError, IndexError):
        cond = None
    if cond != b["condition"]:
        raise RuntimeError("tecCRYPTOCONDITION_ERROR : fulfillment invalide")
    valeur = b["quantite_tbill"] * _nav_lire()
    interets = max(0.0, valeur - b["montant_teur"])
    tx, tx_ass = _faux_hash(), _faux_hash()
    ristourne = TAUX_RISTOURNE * b["montant_teur"]
    b.update(statut="débloqué", montant_operateur=b["montant_teur"] + 0.85 * interets,
             montant_nettoyage=0.15 * interets, tx_hash_finish=tx, ristourne_assurance=ristourne)
    b["liens"]["finish"] = lien(tx)
    b["liens"]["assurance"] = lien(tx_ass)
    _sauver(d)
    return {"tx_hash_finish": tx, "montant_operateur": b["montant_operateur"],
            "montant_nettoyage": b["montant_nettoyage"], "ristourne_assurance": ristourne,
            "total_operateur": b["montant_operateur"] + ristourne, "valeur_seul_en_tbill": valeur,
            "liens": b["liens"]}


def _sim_expire(bond_id):
    d = _charger()
    b = d[bond_id]
    if b["statut"] != "actif":
        raise RuntimeError(f"tecNO_TARGET : escrow {bond_id} déjà {b['statut']}")
    if time.time() - RIPPLE_EPOCH <= b["cancel_after"]:
        raise RuntimeError("tecNO_PERMISSION : date limite pas encore atteinte")
    tx = _faux_hash()
    rec = b["quantite_tbill"] * _nav_lire()
    b.update(statut="annulé", tx_hash_cancel=tx, montant_recupere_par_le_fonds=rec)
    b["liens"]["cancel"] = lien(tx)
    _sauver(d)
    return {"tx_hash_cancel": tx, "montant_recupere_par_le_fonds": rec}


def _sim_avancer(annees, taux=0.04):
    nav = _nav_lire() * (1 + taux) ** annees
    _NAV.write_text(json.dumps({"nav": nav}))
    return nav


def reinitialiser_sim():
    for f in (_ETAT, _NAV):
        if f.exists():
            f.unlink()


# ---------------------------------------------------------------- interface publique
def calcul_caution(altitude_km, masse_kg, propulsion, fast_deorbiter=False, geo=False):
    f = _reel.get("calcul_caution", _calcul_local)
    return f(altitude_km, masse_kg, propulsion, fast_deorbiter, geo)


def create_bond(operateur, altitude_km, masse_kg, propulsion, deadline_min):
    if MODE == "xrpl":
        return _reel["create_bond"](operateur, altitude_km, masse_kg, propulsion, deadline_min)
    return _sim_create(operateur, altitude_km, masse_kg, propulsion, deadline_min)


def confirm_deorbit(bond_id, parts):
    if MODE == "xrpl":
        return _reel["confirm_deorbit"](bond_id, parts)
    return _sim_confirm(bond_id, parts)


def expire_bond(bond_id):
    if MODE == "xrpl":
        return _reel["expire_bond"](bond_id)
    return _sim_expire(bond_id)


def avancer_temps(annees, taux=0.04):
    if MODE == "xrpl":
        return _reel["avancer_temps"](annees, taux)
    return _sim_avancer(annees, taux)


def etat_bonds():
    if MODE == "xrpl":
        return _reel["etat_bonds"]()
    return list(_charger().values())
