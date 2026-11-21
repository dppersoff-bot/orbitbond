# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Mesures radar simulées et vote des 3 oracles.

Chaque oracle (ex. : réseau radar type LeoLabs, Space-Track, ESA SST) a son propre bruit
et son propre biais. Il confirme la rentrée quand :
  - N mesures consécutives sont sous le seuil de rentrée, ou
  - l'objet n'est plus détecté pendant N passages (piste perdue).
Le secret n'est révélé que si 2 oracles sur 3 confirment (quorum Shamir 2/3).
"""
import numpy as np
from orbit import ALT_RENTREE_KM

ORACLES = [
    {"nom": "Oracle 1 — radar LEO", "sigma_km": 1.5, "biais_km": 0.4, "p_detection": 0.97},
    {"nom": "Oracle 2 — réseau SST", "sigma_km": 3.0, "biais_km": -0.8, "p_detection": 0.93},
    {"nom": "Oracle 3 — catalogue public", "sigma_km": 5.0, "biais_km": 1.5, "p_detection": 0.90},
]
N_CONSECUTIVES = 3
QUORUM = 2


def mesurer(traj: dict, cadence_jours: float = 1.0, seed: int = 0, oracles=ORACLES):
    """Renvoie, pour chaque oracle, les mesures bruitées (NaN = non détecté)."""
    rng = np.random.default_rng(seed)
    t, h = traj["t_ans"], traj["alt_km"]
    pas = max(1, int(round(cadence_jours / ((t[1] - t[0]) * 365.25))))
    idx = np.arange(0, len(t), pas)
    res = []
    for o in oracles:
        vrai = h[idx]
        m = vrai + o["biais_km"] + rng.normal(0, o["sigma_km"], len(idx))
        detecte = (rng.random(len(idx)) < o["p_detection"]) & (vrai > 0)
        m = np.where(detecte, m, np.nan)
        res.append({"oracle": o["nom"], "t_ans": t[idx], "mesure_km": m})
    return res


def vote(mesures: dict, n=N_CONSECUTIVES, seuil=ALT_RENTREE_KM):
    """Date (ans) à laquelle l'oracle confirme la rentrée, ou None.

    Garde-fou : la piste perdue ne compte que si la dernière mesure valide
    était déjà basse (< 250 km), pour ignorer les simples trous de détection.
    """
    t, m = mesures["t_ans"], mesures["mesure_km"]
    compteur, derniere_valide = 0, None
    for ti, mi in zip(t, m):
        if np.isnan(mi):
            ok = derniere_valide is not None and derniere_valide < 250
        else:
            derniere_valide = mi
            ok = mi < seuil
        compteur = compteur + 1 if ok else 0
        if compteur >= n:
            return float(ti)
    return None


def quorum(traj: dict, seed: int = 0, cadence_jours: float = 1.0):
    """Mesure, vote et date du quorum 2 sur 3."""
    mesures = mesurer(traj, cadence_jours, seed)
    votes = [vote(m) for m in mesures]
    dates = sorted(v for v in votes if v is not None)
    t_quorum = dates[QUORUM - 1] if len(dates) >= QUORUM else None
    return {"mesures": mesures, "votes": votes, "t_quorum_ans": t_quorum,
            "oracles_ok": [i for i, v in enumerate(votes) if v is not None]}
