# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Rendement simulé du tBILL : valeur liquidative (NAV) en tEUR stockée dans nav.json."""
from config import NAV_FILE, read_json, write_json


def get_nav() -> float:
    return read_json(NAV_FILE, {"nav": 1.0, "annees": 0.0})["nav"]


def reset_nav() -> None:
    write_json(NAV_FILE, {"nav": 1.0, "annees": 0.0})


def avancer_temps(annees: float, taux: float = 0.04) -> float:
    """Fait monter la NAV avec des intérêts composés. Renvoie la nouvelle NAV."""
    data = read_json(NAV_FILE, {"nav": 1.0, "annees": 0.0})
    data["nav"] = round(data["nav"] * (1 + taux) ** annees, 8)
    data["annees"] = round(data["annees"] + annees, 4)
    write_json(NAV_FILE, data)
    return data["nav"]
