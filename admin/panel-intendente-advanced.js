// =============================================================
//  PANEL INTENDENTE – ADVANCED DASHBOARD
//  KPIs avanzados de gestión municipal
// =============================================================

document.addEventListener("DOMContentLoaded", () => {

  // -----------------------------------------------------------
  // CONFIG
  // -----------------------------------------------------------
  const WORKER_URL     = "https://cold-base-33cf.nanotobp.workers.dev";
  const SUPABASE_URL   = "https://wreqfthiuqwzusthjcjv.supabase.co";
  const SUPABASE_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

  const contAvanzado = document.getElementById("kpiAvanzadosContainer");
  if (!contAvanzado) return; // si no existe, no hacemos nada

  // -----------------------------------------------------------
  // ESTADO
  // -----------------------------------------------------------
  let reportesAll  = [];
  let accionesAll  = [];
  let ventana      = "30"; // "7" | "30" | "global"

  // charts para limpiar antes de re-render
  let chartTrendCarga     = null;
  let chartTrendSolucion  = null;
  let chartAccionesDepto  = null;

  // -----------------------------------------------------------
  // HELPERS DE TIEMPO
  // -----------------------------------------------------------
  function parseFecha(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function diffHoras(a, b) {
    if (!a || !b) return null;
    const ta = a.getTime();
    const tb = b.getTime();
    if (isNaN(ta) || isNaN(tb) || tb < ta) return null;
    return (tb - ta) / (1000 * 60 * 60);
  }

  function hoy() {
    return new Date();
  }

  function restarDias(base, dias) {
    return new Date(base.getTime() - dias * 24 * 60 * 60 * 1000);
  }

  // -----------------------------------------------------------
  // ALCANCE TEMPORAL (7 / 30 / GLOBAL)
  // -----------------------------------------------------------
  function getReportesVentana() {
    if (!Array.isArray(reportesAll)) return [];

    if (ventana === "global") {
      return [...reportesAll];
    }

    const now = hoy();
    const limite = restarDias(now, ventana === "7" ? 7 : 30);

    return reportesAll.filter(r => {
      const f = parseFecha(r.created_at);
      if (!f) return false;
      return f >= limite;
    });
  }

  function getAccionesVentana() {
    if (!Array.isArray(accionesAll)) return [];
    if (ventana === "global") return [...accionesAll];

    const now = hoy();
    const limite = restarDias(now, ventana === "7" ? 7 : 30);

    return accionesAll.filter(a => {
      const f = parseFecha(a.created_at);
      if (!f) return false;
      return f >= limite;
    });
  }

  // -----------------------------------------------------------
  // CARGA DE DATOS BASE
  // -----------------------------------------------------------
  async function cargarReportes() {
    const token = localStorage.getItem("asu_jwt");
    if (!token) {
      console.warn("[Advanced] Sin token JWT, no se cargan KPIs avanzados.");
      return [];
    }

    try {
      const resp = await fetch(WORKER_URL + "/listarReportes", {
        headers: { "Authorization": "Bearer " + token }
      });
      const json = await resp.json();

      if (Array.isArray(json.reportes)) return json.reportes;
      if (Array.isArray(json.data))     return json.data;
      if (Array.isArray(json))          return json;

      console.error("[Advanced] Respuesta inesperada /listarReportes:", json);
      return [];

    } catch (e) {
      console.error("[Advanced] Error cargando reportes:", e);
      return [];
    }
  }

  async function cargarAcciones() {
    try {
      // Para no matar al sistema, traemos SOLO últimos 90 días
      const now   = hoy();
      const hace90 = restarDias(now, 90).toISOString();

      const urlAcc =
        `${SUPABASE_URL}/rest/v1/acciones_municipales` +
        `?select=*` +
        `&created_at=gte.${encodeURIComponent(hace90)}`;

      const res = await fetch(urlAcc, {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON
        }
      });

      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data;

    } catch (e) {
      console.error("[Advanced] Error cargando acciones_municipales:", e);
      return [];
    }
  }

  async function cargarDatosBase() {
    contAvanzado.innerHTML = `
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex align-items-center">
            <div class="spinner-border text-primary me-2" role="status"></div>
            <div class="small text-muted">
              Cargando dashboard avanzado de gestión...
            </div>
          </div>
        </div>
      </div>
    `;

    reportesAll = await cargarReportes();
    accionesAll = await cargarAcciones();

    renderAvanzado();
  }

  // -----------------------------------------------------------
  // CÁLCULOS PRINCIPALES
  // -----------------------------------------------------------
  function calcularTiempoPromedioPorCategoria(reps) {
    const mapa = new Map(); // cat -> {sumaHoras, count}

    reps.forEach(r => {
      const cat = r.categoria || "sin_categoria";
      const fCreado  = parseFecha(r.created_at);
      const fResuelto = parseFecha(r.resuelto_at);

      const diff = diffHoras(fCreado, fResuelto);
      if (diff == null) return;

      if (!mapa.has(cat)) {
        mapa.set(cat, { suma: 0, count: 0 });
      }
      const obj = mapa.get(cat);
      obj.suma  += diff;
      obj.count += 1;
    });

    const result = [];
    mapa.forEach((val, cat) => {
      if (!val.count) return;
      result.push({
        categoria: cat,
        horasProm: val.suma / val.count
      });
    });

    // orden por promedio asc (más eficiente arriba)
    result.sort((a, b) => a.horasProm - b.horasProm);
    return result;
  }

  function calcularTiempoPromedioPorDepto(reps) {
    const mapa = new Map(); // depto -> {sumaHoras, count}

    reps.forEach(r => {
      const dep = r.departamento_id || "sin_depto";
      const fCreado  = parseFecha(r.created_at);
      const fResuelto = parseFecha(r.resuelto_at);

      const diff = diffHoras(fCreado, fResuelto);
      if (diff == null) return;

      if (!mapa.has(dep)) {
        mapa.set(dep, { suma: 0, count: 0 });
      }
      const obj = mapa.get(dep);
      obj.suma  += diff;
      obj.count += 1;
    });

    const result = [];
    mapa.forEach((val, dep) => {
      if (!val.count) return;
      result.push({
        departamento_id: dep,
        horasProm: val.suma / val.count
      });
    });

    // orden por promedio asc
    result.sort((a, b) => a.horasProm - b.horasProm);
    return result;
  }

  function calcularPorcentajePrioridadAlta12h(reps) {
    // asumimos campo prioridad: "alta" / "media" / "baja"
    const soloAlta = reps.filter(r => {
      const p = (r.prioridad || "").toString().toLowerCase();
      return p === "alta";
    });

    if (!soloAlta.length) return { porcentaje: null, totalAlta: 0 };

    let dentro12 = 0;
    soloAlta.forEach(r => {
      const fCreado  = parseFecha(r.created_at);
      const fResuelto = parseFecha(r.resuelto_at);
      const diff = diffHoras(fCreado, fResuelto);
      if (diff != null && diff <= 12) dentro12++;
    });

    const porc = soloAlta.length ? (dentro12 / soloAlta.length) * 100 : null;
    return { porcentaje: porc, totalAlta: soloAlta.length };
  }

  function calcularProporcionConFotos(reps) {
    if (!reps.length) return { porcentaje: null, total: 0 };

    let conFoto = 0;
    reps.forEach(r => {
      const fotos = Array.isArray(r.fotos_url) ? r.fotos_url : [];
      if (fotos.length > 0) conFoto++;
    });

    const porc = (conFoto / reps.length) * 100;
    return { porcentaje: porc, total: reps.length, conFoto };
  }

  function calcularDuplicadosDetectados(reps) {
    // Buscamos campos típicos: es_duplicado, duplicado_de_id, reporte_original_id
    let count = 0;

    reps.forEach(r => {
      if (r.es_duplicado === true) {
        count++;
        return;
      }
      if (r.duplicado_de_id != null && r.duplicado_de_id !== "") {
        count++;
        return;
      }
      if (r.reporte_original_id != null && r.reporte_original_id !== "") {
        count++;
        return;
      }
    });

    return count;
  }

  function mapearAccionesPorReporte(acciones) {
    const mapa = new Map(); // reporte_id -> array acciones

    acciones.forEach(a => {
      const id = a.reporte_id;
      if (id == null) return;
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id).push(a);
    });

    return mapa;
  }

  function calcularTiempoPromedioPrimeraAccion(reps, acciones) {
    if (!reps.length || !acciones.length) return null;

    const mapaAcc = mapearAccionesPorReporte(acciones);
    let sumaHoras = 0;
    let count     = 0;

    reps.forEach(r => {
      const id = r.id;
      if (id == null) return;
      const accs = mapaAcc.get(id);
      if (!accs || !accs.length) return;

      const fRep = parseFecha(r.created_at);
      if (!fRep) return;

      // tomamos la fecha de acción más temprana
      let fPrimera = null;
      accs.forEach(a => {
        const fa = parseFecha(a.created_at);
        if (!fa) return;
        if (!fPrimera || fa < fPrimera) fPrimera = fa;
      });

      const diff = diffHoras(fRep, fPrimera);
      if (diff == null) return;

      sumaHoras += diff;
      count++;
    });

    if (!count) return null;
    return sumaHoras / count;
  }

  function calcularReporteMasIntervenciones(acciones) {
    if (!acciones.length) return null;

    const mapaAcc = mapearAccionesPorReporte(acciones);
    let best = null;

    mapaAcc.forEach((lista, repId) => {
      if (!best || lista.length > best.count) {
        best = { reporte_id: repId, count: lista.length };
      }
    });

    return best;
  }

  function calcularAccionesPorDepto(acciones, reps) {
    if (!acciones.length || !reps.length) return [];

    // Index de reportes por id
    const mapaRep = new Map();
    reps.forEach(r => {
      if (r.id != null) mapaRep.set(r.id, r);
    });

    const mapaDepto = new Map(); // depto -> count

    acciones.forEach(a => {
      const rid = a.reporte_id;
      if (rid == null) return;

      const rep = mapaRep.get(rid);
      if (!rep) return;

      const dep = rep.departamento_id || "sin_depto";
      if (!mapaDepto.has(dep)) mapaDepto.set(dep, 0);
      mapaDepto.set(dep, mapaDepto.get(dep) + 1);
    });

    const result = [];
    mapaDepto.forEach((val, dep) => {
      result.push({ departamento_id: dep, acciones: val });
    });

    result.sort((a, b) => b.acciones - a.acciones);
    return result;
  }

  function calcularRankingBarrios(reps, topN = 5) {
    const mapa = new Map(); // barrio -> count

    reps.forEach(r => {
      const b = (r.barrio || "Sin barrio").toString().trim();
      if (!b) return;
      if (!mapa.has(b)) mapa.set(b, 0);
      mapa.set(b, mapa.get(b) + 1);
    });

    const arr = [];
    mapa.forEach((val, barrio) => {
      arr.push({ barrio, total: val });
    });

    arr.sort((a, b) => b.total - a.total);
    return arr.slice(0, topN);
  }

  function calcularTendenciaSemanalCarga(reps, semanas = 6) {
    // devolvemos arrays ordenados por semana ascendente (de más viejo a más nuevo)
    if (!reps.length) return { labels: [], data: [] };

    const now = hoy();
    const startLimit = restarDias(now, semanas * 7);

    const mapa = new Map(); // "YYYY-WW" -> count

    reps.forEach(r => {
      const f = parseFecha(r.created_at);
      if (!f || f < startLimit) return;

      const y = f.getFullYear();
      // semana ISO approx
      const firstJan = new Date(f.getFullYear(), 0, 1);
      const days = Math.floor((f - firstJan) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((days + firstJan.getDay() + 1) / 7);

      const key = `${y}-S${week}`;
      if (!mapa.has(key)) mapa.set(key, 0);
      mapa.set(key, mapa.get(key) + 1);
    });

    const keys = Array.from(mapa.keys()).sort();
    const data = keys.map(k => mapa.get(k));

    return { labels: keys, data };
  }

  function calcularTendenciaSemanalSolucion(reps, semanas = 6) {
    if (!reps.length) return { labels: [], data: [] };

    const now = hoy();
    const startLimit = restarDias(now, semanas * 7);
    const mapa = new Map(); // "YYYY-WW" -> count

    reps.forEach(r => {
      if (r.estado !== "solucionado") return;
      const f = parseFecha(r.resuelto_at);
      if (!f || f < startLimit) return;

      const y = f.getFullYear();
      const firstJan = new Date(f.getFullYear(), 0, 1);
      const days = Math.floor((f - firstJan) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((days + firstJan.getDay() + 1) / 7);

      const key = `${y}-S${week}`;
      if (!mapa.has(key)) mapa.set(key, 0);
      mapa.set(key, mapa.get(key) + 1);
    });

    const keys = Array.from(mapa.keys()).sort();
    const data = keys.map(k => mapa.get(k));

    return { labels: keys, data };
  }

  function calcularMejoraMensual(reps) {
    if (!reps.length) return null;

    const now    = hoy();
    const hace30 = restarDias(now, 30);
    const hace60 = restarDias(now, 60);

    const periodoReciente  = [];
    const periodoAnterior  = [];

    reps.forEach(r => {
      const fCreado = parseFecha(r.created_at);
      if (!fCreado) return;

      if (fCreado >= hace30 && fCreado <= now) {
        periodoReciente.push(r);
      } else if (fCreado >= hace60 && fCreado < hace30) {
        periodoAnterior.push(r);
      }
    });

    function tasaResolucion(arr) {
      if (!arr.length) return null;
      const total = arr.length;
      const sol   = arr.filter(r => r.estado === "solucionado").length;
      return (sol / total) * 100;
    }

    const tRec = tasaResolucion(periodoReciente);
    const tAnt = tasaResolucion(periodoAnterior);

    if (tRec == null || tAnt == null) {
      return null;
    }

    const diff = tRec - tAnt; // puntos porcentuales
    return {
      tasaReciente: tRec,
      tasaAnterior: tAnt,
      diferencia: diff
    };
  }

  // -----------------------------------------------------------
  // RENDER UI AVANZADA
  // -----------------------------------------------------------
  function renderAvanzado() {
    const repsVentana   = getReportesVentana();
    const accVentana    = getAccionesVentana();

    // calculamos todo
    const tpCat         = calcularTiempoPromedioPorCategoria(repsVentana);
    const tpDepto       = calcularTiempoPromedioPorDepto(repsVentana);
    const prioAlta      = calcularPorcentajePrioridadAlta12h(repsVentana);
    const fotosStats    = calcularProporcionConFotos(repsVentana);
    const dupCount      = calcularDuplicadosDetectados(repsVentana);
    const tPrimAccion   = calcularTiempoPromedioPrimeraAccion(repsVentana, accVentana);
    const repMasInter   = calcularReporteMasIntervenciones(accVentana);
    const accionesDep   = calcularAccionesPorDepto(accVentana, repsVentana);
    const rankingBarrio = calcularRankingBarrios(repsVentana, 5);
    const trendCarga    = calcularTendenciaSemanalCarga(repsVentana, 6);
    const trendSol      = calcularTendenciaSemanalSolucion(repsVentana, 6);
    const mejoraMensual = calcularMejoraMensual(reportesAll); // global, no solo ventana

    // helpers de formato
    function fmtHoras(h) {
      if (h == null || !isFinite(h)) return "-";
      if (h < 1) {
        const min = Math.round(h * 60);
        return `${min} min`;
      }
      return `${h.toFixed(1)} h`;
    }

    function fmtPorc(p) {
      if (p == null || !isFinite(p)) return "-";
      return p.toFixed(1) + " %";
    }

    function ventanaLabel() {
      if (ventana === "7") return "últimos 7 días";
      if (ventana === "30") return "últimos 30 días";
      return "histórico completo";
    }

    // top categoría más rápida
    const mejorCat = tpCat.length ? tpCat[0] : null;
    // top depto más rápido
    const mejorDepto = tpDepto.length ? tpDepto[0] : null;

    // texto mejora mensual
    let txtMejora = "-";
    if (mejoraMensual) {
      const signo = mejoraMensual.diferencia >= 0 ? "▲" : "▼";
      const valorAbs = Math.abs(mejoraMensual.diferencia).toFixed(1);
      txtMejora =
        `${signo} ${valorAbs} pts · ` +
        `Actual: ${mejoraMensual.tasaReciente.toFixed(1)}% · ` +
        `Anterior: ${mejoraMensual.tasaAnterior.toFixed(1)}%`;
    }

    // render principal
    contAvanzado.innerHTML = `
      <div class="card mb-3">
        <div class="card-header">
          <h3 class="card-title">Dashboard avanzado - </h3>
          <div class="card-subtitle">
            KPIs calculados sobre <b>${ventanaLabel()}</b>.
          </div>
        </div>
        <div class="card-body">
          
          <!-- FILA 1: KPIs PRINCIPALES -->
          <div class="row row-cards mb-3">

            <div class="col-md-6 col-lg-3">
              <div class="card shadow-sm">
                <div class="card-body">
                  <div class="stat-label">Categoría más eficiente</div>
                  <div class="stat-number">
                    ${mejorCat ? fmtHoras(mejorCat.horasProm) : "-"}
                  </div>
                  <div class="stat-caption">
                    ${mejorCat ? (mejorCat.categoria || "").toUpperCase() : "Sin datos suficientes."}
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-6 col-lg-3">
              <div class="card shadow-sm">
                <div class="card-body">
                  <div class="stat-label">Departamento más rápido</div>
                  <div class="stat-number">
                    ${mejorDepto ? fmtHoras(mejorDepto.horasProm) : "-"}
                  </div>
                  <div class="stat-caption">
                    ${
                      mejorDepto
                        ? ("Depto " + (mejorDepto.departamento_id || "N/D"))
                        : "Sin datos suficientes."
                    }
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-6 col-lg-3">
              <div class="card shadow-sm">
                <div class="card-body">
                  <div class="stat-label">% prioridad alta &lt;= 12h</div>
                  <div class="stat-number">
                    ${prioAlta && prioAlta.porcentaje != null ? fmtPorc(prioAlta.porcentaje) : "-"}
                  </div>
                  <div class="stat-caption">
                    ${
                      prioAlta && prioAlta.totalAlta
                        ? `${prioAlta.totalAlta} reportes de prioridad alta.`
                        : "Sin datos de prioridad alta."
                    }
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-6 col-lg-3">
              <div class="card shadow-sm">
                <div class="card-body">
                  <div class="stat-label">% reportes con fotos</div>
                  <div class="stat-number">
                    ${fotosStats && fotosStats.porcentaje != null ? fmtPorc(fotosStats.porcentaje) : "-"}
                  </div>
                  <div class="stat-caption">
                    ${
                      fotosStats && fotosStats.total
                        ? `${fotosStats.conFoto} de ${fotosStats.total} reportes incluyen fotos.`
                        : "Sin datos disponibles."
                    }
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- FILA 2: PROCESO Y DUPLICADOS -->
          <div class="row row-cards mb-3">

            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <div class="stat-label">Tiempo a primera acción móvil</div>
                  <div class="stat-number">
                    ${tPrimAccion != null ? fmtHoras(tPrimAccion) : "-"}
                  </div>
                  <div class="stat-caption">
                    Promedio entre creación del reporte y la primera intervención registrada.
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <div class="stat-label">Reportes con posibles duplicados</div>
                  <div class="stat-number">
                    ${dupCount}
                  </div>
                  <div class="stat-caption">
                    Basado en campos de duplicado/espejo que existan en la base.
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <div class="stat-label">Reporte con más intervenciones</div>
                  <div class="stat-number">
                    ${repMasInter ? ("#" + repMasInter.reporte_id) : "-"}
                  </div>
                  <div class="stat-caption">
                    ${
                      repMasInter
                        ? `${repMasInter.count} acciones móviles registradas.`
                        : "Aún no hay suficientes acciones registradas."
                    }
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- FILA 3: RANKINGS Y ACCIONES POR DEPTO -->
          <div class="row row-cards mb-3">

            <div class="col-lg-6">
              <div class="card h-100">
                <div class="card-header">
                  <div class="card-title">Ranking de barrios con más reportes</div>
                </div>
                <div class="card-body">
                  ${
                    rankingBarrio.length
                      ? `
                        <ol class="mb-0">
                          ${rankingBarrio.map(b => `
                            <li>
                              <b>${b.barrio}</b> – ${b.total} reportes
                            </li>
                          `).join("")}
                        </ol>
                      `
                      : `<div class="text-muted small">Sin datos suficientes para el período seleccionado.</div>`
                  }
                </div>
              </div>
            </div>

            <div class="col-lg-6">
              <div class="card h-100">
                <div class="card-header">
                  <div class="card-title">Acciones móviles por departamento</div>
                </div>
                <div class="card-body">
                  <div class="mb-2">
                    <canvas id="chartAccionesDepto" height="140"></canvas>
                  </div>
                  ${
                    accionesDep.length
                      ? `<div class="small text-muted">Top departamento: 
                            <b>Depto ${accionesDep[0].departamento_id || "N/D"}</b> 
                            (${accionesDep[0].acciones} acciones).
                          </div>`
                      : `<div class="small text-muted">Sin acciones móviles en el período seleccionado.</div>`
                  }
                </div>
              </div>
            </div>

          </div>

          <!-- FILA 4: TENDENCIAS TEMPORALES -->
          <div class="row row-cards">

            <div class="col-lg-6">
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Tendencia semanal de carga ciudadana</div>
                </div>
                <div class="card-body">
                  <canvas id="chartTrendCarga" height="140"></canvas>
                  <div class="small text-muted mt-2">
                    Evolución de reportes creados en las últimas semanas.
                  </div>
                </div>
              </div>
            </div>

            <div class="col-lg-6">
              <div class="card">
                <div class="card-header">
                  <div class="card-title">Tendencia semanal de solución</div>
                </div>
                <div class="card-body">
                  <canvas id="chartTrendSolucion" height="140"></canvas>
                  <div class="small text-muted mt-2">
                    Evolución de reportes marcados como solucionados.
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- BLOQUE MEJORA MENSUAL -->
          <div class="row mt-3">
            <div class="col-12">
              <div class="alert alert-success">
                <b>Porcentaje de mejora mensual (resolución):</b><br>
                ${txtMejora}
              </div>
            </div>
          </div>

        </div> <!-- /card-body -->
      </div> <!-- /card -->
    `;

    // -------------------------------
    // GRÁFICOS CON CHART.JS
    // -------------------------------
    const canvasAccDepto   = document.getElementById("chartAccionesDepto");
    const canvasTrendCarga = document.getElementById("chartTrendCarga");
    const canvasTrendSol   = document.getElementById("chartTrendSolucion");

    // limpiamos si ya existían
    if (chartAccionesDepto) { chartAccionesDepto.destroy(); chartAccionesDepto = null; }
    if (chartTrendCarga)    { chartTrendCarga.destroy();    chartTrendCarga = null; }
    if (chartTrendSolucion) { chartTrendSolucion.destroy(); chartTrendSolucion = null; }

    if (canvasAccDepto && accionesDep.length && window.Chart) {
      const labels = accionesDep.map(d => "Depto " + (d.departamento_id || "N/D"));
      const data   = accionesDep.map(d => d.acciones);

      chartAccionesDepto = new Chart(canvasAccDepto.getContext("2d"), {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Acciones móviles",
            data
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }

    if (canvasTrendCarga && trendCarga.labels.length && window.Chart) {
      chartTrendCarga = new Chart(canvasTrendCarga.getContext("2d"), {
        type: "line",
        data: {
          labels: trendCarga.labels,
          datasets: [{
            label: "Reportes creados",
            data: trendCarga.data,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    if (canvasTrendSol && trendSol.labels.length && window.Chart) {
      chartTrendSolucion = new Chart(canvasTrendSol.getContext("2d"), {
        type: "line",
        data: {
          labels: trendSol.labels,
          datasets: [{
            label: "Reportes solucionados",
            data: trendSol.data,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
  }

  // -----------------------------------------------------------
  // EVENTOS DEL SELECTOR DE TIEMPO (7 / 30 / GLOBAL)
  // -----------------------------------------------------------
  const selectorTiempo = document.getElementById("selectorTiempo");
  if (selectorTiempo) {
    selectorTiempo.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-dia]");
      if (!btn) return;

      const val = btn.getAttribute("data-dia");
      if (!val || !["7", "30", "global"].includes(val)) return;

      ventana = val;

      // Toggle visual de active (sin romper otros scripts)
      const btns = selectorTiempo.querySelectorAll("[data-dia]");
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Re-render del dashboard avanzado
      renderAvanzado();
    });
  }

  // -----------------------------------------------------------
  // INIT
  // -----------------------------------------------------------
  cargarDatosBase();

});
