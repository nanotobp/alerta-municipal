document.addEventListener("DOMContentLoaded", async () => {

  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";
  const SUPABASE_URL = "https://wreqfthiuqwzusthjcjv.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

  let diasFiltro = 30;
  let mapa, heatLayer;

  let reportes = [];
  let acciones = [];

  // ======================================================
  // CARGA DE REPORTES
  // ======================================================
  async function cargarReportes() {
    try {
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

  // ======================================================
  // CARGA DE ACCIONES MUNICIPALES
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
      console.error("Error cargando acciones:", e);
      return [];
    }
  }

  // ======================================================
  // MAPA
  // ======================================================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(mapa);

    setTimeout(() => mapa.invalidateSize(), 500);
  }

  function limpiarHeat() {
    if (heatLayer) {
      mapa.removeLayer(heatLayer);
      heatLayer = null;
    }
  }

  // ======================================================
  // HEATMAP PRO — REPORTES + ACCIONES
  // ======================================================
  function renderHeat() {
    limpiarHeat();

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const puntosReportes = reportes
      .filter(r => r.lat && r.lng)
      .filter(r => !minDate || new Date(r.created_at) >= minDate)
      .map(r => [r.lat, r.lng, 0.55]);

    const puntosAcciones = acciones
      .filter(a => a.lat && a.lng)
      .filter(a => !minDate || new Date(a.created_at) >= minDate)
      .map(a => [a.lat, a.lng, 0.75]);

    const todos = [...puntosReportes, ...puntosAcciones];

    if (!todos.length) return;

    heatLayer = L.heatLayer(todos, {
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
  // TABLA (solo reportes)
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
  // FILTROS (TABS)
  // ======================================================
  function activarBoton(boton) {
    document.querySelectorAll(".filtro-tiempo").forEach(b => b.classList.remove("active"));
    boton.classList.add("active");
  }

  document.querySelectorAll(".filtro-tiempo").forEach(btn => {
    btn.addEventListener("click", () => {
      diasFiltro = btn.dataset.dias === "global"
        ? "global"
        : Number(btn.dataset.dias);

      activarBoton(btn);
      renderTabla();
      renderHeat();
    });
  });

  // ======================================================
  // BOOTSTRAP
  // ======================================================
  reportes = await cargarReportes();
  acciones = await cargarAcciones();

  initMapa();
  renderTabla();
  renderHeat();

});
