# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""OrbitBond — tableau de bord (rôle B). Lancer : streamlit run app.py"""
import time

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

import adapter as A
from montecarlo import balayage, MOIS
from orbit import SAT_A, SAT_B, simuler, DELAI_LEGAL_ANS, ALT_RENTREE_KM, duree_de_vie_naturelle_ans
from radar import quorum, ORACLES

st.set_page_config(page_title="OrbitBond", page_icon="🛰️", layout="wide")
SATS = {"Sat-A": SAT_A, "Sat-B": SAT_B}
COULEURS = {"Sat-A": "#2E86DE", "Sat-B": "#E74C3C"}
ss = st.session_state
ss.setdefault("bonds", {})      # nom -> réponse de create_bond (contient les parts des oracles)
ss.setdefault("journal", [])


def eur(x):
    return f"{x:,.0f} €".replace(",", " ")


def lien_md(h, label="voir"):
    if not h:
        return "—"
    if str(h).startswith("SIM"):
        return f"`{h[:10]}…` (simulé)"
    return f"[{label}]({A.lien(h)})"


def log(msg):
    ss.journal.insert(0, f"{time.strftime('%H:%M:%S')} — {msg}")


@st.cache_data
def trajectoires():
    return {n: simuler(s, duree_ans=12, pas_jours=1) for n, s in SATS.items()}


@st.cache_data
def oracles_pour(nom, seed=7):
    return quorum(trajectoires()[nom], seed=seed)


# ------------------------------------------------------------------ barre latérale
with st.sidebar:
    st.title("🛰️ OrbitBond")
    st.caption("Le staking appliqué à l'orbite.")
    if A.MODE == "xrpl":
        st.success("Connecté au cœur XRPL (testnet)")
    else:
        st.warning("Mode SIMULATION")
        if A.DOSSIER_A is None:
            st.caption("Code du rôle A introuvable. Définir ORBITBOND_PATH vers le dossier qui contient bond.py.")
        elif A.ERREUR_IMPORT:
            st.caption(f"Code du rôle A trouvé mais import impossible : {A.ERREUR_IMPORT}")
    deadline_min = st.number_input("Date limite de démo (minutes)", 1, 60, 3,
                                   help="CancelAfter de l'escrow. Représente fin de mission + 5 ans.")
    if A.MODE == "sim" and st.button("Réinitialiser la simulation"):
        A.reinitialiser_sim()
        ss.bonds, ss.journal = {}, []
        st.rerun()
    st.divider()
    st.subheader("Journal")
    for l in ss.journal[:12]:
        st.caption(l)

onglets = st.tabs(["🛰️ Satellites", "🌍 Orbite", "📡 Oracles", "💰 Pool (Monte-Carlo)", "⛓️ État on-chain"])

# ------------------------------------------------------------------ 1. Satellites
with onglets[0]:
    st.header("Satellites et cautions")
    cols = st.columns(2)
    for col, (nom, s) in zip(cols, SATS.items()):
        with col, st.container(border=True):
            c = A.calcul_caution(s.altitude_km, s.masse_kg, s.propulsion, False)
            st.subheader(f"{nom} — {s.meta['role']}")
            m1, m2, m3 = st.columns(3)
            m1.metric("Altitude", f"{s.altitude_km:.0f} km")
            m2.metric("Masse", f"{s.masse_kg:.0f} kg")
            m3.metric("Propulsion", "oui" if s.propulsion else "non")
            vie = duree_de_vie_naturelle_ans(s.altitude_km, s.coef_balistique)
            st.caption(f"Durée de vie naturelle sans manœuvre : environ {vie:,.0f} ans".replace(",", " "))
            st.metric("Caution calculée", eur(c))
            if nom in ss.bonds:
                b = ss.bonds[nom]
                st.success(f"Caution déposée : {b['bond_id']} — EscrowCreate {lien_md(b.get('tx_hash'))}")
            elif st.button(f"Déposer la caution de {nom}", key=f"dep_{nom}", type="primary"):
                with st.spinner("Paiement tEUR → conversion tBILL → EscrowCreate…"):
                    try:
                        b = A.create_bond(nom, s.altitude_km, s.masse_kg, s.propulsion, int(deadline_min))
                        ss.bonds[nom] = b
                        log(f"{nom} : caution {eur(b['montant_teur'])} bloquée ({b['bond_id']})")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Échec : {e}")

    with st.expander("Calculateur de caution"):
        c1, c2, c3, c4 = st.columns(4)
        alt = c1.slider("Altitude (km)", 300, 1200, 550, 10)
        geo = c1.checkbox("Orbite géostationnaire")
        masse = c2.select_slider("Masse (kg)", [1, 5, 10, 50, 100, 300, 1000, 5000], 300)
        prop = c3.checkbox("Peut se désorbiter seul", True)
        fast = c4.checkbox("Badge Fast Deorbiter")
        st.metric("Caution", eur(A.calcul_caution(alt, masse, prop, fast, geo)))
        st.caption("200 000 € × f_alt × f_masse × f_prop × f_hist, bornée entre 5 000 € et 1 000 000 €.")

