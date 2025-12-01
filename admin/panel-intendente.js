// =============================================================
//  PANEL INTENDENTE – AsuAlerta
//  Solo lectura – KPIs, mapas, acciones, reportes y gráficos
//  Compatibilidad total con Worker y BD actuales
// =============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// -------------------------------------------------------------
//  CONFIG SUPABASE (ANON – lectura pública)
// -------------------------------------------------------------
const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// =============================================================
//  ESTADO GLOBAL DEL PANEL
// =============================================================
let reportes = [];
let acciones = [];
let categorias = [];

let rangoDias = 7;

// Leaflet
let mapInt;
let layerInt;

// Gráficos
let chartRepCat, chartAccCat, chartLinea, chartPendSol, chartOperadores, chartTopCats;

// -------------------------------------------------------------
//  HELPERS FECHA / RANGO
// -------------------------------------------------------------
function dentroRango(fechaStr) {
  if (rangoDias === 0) return true; // histórico completo
  const f = new Date(fechaStr);
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - (rangoDias - 1));
  desde.setHours(0, 0, 0, 0);
  return f >= desde && f <= hoy;
}

// -------------------------------------------------------------
//  FILTROS PARA TABLAS (top 15)
// -------------------------------------------------------------
function top15(arr) {
  return arr.slice(0, 15);
}

// -------------------------------------------------------------
//  KPIs
// -------------------------------------------------------------
function calcularPorcentajeSolucionados(repFil) {
  const total = repFil.length;
  if (!total) return "--";
  const sol = repFil.filter(r => r.estado === "solucionado").length;
  return ((sol / total) * 100).toFixed(1) + "%";
}

function calcularTiempoPromedioSolucion(repFil, accFil) {
  const diffs = [];

  repFil.forEach(r => {
    if (r.estado !== "solucionado") return;
    const ac = accFil.find(a => a.reporte_id === r.id);
    if (!ac) return;

    const hr = new Date(r.created_at);
    const ha = new Date(ac.created_at);

    const horas = (ha - hr) / 3600000;
    diffs.push(horas);
  });

  if (!diffs.length) return "--";
  const prom = diffs.reduce((s, n) => s + n) / diffs.length;

  if (prom < 48) return prom.toFixed(1) + " h";
  return (prom / 24).toFixed(1) + " d";
}

// Nuevo KPI – Operador más eficiente
function calcularOperadorMasEficiente(accFil) {
  const map = {};

  accFil.forEach(a => {
    const email = a.creado_por_email;
    if (!email) return;

    if (!map[email]) map[email] = { tot: 0, sol: 0 };
    map[email].tot++;

    if (
      a.observacion?.toLowerCase().includes("solucionado") ||
      a.estado === "solucionado"
    ) {
      map[email].sol++;
    }
  });

  let mejor = null;
  let mejorEf = 0;

  Object.keys(map).forEach(email => {
    const ef = map[email].sol / map[email].tot;
    if (ef > mejorEf) {
      mejorEf = ef;
      mejor = email;
    }
  });

  if (!mejor) return "--";
  return `${mejor} (${(mejorEf * 100).toFixed(1)}%)`;
}

// Nuevo KPI – Operador móvil destacado
function calcularOperadorMovilTop(accFil) {
  const map = {};

  accFil.forEach(a => {
    const email = a.creado_por_email;
    if (!email) return;
    map[email] = (map[email] || 0) + 1;
  });

  let top = null;
  let max = 0;

  Object.keys(map).forEach(email => {
    if (map[email] > max) {
      top = email;
      max = map[email];
    }
  });

  if (!top) return "--";
  return `${top} (${max})`;
}

// =============================================================
//  CHARTS
// =============================================================
function destruir(ref) {
  if (ref) ref.destroy();
}

function chartBarras(ctx, labels, data, colors) {
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true
    }
  });
}

function chartLineaDia(ctx, repFil, accFil) {
  const out = {};

  repFil.forEach(r => {
    const d = r.created_at.slice(0, 10);
    if (!out[d]) out[d] = { r: 0, a: 0 };
    out[d].r++;
  });

  accFil.forEach(a => {
    const d = a.created_at.slice(0, 10);
    if (!out[d]) out[d] = { r: 0, a: 0 };
    out[d].a++;
  });

  const fechas = Object.keys(out).sort();
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: fechas,
      datasets: [
        {
          label: "Reportes",
          data: fechas.map(f => out[f].r),
          borderColor: "#d32f2f",
          tension: 0.3
        },
        {
          label: "Acciones",
          data: fechas.map(f => out[f].a),
          borderColor: "#1976d2",
          tension: 0.3
        }
      ]
    },
    options: {
      plugins: { legend: { position: "bottom" } },
      responsive: true
    }
  });
}

function chartPastelPendSol(ctx, repFil) {
  const pend = repFil.filter(r => r.estado === "pendiente").length;
  const sol  = repFil.filter(r => r.estado === "solucionado").length;

  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pendientes", "Solucionados"],
      datasets: [
        {
          data: [pend, sol],
          backgroundColor: ["#ff9800", "#4caf50"]
        }
      ]
    },
    options: { plugins: { legend: { position: "bottom" } } }
  });
}

