# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""Décroissance orbitale : traînée atmosphérique + poussée de désorbitation.

Modèle : orbite circulaire, atmosphère exponentielle par tranches
(table de Vallado, d'après l'atmosphère standard US 1976 / CIRA-72).
    da/dt (traînée) = -rho(h) * sqrt(mu * a) * Cd * A / m
    da/dt (poussée) = -2 * a^(3/2) / sqrt(mu) * F / m     (faible poussée tangentielle)
"""
from dataclasses import dataclass, field
import numpy as np

MU = 3.986004418e14      # m^3/s^2
R_TERRE = 6371e3         # m
ALT_RENTREE_KM = 120.0   # en dessous : rentrée considérée comme acquise
JOUR = 86400.0
AN = 365.25 * JOUR

# altitude de base (km), densité de base (kg/m^3), hauteur d'échelle (km)
_ATMO = np.array([
    [0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682],
    [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714],
    [70, 8.770e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382],
    [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
    [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523],
    [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546],
    [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515],
    [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835],
    [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05],
    [1000, 3.019e-15, 268.00],
])


def densite(h_km: float) -> float:
    """Densité atmosphérique (kg/m^3) à l'altitude h_km."""
    i = np.searchsorted(_ATMO[:, 0], h_km, side="right") - 1
    i = int(np.clip(i, 0, len(_ATMO) - 1))
    h0, rho0, H = _ATMO[i]
    return rho0 * np.exp(-(h_km - h0) / H)


@dataclass
class Satellite:
    nom: str
    altitude_km: float
    masse_kg: float
    surface_m2: float
    propulsion: bool
    cd: float = 2.2
    fin_mission_ans: float = 5.0          # date de fin de mission (depuis le lancement)
    poussee_n: float = 0.0                 # poussée du propulseur (N)
    en_panne: bool = False                 # panne : pas de manœuvre de fin de vie
    meta: dict = field(default_factory=dict)

    @property
    def coef_balistique(self) -> float:    # Cd*A/m (m^2/kg)
        return self.cd * self.surface_m2 / self.masse_kg


def simuler(sat: Satellite, duree_ans: float = 15.0, pas_jours: float = 1.0):
    """Intègre l'altitude jour par jour. Renvoie un dict de tableaux numpy.

    Phases : 'mission' (maintien d'orbite), 'desorbitation' (poussée + traînée),
    'derive' (traînée seule), 'rentree'.
    """
    dt = pas_jours * JOUR
    n = int(duree_ans * 365.25 / pas_jours) + 1
    t = np.zeros(n)
    h = np.zeros(n)
    phase = np.empty(n, dtype=object)
    a = R_TERRE + sat.altitude_km * 1e3
    B = sat.coef_balistique
    t_rentree = None
    k = 0
    for k in range(n):
        t[k] = k * dt
        h_km = (a - R_TERRE) / 1e3
        h[k] = h_km
        ans = t[k] / AN
        if h_km <= ALT_RENTREE_KM:
            phase[k] = "rentree"
            t_rentree = t[k] / AN if t_rentree is None else t_rentree
            h[k] = max(h_km, 0.0)
            # on fige la courbe à 0 après la rentrée
            h[k + 1:] = 0.0
            phase[k + 1:] = "rentree"
            t[k + 1:] = np.arange(k + 1, n) * dt
            break
        if ans < sat.fin_mission_ans:
            phase[k] = "mission"
            continue                      # maintien d'orbite : altitude constante
        da = -densite(h_km) * np.sqrt(MU * a) * B
        if sat.propulsion and not sat.en_panne and h_km > 200:
            phase[k] = "desorbitation"
            da += -2 * a ** 1.5 / np.sqrt(MU) * sat.poussee_n / sat.masse_kg
        else:
            phase[k] = "derive"
        # sous-pas si la décroissance est rapide (fin de rentrée)
        sous = max(1, int(abs(da) * dt / 2e3))
        for _ in range(sous):
            hk = (a - R_TERRE) / 1e3
            dd = -densite(hk) * np.sqrt(MU * a) * B
            if phase[k] == "desorbitation":
                dd += -2 * a ** 1.5 / np.sqrt(MU) * sat.poussee_n / sat.masse_kg
            a += dd * dt / sous
            if a - R_TERRE < ALT_RENTREE_KM * 1e3:
                break
    return {"t_ans": t / AN, "alt_km": h, "phase": phase, "t_rentree_ans": t_rentree}


def duree_de_vie_naturelle_ans(alt_km: float, B: float, max_ans: float = 2000) -> float:
    """Durée de vie orbitale sans manœuvre (estimation rapide, pas adaptatif)."""
    a = R_TERRE + alt_km * 1e3
    t = 0.0
    while a - R_TERRE > ALT_RENTREE_KM * 1e3 and t < max_ans * AN:
        h = (a - R_TERRE) / 1e3
        da = densite(h) * np.sqrt(MU * a) * B
        dt = min(30 * JOUR, max(60.0, 1e3 / da))   # ~1 km par pas au plus
        a -= da * dt
        t += dt
    return t / AN


# Les deux satellites de la démo
SAT_A = Satellite("Sat-A", altitude_km=550, masse_kg=300, surface_m2=2.0,
                  propulsion=True, fin_mission_ans=5.0, poussee_n=0.01,
                  meta={"norad": "99901", "role": "bon élève : se désorbite"})
SAT_B = Satellite("Sat-B", altitude_km=750, masse_kg=150, surface_m2=1.0,
                  propulsion=False, fin_mission_ans=5.0, en_panne=True,
                  meta={"norad": "99902", "role": "en panne : reste en orbite"})

DELAI_LEGAL_ANS = 5.0   # règle FCC : 5 ans après la fin de mission
