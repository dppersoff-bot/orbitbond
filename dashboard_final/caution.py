# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Formule de la caution (copie de celle du rôle A, utilisée par le Monte-Carlo et le mode simulé)."""

BASE = 200_000.0
MIN, MAX = 5_000.0, 1_000_000.0


def calcul_caution(altitude_km: float, masse_kg: float, propulsion: bool,
                   fast_deorbiter: bool = False, geo: bool = False) -> float:
    if geo:
        f_alt = 1.0
    elif altitude_km < 450:
        f_alt = 0.1
    elif altitude_km < 600:
        f_alt = 0.5
    elif altitude_km < 800:
        f_alt = 1.5
    else:
        f_alt = 3.0
    if masse_kg < 10:
        f_masse = 0.25
    elif masse_kg < 100:
        f_masse = 0.5
    elif masse_kg <= 1000:
        f_masse = 1.0
    else:
        f_masse = 2.0
    f_prop = 0.5 if propulsion else 1.0
    f_hist = 0.8 if fast_deorbiter else 1.0
    return float(min(MAX, max(MIN, BASE * f_alt * f_masse * f_prop * f_hist)))
