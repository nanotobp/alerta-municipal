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

  // =========================
  //  CARGA BASE DE DATOS
  // =========================
  async function cargarReportes() {
    try {
      const res = await fetch(WORKER_URL + "/estadisticas");
      const json = await res.json();

      const r2 = await fetch(WORKER_URL + "/listarReportes", {
        headers: { Authorization: "Bearer " + (localStorage.getItem("asu_jwt") || "") }
      });

      const j2 = await r2.json();
      if (Array.isArray(j2.data)) return j2.data;
      if (Array.isArray(j2.reportes)) return j2.reportes;

      return [];
    } catch (e) {
      console.error("Error cargando reportes:", e);
      return [];
    }
  }

  async function cargarAcciones() {
    try {
      const fechaMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

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
      console.error("Error cargando acciones:", e);
      return [];
    }
  }

  reportes = await cargarReportes();
  acciones = await cargarAcciones();

  // =========================
  //  MAPA
  // =========================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(mapa);
  }

  function limpiarHeat() {
    if (heatLayer) {
      mapa.removeLayer(heatLayer);
      heatLayer = null;
    }
  }

  // =========================
  //  HEATMAP (PRO)
  // =========================
  function renderHeat(filtradosReportes) {

    limpiarHeat();

    const puntosReportes = filtradosReportes
      .filter(r => r.lat && r.lng)
      .map(r => [r.lat, r.lng, 0.55]);

    const puntosAcciones = acciones
      .filter(a => a.lat && a.lng)
      .filter(a => {
        if (diasFiltro === "global") return true;
        const fecha = new Date(a.created_at);
        return fecha >= new Date(Date.now() - diasFiltro * 86400000);
      })
      .map(a => [a.lat, a.lng, 0.75]);

    const todos = [...puntosReportes, ...puntosAcciones];

    if (!todos.length) return;

    heatLayer = L.heatLayer(todos, {
      radius: 28,
      blur: 18,
      maxZoom: 17,
      minOpacity: 0.35,
      max: 1.0
    });

    heatLayer.addTo(mapa);
  }

  // =========================
  //  TABLA
  // =========================
  function renderTabla(rows) {
    const tbody = document.getElementById("tablaStats");
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.categoria || "-"}</td>
        <td>${r.barrio || "-"}</td>
        <td>${r.estado || "-"}</td>
        <td>${new Date(r.created_at).toLocaleString("es-PY")}</td>
      </tr>
    `).join("");
  }

  // =========================
  //  FILTROS
  // =========================
  function filtrar() {
    let filtrados;

    if (diasFiltro === "global") {
      filtrados = reportes;
    } else {
      const minDate = new Date(Date.now() - diasFiltro * 86400000);
      filtrados = reportes.filter(r => {
        if (!r.created_at) return false;
        return new Date(r.created_at) >= minDate;
      });
    }

    renderTabla(filtrados);
    renderHeat(filtrados);
  }

  document.querySelectorAll(".filtro-tiempo").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.dias;
      diasFiltro = d === "global" ? "global" : Number(d);
      filtrar();
    });
  });

  // =========================
  // INICIALIZACIÓN
  // =========================
  initMapa();
  filtrar();

});
