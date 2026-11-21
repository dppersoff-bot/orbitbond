# OrbitBond — Rôle B : simulation + tableau de bord

> Code écrit avec l'aide de Claude (Anthropic), relu par l'équipe Nexora. Déclaration IA : en-tête de chaque fichier.

## Lancer
```bash
pip install -r requirements.txt
streamlit run app.py                 # utilise le paquet `orbitbond` du rôle A s'il est importable
ORBITBOND_MODE=sim streamlit run app.py   # force le mode simulé (sans testnet)
```
Pour brancher le rôle A : mettre ce dossier à côté du dossier `orbitbond/` (ou l'installer), avec `bond.py`
(create_bond, confirm_deorbit, expire_bond, etat_bonds, et si possible calcul_caution) et `nav.py` (avancer_temps).

## Fichiers
| Fichier | Rôle |
|---|---|
| `orbit.py` | Décroissance orbitale : traînée en atmosphère exponentielle (table Vallado) + poussée de désorbitation |
| `radar.py` | Mesures radar bruitées pour 3 oracles, vote, quorum 2 sur 3 |
| `montecarlo.py` | Fonds de nettoyage sur 10 ans, conformité 0–100 %, taux variables |
| `caution.py` | Formule de la caution (identique au rôle A) |
| `adapter.py` | Pont vers le rôle A, ou mode simulé avec la même interface |
| `app.py` | Tableau de bord Streamlit |

## Scénario de démo
1. Satellites : déposer les cautions de Sat-A (50 000 €) et Sat-B (300 000 €).
2. État on-chain : avancer le temps de 5 ans.
3. Orbite : ▶ Lancer, Sat-A rentre ~2 mois après sa fin de mission, Sat-B reste à ~748 km.
4. Oracles : Sat-A, tentative de triche (1 part) refusée, puis révéler 2 parts, EscrowFinish.
5. Oracles : Sat-B, aucun quorum, compte à rebours, puis EscrowCancel vers le Fonds.
6. Pool : le solde reste ≥ 0 pour toute conformité.
