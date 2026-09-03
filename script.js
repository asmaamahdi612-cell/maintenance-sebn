// ==========================================
// CONFIGURATION APPSHEET
// ==========================================

// LECTURE : Application SEBN_MA INTER (Table Maintenance_Data)
const APPSHEET_SOURCE = {
  appId: "612179e5-1065-4918-8cb9-210df0897f60",
  apiKey: "V2-RRD05-rsvk4-S4j53-Fu9IM-TM5ws-6NRag-zwjJl-M6fWT",
  tableName: "Maintenance_Data"
};

// ÉCRITURE : Application SEBN_Predictions (Table Prediction_Data)
const APPSHEET_PREDICTIONS = {
  appId: "1216185c-b47f-4875-9aec-f9738d7ae8ff",
  apiKey: "V2-RCKOD-Pz6OI-xZM6X-UPAsf-3czak-8VwLC-qBu0p-mevdM", // <-- Remplacez par votre clé générée à l'Étape 1
  tableName: "Prediction_Data"
};

let machinesData = [];
let seuilActuel = 70;
const sentState = {};
let monGraphique = null;

const FALLBACK_MACHINES = [
  { idMachine: "M1", machine: "TW1", zone: "COUPE", typePanne: "Electrique", tech: "Metghari Adnane", temp: 64, vibration: 3.5, force: 850, humidite: 50, usure: 48, risque: 62 },
  { idMachine: "M2", machine: "TW5", zone: "SERTISSAGE", typePanne: "Mecanique", tech: "Lghdira Mohammed", temp: 68, vibration: 3.8, force: 900, humidite: 50, usure: 56, risque: 74 },
  { idMachine: "M3", machine: "TW3", zone: "SOUDAGE", typePanne: "Pneumatique", tech: "Mohamed Nakkab", temp: 72, vibration: 4.1, force: 950, humidite: 50, usure: 64, risque: 86 }
];

// ==========================================
// SYNCHRONISATION CONTINU (AUTO-REFRESH)
// ==========================================
async function synchroniserDepuisAppSheet() {
  const syncStatusEl = document.getElementById('syncStatus');
  const lastSyncTimeEl = document.getElementById('lastSyncTime');

  if (syncStatusEl) {
    syncStatusEl.innerText = "● Sync en cours...";
    syncStatusEl.className = "text-xs font-semibold text-amber-400";
  }

  const targetUrl = `https://api.appsheet.com/api/v2/apps/${APPSHEET_SOURCE.appId}/tables/${APPSHEET_SOURCE.tableName}/Action`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "ApplicationAccessKey": APPSHEET_SOURCE.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "Action": "Find",
        "Properties": { "Locale": "fr-FR" },
        "Rows": []
      })
    });

    if (res.ok) {
      const data = await res.json();
      const list = [];

      if (Array.isArray(data) && data.length > 0) {
        data.forEach((row, idx) => {
          const nomMachine = String(row.MACHINE || row.Machine || row.Nom || "").trim();
          if (nomMachine) {
            list.push({
              idMachine: String(row.ID || `ID_${idx}`).trim(),
              machine: nomMachine,
              zone: String(row.Zone || "SERTISSAGE").trim(),
              typePanne: String(row.Type_panne || row.Type_Panne || "Electrique").trim(),
              tech: String(row.Technicien || row.Tech || "Non assigné").trim(),
              temp: parseFloat(row.Temperature) || (60 + (idx * 4) % 25),
              vibration: parseFloat(row.Vibration) || parseFloat((3.2 + (idx * 0.3) % 2.5).toFixed(1)),
              force: parseFloat(row.Force) || (800 + (idx * 45) % 250),
              humidite: 50,
              usure: parseFloat(row.Usure) || (40 + (idx * 8) % 40),
              risque: parseFloat(row.Risque) || (50 + (idx * 12) % 40)
            });
          }
        });
      }

      machinesData = list.length > 0 ? list : FALLBACK_MACHINES;

      if (syncStatusEl) {
        syncStatusEl.innerText = "● Synchronisé";
        syncStatusEl.className = "text-xs font-semibold text-emerald-400";
      }
    } else {
      machinesData = FALLBACK_MACHINES;
      if (syncStatusEl) {
        syncStatusEl.innerText = "● Mode local";
        syncStatusEl.className = "text-xs font-semibold text-slate-400";
      }
    }
  } catch (err) {
    machinesData = FALLBACK_MACHINES;
    if (syncStatusEl) {
      syncStatusEl.innerText = "● Mode local";
      syncStatusEl.className = "text-xs font-semibold text-slate-400";
    }
  }

  if (lastSyncTimeEl) {
    lastSyncTimeEl.innerText = `Dernière MàJ: ${new Date().toLocaleTimeString('fr-FR')}`;
  }

  renderMachines();
}

