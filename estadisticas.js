// =========================================================
// ESTADÍSTICAS v3 PRO – con mapa de densidad Leaflet
// =========================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
const SUPABASE_ANON = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// =======================================
// ESTADO
// =======================================
let dataReportes = [];
let dataAcciones = [];
let categorias   = [];
let departamentos= [];

let rangoDias   = 7;
let deptoFiltro = "todos";

let chartReportes, chartAcciones, chartLinea, chartDeptos;

// heatmap
let mapHeat;
let heatLayer;

// =======================================
// MAPEOS CATEGORÍAS (conceptual)
// =======================================
//
// Reportes ciudadanos → Acciones municipales relacionadas
//
const MAPEO = {
  baches: "bacheo",
  basural: "limpieza",
  arbol_caido: "arboles",
  cano_roto: "agua"
};

// =======================================
// HELPERS
// =======================================
function dentroRango(fechaStr) {
  const fecha = new Date(fechaStr);
  const hoy   = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - (rangoDias - 1));
  desde.setHours(0,0,0,0);
  return fecha >= desde && fecha <= hoy;
}

function filtrarDepto(arr) {
  if (deptoFiltro === "todos") return arr;
  return arr.filter(x => x.departamento_id == deptoFiltro);
}

function groupBy(arr, key) {
  const res = {};
  arr.forEach(a => {
    const k = a[key];
    if (!res[k]) res[k] = 0;
    res[k]++;
  });
  return res;
}

// para línea
function groupByDia(arr) {
  const out = {};
  arr.forEach(a => {
    const d = new Date(a.created_at).toISOString().slice(0,10);
    if (!out[d]) out[d] = { r:0, a:0 };
    if (a.__tipo === "reporte") out[d].r++;
    if (a.__tipo === "accion")  out[d].a++;
  });
  return out;
}

// =======================================
// KPI: tiempo promedio de resolución
// =======================================
function calcularTiempoPromedio(dataRep, dataAcc) {
  const tiempos = [];

  dataRep.forEach(rep => {
    if (rep.estado !== "solucionado") return;
    if (!rep.id) return;
    const acc = dataAcc.find(a => a.reporte_id === rep.id);
    if (!acc) return;

    const fr = new Date(rep.created_at);
    const fa = new Date(acc.created_at);
    const diff = (fa - fr) / 3600000; // horas
    tiempos.push(diff);
  });

  if (!tiempos.length) return "--";

  const promedio = tiempos.reduce((a,b)=>a+b,0) / tiempos.length;

  if (promedio < 48) return `${promedio.toFixed(1)} h`;
  return `${(promedio/24).toFixed(1)} d`;
}

// =======================================
// KPI Solucionados
// =======================================
function calcularSolucionados(arr) {
  const tot = arr.length;
  if (!tot) return "--";
  const sol = arr.filter(r => r.estado === "solucionado").length;
  return ((sol/tot)*100).toFixed(1) + "%";
}

// =======================================
// CHART FACTORY
// =======================================
function destruirPrevio(ref){
  if (ref) ref.destroy();
}

function crearBarChart(ctx, labels, values, colors){
  return new Chart(ctx, {
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Cantidad",
        data:values,
        backgroundColor:colors
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{display:false} }
    }
  });
}

function crearLineaChart(ctx, dataObj){
  const fechas = Object.keys(dataObj).sort();
  const rep = fechas.map(f => dataObj[f].r);
  const acc = fechas.map(f => dataObj[f].a);

  return new Chart(ctx, {
    type:"line",
    data:{
      labels:fechas,
      datasets:[
        {
          label:"Reportes",
          data:rep,
          borderColor:"#d32f2f",
          tension:.3
        },
        {
          label:"Acciones",
          data:acc,
          borderColor:"#1e88e5",
          tension:.3
        }
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{position:"bottom"}}
    }
  });
}

function crearDeptosChart(ctx, labels, values){
  return new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Total",
        data:values,
        backgroundColor:"#6366f1"
      }]
    },
    options:{
      indexAxis:"y",
      responsive:true,
      plugins:{legend:{display:false}}
    }
  });
}

