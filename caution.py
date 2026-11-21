# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Formule de la caution : 200 000 × f_alt × f_masse × f_prop × f_hist, bornée [5 000 ; 1 000 000]."""

BASE_BOND = 200_000
MIN_BOND, MAX_BOND = 5_000, 1_000_000


def f_alt(altitude_km: float, geo: bool) -> float:
    if geo:
        return 1.0
    if altitude_km < 450:
        return 0.1
    if altitude_km < 600:
        return 0.5
    if altitude_km < 800:
        return 1.5
    return 3.0


def f_masse(masse_kg: float) -> float:
    if masse_kg < 10:
        return 0.25
    if masse_kg < 100:
        return 0.5
    if masse_kg <= 1000:
        return 1.0
    return 2.0


def calcul_caution(altitude_km: float, masse_kg: float, propulsion: bool,
                   fast_deorbiter: bool = False, geo: bool = False) -> float:
    montant = (BASE_BOND * f_alt(altitude_km, geo) * f_masse(masse_kg)
               * (0.5 if propulsion else 1.0) * (0.8 if fast_deorbiter else 1.0))
    return float(min(max(montant, MIN_BOND), MAX_BOND))


if __name__ == "__main__":
    # Tests unitaires sur les 4 exemples du brief
    assert calcul_caution(420, 5, False) == 5_000            # cubesat 3U bas
    assert calcul_caution(650, 5, False) == 75_000           # même cubesat plus haut
    assert calcul_caution(550, 300, True) == 50_000          # 300 kg avec propulsion
    assert calcul_caution(36_000, 5_000, True, geo=True) == 200_000  # GEO 5 t
    assert calcul_caution(550, 300, True, fast_deorbiter=True) == 40_000
    print("calcul_caution : 5 tests OK")
