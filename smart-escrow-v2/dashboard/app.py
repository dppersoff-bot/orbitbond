# Généré avec l'aide de Claude (Anthropic), relu et adapté par l'équipe Nexora (IXH26).
"""OrbitBond V2 (Smart Escrow) — tableau de bord (rôle B). Lancer : streamlit run app.py"""
import time

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

import adapter as A
from caution import calcul_caution
from montecarlo import balayage, MOIS, rendement_operateur
from orbit import SAT_A, SAT_B, simuler, DELAI_LEGAL_ANS, ALT_RENTREE_KM, duree_de_vie_naturelle_ans
from radar import quorum, ORACLES

st.set_page_config(page_title="OrbitBond", page_icon="🛰️", layout="wide")
SATS = {"Sat-A": SAT_A, "Sat-B": SAT_B}
COULEURS = {"Sat-A": "#2E86DE", "Sat-B": "#E74C3C"}
ss = st.session_state
ss.setdefault("bonds", {})      # nom -> réponse de create_bond
ss.setdefault("journal", [])


def eur(x):
    return f"{x:,.0f} €".replace(",", " ")


def lien_md(h, label="voir"):
    return f"`{h[:10]}…` (simulé)" if h else "—"


def etat(bond_id):
    return next((x for x in A.etat_bonds() if x.get("bond_id") == bond_id), {})


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
    st.info("Modèle V2 — Smart Escrow (XLS-100)")
    st.caption("Simulation fidèle aux règles exécutées sur le devnet Smart Escrow : "
               "quorum 2 oracles sur 3 vérifié par WASM, 100 % des intérêts à l'opérateur, "
               "1 % de frais, caution perdue 70 % nettoyage / 30 % bonus.")
    deadline_min = st.number_input("Date limite de Sat-B (minutes)", 1, 60, 1,
                                   help="CancelAfter de l'escrow de Sat-B (fin de mission + 5 ans). "
                                        "Sat-A a 60 minutes, comme dans le run devnet (2 min / 1 h).")
    st.caption("Sat-A (bon élève) : date limite fixée à 60 minutes.")
    if st.button("Réinitialiser la simulation"):
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
            c = calcul_caution(s.altitude_km, s.masse_kg, s.propulsion, False)
            st.subheader(f"{nom} — {s.meta['role']}")
            m1, m2, m3 = st.columns(3)
            m1.metric("Altitude", f"{s.altitude_km:.0f} km")
            m2.metric("Masse", f"{s.masse_kg:.0f} kg")
            m3.metric("Propulsion", "oui" if s.propulsion else "non")
            vie = duree_de_vie_naturelle_ans(s.altitude_km, s.coef_balistique)
            st.caption(f"Durée de vie naturelle sans manœuvre : environ {vie:,.0f} ans".replace(",", " "))
            st.metric("Caution calculée", eur(c), f"+ {eur(A.FRAIS * c)} de frais OrbitBond (1 %)", delta_color="off")
            if nom in ss.bonds:
                b = ss.bonds[nom]
                st.success(f"Caution déposée : {b['bond_id']} — EscrowCreate {lien_md(b.get('tx_hash'))}")
            elif st.button(f"Déposer la caution de {nom}", key=f"dep_{nom}", type="primary"):
                with st.spinner("Paiement tEUR + 1 % de frais → conversion tBILL → Smart Escrow…"):
                    try:
                        delai = int(deadline_min) if nom == "Sat-B" else 60
                        b = A.create_bond(nom, s.altitude_km, s.masse_kg, s.propulsion, delai)
                        ss.bonds[nom] = b
                        log(f"{nom} : caution {eur(b['montant_teur'])} en Smart Escrow ({b['bond_id']}), frais {eur(b['frais_orbitbond'])}")
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
        st.metric("Caution", eur(calcul_caution(alt, masse, prop, fast, geo)))
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
    st.header("Smart Escrow : 2 oracles sur 3 (ESA, LeoLabs, Space-Track)")
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

    b = ss.bonds.get(nom)
    x = etat(b["bond_id"]) if b else {}
    actif = x.get("statut") == "actif"
    emis = x.get("credentials", [])

    st.subheader("Credentials « DEORBITED » émis on-chain")
    st.caption("Un oracle honnête n'émet son Credential que si son propre radar a confirmé la rentrée.")
    cols = st.columns(3)
    for i, (c, o) in enumerate(zip(cols, ORACLES)):
        v = q["votes"][i]
        with c, st.container(border=True):
            st.metric(o["nom"], "✅ Rentrée" if v else "⏳ En orbite", f"radar : t = {v:.3f} ans" if v else None)
            if o["nom"] in emis:
                st.success("Credential émis")
            elif st.button("Émettre le Credential", key=f"cred_{nom}_{i}", disabled=not (b and actif and v)):
                A.emettre_credential(b["bond_id"], o["nom"])
                log(f"{nom} : {o['nom']} émet le Credential DEORBITED")
                st.rerun()

    st.divider()
    if not b:
        st.info("Déposer d'abord la caution dans l'onglet Satellites.")
    else:
        n = len(emis)
        c1, c2 = st.columns([1, 2])
        c1.metric("Confirmations lues par le Smart Escrow", f"{n} / 3", f"seuil : {A.SEUIL}", delta_color="off")
        with c2:
            st.caption("N'importe qui peut envoyer l'EscrowFinish : c'est le code WASM qui décide.")
            if st.button("⚙️ EscrowFinish → la finish function compte les Credentials",
                         disabled=not actif, type="primary" if n >= A.SEUIL else "secondary"):
                try:
                    A.confirm_deorbit(b["bond_id"])
                    log(f"{nom} : EscrowFinish accepté ({n}/3), caution versée directement à l'opérateur")
                    st.rerun()
                except A.RefusLedger as e:
                    log(f"{nom} : EscrowFinish refusé ({n}/3)")
                    st.error(f"Refusé par le ledger — {e}")
        with st.expander("Code de la finish function (Rust → WASM, smart-escrow-v2/src/lib.rs)"):
            st.code("""for oracle in oracles_inscrits_dans_Data {            // ESA, LeoLabs, Space-Track
    if credential_existe(operateur, oracle, "DEORBITED") { confirmations += 1 }
}
if confirmations >= 2 { succeed() } else { reject() }   // reject -> tecBYTECODE_REJECTED""", language="rust")

        @st.fragment(run_every=1)
        def suivi(b=b, nom=nom):
            x = etat(b["bond_id"])
            statut = x.get("statut", "actif")
            if statut == "débloqué":
                bl = A.bilan_operateur(b["bond_id"])
                st.success("Caution débloquée — l'escrow a payé l'opérateur directement, sans intermédiaire.")
                m = st.columns(4)
                m[0].metric("Caution + 100 % des intérêts", eur(bl["valeur_rachat"]))
                m[1].metric("Ristourne de l'assureur", eur(bl["ristourne_assurance"]))
                m[2].metric("Bonus de performance", eur(bl["bonus_performance"]),
                            "payé par les tricheurs" if bl["bonus_performance"] else "en attente d'un tricheur",
                            delta_color="off")
                m[3].metric("Frais OrbitBond (1 %)", eur(-bl["frais_orbitbond"]))
                c1b, c2b = st.columns(2)
                gain = bl["total_operateur"] - bl["valeur_seul_en_tbill"]
                c1b.metric("Total opérateur avec OrbitBond", eur(bl["total_operateur"]),
                           f"{gain:+,.0f} € vs placement seul".replace(",", " "))
                c2b.metric("Seul en bons du Trésor, sans OrbitBond", eur(bl["valeur_seul_en_tbill"]))
                return
            if statut == "annulé":
                st.error("Caution perdue — escrow annulé, la caution revient au Fonds.")
                m = st.columns(3)
                m[0].metric("Récupéré par le Fonds", eur(x["montant_recupere_par_le_fonds"]))
                m[1].metric("→ Nettoyage (70 %)", eur(x["vers_nettoyage"]))
                m[2].metric("→ Bonus aux opérateurs conformes (30 %)", eur(x["bonus_distribue"]))
                return
            restant = A.ripple_vers_unix(b["cancel_after"]) - time.time()
            if restant > 0:
                mn, sc = divmod(int(restant), 60)
                st.metric("Date limite (CancelAfter) dans", f"{mn:02d}:{sc:02d}")
            else:
                st.metric("Date limite (CancelAfter)", "dépassée")
                if st.button("⛔ EscrowCancel → la caution part au Fonds (70 % nettoyage / 30 % bonus)", key=f"cancel_{nom}"):
                    try:
                        r = A.expire_bond(b["bond_id"])
                        log(f"{nom} : EscrowCancel, {eur(r['vers_nettoyage'])} au nettoyage, "
                            f"{eur(r['bonus_distribue'])} de bonus → {', '.join(r['beneficiaires'])}")
                    except A.RefusLedger as e:
                        st.error(f"Refusé : {e}")
        suivi()