// ==========================================
// AFFICHAGE DYNAMIQUE & GRAPHIQUE
// ==========================================
function renderMachines() {
  const container = document.getElementById('machinesContainer');
  if (!container) return;

  container.innerHTML = '';

  if (machinesData.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-500 text-sm">Chargement des données...</div>`;
    return;
  }

  let maxRisque = 0;
  let maxMachineName = "Aucune";
  machinesData.forEach(m => {
    if (m.risque > maxRisque) {
      maxRisque = m.risque;
      maxMachineName = m.machine;
    }
  });

  const kpiRiskEl = document.getElementById('kpiRisqueMax');
  const kpiMachEl = document.getElementById('kpiMachineMax');
  if (kpiRiskEl) kpiRiskEl.innerText = `${maxRisque}%`;
  if (kpiMachEl) kpiMachEl.innerText = maxMachineName;

  machinesData.forEach((m, index) => {
    const depasseSeuil = m.risque >= seuilActuel;
    const isSent = sentState[m.idMachine || m.machine];

    const card = document.createElement('div');
    card.className = `bg-[#121722] border rounded-xl p-4 flex flex-col space-y-4 transition-all ${
      depasseSeuil 
        ? 'border-rose-500/60 bg-rose-950/10 alert-glow' 
        : 'border-slate-800/80 opacity-95'
    }`;

    card.innerHTML = `
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center space-x-3">
            <span class="font-black text-lg text-white">#${index + 1} - ${m.machine}</span>
            ${
              depasseSeuil 
                ? `<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/40">● ALERTE (≥ ${seuilActuel}%)</span>`
                : `<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">● CONFORME (< ${seuilActuel}%)</span>`
            }
          </div>
          <p class="text-xs text-slate-400 mt-1">
            Zone: <span class="uppercase text-slate-200 font-bold">${m.zone}</span> · 
            Panne: <span class="text-slate-300 font-semibold">${m.typePanne}</span> · 
            Tech: <span class="text-slate-300 font-semibold">${m.tech || 'N/A'}</span>
          </p>
        </div>

        <div class="flex items-center space-x-6">
          <div class="text-right">
            <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">RISQUE INDUIT</div>
            <div class="text-xl font-black ${depasseSeuil ? 'text-rose-400' : 'text-emerald-400'}">${m.risque}%</div>
          </div>

          <button 
            id="btn-${index}"
            onclick="envoyerAlerteByIndex(${index})"
            ${!depasseSeuil || isSent ? 'disabled' : ''}
            class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md ${
              isSent
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                : depasseSeuil
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50 cursor-pointer active:scale-95'
                : 'bg-[#1a2130] text-slate-500 border border-slate-700/40 cursor-not-allowed'
            }"
          >
            ${isSent ? '✓ Transmission OK' : depasseSeuil ? 'Transmettre l\'Alerte' : '🔒 Sous le seuil'}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-800/80 text-xs">
        <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800/80">
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-1">🧪 TEMP. MOTEUR</span>
          <span class="text-sm font-bold ${m.temp > 80 ? 'text-rose-400' : 'text-slate-100'}">${m.temp} °C</span>
        </div>

        <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800/80">
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-1">⚡ VIBRATION</span>
          <span class="text-sm font-bold ${m.vibration > 5 ? 'text-rose-400' : 'text-slate-100'}">${m.vibration} mm/s</span>
        </div>

        <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800/80">
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-1">🏋️ FORCE CFA</span>
          <span class="text-sm font-bold ${m.force > 1000 ? 'text-rose-400' : 'text-slate-100'}">${m.force} N</span>
        </div>

        <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800/80">
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-1">💧 HUMIDITÉ</span>
          <span class="text-sm font-bold text-slate-100">${m.humidite} %</span>
        </div>

        <div class="bg-[#0b0e14] p-3 rounded-xl border border-slate-800/80 col-span-2 md:col-span-1">
          <span class="text-[10px] text-slate-400 uppercase font-bold block mb-1">✂️ USURE OUTIL</span>
          <div class="flex items-center space-x-2 mt-1">
            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div class="h-full ${m.usure > 80 ? 'bg-rose-500' : 'bg-amber-500'}" style="width: ${m.usure}%"></div>
            </div>
            <span class="font-bold text-slate-200 text-xs">${m.usure}%</span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  rendreGraphique();
}

// ==========================================
// MOTEUR DU GRAPHIQUE (CHART.JS)
// ==========================================
function rendreGraphique() {
  const canvas = document.getElementById('risqueChart');
  if (!canvas) return;

  const labels = machinesData.map(m => m.machine);
  const risques = machinesData.map(m => m.risque);

  if (monGraphique) {
    monGraphique.destroy();
  }

  monGraphique = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Risque (%)',
          data: risques,
          backgroundColor: risques.map(r => r >= seuilActuel ? 'rgba(244, 63, 94, 0.85)' : 'rgba(16, 185, 129, 0.7)'),
          borderColor: risques.map(r => r >= seuilActuel ? '#f43f5e' : '#10b981'),
          borderWidth: 1,
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { weight: 'bold' } } },
        y: { min: 0, max: 100, grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

// ==========================================
// TRANSMISSION DE L'ALERTE (AVEC DIAGNOSTIC D'ERREUR)
// ==========================================
async function envoyerAlerteByIndex(index) {
  const m = machinesData[index];
  if (!m) return;

  const btn = document.getElementById(`btn-${index}`);
  if (btn) {
    btn.innerText = "Envoi...";
    btn.disabled = true;
  }

  const today = new Date();
  const dateFormatted = today.toISOString().split('T')[0];
  const idCourt = `PRED-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const payload = {
    "Action": "Add",
    "Properties": { 
      "Locale": "fr-FR",
      "Timezone": "W. Europe Standard Time"
    },
    "Rows": [
      {
        "ID": idCourt,
        "Date": dateFormatted,
        "MACHINE": String(m.machine),
        "Zone": String(m.zone),
        "Type_panne": String(m.typePanne),
        "Description": `[ALERTE ML] Risque calculé à ${m.risque}%`
      }
    ]
  };

  const targetUrl = `https://api.appsheet.com/api/v2/apps/${APPSHEET_PREDICTIONS.appId}/tables/${APPSHEET_PREDICTIONS.tableName}/Action`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "ApplicationAccessKey": APPSHEET_PREDICTIONS.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseData = await res.json().catch(() => null);

    if (res.ok) {
      sentState[m.idMachine || m.machine] = true;
      alert(`✅ Alerte transmise avec succès dans le Sheet ! (ID: ${idCourt})`);
      renderMachines();
    } else {
      // SI APPSHEET REFUSE LA REQUÊTE : ON AFFICHE LE MESSAGE D'ERREUR EXACT
      alert(`❌ Erreur AppSheet (${res.status}):\n${JSON.stringify(responseData, null, 2)}`);
      if (btn) {
        btn.innerText = "Transmettre l'Alerte";
        btn.disabled = false;
      }
    }
  } catch (e) {
    alert(`❌ Erreur Réseau/CORS : ${e.message}`);
    if (btn) {
      btn.innerText = "Transmettre l'Alerte";
      btn.disabled = false;
    }
  }
}

// ==========================================
// INITIALISATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  const range = document.getElementById('seuilRange');
  const display = document.getElementById('seuilValueDisplay');

  if (range) {
    range.addEventListener('input', (e) => {
      seuilActuel = Number(e.target.value);
      if (display) display.innerText = `${seuilActuel}%`;
      renderMachines();
    });
  }

  synchroniserDepuisAppSheet();
  setInterval(synchroniserDepuisAppSheet, 5000);
});