# ------------------------------------------------------------------ 2. Orbite
with onglets[1]:
    st.header("Décroissance orbitale")
    st.caption("Traînée en atmosphère exponentielle. Sat-A allume son propulseur en fin de mission ; "
               "Sat-B tombe en panne et reste en orbite.")
    tr = trajectoires()
    n_frames = 120
    t_max = 12.0
    ts = np.linspace(0, t_max, n_frames)

    def alt_a(nom, t):
        d = tr[nom]
        return float(np.interp(t, d["t_ans"], d["alt_km"]))

    def xy(nom, t):
        r = 1 + alt_a(nom, t) / 1000 * 0.6 if alt_a(nom, t) > 0 else 0.98
        ang = 2 * np.pi * (t * 2.3 + (0 if nom == "Sat-A" else 0.4))
        return r * np.cos(ang), r * np.sin(ang)

    fig = make_subplots(rows=1, cols=2, column_widths=[0.38, 0.62],
                        subplot_titles=("Vue orbitale (altitude exagérée)", "Altitude (km)"))
    th = np.linspace(0, 2 * np.pi, 100)
    fig.add_trace(go.Scatter(x=np.cos(th), y=np.sin(th), fill="toself", fillcolor="#1B4F72",
                             line=dict(color="#1B4F72"), hoverinfo="skip", showlegend=False), 1, 1)
    for nom in SATS:
        x, y = xy(nom, 0)
        fig.add_trace(go.Scatter(x=[x], y=[y], mode="markers+text", text=[nom], textposition="top center",
                                 marker=dict(size=12, color=COULEURS[nom]), showlegend=False), 1, 1)
    for nom in SATS:
        fig.add_trace(go.Scatter(x=[0], y=[alt_a(nom, 0)], mode="lines", name=nom,
                                 line=dict(color=COULEURS[nom], width=3)), 1, 2)
    frames = []
    for t in ts:
        data = [go.Scatter(x=np.cos(th), y=np.sin(th))]
        for nom in SATS:
            x, y = xy(nom, t)
            data.append(go.Scatter(x=[x], y=[y]))
        for nom in SATS:
            sel = tr[nom]["t_ans"] <= t
            data.append(go.Scatter(x=tr[nom]["t_ans"][sel][::5], y=tr[nom]["alt_km"][sel][::5]))
        frames.append(go.Frame(data=data, name=f"{t:.1f}"))
    fig.frames = frames
    fig.add_vline(x=SAT_A.fin_mission_ans, line_dash="dot", line_color="gray",
                  annotation_text="fin de mission", row=1, col=2)
    fig.add_vline(x=SAT_A.fin_mission_ans + DELAI_LEGAL_ANS, line_dash="dash", line_color="#E74C3C",
                  annotation_text="date limite (5 ans)", row=1, col=2)
    fig.add_hline(y=ALT_RENTREE_KM, line_dash="dot", line_color="orange",
                  annotation_text="rentrée", row=1, col=2)
    fig.update_xaxes(range=[-1.7, 1.7], visible=False, row=1, col=1)
    fig.update_yaxes(range=[-1.7, 1.7], visible=False, scaleanchor="x", row=1, col=1)
    fig.update_xaxes(range=[0, t_max], title="années depuis le lancement", row=1, col=2)
    fig.update_yaxes(range=[0, 850], row=1, col=2)
    fig.update_layout(height=480, margin=dict(t=40, b=10),
                      updatemenus=[dict(type="buttons", x=0, y=-0.08, xanchor="left", buttons=[
                          dict(label="▶ Lancer", method="animate",
                               args=[None, dict(frame=dict(duration=60, redraw=True), fromcurrent=True)]),
                          dict(label="⏸", method="animate",
                               args=[[None], dict(mode="immediate", frame=dict(duration=0))])])],
                      sliders=[dict(active=0, x=0.1, len=0.9, y=-0.08, currentvalue=dict(prefix="t = ", suffix=" ans"),
                                    steps=[dict(method="animate", label=f.name,
                                                args=[[f.name], dict(mode="immediate", frame=dict(duration=0, redraw=True))])
                                           for f in frames])])
    st.plotly_chart(fig, width="stretch")
    c1, c2 = st.columns(2)
    ta = tr["Sat-A"]["t_rentree_ans"]
    c1.metric("Sat-A : rentrée", f"{ta:.2f} ans", f"{(ta - SAT_A.fin_mission_ans) * 365:.0f} jours après la fin de mission")
    c2.metric("Sat-B : altitude à la date limite", f"{alt_a('Sat-B', 10):.0f} km", "toujours en orbite", delta_color="inverse")

