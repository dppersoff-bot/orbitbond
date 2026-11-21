# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Configuration partagée : réseau, codes des tokens, fichiers d'état, chargement du .env."""
import json
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
TESTNET_URL = "https://s.altnet.rippletest.net:51234/"
EXPLORER = "https://testnet.xrpl.org/transactions/"

TEUR = "TEU"   # stablecoin de test (euro)
TBILL = "TBL"  # fonds tokenisé de bons du Trésor (test)

ACCOUNTS_FILE = BASE / "accounts.json"
BONDS_FILE = BASE / "bonds.json"
NAV_FILE = BASE / "nav.json"
ENV_FILE = BASE / ".env"

OPERATOR_SHARE = 0.85   # part des intérêts rendue à l'opérateur
CLEANUP_SHARE = 0.15    # part des intérêts versée au nettoyage
ROLES = ["ISSUER", "FUND", "SETTLEMENT", "OPERATOR_A", "OPERATOR_B", "CLEANUP", "INSURER"]
INSURER_REBATE_RATE = 0.04  # ristourne d'assurance versée au désorbiteur rapide (en % de la caution)


def client():
    from xrpl.clients import JsonRpcClient
    return JsonRpcClient(TESTNET_URL)


def load_env() -> dict:
    """Lit le .env sans dépendance externe. Les seeds ne sont jamais affichés."""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.endswith("_SEED")})
    return env


def wallet(role: str):
    from xrpl.wallet import Wallet
    seed = load_env().get(f"{role}_SEED")
    if not seed:
        raise RuntimeError(f"Seed manquant pour {role} : lance d'abord `python accounts.py`")
    return Wallet.from_seed(seed)


def address(role: str) -> str:
    return json.loads(ACCOUNTS_FILE.read_text())[role]


def read_json(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def link(tx_hash: str) -> str:
    return EXPLORER + tx_hash
