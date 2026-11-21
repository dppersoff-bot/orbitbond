# Généré avec l'aide de Claude (Anthropic) — assistant de code IA, hackathon IXH26. Relu et testé par l'équipe Nexora.
"""Partage de secret de Shamir 2 sur 3 sur le corps premier p = 2^521 - 1.

Chaque oracle reçoit une part "x-<hex>". 2 parts reconstruisent le secret ; 1 seule ne donne rien.
"""
import secrets

P = 2**521 - 1


def split(secret: bytes, n: int = 3, k: int = 2) -> list[str]:
    s = int.from_bytes(secret, "big")
    coefs = [s] + [secrets.randbelow(P) for _ in range(k - 1)]
    shares = []
    for x in range(1, n + 1):
        y = sum(c * pow(x, i, P) for i, c in enumerate(coefs)) % P
        shares.append(f"{x}-{y:x}")
    return shares


def combine(shares: list[str], length: int = 32) -> bytes:
    pts = [(int(s.split("-")[0]), int(s.split("-")[1], 16)) for s in shares]
    secret = 0
    for i, (xi, yi) in enumerate(pts):
        num, den = 1, 1
        for j, (xj, _) in enumerate(pts):
            if i != j:
                num = num * (-xj) % P
                den = den * (xi - xj) % P
        secret = (secret + yi * num * pow(den, -1, P)) % P
    # Avec une seule part (ou de mauvaises parts) le résultat est un nombre quelconque :
    # on le tronque à la bonne taille, il ne correspondra simplement pas à la condition.
    return (secret % (1 << (8 * length))).to_bytes(length, "big")