# ------------------------------------------------------------------ 3. Oracles
with onglets[2]:
    st.header("Oracles de suivi orbital (2 sur 3)")
    st.caption("Chaque oracle a son propre radar, avec bruit et trous de détection. "
               "Il confirme la rentrée après 3 mesures consécutives sous 120 km ou une piste perdue à basse altitude.")
    nom = st.radio("Satellite", list(SATS), horizontal=True)
    q = oracles_pour(nom)
    t_r = trajectoires()[nom]["t_rentree_ans"]
    t0 = (t_r - 0.12) if t_r else 9.6
    t1 = (t_r + 0.03) if t_r else 10.0
    fig = go.Figure()
    d = trajectoires()[nom]
    sel = (d["t_ans"] >= t0) & (d["t_ans"] <= t1)
    fig.add_trace(go.Scatter(x=d["t_ans"][sel], y=d["alt_km"][sel], name="altitude réelle",
                             line=dict(color="black", width=2)))
    for m, col in zip(q["mesures"], ["#2E86DE", "#27AE60", "#8E44AD"]):
        s2 = (m["t_ans"] >= t0) & (m["t_ans"] <= t1)
        fig.add_trace(go.Scatter(x=m["t_ans"][s2], y=m["mesure_km"][s2], mode="markers",
                                 name=m["oracle"], marker=dict(size=6, color=col, opacity=0.7)))
    fig.add_hline(y=ALT_RENTREE_KM, line_dash="dot", line_color="orange")
    fig.update_layout(height=360, xaxis_title="années", yaxis_title="altitude mesurée (km)", margin=dict(t=20))
    st.plotly_chart(fig, width="stretch")

    cols = st.columns(3)
    for i, (c, o) in enumerate(zip(cols, ORACLES)):
        v = q["votes"][i]
        c.metric(o["nom"], "✅ Rentrée" if v else "⏳ En orbite",
                 f"à t = {v:.3f} ans" if v else None)

    b = ss.bonds.get(nom)
    st.divider()
    if q["t_quorum_ans"]:
        st.success(f"Quorum atteint à t = {q['t_quorum_ans']:.3f} ans : les oracles "
                   f"{', '.join(str(i + 1) for i in q['oracles_ok'][:2])} peuvent révéler leurs parts.")
    else:
        st.error("Pas de quorum : aucun oracle ne confirme la rentrée. Le secret reste caché.")

    if not b:
        st.info("Déposer d'abord la caution dans l'onglet Satellites.")
    else:
        parts = b.get("parts_oracles", [])
        c1, c2 = st.columns(2)
        if c1.button("🔓 Révéler 2 parts → EscrowFinish", disabled=not q["t_quorum_ans"], type="primary"):
            try:
                r = A.confirm_deorbit(b["bond_id"], [parts[i] for i in q["oracles_ok"][:2]])
                log(f"{nom} : EscrowFinish, opérateur {eur(r['montant_operateur'])}, nettoyage {eur(r['montant_nettoyage'])}")
                st.success(f"Caution débloquée — EscrowFinish {lien_md(r.get('tx_hash_finish'))}")
                m1, m2, m3 = st.columns(3)
                m1.metric("Rendu à l'opérateur (caution + 85 % des intérêts)", eur(r["montant_operateur"]))
                m2.metric("Ristourne de l'assureur", eur(r.get("ristourne_assurance", 0)))
                m3.metric("Fonds de nettoyage (15 % des intérêts)", eur(r["montant_nettoyage"]))
                if "total_operateur" in r:
                    seul = r.get("valeur_seul_en_tbill", 0)
                    gain = r["total_operateur"] - seul
                    c1b, c2b = st.columns(2)
                    c1b.metric("Total opérateur avec OrbitBond", eur(r["total_operateur"]),
                               f"{gain:+,.0f} € vs placement seul".replace(",", " "))
                    c2b.metric("Seul en bons du Trésor, sans OrbitBond", eur(seul))
                if r.get("liens", {}).get("assurance"):
                    st.caption(f"Ristourne : {lien_md(r['liens']['assurance'].split('/')[-1])}")
            except Exception as e:
                st.error(f"Refusé par le ledger : {e}")
        if c2.button("🕵️ Tentative de triche : débloquer avec 1 seule part"):
            try:
                A.confirm_deorbit(b["bond_id"], parts[:1])
                st.warning("La transaction est passée : à vérifier côté rôle A !")
            except Exception as e:
                log(f"{nom} : tentative de triche refusée")
                st.error(f"Refusé par le ledger : {e}")

        @st.fragment(run_every=1)
        def compte_a_rebours(b=b, nom=nom):
            x = next((x for x in A.etat_bonds() if x.get("bond_id") == b["bond_id"]), {})
            statut = x.get("statut", "actif")
            if statut != "actif":
                if x.get("montant_recupere_par_le_fonds"):
                    st.metric("Statut de la caution : annulé", eur(x["montant_recupere_par_le_fonds"]),
                              "récupéré par le Fonds de nettoyage", delta_color="off")
                elif x.get("montant_operateur"):
                    st.metric("Statut de la caution : débloqué", eur(x["montant_operateur"]),
                              "rendu à l'opérateur", delta_color="off")
                else:
                    st.metric("Statut de la caution", statut)
                return
            restant = A.ripple_vers_unix(b["cancel_after"]) - time.time()
            if restant > 0:
                mn, sc = divmod(int(restant), 60)
                st.metric("Date limite (CancelAfter) dans", f"{mn:02d}:{sc:02d}")
            else:
                st.metric("Date limite (CancelAfter)", "dépassée")
                if st.button("⛔ EscrowCancel → la caution part au Fonds", key=f"cancel_{nom}"):
                    try:
                        r = A.expire_bond(b["bond_id"])
                        log(f"{nom} : EscrowCancel, Fonds récupère {eur(r['montant_recupere_par_le_fonds'])}")
                        st.success(f"Escrow annulé {lien_md(r.get('tx_hash_cancel'))} — le Fonds récupère "
                                   f"{eur(r['montant_recupere_par_le_fonds'])}")
                    except Exception as e:
                        st.error(f"Refusé : {e}")
        compte_a_rebours()

