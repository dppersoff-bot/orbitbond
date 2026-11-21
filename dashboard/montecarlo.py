# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Monte-Carlo du fonds de nettoyage OrbitBond sur 10 ans (pas mensuel).

Entrées du fonds :
  - parrainage initial des assureurs (programme pionniers)
  - 15 % des intérêts de chaque caution rendue
  - caution + intérêts des satellites non conformes (escrow annulé)
  - rendement du fonds lui-même (placé en tBILL)
Sorties :
  - financement d'une mission de retrait (ADR) pour chaque objet abandonné,
    UNIQUEMENT après l'annulation de son escrow et seulement si le solde couvre
    la mission entière (sinon l'objet attend dans la file).
Le fonds ne dépense que ce qu'il a déjà encaissé, donc son solde reste >= 0.
"""
import numpy as np
from caution import calcul_caution

MOIS = 120


def _tirer_satellites(rng, n):
    """Population de satellites réaliste (beaucoup de petits sats en LEO basse)."""
    alt = rng.choice([400, 520, 700, 900, 35786], size=n, p=[0.35, 0.35, 0.18, 0.07, 0.05])
    masse = rng.choice([5, 50, 300, 2000], size=n, p=[0.35, 0.25, 0.30, 0.10])
    prop = rng.random(n) < np.where(masse >= 100, 0.85, 0.15)
    geo = alt == 35786
    return np.array([calcul_caution(a, m, p, False, g) for a, m, p, g in zip(alt, masse, prop, geo)])


def simuler_pool(conformite: float, n_runs: int = 200, parrainage: float = 2_000_000,
                 arrivees_par_mois: float = 4.0, cout_adr_x: float = 1.5,
                 taux_moyen: float = 0.04, vol_taux: float = 0.004, part_nettoyage: float = 0.15,
                 seed: int = 42):
    """Renvoie solde[n_runs, MOIS+1], objets nettoyés et en attente, taux simulés."""
    rng = np.random.default_rng(seed)
    soldes = np.zeros((n_runs, MOIS + 1))
    nettoyes = np.zeros((n_runs, MOIS + 1))
    en_attente = np.zeros((n_runs, MOIS + 1))
    taux_all = np.zeros((n_runs, MOIS))
    for r in range(n_runs):
        # taux variable : marche aléatoire avec rappel vers la moyenne, borné 0,5 % – 7 %
        taux = np.empty(MOIS)
        x = taux_moyen
        for m in range(MOIS):
            x += 0.15 * (taux_moyen - x) + rng.normal(0, vol_taux)
            x = float(np.clip(x, 0.005, 0.07))
            taux[m] = x
        taux_all[r] = taux
        indice = np.concatenate([[1.0], np.cumprod(1 + taux / 12)])   # valeur du tBILL

        n_par_mois = rng.poisson(arrivees_par_mois, MOIS)
        dep = np.repeat(np.arange(MOIS), n_par_mois)
        n = len(dep)
        montant = _tirer_satellites(rng, n)
        mission = rng.integers(12, 61, n)                  # 1 à 5 ans de mission
        echeance = dep + mission + 60                      # + 5 ans (règle FCC)
        conforme = rng.random(n) < conformite
        retour = dep + mission + rng.integers(1, 61, n)    # rentrée entre fin de mission et échéance
        resolution = np.where(conforme, retour, echeance)

        solde = parrainage
        file_adr = []                                      # coûts des objets à retirer
        nb_nettoyes = 0
        soldes[r, 0] = solde
        for m in range(1, MOIS + 1):
            solde *= 1 + taux[m - 1] / 12
            sel = resolution == m
            if sel.any():
                valeur = montant[sel] * indice[m] / indice[dep[sel]]
                interets = valeur - montant[sel]
                ok = conforme[sel]
                solde += part_nettoyage * interets[ok].sum()          # 15 % des intérêts
                solde += valeur[~ok].sum()                            # cautions perdues
                file_adr.extend((cout_adr_x * montant[sel][~ok]).tolist())
            # le fonds paie les retraits dans l'ordre, tant qu'il peut payer la mission entière
            while file_adr and file_adr[0] <= solde:
                solde -= file_adr.pop(0)
                nb_nettoyes += 1
            soldes[r, m] = solde
            nettoyes[r, m] = nb_nettoyes
            en_attente[r, m] = len(file_adr)
    return {"solde": soldes, "nettoyes": nettoyes, "en_attente": en_attente, "taux": taux_all}


def balayage(niveaux=(0.0, 0.25, 0.5, 0.75, 1.0), **kw):
    return {c: simuler_pool(c, **kw) for c in niveaux}


if __name__ == "__main__":
    for c, res in balayage(n_runs=100).items():
        s = res["solde"]
        print(f"conformité {c:4.0%} | min {s.min():>14,.0f} | médiane finale {np.median(s[:, -1]):>14,.0f}"
              f" | nettoyés {res['nettoyes'][:, -1].mean():6.1f} | en attente {res['en_attente'][:, -1].mean():5.1f}")
