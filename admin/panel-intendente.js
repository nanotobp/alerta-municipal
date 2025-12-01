document.addEventListener("DOMContentLoaded", () => {
  // ============================
  // CONFIG / AUTH
  // ============================
  const WORKER_URL = "https://cold-base-33cf.nanotobp.workers.dev";
  const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

  // ============================
  // CATEGORÍAS (COLORES / LABELS)
  // ============================
  const catColors = {
    bache: "#d32f2f",
    baches: "#d32f2f",
    basural: "#2e7d32",
    basura: "#2e7d32",
    arbol_caido:"#b8860b",
    cano_roto:"#1976d2"
  };
  const catLabels = {
    bache:"BACHE", baches:"BACHE",
    basural:"BASURAL", basura:"BASURAL",
    arbol_caido:"ÁRBOL CAÍDO",
    cano_roto:"CAÑO ROTO"
  };

  function matchCategoriaFiltro(valorFiltro, cat) {
    if (!valorFiltro || !cat) return true;
    if (valorFiltro === "bache") {
      return cat === "bache" || cat === "baches";
    }
    if (valorFiltro === "basural") {
      return cat === "basural" || cat === "basura";
    }
    return cat === valorFiltro;
  }

  // ============================
  // ESTADO GLOBAL
  // ============================
  let reportesFull = [];
  let reportes30   = [];
  let deptosMap    = {};
  let accionesCache = {};
  let acciones30   = []; // acciones móviles últimos 30 días

  let mapa30 = null;
  let cluster30 = null;
  let miniMapInstance = null;
  let reporteDetalleActual = null;

  // paginación tabla
  const PAGE_SIZE = 15;
  let paginaActual = 1;
  let listaActual = [];

  // charts
  let chartCat30 = null;
  let chartDepto30 = null;
  let chartEstado30 = null;

  // ============================
  // TEMA
  // ============================
  const htmlEl    = document.documentElement;
  const themeBtn  = document.getElementById("themeToggle");

  function setTemaInicial() {
    let saved = localStorage.getItem("asu_theme");
    if (!saved) {
      saved = window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
    }
    htmlEl.setAttribute("data-bs-theme", saved);
    themeBtn.textContent = saved === "dark" ? "☀️" : "🌙";
  }

  function toggleTema() {
    const actual = htmlEl.getAttribute("data-bs-theme") || "light";
    const nuevo  = actual === "dark" ? "light" : "dark";
    htmlEl.setAttribute("data-bs-theme", nuevo);
    localStorage.setItem("asu_theme", nuevo);
    themeBtn.textContent = nuevo === "dark" ? "☀️" : "🌙";
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTema);
  }
  setTemaInicial();

  // ============================
  // FULLSCREEN
  // ============================
  const btnFullscreen = document.getElementById("btnFullscreen");
  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.error("Error al entrar en fullscreen:", err);
        });
        btnFullscreen.innerHTML = `<i class="ti ti-minimize"></i>`;
      } else {
        document.exitFullscreen().catch(err => {
          console.error("Error al salir de fullscreen:", err);
        });
        btnFullscreen.innerHTML = `<i class="ti ti-maximize"></i>`;
      }
    });

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        btnFullscreen.innerHTML = `<i class="ti ti-maximize"></i>`;
      }
    });
  }

  // ============================
  // LOGOUT
  // ============================
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (!confirm("¿Cerrar sesión?")) return;
      localStorage.removeItem("asu_jwt");
      localStorage.removeItem("asu_rol");
      localStorage.removeItem("asu_email");
      localStorage.removeItem("asu_departamento");
      window.location.href = "/admin/login.html";
    });
  }

  // ============================
  // FETCH — ESTADÍSTICAS GLOBALES
  // ============================
  async function cargarEstadisticasGlobales() {
    try {
      const token = localStorage.getItem("asu_jwt");
      const res = await fetch(WORKER_URL + "/estadisticas", {
        headers: { Authorization: "Bearer " + token }
      });
      const json = await res.json();
      if (!json || json.error) {
        throw new Error(json?.error || "Error desconocido en /estadisticas");
      }

      document.getElementById("stat_total_global").textContent        = json.total ?? 0;
      document.getElementById("stat_pendientes_global").textContent   = json.pendientes ?? 0;
      document.getElementById("stat_solucionados_global").textContent = json.solucionados ?? 0;

      if (json.promedio_horas_resolucion != null) {
        const v = Number(json.promedio_horas_resolucion);
        document.getElementById("stat_tiempo_global").textContent =
          v < 1 ? Math.round(v * 60) + " min" : v.toFixed(1) + " h";
      } else {
        document.getElementById("stat_tiempo_global").textContent = "-";
      }

      // ---- KPI: EFICIENCIA GLOBAL ----
      const tot = json.total ?? 0;
      const sol = json.solucionados ?? 0;
      const eficiencia = tot > 0 ? ((sol / tot) * 100).toFixed(1) + "%" : "-";
      const elEfic = document.getElementById("stat_eficiencia_global");
      if (elEfic) elEfic.textContent = eficiencia;

    } catch (e) {
      console.error(e);
    }
  }

  // ============================
  // FETCH — DEPARTAMENTOS
  // ============================
  async function cargarDepartamentos() {
    try {
      const url = `${SUPABASE_URL}/rest/v1/departamentos?select=id,nombre,slug`;
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON
        }
      });
      const data = await res.json();

      deptosMap = {};
      const sel = document.getElementById("filtroDepto");
      if (!sel) return;

      data.forEach(d => {
        deptosMap[d.id] = d.nombre;
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.nombre;
        sel.appendChild(opt);
      });

    } catch (e) {
      console.error("Error cargando departamentos:", e);
    }
  }

  // ============================
  // FETCH — REPORTES INTENDENTE
  // ============================
  async function cargarReportesIntendente() {
    const token = localStorage.getItem("asu_jwt");
    const rol = localStorage.getItem("asu_rol");

    if (!token || rol !== "intendente") {
      alert("Sesión inválida.");
      return;
    }

    try {
      const resp = await fetch(WORKER_URL + "/listarReportes", {
        headers: { "Authorization": "Bearer " + token }
      });

      const json = await resp.json();

      let arr = [];
      if (Array.isArray(json.reportes)) {
        arr = json.reportes;
      } else if (Array.isArray(json.data)) {
        arr = json.data;
      } else if (Array.isArray(json)) {
        arr = json;
      } else {
        console.error("Respuesta inesperada del Worker:", json);
        alert("Error: El Worker no devolvió reportes.");
        return;
      }

      reportesFull = arr;
      calcularVentana30();
      calcularStats30();

      listaActual = reportes30.slice();
      paginaActual = 1;
      renderTablaPaginada();
      renderMapa30(reportes30);
      actualizarGraficos();

      // KPIs de operadores / equipos (usa reportes30 + acciones30)
      await cargarKpisOperadores();

    } catch (err) {
      console.error("Error cargando reportes intendente:", err);
      alert("Error cargando datos.");
    }
  }

  // ============================
  // CÁLCULO — ÚLTIMOS 30 DÍAS
  // ============================
  function calcularVentana30() {
    const ahora = new Date();
    const hace30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

    reportes30 = reportesFull.filter(r => {
      if (!r.created_at) return false;
      const f = new Date(r.created_at);
      return f >= hace30;
    });
  }

  function calcularStats30() {
    const total = reportes30.length;
    const sol   = reportes30.filter(r => r.estado === "solucionado").length;

    const ahora = new Date();
    const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
    const atrasados = reportes30.filter(r =>
      r.estado !== "solucionado" &&
      r.created_at &&
      new Date(r.created_at) < hace48h
    ).length;

    const elTotal = document.getElementById("stat_total_30");
    const elSol   = document.getElementById("stat_sol_30");
    const elAtr   = document.getElementById("stat_atrasados_30");
    if (elTotal) elTotal.textContent = total;
    if (elSol)   elSol.textContent   = sol;
    if (elAtr)   elAtr.textContent   = atrasados;
  }

  // ============================
  // KPIS DE OPERADORES / EQUIPOS
  // ============================
  async function cargarKpisOperadores() {
    try {
      const ahora = new Date();
      const hace30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
      const iso30 = hace30.toISOString();

      const urlAcc =
        `${SUPABASE_URL}/rest/v1/acciones_municipales?select=*` +
        `&created_at=gte.${encodeURIComponent(iso30)}`;

      const res = await fetch(urlAcc, {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON
        }
      });

      const data = await res.json();
      acciones30 = Array.isArray(data) ? data : [];

      // Mapear operadores móviles
      const operadoresMap = {};
      acciones30.forEach(a => {
        const nombre = a.creado_por_nombre || "Operador N/D";
        const ident  = a.creado_por_identificador || "";
        const key    = ident || nombre;

        if (!operadoresMap[key]) {
          operadoresMap[key] = {
            nombre,
            identificador: ident,
            totalAcciones: 0,
            reportesSet: new Set(),
            tiemposHoras: []
          };
        }
        const op = operadoresMap[key];
        op.totalAcciones += 1;
        if (a.reporte_id != null) {
          op.reportesSet.add(a.reporte_id);
          const rep = reportesFull.find(r => r.id === a.reporte_id);
          if (rep && rep.created_at && a.created_at) {
            const tRep = new Date(rep.created_at).getTime();
            const tAcc = new Date(a.created_at).getTime();
            if (!isNaN(tRep) && !isNaN(tAcc) && tAcc >= tRep) {
              const diffHoras = (tAcc - tRep) / (1000 * 60 * 60);
              op.tiemposHoras.push(diffHoras);
            }
          }
        }
      });

      const operadores = Object.values(operadoresMap);
      if (!operadores.length) {
        return;
      }

      // Operador móvil con más reportes distintos atendidos
      const topMovil = operadores.reduce((best, op) => {
        const repCount = op.reportesSet.size;
        if (!best) return op;
        return repCount > best.reportesSet.size ? op : best;
      }, null);

      // Operador con más acciones móviles
      const topAcciones = operadores.reduce((best, op) => {
        if (!best) return op;
        return op.totalAcciones > best.totalAcciones ? op : best;
      }, null);

      // Operador que más “resuelve”
      const topResuelve = operadores.reduce((best, op) => {
        if (!best) return op;
        return op.reportesSet.size > best.reportesSet.size ? op : best;
      }, null);

      // Operador más rápido (promedio horas)
      const candidatosRapidos = operadores.filter(op => op.tiemposHoras.length > 0);
      let topRapido = null;
      let mejorProm = Infinity;
      candidatosRapidos.forEach(op => {
        const prom = op.tiemposHoras.reduce((s, v) => s + v, 0) / op.tiemposHoras.length;
        if (prom < mejorProm) {
          mejorProm = prom;
          topRapido = { ...op, promedioHoras: prom };
        }
      });

      const kpiTopMovil       = document.getElementById("kpi_top_movil");
      const kpiTopMovilDet    = document.getElementById("kpi_top_movil_det");
      const kpiAccMovil       = document.getElementById("kpi_acciones_movil");
      const kpiAccMovilDet    = document.getElementById("kpi_acciones_movil_det");
      const kpiResuelveMas    = document.getElementById("kpi_resuelve_mas");
      const kpiResuelveMasDet = document.getElementById("kpi_resuelve_mas_det");
      const kpiMasRapido      = document.getElementById("kpi_mas_rapido");
      const kpiMasRapidoDet   = document.getElementById("kpi_mas_rapido_det");
      const kpiEquipo         = document.getElementById("kpi_equipo_productivo");
      const kpiEquipoDet      = document.getElementById("kpi_equipo_productivo_det");

      if (topMovil && kpiTopMovil && kpiTopMovilDet) {
        kpiTopMovil.textContent = topMovil.reportesSet.size || "-";
        kpiTopMovilDet.textContent =
          `${topMovil.nombre}${topMovil.identificador ? " (" + topMovil.identificador + ")" : ""}`;
      }

      if (topAcciones && kpiAccMovil && kpiAccMovilDet) {
        kpiAccMovil.textContent = topAcciones.totalAcciones;
        kpiAccMovilDet.textContent =
          `${topAcciones.nombre}${topAcciones.identificador ? " (" + topAcciones.identificador + ")" : ""}`;
      }

      if (topResuelve && kpiResuelveMas && kpiResuelveMasDet) {
        kpiResuelveMas.textContent = topResuelve.reportesSet.size || "-";
        kpiResuelveMasDet.textContent =
          `${topResuelve.nombre}${topResuelve.identificador ? " (" + topResuelve.identificador + ")" : ""}`;
      }

      if (topRapido && isFinite(topRapido.promedioHoras) && kpiMasRapido && kpiMasRapidoDet) {
        const h = topRapido.promedioHoras;
        const labelTiempo = h < 1
          ? `${Math.round(h * 60)} min`
          : `${h.toFixed(1)} h`;
        kpiMasRapido.textContent = labelTiempo;
        kpiMasRapidoDet.textContent =
          `${topRapido.nombre}${topRapido.identificador ? " (" + topRapido.identificador + ")" : ""}`;
      }

      // Equipo más productivo
      if (kpiEquipo && kpiEquipoDet) {
        if (reportes30.length) {
          const equipos = {};
          reportes30.forEach(r => {
            const depId = r.departamento_id || "sin_depto";
            if (!equipos[depId]) {
              equipos[depId] = { total: 0, sol: 0 };
            }
            equipos[depId].total += 1;
            if (r.estado === "solucionado") {
              equipos[depId].sol += 1;
            }
          });

          const entries = Object.entries(equipos);
          if (entries.length) {
            let bestDep = null;
            let bestSol = -1;
            entries.forEach(([depId, info]) => {
              if (info.sol > bestSol) {
                bestSol = info.sol;
                bestDep = { depId, ...info };
              }
            });

            if (bestDep) {
              const nom = deptosMap[bestDep.depId] || "Sin departamento asignado";
              kpiEquipo.textContent = nom;
              kpiEquipoDet.textContent =
                `${bestDep.sol} reportes solucionados de ${bestDep.total} en los últimos 30 días.`;
            } else {
              kpiEquipo.textContent = "-";
              kpiEquipoDet.textContent = "Sin datos suficientes.";
            }
          } else {
            kpiEquipo.textContent = "-";
            kpiEquipoDet.textContent = "Sin datos suficientes.";
          }
        } else {
          kpiEquipo.textContent = "-";
          kpiEquipoDet.textContent = "No hay reportes en los últimos 30 días.";
        }
      }

    } catch (e) {
      console.error("Error al calcular KPIs de operadores:", e);
    }
  }

  // ============================
  // TABLA + PAGINACIÓN
  // ============================
  function construirFilaReporte(r) {
    const catColor = catColors[r.categoria] || "#999";
    const catLabel = catLabels[r.categoria] || (r.categoria || "").toUpperCase();
    const fechaStr = r.created_at
      ? new Date(r.created_at).toLocaleString("es-PY", {
          day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
        })
      : "-";

    const deptoNombre = deptosMap[r.departamento_id] || "-";

    const estadoHtml =
      r.estado === "solucionado"
        ? '<span class="badge bg-success badge-pill">Solucionado</span>'
        : '<span class="badge bg-warning badge-pill">Pendiente</span>';

    return `
      <tr>
        <td>${r.id}</td>
        <td>${deptoNombre}</td>
        <td>
          <span class="category-dot" style="background:${catColor}"></span>
          ${catLabel}
        </td>
        <td>${r.barrio || "-"}</td>
        <td>${r.detalle || "-"}</td>
        <td>
          ${r.nombre || "-"}<br>
          <span class="text-muted" style="font-size:0.8rem;">${r.celular || ""}</span>
        </td>
        <td>${estadoHtml}</td>
        <td>${fechaStr}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-ver="${r.id}">Ver</button>
        </td>
      </tr>
    `;
  }

  function renderTablaPaginada() {
    const tbody = document.getElementById("tablaReportesInt");
    if (!tbody) return;

    const total = listaActual.length;

    if (!total) {
      tbody.innerHTML = `
        <tr><td colspan="9" class="text-center py-4 text-muted">Sin datos disponibles</td></tr>
      `;
      actualizarPaginacion(0, 0, 0);
      return;
    }

    const totalPaginas = Math.ceil(total / PAGE_SIZE);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * PAGE_SIZE;
    const fin = Math.min(inicio + PAGE_SIZE, total);
    const slice = listaActual.slice(inicio, fin);

    tbody.innerHTML = slice.map(construirFilaReporte).join("");
    actualizarPaginacion(total, inicio + 1, fin);
  }

  function actualizarPaginacion(total, desde, hasta) {
    const cont = document.getElementById("paginacionTabla");
    if (!cont) return;

    if (!total) {
      cont.innerHTML = `<div class="text-muted small">Sin datos</div>`;
      return;
    }

    const totalPaginas = Math.ceil(total / PAGE_SIZE);

    cont.innerHTML = `
      <div class="d-flex align-items-center w-100">
        <div class="text-muted small">
          Mostrando <span>${desde}</span>–<span>${hasta}</span> de <span>${total}</span> reportes
        </div>
        <div class="ms-auto btn-group">
          <button class="btn btn-sm btn-outline-secondary" id="btnPrevPage" ${paginaActual <= 1 ? "disabled" : ""}>Anterior</button>
          <button class="btn btn-sm btn-outline-secondary" id="btnNextPage" ${paginaActual >= totalPaginas ? "disabled" : ""}>Ver más</button>
        </div>
      </div>
    `;

    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");

    if (btnPrev) {
      btnPrev.onclick = () => {
        if (paginaActual > 1) {
          paginaActual--;
          renderTablaPaginada();
        }
      };
    }
    if (btnNext) {
      btnNext.onclick = () => {
        if (paginaActual < totalPaginas) {
          paginaActual++;
          renderTablaPaginada();
        }
      };
    }
  }

  // ============================
  // FILTROS
  // ============================
  function filtrar() {
    const elBuscar = document.getElementById("buscar");
    const elEst = document.getElementById("filtroEstado");
    const elCat = document.getElementById("filtroCategoria");
    const elDep = document.getElementById("filtroDepto");
    const elFd  = document.getElementById("fchDesde");
    const elFh  = document.getElementById("fchHasta");

    const q   = elBuscar ? elBuscar.value.toLowerCase().trim() : "";
    const est = elEst ? elEst.value : "";
    const cat = elCat ? elCat.value : "";
    const dep = elDep ? elDep.value : "";
    const fd  = elFd ? elFd.value : "";
    const fh  = elFh ? elFh.value : "";

    const filtrados = reportes30.filter(r => {
      if (est && r.estado !== est) return false;
      if (cat && !matchCategoriaFiltro(cat, r.categoria)) return false;
      if (dep && String(r.departamento_id || "") !== dep) return false;

      if (fd && r.created_at && new Date(r.created_at) < new Date(fd)) {
        return false;
      }
      if (fh && r.created_at && new Date(r.created_at) > new Date(fh + "T23:59:59")) {
        return false;
      }

      const texto =
        (r.detalle || "").toLowerCase() + " " +
        (r.barrio  || "").toLowerCase() + " " +
        (r.nombre  || "").toLowerCase();

      if (q && !texto.includes(q)) return false;
      return true;
    });

    listaActual = filtrados;
    paginaActual = 1;
    renderTablaPaginada();
    renderMapa30(filtrados);
  }

  const elBuscar = document.getElementById("buscar");
  if (elBuscar) elBuscar.addEventListener("input", filtrar);
  const elEst    = document.getElementById("filtroEstado");
  const elCat    = document.getElementById("filtroCategoria");
  const elDep    = document.getElementById("filtroDepto");
  const elFd     = document.getElementById("fchDesde");
  const elFh     = document.getElementById("fchHasta");

  if (elEst) elEst.addEventListener("change", filtrar);
  if (elCat) elCat.addEventListener("change", filtrar);
  if (elDep) elDep.addEventListener("change", filtrar);
  if (elFd)  elFd.addEventListener("change", filtrar);
  if (elFh)  elFh.addEventListener("change", filtrar);

  const btnRefrescar = document.getElementById("btnRefrescar");
  if (btnRefrescar) {
    btnRefrescar.addEventListener("click", () => {
      cargarEstadisticasGlobales();
      cargarReportesIntendente();
    });
  }

  // ============================
  // MAPA 30 DÍAS
  // ============================
  function renderMapa30(baseLista) {
    const lista = baseLista || reportes30;

    const mapDiv = document.getElementById("map30");
    if (!mapDiv) return;

    if (!mapa30) {
      mapa30 = L.map("map30").setView([-25.28, -57.64], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
      }).addTo(mapa30);
    }

    if (cluster30) {
      mapa30.removeLayer(cluster30);
    }

    cluster30 = L.markerClusterGroup();
    lista.forEach(r => {
      if (!r.lat || !r.lng) return;
      const catLabel = catLabels[r.categoria] || r.categoria || "";
      const deptoNombre = deptosMap[r.departamento_id] || "";
      const barrio = r.barrio || "";
      const fotos = Array.isArray(r.fotos_url) ? r.fotos_url : [];
      const thumb = fotos.length
        ? `<img src="${fotos[0]}" class="foto-thumb" />`
        : "";

      const marker = L.marker([r.lat, r.lng]);
      const popupHtml = `
        <div style="min-width:210px">
          <div><strong>#${r.id}</strong> – ${catLabel}</div>
          <div class="text-muted" style="font-size:0.8rem;">
            ${deptoNombre}${barrio ? " · " + barrio : ""}
          </div>
          <div class="d-flex align-items-center mt-2">
            ${thumb}
            <button class="btn btn-sm btn-primary ms-auto" data-ver="${r.id}">
              Ver
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      cluster30.addLayer(marker);
    });

    mapa30.addLayer(cluster30);
  }

  // ============================
  // CHARTS
  // ============================
  function actualizarGraficos() {
    const base = reportes30;
    const canvasCat    = document.getElementById("chartCat30");
    const canvasDepto  = document.getElementById("chartDepto30");
    const canvasEstado = document.getElementById("chartEstado30");

    if (!canvasCat || !canvasDepto || !canvasEstado) return;

    if (!base.length) {
      if (chartCat30) chartCat30.destroy();
      if (chartDepto30) chartDepto30.destroy();
      if (chartEstado30) chartEstado30.destroy();
      return;
    }

    // categorías
    const catOrder = ["bache","basural","arbol_caido","cano_roto"];
    const labelsCat = catOrder.map(c => catLabels[c] || c.toUpperCase());
    const dataCat = catOrder.map(c =>
      base.filter(r => matchCategoriaFiltro(c, r.categoria)).length
    );

    // departamentos
    const idsDepto = [...new Set(base.map(r => r.departamento_id).filter(Boolean))];
    const labelsDepto = idsDepto.map(id => deptosMap[id] || ("Depto " + id));
    const dataDepto = idsDepto.map(id =>
      base.filter(r => r.departamento_id === id).length
    );

    // estado
    const total = base.length;
    const sol = base.filter(r => r.estado === "solucionado").length;
    const pend = total - sol;

    const ctxCat = canvasCat.getContext("2d");
    const ctxDepto = canvasDepto.getContext("2d");
    const ctxEstado = canvasEstado.getContext("2d");

    if (chartCat30) chartCat30.destroy();
    if (chartDepto30) chartDepto30.destroy();
    if (chartEstado30) chartEstado30.destroy();

    chartCat30 = new Chart(ctxCat, {
      type: "bar",
      data: {
        labels: labelsCat,
        datasets: [{
          label: "Reportes",
          data: dataCat
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display:false } },
        scales: {
          y: { beginAtZero:true, ticks:{ precision:0 } }
        }
      }
    });

    chartDepto30 = new Chart(ctxDepto, {
      type: "bar",
      data: {
        labels: labelsDepto,
        datasets: [{
          label: "Reportes",
          data: dataDepto
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display:false } },
        scales: {
          y: { beginAtZero:true, ticks:{ precision:0 } }
        }
      }
    });

    chartEstado30 = new Chart(ctxEstado, {
      type: "bar",
      data: {
        labels: ["Pendientes","Solucionados"],
        datasets: [{
          label: "Reportes",
          data: [pend, sol]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display:false } },
        scales: {
          y: { beginAtZero:true, ticks:{ precision:0 } }
        }
      }
    });
  }

  // ============================
  // ACCIONES MUNICIPALES (DETALLE)
  // ============================
  async function obtenerAccionesPorReporte(reporteId) {
    if (!reporteId) return [];
    if (accionesCache[reporteId]) return accionesCache[reporteId];

    try {
      const url =
        `${SUPABASE_URL}/rest/v1/acciones_municipales?reporte_id=eq.${reporteId}&select=*`;

      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON
        }
      });

      const data = await res.json();
      accionesCache[reporteId] = Array.isArray(data) ? data : [];
      return accionesCache[reporteId];

    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // ============================
  // DETALLE REPORTE
  // ============================
  const detallePanel   = document.getElementById("detalleReportePanel");
  const detalleTitulo  = document.getElementById("detalleTitulo");
  const detalleSub     = document.getElementById("detalleSubtitulo");
  const detalleBadge   = document.getElementById("detalleBadgeEstado");
  const detalleCatChip = document.getElementById("detalleCategoriaChip");
  const detalleDeptoChip = document.getElementById("detalleDeptoChip");
  const detalleCiudadanoNombre  = document.getElementById("detalleCiudadanoNombre");
  const detalleCiudadanoCelular = document.getElementById("detalleCiudadanoCelular");
  const detalleTextoReporte     = document.getElementById("detalleTextoReporte");
  const detalleFechas           = document.getElementById("detalleFechas");
  const detalleFotosCiudadano   = document.getElementById("detalleFotosCiudadano");
  const detalleMiniDashboard    = document.getElementById("detalleMiniDashboard");
  const accionesListado         = document.getElementById("accionesListado");
  const alertaDuplicados        = document.getElementById("alertaDuplicados");
  const listaDuplicados         = document.getElementById("listaDuplicados");
  const btnAbrirEnMapa          = document.getElementById("btnAbrirEnMapa");

  function buscarReportePorId(id) {
    return reportesFull.find(r => String(r.id) === String(id));
  }

  function renderMiniDashboardStats(rep) {
    if (!detalleMiniDashboard) return;

    const mismaCat = reportes30.filter(r => r.categoria === rep.categoria);
    const mismoBarrio = reportes30.filter(r =>
      r.barrio && rep.barrio &&
      r.barrio.toLowerCase() === rep.barrio.toLowerCase()
    );

    const totalCat = mismaCat.length;
    const totalCatPend = mismaCat.filter(r => r.estado !== "solucionado").length;

    const totalBarrio = mismoBarrio.length;
    const totalBarrioPend = mismoBarrio.filter(r => r.estado !== "solucionado").length;

    detalleMiniDashboard.innerHTML = `
      <div>En esta categoría (últimos 30 días): <b>${totalCat}</b> reportes, <b>${totalCatPend}</b> pendientes.</div>
      <div>En este barrio (últimos 30 días): <b>${totalBarrio}</b> reportes, <b>${totalBarrioPend}</b> pendientes.</div>
    `;
  }

  function renderMiniMapa(lat, lng) {
    const mapDiv = document.getElementById("miniMapaDetalle");
    if (!mapDiv) return;

    mapDiv.innerHTML = "";
    if (!lat || !lng || typeof L === "undefined") return;

    miniMapInstance = L.map("miniMapaDetalle", {
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false
    }).setView([lat, lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(miniMapInstance);

    L.marker([lat, lng]).addTo(miniMapInstance);
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI/180;
    const dLng = (lng2 - lng1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) *
              Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function verificarDuplicados(rep) {
    if (!alertaDuplicados || !listaDuplicados) return;

    alertaDuplicados.classList.add("d-none");
    listaDuplicados.innerHTML = "";

    if (!rep.lat || !rep.lng) return;

    const cercanos = reportesFull.filter(r => {
      if (String(r.id) === String(rep.id)) return false;
      if (!r.lat || !r.lng) return false;
      const d = distanciaMetros(rep.lat, rep.lng, r.lat, r.lng);
      return d <= 40;
    });

    if (!cercanos.length) return;

    alertaDuplicados.classList.remove("d-none");
    listaDuplicados.innerHTML = cercanos
      .map(c => {
        const fecha = c.created_at ? c.created_at.slice(0,10) : "";
        return `• #${c.id} – ${c.categoria} (${c.estado}) ${fecha}`;
      })
      .join("<br>");
  }

  function renderAccionesLista(lista) {
    if (!accionesListado) return;
    accionesListado.innerHTML = "";

    if (!lista.length) {
      accionesListado.innerHTML = `
        <div class="text-muted small">
          Aún no hay acciones registradas.
        </div>`;
      return;
    }

    lista.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

    const cont = document.createElement("div");
    cont.className = "timeline";

    lista.forEach(a => {
      const fechaStr = a.created_at
        ? new Date(a.created_at).toLocaleString("es-PY", {
            day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
          })
        : "";

      const fotos = Array.isArray(a.fotos_url) ? a.fotos_url : [];

      const item = document.createElement("div");
      item.className = "timeline-item";

      item.innerHTML = `
        <div class="timeline-point"></div>
        <div class="timeline-event">
          <div class="timeline-header">
            <strong>${a.titulo || (a.categoria || "Acción municipal")}</strong>
            <span class="text-muted small"> · ${fechaStr}</span>
          </div>
          <div class="timeline-content small mt-1">
            <b>Operador:</b> ${a.creado_por_nombre || "N/D"}
            ${a.creado_por_identificador ? ` (${a.creado_por_identificador})` : ""}
            <br>
            ${a.detalle || "Acción registrada."}
          </div>
          ${
            a.observacion
              ? `<div class="small mt-2"><b>Observación:</b> ${a.observacion}</div>`
              : ""
          }
          ${
            a.social_url
              ? `<div class="small mt-2"><a href="${a.social_url}" target="_blank">🔗 Ver publicación</a></div>`
              : ""
          }
        </div>
      `;

      if (fotos.length) {
        const fotosDiv = document.createElement("div");
        fotosDiv.className = "acciones-fotos mt-2";
        fotos.forEach(u => {
          const img = document.createElement("img");
          img.src = u;
          img.onclick = () => window.open(u, "_blank");
          fotosDiv.appendChild(img);
        });
        item.querySelector(".timeline-event").appendChild(fotosDiv);
      }

      cont.appendChild(item);
    });

    accionesListado.appendChild(cont);
  }

  async function abrirDetalle(id) {
    if (!detallePanel) return;

    if (mapa30 && mapa30.closePopup) mapa30.closePopup();

    const rep = buscarReportePorId(id);
    if (!rep) {
      alert("Reporte no encontrado.");
      return;
    }
        reporteDetalleActual = rep;

    // ----- Título -----
    if (detalleTitulo) detalleTitulo.textContent = `Reporte #${rep.id}`;
    if (detalleSub) {
      const fecha = rep.created_at
        ? new Date(rep.created_at).toLocaleString("es-PY", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";
      detalleSub.textContent = fecha;
    }

    // ----- Estado -----
    if (detalleBadge) {
      if (rep.estado === "solucionado") {
        detalleBadge.className = "badge bg-success";
        detalleBadge.textContent = "Solucionado";
      } else {
        detalleBadge.className = "badge bg-warning";
        detalleBadge.textContent = "Pendiente";
      }
    }

    // ----- Categoría -----
    if (detalleCategoriaChip) {
      const label = catLabels[rep.categoria] || rep.categoria || "-";
      detalleCategoriaChip.textContent = label;
      detalleCategoriaChip.style.background = catColors[rep.categoria] || "#666";
    }

    // ----- Departamento -----
    if (detalleDeptoChip) {
      const nombreDep = deptosMap[rep.departamento_id] || "Sin departamento";
      detalleDeptoChip.textContent = nombreDep;
    }

    // ----- Ciudadano -----
    if (detalleCiudadanoNombre)
      detalleCiudadanoNombre.textContent = rep.nombre || "-";

    if (detalleCiudadanoCelular)
      detalleCiudadanoCelular.textContent = rep.celular || "-";

    // ----- Detalle del reporte -----
    if (detalleTextoReporte)
      detalleTextoReporte.textContent = rep.detalle || "(sin descripción)";

    // ----- Fechas -----
    if (detalleFechas) {
      const fCrea = rep.created_at
        ? new Date(rep.created_at).toLocaleString("es-PY")
        : "-";
      const fSol = rep.fecha_solucion
        ? new Date(rep.fecha_solucion).toLocaleString("es-PY")
        : "-";

      detalleFechas.innerHTML = `
        <div><b>Creado:</b> ${fCrea}</div>
        <div><b>Solucionado:</b> ${fSol}</div>
      `;
    }

    // ----- Fotos del ciudadano -----
    if (detalleFotosCiudadano) {
      detalleFotosCiudadano.innerHTML = "";
      const fotos = Array.isArray(rep.fotos_url) ? rep.fotos_url : [];
      if (!fotos.length) {
        detalleFotosCiudadano.innerHTML =
          `<div class="text-muted small">(sin fotos)</div>`;
      } else {
        fotos.forEach((u) => {
          const img = document.createElement("img");
          img.src = u;
          img.className = "foto-thumb-lg";
          img.onclick = () => window.open(u, "_blank");
          detalleFotosCiudadano.appendChild(img);
        });
      }
    }

    // ----- Mini dashboard -----
    renderMiniDashboardStats(rep);

    // ----- Mini mapa -----
    renderMiniMapa(rep.lat, rep.lng);

    // ----- Duplicados -----
    verificarDuplicados(rep);

    // ----- Acciones -----
    const acciones = await obtenerAccionesPorReporte(rep.id);
    renderAccionesLista(acciones);

    // ----- Abrir en mapa principal -----
    if (btnAbrirEnMapa) {
      btnAbrirEnMapa.onclick = () => {
        if (!mapa30) return;
        detallePanel.classList.remove("open");
        mapa30.flyTo([rep.lat, rep.lng], 17, {
          animate: true,
          duration: 0.7
        });
      };
    }

    // ----- Mostrar panel -----
    detallePanel.classList.add("open");
  }

  // ============================
  // CERRAR PANEL DETALLE
  // ============================
  const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");
  if (btnCerrarDetalle) {
    btnCerrarDetalle.addEventListener("click", () => {
      detallePanel.classList.remove("open");
      reporteDetalleActual = null;
    });
  }

  // ============================
  // EVENTO GLOBAL: CLICK "VER"
  // ============================
  document.body.addEventListener("click", (ev) => {
    const id = ev.target.getAttribute("data-ver");
    if (id) {
      abrirDetalle(id);
    }
  });

  // ============================
  // INICIALIZACIÓN
  // ============================
  cargarEstadisticasGlobales();
  cargarDepartamentos();
  cargarReportesIntendente();
});