# ------------------------------------------------------------------ 4. Monte-Carlo
with onglets[3]:
    st.header("Le fonds de nettoyage reste-t-il solvable ?")
    st.caption("10 ans, arrivées aléatoires d'opérateurs, taux des bons du Trésor variables (≈ 4 % ± chocs). "
               "Le fonds ne finance un retrait qu'après l'annulation de l'escrow et seulement s'il a l'argent.")
    c1, c2, c3, c4 = st.columns(4)
    n_runs = c1.slider("Nombre de scénarios", 50, 500, 200, 50)
    parrainage = c2.slider("Parrainage assureurs (M€)", 0.0, 10.0, 2.0, 0.5) * 1e6
    cout = c3.slider("Coût d'un retrait / caution", 0.5, 5.0, 1.5, 0.25)
    arr = c4.slider("Nouveaux satellites / mois", 1, 20, 4)

    @st.cache_data(show_spinner="Simulation Monte-Carlo…")
    def mc(n_runs, parrainage, cout, arr):
        return balayage(n_runs=n_runs, parrainage=parrainage, cout_adr_x=cout, arrivees_par_mois=arr)

    res = mc(n_runs, parrainage, cout, arr)
    mois = np.arange(MOIS + 1) / 12
    fig = go.Figure()
    palette = ["#C0392B", "#E67E22", "#F1C40F", "#27AE60", "#2E86DE"]
    for (c, r), col in zip(res.items(), palette):
        s = r["solde"] / 1e6
        p5, p50, p95 = np.percentile(s, [5, 50, 95], axis=0)
        fig.add_trace(go.Scatter(x=np.r_[mois, mois[::-1]], y=np.r_[p95, p5[::-1]], fill="toself",
                                 fillcolor=col, opacity=0.15, line=dict(width=0), hoverinfo="skip",
                                 showlegend=False))
        fig.add_trace(go.Scatter(x=mois, y=p50, name=f"conformité {c:.0%}", line=dict(color=col, width=3)))
    fig.add_hline(y=0, line_color="black")
    fig.update_layout(height=420, xaxis_title="années", yaxis_title="solde du fonds (M€) — médiane et 5–95 %",
                      margin=dict(t=20), yaxis=dict(rangemode="tozero"))
    st.plotly_chart(fig, width="stretch")

    mini = min(r["solde"].min() for r in res.values())
    m1, m2 = st.columns(2)
    m1.metric("Solde minimum sur tous les scénarios", f"{mini / 1e6:,.2f} M€", "jamais négatif" if mini >= 0 else "NÉGATIF")
    tab = pd.DataFrame({
        "conformité": [f"{c:.0%}" for c in res],
        "objets retirés (moy.)": [r["nettoyes"][:, -1].mean().round(1) for r in res.values()],
        "objets en attente (moy.)": [r["en_attente"][:, -1].mean().round(1) for r in res.values()],
        "solde final médian (M€)": [np.median(r["solde"][:, -1] / 1e6).round(2) for r in res.values()],
    })
    m2.dataframe(tab, hide_index=True, width="stretch")

