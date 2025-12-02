document.addEventListener("DOMContentLoaded", async () => {

  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";

  let diasFiltro = 30;
  let mapa = null;
  let heatLayer = null;

  let dataset = [];         // reportes + acciones
  let datasetReportes = []; // tabla

  // ===========================
  // CARGA ÚNICA (endpoint correcto)
  // ===========================
  async function cargarDatos() {
    try {
      const res = await fetch(WORKER_URL + "/estadisticas");
      const json = await res.json();

      datasetReportes = json.ultimos_reportes || [];
      dataset = [
        ...json.ultimos_reportes.map(r => ({
          tipo: "reporte",
          lat: r.lat,
          lng: r.lng,
          created_at: r.created_at
        })),
        ...json.ultimas_acciones.map(a => ({
          tipo: "accion",
          lat: a.lat,
          lng: a.lng,
          created_at: a.created_at
        }))
      ];

    } catch (e) {
      console.error("Error:", e);
      dataset = [];
    }
  }

  // ===========================
  // MAPA
  // ===========================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(mapa);

    setTimeout(() => mapa.invalidateSize(), 400);
  }

  function limpiarHeat() {
    if (heatLayer) mapa.removeLayer(heatLayer);
    heatLayer = null;
  }

  function renderHeat() {
    limpiarHeat();

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const puntos = dataset
      .filter(p => p.lat && p.lng)
      .filter(p => !minDate || new Date(p.created_at) >= minDate)
      .map(p => [p.lat, p.lng, p.tipo === "accion" ? 0.75 : 0.55]);

    if (!puntos.length) return;

    heatLayer = L.heatLayer(puntos, {
      radius: 30,
      blur: 18,
      minOpacity: 0.35
    });

    heatLayer.addTo(mapa);
  }

  // ===========================
  // TABLA
  // ===========================
  function renderTabla() {

    const tbody = document.getElementById("tablaStats");

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const filtrados = datasetReportes.filter(r =>
      !minDate || new Date(r.created_at) >= minDate
    );

    tbody.innerHTML = filtrados.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.categoria}</td>
        <td>${r.barrio || "-"}</td>
        <td>${r.estado}</td>
        <td>${new Date(r.created_at).toLocaleString("es-PY")}</td>
      </tr>
    `).join("");
  }

  // ===========================
  // FILTROS
  // ===========================
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

  // ===========================
  // BOOTSTRAP
  // ===========================
  await cargarDatos();
  initMapa();
  renderTabla();
  renderHeat();

});