// =======================================
// HEATMAP (densidad con círculos Leaflet)
// =======================================
function initHeatmap() {
  if (mapHeat) return;

  mapHeat = L.map("mapHeat", {
    center: [-25.282, -57.63],
    zoom: 12,
    zoomControl: false
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(mapHeat);

  heatLayer = L.layerGroup().addTo(mapHeat);

  // fix de tamaño al entrar a la vista
  setTimeout(() => {
    mapHeat.invalidateSize();
  }, 300);
}

function renderHeatmap(repFil, accFil) {
  if (!window.L) return;
  initHeatmap();

  heatLayer.clearLayers();

  const hoy = new Date();

  // función para calcular peso por antigüedad (más nuevo = más peso)
  function pesoPorFecha(fechaStr){
    if (!fechaStr) return 0.4;
    const f  = new Date(fechaStr);
    const ms = hoy - f;
    const dias = ms / 86400000;
    const factor = 1 - (dias / rangoDias);
    return Math.max(0.2, Math.min(1, factor));
  }

  // reportes = rojo
  repFil.forEach(r=>{
    if (!r.lat || !r.lng) return;
    const w = pesoPorFecha(r.created_at);
    L.circle([r.lat, r.lng], {
      radius: 40,
      color: "transparent",
      fillColor: "#ef4444",
      fillOpacity: 0.08 + (0.25 * w)
    }).addTo(heatLayer);
  });

  // acciones = azul
  accFil.forEach(a=>{
    if (!a.lat || !a.lng) return;
    const w = pesoPorFecha(a.created_at);
    L.circle([a.lat, a.lng], {
      radius: 40,
      color: "transparent",
      fillColor: "#1d4ed8",
      fillOpacity: 0.08 + (0.25 * w)
    }).addTo(heatLayer);
  });
}

// =======================================
// RENDER PRINCIPAL
// =======================================
function renderTodo(){
  const repFil = filtrarDepto(dataReportes.filter(r=>dentroRango(r.created_at)));
  const accFil = filtrarDepto(dataAcciones.filter(r=>dentroRango(r.created_at)));

  // KPIs
  document.getElementById("kpiReportes").textContent = repFil.length;
  document.getElementById("kpiAcciones").textContent = accFil.length;
  document.getElementById("kpiSolucion").textContent = calcularSolucionados(repFil);
  document.getElementById("kpiTiempo").textContent  = calcularTiempoPromedio(repFil, accFil);

  // Agrupación por categoría
  const repGroup = groupBy(repFil, "categoria");
  const accGroup = groupBy(accFil, "categoria");

  const repLabels = [], repValues = [], repColors=[];
  const accLabels = [], accValues = [], accColors=[];

  categorias.forEach(cat=>{
    repLabels.push(cat.nombre);
    repValues.push(repGroup[cat.slug] || 0);
    repColors.push(cat.color || "#d32f2f");

    accLabels.push(cat.nombre);
    accValues.push(accGroup[cat.slug] || 0);
    accColors.push(cat.color || "#1e88e5");
  });

  // Línea
  repFil.forEach(r=> { r.__tipo="reporte"; });
  accFil.forEach(a=> { a.__tipo="accion";  });

  const timelineData = groupByDia([...repFil, ...accFil]);

  // Deptos
  const depGroup = {};
  repFil.forEach(r=>{
    if(!depGroup[r.departamento_id]) depGroup[r.departamento_id]=0;
    depGroup[r.departamento_id]++;
  });
  accFil.forEach(a=>{
    if(!depGroup[a.departamento_id]) depGroup[a.departamento_id]=0;
    depGroup[a.departamento_id]++;
  });

  const depLabels=[], depValues=[];
  departamentos.forEach(d=>{
    depLabels.push(d.nombre);
    depValues.push(depGroup[d.id] || 0);
  });

  // CHARTS
  destruirPrevio(chartReportes);
  destruirPrevio(chartAcciones);
  destruirPrevio(chartLinea);
  destruirPrevio(chartDeptos);

  chartReportes = crearBarChart(
    document.getElementById("chartReportes"),
    repLabels, repValues, repColors
  );
  chartAcciones = crearBarChart(
    document.getElementById("chartAcciones"),
    accLabels, accValues, accColors
  );
  chartLinea = crearLineaChart(
    document.getElementById("chartLinea"),
    timelineData
  );
  chartDeptos = crearDeptosChart(
    document.getElementById("chartDeptos"),
    depLabels, depValues
  );

  // HEATMAP
  renderHeatmap(repFil, accFil);
}

// =======================================
// INIT DATOS
// =======================================
async function cargarDatos(){
  const [rep, acc, cat, dep] = await Promise.all([
    supabase.from("reportes").select("*"),
    supabase.from("acciones_municipales").select("*"),
    supabase.from("categorias_municipales").select("*").order("id"),
    supabase.from("departamentos").select("*").order("id")
  ]);

  dataReportes   = rep.data   || [];
  dataAcciones   = acc.data   || [];
  categorias     = cat.data   || [];
  departamentos  = dep.data   || [];

  // llenar select depto
  const sel = document.getElementById("selectDepto");
  departamentos.forEach(d=>{
    const op = document.createElement("option");
    op.value = d.id;
    op.textContent = d.nombre;
    sel.appendChild(op);
  });

  renderTodo();
}

// =======================================
// EVENTOS UI
// =======================================
function bindUI(){
  document.querySelectorAll(".filtro-tiempo").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".filtro-tiempo")
              .forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      rangoDias = parseInt(btn.dataset.dias);
      renderTodo();
    });
  });

  document.getElementById("selectDepto").addEventListener("change", e=>{
    deptoFiltro = e.target.value;
    renderTodo();
  });
}

// =======================================
// START
// =======================================
(async () => {
  await cargarDatos();
  bindUI();
})();
