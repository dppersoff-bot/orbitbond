# OrbitBond — Rôle B : simulation + tableau de bord (modèle V2 Smart Escrow)

> Code écrit avec l'aide de Claude (Anthropic), relu par l'équipe Nexora. Déclaration IA : en-tête de chaque fichier.

## Lancer
```bash
pip install -r requirements.txt
streamlit run app.py
```
Le tableau de bord simule le modèle **V2** avec exactement les règles exécutées sur le devnet Smart Escrow
(`smart-escrow-v2/runTest.js`). Les vraies transactions du devnet sont affichées dans l'onglet « État on-chain »,
lues depuis `docs/v2_full_devnet_output.txt` (le dossier `dashboard/` doit rester à côté de `docs/`).

## Règles V2 reproduites
| Étape | Règle |
|---|---|
| Dépôt | caution en tEUR au Fonds + **1 % de frais** à OrbitBond, conversion en tBILL |
| Verrouillage | Smart Escrow (XLS-100) : destination = opérateur, `Data` = 3 oracles (ESA, LeoLabs, Space-Track), `CancelAfter` |
| Déblocage | chaque oracle émet un Credential `DEORBITED` ; la finish function WASM les compte : < 2 → `tecBYTECODE_REJECTED`, ≥ 2 → libération |
| Succès | l'escrow paie l'opérateur directement : caution + **100 % des intérêts** + ristourne d'assurance (4 %) |
| Échec | `EscrowCancel` → Fonds → **70 % nettoyage**, **30 % bonus de performance** aux opérateurs conformes (au prorata) |

Vérification : avec Sat-A (50 000 €) et Sat-B (75 000 €), le tableau de bord retrouve les chiffres du devnet :
91 248,97 récupérés, 63 874,28 au nettoyage, 27 374,69 de bonus, **89 707,34 tEUR net pour l'opérateur A**.

## Fichiers
| Fichier | Rôle |
|---|---|
| `orbit.py` | Décroissance orbitale : traînée en atmosphère exponentielle (table Vallado) + poussée de désorbitation |
| `radar.py` | Mesures radar bruitées pour les 3 oracles ; un oracle honnête ne certifie que ce que son radar confirme |
| `adapter.py` | Modèle V2 (Smart Escrow) : dépôt, Credentials, EscrowFinish, EscrowCancel, répartition 70/30, preuves devnet |
| `montecarlo.py` | Rendement d'un opérateur conforme selon le taux d'abandon + solvabilité du fonds de nettoyage sur 10 ans |
| `caution.py` | Formule de la caution (identique au rôle A) |
| `app.py` | Tableau de bord Streamlit |

## Scénario de démo (date limite : 1 minute)
1. Satellites : déposer **Sat-B** (5 kg, 650 km, 75 000 €) puis **Sat-A** (300 kg, 550 km, 50 000 €).
2. État on-chain : avancer le temps de 5 ans.
3. Orbite : ▶ Lancer — Sat-A rentre ~2 mois après sa fin de mission, Sat-B reste vers 640 km.
4. Smart Escrow → Sat-A : EscrowFinish avec 0 puis 1 Credential → `tecBYTECODE_REJECTED` ; ESA + Space-Track émettent → EscrowFinish accepté.
5. Smart Escrow → Sat-B : aucun oracle ne peut certifier ; à 00:00, EscrowCancel → 70 % nettoyage, 30 % bonus à Sat-A (89 707 €).
6. Pool : un opérateur conforme bat les bons du Trésor seuls, d'autant plus qu'il y a d'abandons ; le fonds reste ≥ 0.

## Limites assumées
Simulation locale (pas de transaction depuis le tableau de bord) ; rendement des tBILL simulé ; oracles simulés par des radars bruités.
