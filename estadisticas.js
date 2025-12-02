document.addEventListener("DOMContentLoaded", async () => {

  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";
  const SUPABASE_URL = "https://wreqfthiuqwzusthjcjv.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

  let diasFiltro = 30;
  let mapa = null;
  let heatLayer = null;

  let reportes = [];     // SOLO reportes ciudadanos
  let acciones = [];     // SOLO acciones municipales
  let combinados = [];   // Para el HEATMAP

  // ================================================
  //  CARGA REPORTES (solo ciudadanos)
  // ================================================
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

  // ================================================
  //  CARGA ACCIONES MUNICIPALES
  // ================================================
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

  // ================================================
  // MERGE PARA EL HEATMAP
  // ================================================
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

  // ================================================
  // MAPA
  // ================================================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(mapa);

    // FIX visual
    setTimeout(() => {
      mapa.invalidateSize();
    }, 500);
  }

  function limpiarHeat() {
    if (heatLayer) {
      mapa.removeLayer(heatLayer);
      heatLayer = null;
    }
  }

  // ================================================
  // HEATMAP PRO
  // ================================================
  function renderHeat() {
    limpiarHeat();

    const puntos = combinados.filter(p => {
      if (!p.lat || !p.lng) return false;

      if (diasFiltro === "global") return true;

      const f = new Date(p.created_at);
      const min = new Date(Date.now() - diasFiltro * 86400000);

      return f >= min;
    })
    .map(p => [p.lat, p.lng, p.tipo === "accion" ? 0.75 : 0.55]);

    if (!puntos.length) return;

    heatLayer = L.heatLayer(puntos, {
      radius: 28,
      blur: 18,
      maxZoom: 17,
      minOpacity: 0.35,
      max: 1.0,
      gradient: {
        0.1: "#ffd1d1",
        0.3: "#ff6b6b",
        0.6: "#d32f2f",
        1.0: "#7f0000"
      }
    });

    heatLayer.addTo(mapa);
  }

  // ================================================
  // TABLA (solo muestra reportes ciudadanos, no acciones)
  // ================================================
  function renderTabla(filtrados) {
    const tbody = document.getElementById("tablaStats");

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

  // ================================================
  // FILTROS
  // ================================================
  function filtrar() {
    let filtrados = [];

    if (diasFiltro === "global") {
      filtrados = reportes;
    } else {
      const min = new Date(Date.now() - diasFiltro * 86400000);

      filtrados = reportes.filter(r => {
        if (!r.created_at) return false;
        return new Date(r.created_at) >= min;
      });
    }

    renderTabla(filtrados);
    renderHeat();  // usa combinados
  }

  document.querySelectorAll(".filtro-tiempo").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.dias;
      diasFiltro = d === "global" ? "global" : Number(d);
      filtrar();
    });
  });

  // ================================================
  // BOOTSTRAP
  // ================================================
  reportes = await cargarReportes();   // ciudadanos
  acciones = await cargarAcciones();   // municipales
  generarCombinados();                 // merge PRO

  initMapa();
  filtrar();

});
