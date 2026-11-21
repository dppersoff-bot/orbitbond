# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Scénario complet de démo sur le testnet XRPL.

  python cli_demo.py --setup    # 1re fois : comptes faucet + tokens (≈ 3 min)
  python cli_demo.py            # scénario : Sat-A rembourse + ristourne, Sat-B perd sa caution

Sat-B est créé en premier : sa date limite expire pendant que Sat-A se règle, donc pas d'attente.
"""
import sys

from config import ACCOUNTS_FILE, BONDS_FILE, read_json

DEADLINE_A_MIN = 15   # Sat-A : large marge, il rentre à temps
DEADLINE_B_MIN = 4    # Sat-B : date limite courte pour la démo


def titre(t: str) -> None:
    print(f"\n{'=' * 70}\n{t}\n{'=' * 70}", flush=True)


def main() -> None:
    from accounts import create_accounts
    if "--setup" in sys.argv or not ACCOUNTS_FILE.exists():
        from tokens import setup_tokens
        titre("0. Comptes testnet (faucet) et tokens tEUR / tBILL")
        create_accounts()
        setup_tokens()
    elif "INSURER" not in read_json(ACCOUNTS_FILE, {}):
        from tokens import setup_insurer
        titre("0. Ajout du compte Assureur")
        create_accounts()
        setup_insurer()

    from bond import confirm_deorbit, create_bond, etat_bonds, expire_bond, parts_oracles, tentative_triche
    from caution import calcul_caution
    from nav import avancer_temps, reset_nav

    reset_nav()
    BONDS_FILE.unlink(missing_ok=True)

    titre("1. Calcul et dépôt des cautions (placées en tBILL, bloquées en escrow)")
    print(f"   Sat-B : 5 kg, 650 km, sans propulsion → {calcul_caution(650, 5, False):,.0f} tEUR", flush=True)
    b = create_bond("B", 650, 5, False, DEADLINE_B_MIN, satellite="Sat-B")
    print(f"   {b['bond_id']} : {b['quantite_tbill']:,} tBILL en escrow  {b['lien']}", flush=True)
    print(f"   Sat-A : 300 kg, 550 km, propulsion → {calcul_caution(550, 300, True):,.0f} tEUR", flush=True)
    a = create_bond("A", 550, 300, True, DEADLINE_A_MIN, satellite="Sat-A")
    print(f"   {a['bond_id']} : {a['quantite_tbill']:,} tBILL en escrow  {a['lien']}", flush=True)

    titre("2. On avance le temps de 5 ans (tBILL à 4 %/an)")
    print(f"   NAV du tBILL : 1.00 → {avancer_temps(5, 0.04):.4f} tEUR", flush=True)

    titre("3. Tentative de triche : débloquer Sat-B sans le secret")
    t = tentative_triche(b["bond_id"])
    print(f"   Faux secret      → {t['faux_secret']}")
    print(f"   Une seule part   → {t['une_seule_part']}", flush=True)

    titre("4. Sat-A rentre dans l'atmosphère : 2 oracles sur 3 révèlent leurs parts")
    parts = parts_oracles(a["bond_id"])
    r = confirm_deorbit(a["bond_id"], [parts[0], parts[2]])
    print(f"   EscrowFinish                     {r['liens']['finish']}")
    print(f"   Intérêts sur 5 ans : {r['interets']:,.2f} tEUR")
    print(f"   Caution + 85 % des intérêts → A : {r['montant_operateur']:>11,.2f} tEUR  {r['liens']['operateur']}")
    print(f"   15 % des intérêts → nettoyage  : {r['montant_nettoyage']:>11,.2f} tEUR  {r['liens']['nettoyage']}")
    print(f"   Ristourne de l'assureur → A    : {r['ristourne_assurance']:>11,.2f} tEUR  {r['liens']['assurance']}")
    print(f"   ► Total pour l'opérateur A     : {r['total_operateur']:>11,.2f} tEUR")
    print(f"     (seul en bons du Trésor, sans OrbitBond : {r['valeur_seul_en_tbill']:,.2f} tEUR)", flush=True)

    titre("5. Sat-B est resté en orbite : la date limite est passée")
    e = expire_bond(b["bond_id"])
    print(f"   EscrowCancel → le Fonds récupère {e['montant_recupere_par_le_fonds']:,} tBILL "
          f"(≈ {e['valeur_teur']:,.2f} tEUR) pour le nettoyage  {e['lien']}")

    titre("6. État final des cautions")
    for s in etat_bonds():
        print(f"   {s['bond_id']} {s['satellite']:6s} {s['statut']:9s} caution {s['montant_teur']:>10,.0f} tEUR")


if __name__ == "__main__":
    main()