# ------------------------------------------------------------------ 5. On-chain
with onglets[4]:
    st.header("État des cautions sur XRPL")
    c1, c2 = st.columns([1, 3])
    if c1.button("⏩ Avancer le temps de 5 ans (tBILL à 4 %/an)"):
        nav = A.avancer_temps(5, 0.04)
        log(f"Temps avancé de 5 ans, valeur du tBILL = {nav:.4f} tEUR")
        st.success(f"Valeur du tBILL : {nav:.4f} tEUR")
    try:
        bonds = A.etat_bonds()
    except Exception as e:
        bonds = []
        st.error(f"etat_bonds() a échoué : {e}")
    if not bonds:
        st.info("Aucune caution pour l'instant.")
    else:
        lignes = []
        for x in bonds:
            ca = x.get("cancel_after")
            lignes.append({
                "caution": x.get("bond_id"), "opérateur": x.get("operateur"), "statut": x.get("statut"),
                "montant (tEUR)": x.get("montant_teur"), "tBILL": x.get("quantite_tbill"),
                "ristourne": x.get("ristourne_assurance") or 0,
                "date limite": time.strftime("%H:%M:%S", time.localtime(A.ripple_vers_unix(ca))) if ca else None,
                "EscrowCreate": None if str(x.get("tx_hash", "")).startswith("SIM") else A.lien(x.get("tx_hash", "")),
            })
        st.dataframe(pd.DataFrame(lignes), hide_index=True, width="stretch",
                     column_config={"EscrowCreate": st.column_config.LinkColumn(display_text="explorateur")})

    preuves = A.sortie_demo()
    st.subheader("Preuves testnet (dernière exécution de cli_demo.py)")
    if preuves:
        st.dataframe(pd.DataFrame(preuves), hide_index=True, width="stretch",
                     column_config={"lien": st.column_config.LinkColumn(display_text="explorateur")})
    else:
        st.caption("demo_output.txt du rôle A introuvable.")