# ------------------------------------------------------------------ 4. Monte-Carlo
with onglets[3]:
    st.header("Pourquoi un opérateur choisit OrbitBond")
    st.caption("Rendement net sur 5 ans d'un opérateur qui se désorbite à temps, dans des cohortes de 40 satellites "
               "aléatoires. Le bonus vient uniquement des cautions perdues par les autres (30 %), au prorata des cautions.")
    ca, cb = st.columns([1, 3])
    avec_ristourne = ca.toggle("Inclure la ristourne d'assurance (4 %)", True)

    @st.cache_data(show_spinner="Simulation des cohortes…")
    def courbe_rendement(avec_ristourne):
        ps = np.round(np.arange(0, 0.51, 0.05), 2)
        q = [np.percentile(rendement_operateur(p, ristourne=0.04 if avec_ristourne else 0.0), [5, 50, 95]) for p in ps]
        return ps, np.array(q)

    ps, q = courbe_rendement(avec_ristourne)
    tbill = 1.04 ** 5 - 1
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=np.r_[ps, ps[::-1]] * 100, y=np.r_[q[:, 2], q[::-1, 0]] * 100, fill="toself",
                             fillcolor="#27AE60", opacity=0.15, line=dict(width=0), hoverinfo="skip", showlegend=False))
    fig.add_trace(go.Scatter(x=ps * 100, y=q[:, 1] * 100, name="Opérateur conforme avec OrbitBond",
                             line=dict(color="#27AE60", width=3)))
    fig.add_hline(y=tbill * 100, line_dash="dash", line_color="gray",
                  annotation_text=f"Bons du Trésor seuls : {tbill:.1%}", annotation_position="bottom right")
    fig.add_vrect(x0=10, x1=17, fillcolor="#F1C40F", opacity=0.12, line_width=0,
                  annotation_text="abandon réaliste : 10–17 %", annotation_position="top left")
    fig.update_layout(height=380, xaxis_title="taux d'abandon de la cohorte (%)",
                      yaxis_title="rendement net sur 5 ans (%)", margin=dict(t=30))
    cb.plotly_chart(fig, width="stretch")
    i10, i15 = list(ps).index(0.1), list(ps).index(0.15)
    k = st.columns(3)
    k[0].metric("Sans aucun tricheur", f"{q[0, 1]:.1%}", f"{q[0, 1] - tbill:+.1%} vs T-bills")
    k[1].metric("10 % d'abandons", f"{q[i10, 1]:.1%}", f"{q[i10, 1] - tbill:+.1%} vs T-bills")
    k[2].metric("15 % d'abandons", f"{q[i15, 1]:.1%}", f"{q[i15, 1] - tbill:+.1%} vs T-bills")

    st.divider()
    st.header("Le fonds de nettoyage reste-t-il solvable ?")
    st.caption("10 ans, arrivées aléatoires d'opérateurs, taux des bons du Trésor variables (≈ 4 % ± chocs). "
               "Le fonds reçoit 70 % des cautions perdues et ne finance un retrait que s'il a déjà l'argent.")
    c1, c2, c3, c4 = st.columns(4)
    n_runs = c1.slider("Nombre de scénarios", 50, 500, 150, 50)
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
                "montant (tEUR)": round(x.get("montant_teur", 0)), "frais OrbitBond": round(x.get("frais_orbitbond", 0)),
                "Credentials": f"{len(x.get('credentials', []))} / 3",
                "ristourne": round(x.get("ristourne_assurance") or 0),
                "bonus perf.": round(x.get("bonus_performance") or 0),
                "date limite": time.strftime("%H:%M:%S", time.localtime(A.ripple_vers_unix(ca))) if ca else None,
            })
        st.dataframe(pd.DataFrame(lignes), hide_index=True, width="stretch")
        fonds = sum(x.get("vers_nettoyage", 0) for x in bonds)
        frais = sum(x.get("frais_orbitbond", 0) for x in bonds)
        m1, m2, m3 = st.columns(3)
        m1.metric("Fonds de nettoyage", eur(fonds))
        m2.metric("Revenus OrbitBond (frais de dépôt)", eur(frais))
        m3.metric("Bonus en réserve", eur(A.reserve_bonus()))

    preuves = A.sortie_demo()
    st.subheader("Preuves on-chain (vraies transactions : devnet Smart Escrow V2, testnet V1)")
    if preuves:
        st.dataframe(pd.DataFrame(preuves), hide_index=True, width="stretch",
                     column_config={"lien": st.column_config.LinkColumn(display_text="explorateur")})
    else:
        st.caption("docs/v2_full_devnet_output.txt introuvable (le dossier dashboard doit être à côté de docs/).")
