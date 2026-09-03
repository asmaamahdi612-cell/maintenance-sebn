import streamlit as st
import pandas as pd
import unicodedata
import os

st.set_page_config(page_title="Planning & Carte de Suivi SEBN_MA", layout="wide")

URL_PUBLIEE_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTsjXyHY3fnnpzA4OFr8qkjj8ZEl-fEpOCcC-a0ZhHFMQ5OcgKOQx9yG999CGch4WmCpYojrFeKtm-H/pub?gid=642676886&single=true&output=csv"
FICHIER_BACKUP = "backup_data.csv"

# Style CSS spécifique pour l'impression en PDF
st.markdown("""
    <style>
    @media print {
        /* Masque les éléments d'interface inutiles à l'impression */
        header, footer, [data-testid="stHeader"], .no-print, .stSelectbox, .stAlert, button {
            display: none !important;
        }
        /* Ajuste la carte de suivi pour qu'elle prenne toute la page imprimée */
        .main .block-container {
            padding: 0 !important;
            margin: 0 !important;
        }
    }
    </style>
""", unsafe_allow_html=True)

def clean_str(text):
    if pd.isna(text): return ""
    text = str(text).strip().lower()
    text = unicodedata.normalize('NFD', text)
    return "".join(c for c in text if unicodedata.category(c) != 'Mn')

def get_priority(statut):
    if any(k in statut for k in ["arret", "tech", "panne"]): return 4
    elif any(k in statut for k in ["realis", "fait", "ok"]): return 3
    elif any(k in statut for k in ["report", "annul", "nok"]): return 2
    return 1

@st.cache_data(ttl=2)
def load_data():
    try:
        df = pd.read_csv(URL_PUBLIEE_CSV)
        df.to_csv(FICHIER_BACKUP, index=False) # Sauvegarde locale
        return df, "online"
    except Exception:
        if os.path.exists(FICHIER_BACKUP):
            return pd.read_csv(FICHIER_BACKUP), "offline"
        else:
            return pd.DataFrame(), "error"

df_prev, mode = load_data()

# Affichage de l'état de connexion
if mode == "online":
    st.success("✅ Synchronisation Google Sheets réussie !")
elif mode == "offline":
    st.warning("⚠️ Mode hors-ligne : Données chargées depuis la dernière sauvegarde locale.")
else:
    st.error("❌ Erreur de réseau et aucune sauvegarde locale disponible.")

if not df_prev.empty:
    df_prev.columns = df_prev.columns.str.strip()

# --- RECUPERATION DYNAMIQUE DES MACHINES DU GOOGLE SHEET ---
liste_machines = []
if not df_prev.empty and "Machine" in df_prev.columns:
    # Récupère toutes les machines uniques dans l'ordre du fichier Google Sheet
    for m in df_prev["Machine"].dropna():
        m_str = str(m).strip()
        if m_str and m_str not in liste_machines:
            liste_machines.append(m_str)

cols_semaines = list(range(1, 53))

# En-tête principal & Légende
st.title("🗓️ Suivi de la Maintenance Préventive - SEBN_MA")
c1, c2, c3, c4 = st.columns(4)
c1.markdown("🟩 **Réalisé**")
c2.markdown("🟥 **Reporté**")
c3.markdown("🟦 **Arrêt Technique**")
c4.markdown("⬜ **Prévu**")

st.markdown("---")

# =========================================================
# 1. GRAND TABLEAU MATRICE GÉNÉRALE (MASQUÉ À L'IMPRESSION)
# =========================================================
st.markdown('<div class="no-print">', unsafe_allow_html=True)
st.subheader("📊 Planning Général des Préventifs")

matrix_val = pd.DataFrame("", index=liste_machines, columns=cols_semaines)
matrix_status = pd.DataFrame("", index=liste_machines, columns=cols_semaines)
matrix_priority = pd.DataFrame(0, index=liste_machines, columns=cols_semaines)

if not df_prev.empty:
    for _, row in df_prev.iterrows():
        machine = str(row.get("Machine", "")).strip()
        sem_raw = str(row.get("Semaine", ""))
        sem_digits = "".join(filter(str.isdigit, sem_raw))
        if not sem_digits: continue
        semaine = int(sem_digits)
        
        type_prev = str(row.get("Type_Preventif", "")).strip()
        statut_clean = clean_str(row.get("Statut", ""))
        
        if type_prev.lower() in ["nan", "none", "null"]: type_prev = ""

        if machine in matrix_val.index and semaine in cols_semaines:
            prio_actuelle = matrix_priority.loc[machine, semaine]
            prio_nouvelle = get_priority(statut_clean)
            if prio_nouvelle >= prio_actuelle:
                matrix_val.loc[machine, semaine] = type_prev
                matrix_status.loc[machine, semaine] = statut_clean
                matrix_priority.loc[machine, semaine] = prio_nouvelle

def style_global_matrix(val_df, status_df):
    style_df = pd.DataFrame("", index=val_df.index, columns=val_df.columns)
    for row in val_df.index:
        for col in val_df.columns:
            cell_val = val_df.loc[row, col]
            st_val = status_df.loc[row, col]
            if cell_val != "":
                if any(k in st_val for k in ["arret", "tech", "panne"]):
                    style_df.loc[row, col] = "background-color: #3b82f6; color: white; font-weight: bold; text-align: center;"
                elif any(k in st_val for k in ["realis", "fait", "ok"]):
                    style_df.loc[row, col] = "background-color: #22c55e; color: white; font-weight: bold; text-align: center;"
                elif any(k in st_val for k in ["report", "annul", "nok"]):
                    style_df.loc[row, col] = "background-color: #ef4444; color: white; font-weight: bold; text-align: center;"
                else:
                    style_df.loc[row, col] = "background-color: #cbd5e1; color: #0f172a; font-weight: bold; text-align: center;"
    return style_df

