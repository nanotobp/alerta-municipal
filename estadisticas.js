document.addEventListener("DOMContentLoaded", async () => {

  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";

  let diasFiltro = 7;
  let mapa, heatLayer;

  let dataset = [];         // reportes + acciones
  let datasetReportes = []; // solo reportes

  // ===========================
  // CARGA ÚNICA DEL WORKER
  // ===========================
  async function cargarDatos() {
    const res = await fetch(WORKER_URL + "/estadisticas");
    const json = await res.json();

    // KPIs
    document.getElementById("kpiReportes").innerText = json.total_reportes;
    document.getElementById("kpiAcciones").innerText = json.total_acciones;
    document.getElementById("kpiSolucion").innerText = json.porcentaje_solucion + "%";
    document.getElementById("kpiTiempo").innerText = json.tiempo_promedio || "--";

    datasetReportes = json.ultimos_reportes || [];

    dataset = [
      ...json.ultimos_reportes.map(r => ({
        tipo: "reporte",
        lat: r.lat,
        lng: r.lng,
        categoria: r.categoria,
        departamento: r.departamento_id,
        created_at: r.created_at
      })),
      ...json.ultimas_acciones.map(a => ({
        tipo: "accion",
        lat: a.lat,
        lng: a.lng,
        categoria: a.categoria,
        departamento: a.departamento_id,
        created_at: a.created_at
      }))
    ];

    // graficos
    renderGraficos(json);
  }

  // ===========================
  // MAPA
  // ===========================
  function initMapa() {
    mapa = L.map("mapaStats").setView([-25.3, -57.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapa);

    setTimeout(() => mapa.invalidateSize(), 300);
  }

  function limpiarHeat() {
    if (heatLayer) mapa.removeLayer(heatLayer);
  }

  function renderHeat() {

    limpiarHeat();

    const minDate = diasFiltro === "global"
      ? null
      : new Date(Date.now() - diasFiltro * 86400000);

    const puntos = dataset
      .filter(p => p.lat && p.lng)
      .filter(p => !minDate || new Date(p.created_at) >= minDate)
      .map(p => [p.lat, p.lng, p.tipo === "accion" ? 0.8 : 0.55]);

    if (puntos.length === 0) return;

    heatLayer = L.heatLayer(puntos, {
      radius: 33,
      blur: 20,
      minOpacity: 0.35,
      gradient: {
        0.25: "#ffb3b3",
        0.5: "#ff6b6b",
        0.8: "#d32f2f",
        1.0: "#7f0000"
      }
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
  // GRÁFICOS
  // ===========================
  let chart1, chart2, chart3, chart4;

  function renderGraficos(data) {

    if (chart1) chart1.destroy();
    if (chart2) chart2.destroy();
    if (chart3) chart3.destroy();
    if (chart4) chart4.destroy();

    chart1 = new Chart(document.getElementById("chartCategorias"), {
      type: "bar",
      data: {
        labels: Object.keys(data.categorias_conteo),
        datasets: [{
          label: "Reportes",
          data: Object.values(data.categorias_conteo),
          backgroundColor: "#d32f2f"
        }]
      }
    });

    chart2 = new Chart(document.getElementById("chartComparativa"), {
      type: "line",
      data: {
        labels: data.comparativa_fechas,
        datasets: [
          {
            label: "Reportes",
            data: data.comparativa_reportes,
            borderColor: "#d32f2f",
            fill: false
          },
          {
            label: "Acciones",
            data: data.comparativa_acciones,
            borderColor: "#0038A8",
            fill: false
          }
        ]
      }
    });

    chart3 = new Chart(document.getElementById("chartDeptos"), {
      type: "bar",
      data: {
        labels: Object.keys(data.departamentos_conteo),
        datasets: [{
          label: "Reportes",
          data: Object.values(data.departamentos_conteo),
          backgroundColor: "#0038A8"
        }]
      }
    });

    chart4 = new Chart(document.getElementById("chartSemana"), {
      type: "line",
      data: {
        labels: data.semana_fechas,
        datasets: [{
          label: "Tendencia semanal",
          data: data.semana_conteo,
          borderColor: "#d32f2f",
          fill: false
        }]
      }
    });
  }

  // ===========================
  // TABS
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
