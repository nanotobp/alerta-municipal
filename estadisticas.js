document.addEventListener("DOMContentLoaded", async () => {

  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";
  const SUPABASE_URL = "https://wreqfthiuqwzusthjcjv.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

  let diasFiltro = 30;
  let mapa = null;
  let heatLayer = null;

  let reportes = [];
  let acciones = [];
  let combinados = [];

  // ======================================================
  // FINAL: usamos los KPI reales del worker
  // ======================================================
  async function cargarKPI() {
    try {
      const res = await fetch(WORKER_URL + "/estadisticas");
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("Error KPI:", e);
      return {};
    }
  }

  // ======================================================
  // CARGA DE REPORTES CIUDADANOS
  // ======================================================
  async function cargarReportes() {
    try {
      const res = await fetch(WORKER_URL + "/listarReportes", {
        headers: {
          Authorization: "Bearer " + (localStorage.getItem("asu_jwt") || "")
        }
      });

      const j = await res.json();

      if (Array.isArray(j.data)) return j.data;
      if (Array.isArray(j.reportes)) return j.reportes;

      return [];

    } catch (e) {
      console.error("Error reportes:", e);
      return [];
    }
  }

  // ======================================================
  // CARGA DE ACCIONES MUNICIPALES (Supabase)
  // ======================================================
  async function cargarAcciones() {
    try {
      const fechaMin = new Date(Date.now() - 90 * 86400000).toISOString();

      const url =
        `${SUPABASE_URL}/rest/v1/acciones_municipales?select=*&created_at=gte.${fechaMin}`;

      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON
        }
      });

      const data = await res.json();

      return Array.isArray(data) ? data : [];

    } catch (e) {
      console.error("Error acciones:", e);
      return [];
    }
  }

  // ======================================================
  // MERGE PARA HEATMAP
  // ======================================================
  function generarCombinados() {
    combinados = [
      ...reportes.map(r => ({
        tipo: "reporte",
        lat: r.lat,
        lng: r.lng,
        created_at: r.created_at
      })),
      ...acciones.map(a => ({
        tipo: "accion",
        lat: a.lat,
        lng: a.lng,
        created_at: a.created_at
      }))
    ];
  }

  // ======================================================
  // MAPA
  // ======================================================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(mapa);

    setTimeout(() => mapa.invalidateSize(), 400);
  }

  function limpiarHeat() {
    if (heatLayer) {
      mapa.removeLayer(heatLayer);
      heatLayer = null;
    }
  }

  // ======================================================
  // HEATMAP PRO REAL
  // ======================================================
  function renderHeat() {

    limpiarHeat();

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const puntos = combinados
      .filter(p => p.lat && p.lng)
      .filter(p => !minDate || new Date(p.created_at) >= minDate)
      .map(p => [
        p.lat,
        p.lng,
        p.tipo === "accion" ? 0.75 : 0.55
      ]);

    if (!puntos.length) return;

    heatLayer = L.heatLayer(puntos, {
      radius: 32,
      blur: 18,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: {
        0.2: "#ffdede",
        0.4: "#ff7b7b",
        0.7: "#d32f2f",
        1.0: "#7f0000"
      }
    });

    heatLayer.addTo(mapa);
  }

  // ======================================================
  // TABLA (SOLO REPORTES)
  // ======================================================
  function renderTabla() {

    const tbody = document.getElementById("tablaStats");

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const filtrados = reportes.filter(r =>
      !minDate || new Date(r.created_at) >= minDate
    );

    tbody.innerHTML = filtrados.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.categoria || "-"}</td>
        <td>${r.barrio || "-"}</td>
        <td>${r.estado || "-"}</td>
        <td>${new Date(r.created_at).toLocaleString("es-PY")}</td>
      </tr>
    `).join("");
  }

  // ======================================================
  // TABS DE FILTRO
  // ======================================================
  function activar(btn) {
    document.querySelectorAll(".filtro-tiempo")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  document.querySelectorAll(".filtro-tiempo").forEach(btn => {
    btn.addEventListener("click", () => {
      diasFiltro = btn.dataset.dias === "global"
        ? "global"
        : Number(btn.dataset.dias);

      activar(btn);

      renderTabla();
      renderHeat();
    });
  });

  // ======================================================
  // BOOTSTRAP
  // ======================================================
  const kpi = await cargarKPI(); // ahora sí lo usamos
  reportes = await cargarReportes();
  acciones = await cargarAcciones();
  generarCombinados();

  initMapa();
  renderTabla();
  renderHeat();

});