styled_global = matrix_val.style.apply(lambda _: style_global_matrix(matrix_val, matrix_status), axis=None)
st.dataframe(styled_global, width="stretch", height=400)

st.markdown("---")
st.markdown('</div>', unsafe_allow_html=True)

# =========================================================
# 2. CARTE DE SUIVI INDIVIDUELLE (IMPRIMABLE)
# =========================================================
col_sub, col_btn = st.columns([3, 1])

with col_sub:
    st.subheader("📋 Carte de Suivi Individuelle par Machine")

with col_btn:
    if st.button("🖨️ Imprimer / Exporter en PDF"):
        st.components.v1.html("<script>window.print();</script>", height=0, width=0)

if liste_machines:
    machine_selected = st.selectbox("🔍 Sélectionnez une machine à inspecter :", liste_machines)
    df_m = df_prev[df_prev["Machine"].astype(str).str.strip() == machine_selected] if not df_prev.empty else pd.DataFrame()

    # En-tête officiel de la carte SEBN_MA
    col_hdr1, col_hdr2 = st.columns([3, 1])
    with col_hdr1:
        st.markdown(f"""
        **Type de Machine :** {machine_selected.split()[0]}  
        **Numéro de machine :** {machine_selected}  
        **Année :** 2026
        """)
    with col_hdr2:
        st.markdown("""
        ### 🔷 SEBN_MA
        **PPR Ma 070 Rév 5**
        """)

    types_preventifs = ["Mensuelle", "Trimestrielle", "Semestrielle"]

    def build_grid_and_style(semaines_cols, df_filtered):
        grid = pd.DataFrame("", index=types_preventifs, columns=[f"KW{s}" for s in semaines_cols])
        status_grid = pd.DataFrame("", index=types_preventifs, columns=[f"KW{s}" for s in semaines_cols])
        priority_grid = pd.DataFrame(0, index=types_preventifs, columns=[f"KW{s}" for s in semaines_cols])

        if not df_filtered.empty:
            for _, row in df_filtered.iterrows():
                sem_raw = str(row.get("Semaine", ""))
                sem_digits = "".join(filter(str.isdigit, sem_raw))
                if not sem_digits: continue
                semaine = int(sem_digits)
                
                if semaine not in semaines_cols: continue
                
                kw_col = f"KW{semaine}"
                tp_raw = str(row.get("Type_Preventif", "")).strip().lower()
                statut_clean = clean_str(row.get("Statut", ""))
                prio = get_priority(statut_clean)
                
                tp_target = "Mensuelle"
                if "m" in tp_raw or "mensu" in tp_raw: tp_target = "Mensuelle"
                elif "t" in tp_raw or "trime" in tp_raw: tp_target = "Trimestrielle"
                elif "s" in tp_raw or "seme" in tp_raw: tp_target = "Semestrielle"

                if tp_target in types_preventifs and prio >= priority_grid.loc[tp_target, kw_col]:
                    grid.loc[tp_target, kw_col] = tp_raw.upper() if tp_raw else "X"
                    status_grid.loc[tp_target, kw_col] = statut_clean
                    priority_grid.loc[tp_target, kw_col] = prio

        def style_fn(val_df):
            style_df = pd.DataFrame("", index=val_df.index, columns=val_df.columns)
            for row in val_df.index:
                for col in val_df.columns:
                    val = val_df.loc[row, col]
                    st_val = status_grid.loc[row, col]
                    if val != "":
                        if any(k in st_val for k in ["arret", "tech", "panne"]):
                            style_df.loc[row, col] = "background-color: #3b82f6; color: white; font-weight: bold; text-align: center;"
                        elif any(k in st_val for k in ["realis", "fait", "ok"]):
                            style_df.loc[row, col] = "background-color: #22c55e; color: white; font-weight: bold; text-align: center;"
                        elif any(k in st_val for k in ["report", "annul", "nok"]):
                            style_df.loc[row, col] = "background-color: #ef4444; color: white; font-weight: bold; text-align: center;"
                        else:
                            style_df.loc[row, col] = "background-color: #cbd5e1; color: #0f172a; font-weight: bold; text-align: center;"
            return style_df

        return grid.style.apply(lambda _: style_fn(grid), axis=None)

    # Semestre 1 (KW1 - KW26)
    st.markdown("#### 📅 Semestre 1 (KW1 à KW26)")
    styled_s1 = build_grid_and_style(list(range(1, 27)), df_m)
    st.dataframe(styled_s1, width="stretch")

    # Semestre 2 (KW27 - KW52)
    st.markdown("#### 📅 Semestre 2 (KW27 à KW52)")
    styled_s2 = build_grid_and_style(list(range(27, 53)), df_m)
    st.dataframe(styled_s2, width="stretch")

    # Registre des interventions
    st.markdown("#### 📝 Registre d'interventions sur cette machine")
    if not df_m.empty:
        cols_a_afficher = [c for c in ["Semaine", "Type_Preventif", "Date_Prevue", "Date_Realisee", "Statut", "Technicien"] if c in df_m.columns]
        st.dataframe(df_m[cols_a_afficher], width="stretch")
    else:
        st.info("Aucune intervention enregistrée pour cette machine.")
else:
    st.info("Aucune machine n'a été trouvée dans le fichier Google Sheet.")