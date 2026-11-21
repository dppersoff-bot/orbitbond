# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Crée (ou recharge) les comptes testnet via le faucet.

Les seeds vont dans .env (jamais affichés), les adresses publiques dans accounts.json.
Usage : python accounts.py [--force]
"""
import sys

from xrpl.wallet import Wallet, generate_faucet_wallet

from config import ACCOUNTS_FILE, ENV_FILE, ROLES, client, load_env, write_json


def create_accounts(force: bool = False) -> dict:
    env, c = load_env(), client()
    lines = ["# Seeds testnet OrbitBond — NE JAMAIS COMMITER NI PARTAGER"]
    addrs = {}
    for role in ROLES:
        seed = env.get(f"{role}_SEED")
        if seed and not force:
            w = Wallet.from_seed(seed)
            state = "existant"
        else:
            w = generate_faucet_wallet(c)
            state = "créé via faucet"
        lines.append(f"{role}_SEED={w.seed}")
        addrs[role] = w.address
        print(f"  {role:11s} {w.address}  ({state})")
    ENV_FILE.write_text("\n".join(lines) + "\n")
    write_json(ACCOUNTS_FILE, addrs)
    return addrs


if __name__ == "__main__":
    create_accounts(force="--force" in sys.argv)
    print("Adresses sauvegardées dans accounts.json, seeds dans .env")