function chartAccionesPorOperador(ctx, accFil) {
  const map = {};
  accFil.forEach(a => {
    const email = a.creado_por_email;
    if (!email) return;
    map[email] = (map[email] || 0) + 1;
  });

  const labels = Object.keys(map);
  const valores = Object.values(map);
  const colors = labels.map(() => "#1e88e5");

  return chartBarras(ctx, labels, valores, colors);
}

function chartTopCategoriasAccion(ctx, accFil) {
  const map = {};

  accFil.forEach(a => {
    map[a.categoria] = (map[a.categoria] || 0) + 1;
  });

  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return chartBarras(
    ctx,
    entries.map(e => e[0]),
    entries.map(e => e[1]),
    entries.map(() => "#6a1b9a")
  );
}

// =============================================================
//  MAPA LEAFLET
// =============================================================
function initMapa() {
  if (mapInt) return;

  mapInt = L.map("mapIntendente").setView([-25.282, -57.63], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(mapInt);

  layerInt = L.layerGroup().addTo(mapInt);
}

function renderMapa(repFil, accFil) {
  layerInt.clearLayers();

  repFil.forEach(r => {
    const icon = L.divIcon({
      className: "emoji-marker",
      html: `<span style="font-size:22px">🔴</span>`
    });

    const fotos = Array.isArray(r.fotos_url) ? r.fotos_url : [];

    const popup = `
      <b>Reporte ciudadano</b><br>
      ${r.barrio || ""}<br>
      ${r.detalle || ""}
      ${
        fotos.length
          ? `<br><button class="popup-fotos-btn">Ver fotos (${fotos.length})</button>`
          : ""
      }
    `;

    const marker = L.marker([r.lat, r.lng], { icon }).addTo(layerInt).bindPopup(popup);

    if (fotos.length) {
      marker.on("popupopen", e => {
        const el = e.popup.getElement();
        const btn = el.querySelector(".popup-fotos-btn");
        if (!btn) return;
        btn.addEventListener("click", () => {
          openFotoViewer(fotos, 0);
        });
      });
    }
  });

  accFil.forEach(a => {
    const icon = L.divIcon({
      className: "emoji-marker",
      html: `<span style="font-size:22px">🔵</span>`
    });

    const fotos = Array.isArray(a.fotos_url) ? a.fotos_url : [];

    const popup = `
      <b>Acción municipal</b><br>
      ${a.titulo || ""}<br>
      ${a.detalle || ""}
      ${
        fotos.length
          ? `<br><button class="popup-fotos-btn">Ver fotos (${fotos.length})</button>`
          : ""
      }
    `;

    const marker = L.marker([a.lat, a.lng], { icon }).addTo(layerInt).bindPopup(popup);

    if (fotos.length) {
      marker.on("popupopen", e => {
        const el = e.popup.getElement();
        const btn = el.querySelector(".popup-fotos-btn");
        if (!btn) return;
        btn.addEventListener("click", () => {
          openFotoViewer(fotos, 0);
        });
      });
    }
  });
}

// =============================================================
//  TABLAS – Render TOP 15
// =============================================================
function renderTablaReportes(repFil) {
  const tbody = document.querySelector("#tablaReportes tbody");
  tbody.innerHTML = "";

  top15(repFil).forEach(r => {
    const tr = document.createElement("tr");

    const fotos = Array.isArray(r.fotos_url) ? r.fotos_url : [];

    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${new Date(r.created_at).toLocaleString("es-PY")}</td>
      <td>${r.barrio || ""}</td>
      <td>${r.categoria || ""}</td>
      <td>
        <span class="badge ${
          r.estado === "solucionado" ? "badge-estado-sol" : "badge-estado-pend"
        }">${r.estado}</span>
      </td>
      <td>
        ${
          fotos.length
            ? `<button class="btn btn-sm btn-primary btn-ver" data-type="rep" data-id="${r.id}">Ver</button>`
            : ""
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTablaAcciones(accFil) {
  const tbody = document.querySelector("#tablaAcciones tbody");
  tbody.innerHTML = "";

  top15(accFil).forEach(a => {
    const fotos = Array.isArray(a.fotos_url) ? a.fotos_url : [];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.id}</td>
      <td>${new Date(a.created_at).toLocaleString("es-PY")}</td>
      <td>${a.titulo || ""}</td>
      <td>${a.categoria || ""}</td>
      <td>${a.creado_por_email || ""}</td>
      <td>
        ${
          fotos.length
            ? `<button class="btn btn-sm btn-primary btn-ver" data-type="acc" data-id="${a.id}">Ver</button>`
            : ""
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================
//  MODAL DETALLE
// =============================================================
function abrirModalDetalle(obj) {
  const body = document.getElementById("modalDetalleBody");

  let fotos = Array.isArray(obj.fotos_url) ? obj.fotos_url : [];

  body.innerHTML = `
    <div class="modal-detalle-label">ID</div>
    <div class="modal-detalle-valor">${obj.id}</div>

    <div class="modal-detalle-label">Fecha</div>
    <div class="modal-detalle-valor">${new Date(obj.created_at).toLocaleString("es-PY")}</div>

    ${
      obj.barrio
        ? `<div class="modal-detalle-label">Barrio</div>
           <div class="modal-detalle-valor">${obj.barrio}</div>`
        : ""
    }

    ${
      obj.titulo
        ? `<div class="modal-detalle-label">Título</div>
           <div class="modal-detalle-valor">${obj.titulo}</div>`
        : ""
    }

    <div class="modal-detalle-label">Detalle</div>
    <div class="modal-detalle-valor">${obj.detalle || "Sin descripción"}</div>

    ${
      obj.observacion
        ? `<div class="modal-detalle-label">Observación</div>
           <div class="modal-detalle-valor">${obj.observacion}</div>`
        : ""
    }

    ${
      fotos.length
        ? `<div class="modal-detalle-label">Fotos</div>
           <div class="fotos-grid-modal">
             ${fotos.map(u => `<img src="${u}">`).join("")}
           </div>`
        : ""
    }
  `;

  new bootstrap.Modal(document.getElementById("modalDetalle")).show();
}

// FIX: botón VER que antes solo funcionaba una vez
function bindBotonesVer(repFil, accFil) {
  document.querySelectorAll(".btn-ver").forEach(btn => {
    btn.addEventListener("click", () => {
      const tipo = btn.dataset.type;
      const id = parseInt(btn.dataset.id);

      let obj = null;
      if (tipo === "rep") obj = repFil.find(r => r.id === id);
      if (tipo === "acc") obj = accFil.find(a => a.id === id);

      if (obj) abrirModalDetalle(obj);
    });
  });
}

// =============================================================
//  RENDER GLOBAL
// =============================================================
function renderTodo() {
  const repFil = reportes.filter(r => dentroRango(r.created_at));
  const accFil = acciones.filter(a => dentroRango(a.created_at));

  // KPIs
  document.getElementById("kpiReportes").textContent = repFil.length;
  document.getElementById("kpiAcciones").textContent = accFil.length;
  document.getElementById("kpiSolucion").textContent = calcularPorcentajeSolucionados(repFil);
  document.getElementById("kpiTiempo").textContent = calcularTiempoPromedioSolucion(repFil, accFil);
  document.getElementById("kpiOperadorEficiente").textContent = calcularOperadorMasEficiente(accFil);
  document.getElementById("kpiOperadorMovil").textContent = calcularOperadorMovilTop(accFil);

  // MAPA
  initMapa();
  renderMapa(repFil, accFil);

  // TABLAS
  renderTablaReportes(repFil);
  renderTablaAcciones(accFil);
  bindBotonesVer(repFil, accFil);

  // GRÁFICOS
  const repCat = {};
  repFil.forEach(r => { repCat[r.categoria] = (repCat[r.categoria] || 0) + 1; });

  const accCat = {};
  accFil.forEach(a => { accCat[a.categoria] = (accCat[a.categoria] || 0) + 1; });

  const repLabels = Object.keys(repCat);
  const repVals   = Object.values(repCat);
  const repCols   = repLabels.map(() => "#d32f2f");

  const accLabels = Object.keys(accCat);
  const accVals   = Object.values(accCat);
  const accCols   = accLabels.map(() => "#1976d2");

  destruir(chartRepCat);
  destruir(chartAccCat);
  destruir(chartLinea);
  destruir(chartPendSol);
  destruir(chartOperadores);
  destruir(chartTopCats);

  chartRepCat = chartBarras(document.getElementById("chartReportesCat"), repLabels, repVals, repCols);
  chartAccCat = chartBarras(document.getElementById("chartAccionesCat"), accLabels, accVals, accCols);

  chartLinea = chartLineaDia(document.getElementById("chartLineaDia"), repFil, accFil);
  chartPendSol = chartPastelPendSol(document.getElementById("chartPendSol"), repFil);

  chartOperadores = chartAccionesPorOperador(document.getElementById("chartOperadores"), accFil);
  chartTopCats = chartTopCategoriasAccion(document.getElementById("chartTopCats"), accFil);
}

// =============================================================
//  CARGA INICIAL
// =============================================================
async function cargarDatos() {
  const [rep, acc, cat] = await Promise.all([
    supabase.from("reportes").select("*").order("created_at", { ascending: false }),
    supabase.from("acciones_municipales").select("*").order("created_at", { ascending: false }),
    supabase.from("categorias_municipales").select("*").order("id")
  ]);

  reportes = rep.data || [];
  acciones = acc.data || [];
  categorias = cat.data || [];

  renderTodo();
}

// =============================================================
//  EVENTOS UI
// =============================================================
document.getElementById("selectRangoDias").addEventListener("change", e => {
  rangoDias = parseInt(e.target.value);
  renderTodo();
});

// =============================================================
//  START
// =============================================================
cargarDatos();
