import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ---------------------------------------
   ESTADO GLOBAL
---------------------------------------- */
let reportes = [];
let acciones = [];
let categorias = []; // categorias_municipales: { id, nombre, slug, icono, color }

let modoTab = "acciones";  // "acciones" | "reportes"
let rangoDias = 7;
let categoriaActiva = null; // slug de categorias_municipales
let vista = "lista";       // "lista" | "mapa"

let mapCiudad;
let layerCiudad;

/* ---------------------------------------
   CATEGORÍAS REPORTES CIUDADANOS
   (alineado a reportes.categoria)
---------------------------------------- */
const CAT_REP_INFO = {
  baches: {
    label: "Bache",
    emoji: "🚧",
    color: "#d32f2f"
  },
  basural: {
    label: "Basural",
    emoji: "🗑️",
    color: "#2e7d32"
  },
  arbol_caido: {
    label: "Árbol caído",
    emoji: "🌳",
    color: "#b8860b"
  },
  cano_roto: {
    label: "Caño roto",
    emoji: "🚰",
    color: "#1976d2"
  }
};

function getInfoReporteCat(cat) {
  return CAT_REP_INFO[cat] || {
    label: (cat || "").toUpperCase(),
    emoji: "📍",
    color: "#666"
  };
}

function getInfoAccionCat(slug) {
  const cat = categorias.find(c => c.slug === slug);
  if (!cat) {
    return {
      label: slug || "Acción municipal",
      emoji: "🏛️",
      color: "#206bc4"
    };
  }
  return {
    label: cat.nombre || slug,
    emoji: cat.icono || "🏛️",
    color: cat.color || "#206bc4"
  };
}

/* ---------------------------------------
   VISOR DE FOTOS (SLIDESHOW)
---------------------------------------- */
const fotoViewerState = {
  urls: [],
  index: 0
};

let fotoModalEl, fotoModalImg, fotoPrevBtn, fotoNextBtn, fotoCloseBtn;

function initFotoModal() {
  fotoModalEl  = document.getElementById("fotoModal");
  fotoModalImg = document.getElementById("fotoModalImg");
  fotoPrevBtn  = document.getElementById("fotoModalPrev");
  fotoNextBtn  = document.getElementById("fotoModalNext");
  fotoCloseBtn = document.getElementById("fotoModalClose");

  if (!fotoModalEl || !fotoModalImg) return;

  const cerrar = () => {
    fotoModalEl.style.display = "none";
    fotoViewerState.urls = [];
    fotoViewerState.index = 0;
  };

  const mostrar = (idx) => {
    if (!fotoViewerState.urls.length) return;
    if (idx < 0) idx = fotoViewerState.urls.length - 1;
    if (idx >= fotoViewerState.urls.length) idx = 0;
    fotoViewerState.index = idx;
    fotoModalImg.src = fotoViewerState.urls[idx];
    fotoModalEl.style.display = "flex";
  };

  // función global reutilizable
  window.openFotoViewer = function(urls, startIndex = 0) {
    if (!urls || !urls.length) return;
    fotoViewerState.urls = urls.slice();
    mostrar(startIndex || 0);
  };

  if (fotoPrevBtn) {
    fotoPrevBtn.addEventListener("click", () => {
      mostrar(fotoViewerState.index - 1);
    });
  }
  if (fotoNextBtn) {
    fotoNextBtn.addEventListener("click", () => {
      mostrar(fotoViewerState.index + 1);
    });
  }
  if (fotoCloseBtn) {
    fotoCloseBtn.addEventListener("click", cerrar);
  }

  fotoModalEl.addEventListener("click", (e) => {
    if (
      e.target === fotoModalEl ||
      e.target.classList.contains("foto-modal-backdrop")
    ) {
      cerrar();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!fotoModalEl || fotoModalEl.style.display !== "flex") return;
    if (e.key === "Escape") cerrar();
    if (e.key === "ArrowLeft") mostrar(fotoViewerState.index - 1);
    if (e.key === "ArrowRight") mostrar(fotoViewerState.index + 1);
  });
}

/* ---------------------------------------
   HELPERS
---------------------------------------- */
function getParamTab() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("tab");
  return t === "reportes" ? "reportes" : "acciones";
}

function dentroDeRango(fechaStr, dias) {
  if (!fechaStr) return false;
  const d = new Date(fechaStr);
  const hoy = new Date();
  const desde = new Date();
  // últimos "dias" redondeando inicio a 00:00
  desde.setDate(hoy.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);
  return d >= desde && d <= hoy;
}

/* ---------------------------------------
   CARGA DE DATOS
---------------------------------------- */
async function cargarDatos() {
  const [repRes, accRes, catRes] = await Promise.all([
    supabase
      .from("reportes")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("acciones_municipales")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("categorias_municipales")
      .select("id,nombre,slug,icono,color")
      .order("id")
  ]);

  reportes   = repRes.data   || [];
  acciones   = accRes.data   || [];
  categorias = catRes.data   || [];
}

/* ---------------------------------------
   FILTROS
---------------------------------------- */
function getReportesFiltrados() {
  let arr = reportes.filter(r => dentroDeRango(r.created_at, rangoDias));
  // límite simple por rendimiento
  return arr.slice(0, 150);
}

function getAccionesFiltradas() {
  let arr = acciones.filter(a => dentroDeRango(a.created_at, rangoDias));
  if (categoriaActiva) {
    arr = arr.filter(a => (a.categoria || "") === categoriaActiva);
  }
  return arr.slice(0, 150);
}

/* ---------------------------------------
   UI TABS
---------------------------------------- */
function bindTabs() {
  const tabAcc = document.getElementById("tabAcciones");
  const tabRep = document.getElementById("tabReportes");
  modoTab = getParamTab();

  function updateTabs() {
    tabAcc.classList.toggle("active", modoTab === "acciones");
    tabRep.classList.toggle("active", modoTab === "reportes");

    const chips = document.getElementById("chipsCategorias");
    chips.style.display = modoTab === "acciones" ? "flex" : "none";
  }

  tabAcc.addEventListener("click", () => {
    modoTab = "acciones";
    updateTabs();
    renderTodo();
    history.replaceState(null, "", "ciudad.html?tab=acciones");
  });

  tabRep.addEventListener("click", () => {
    modoTab = "reportes";
    updateTabs();
    renderTodo();
    history.replaceState(null, "", "ciudad.html?tab=reportes");
  });

  updateTabs();
}

function bindFiltrosTiempo() {
  document.querySelectorAll(".filtro-tiempo").forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filtro-tiempo")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      rangoDias = parseInt(btn.dataset.dias || "7", 10);
      renderTodo();
    });
  });
}

/* ---------------------------------------
   DROPDOWN DE CATEGORÍAS (ACCIONES)
---------------------------------------- */
function renderCategoriasDropdown() {
  const select = document.getElementById("selectCategoria");
  if (!select) return;

  // limpiar opciones
  select.innerHTML = `<option value="">Todas las categorías</option>`;

  categorias.forEach(cat => {
    const info = getInfoAccionCat(cat.slug);
    const opt = document.createElement("option");
    opt.value = cat.slug;
    opt.textContent = `${info.emoji} ${info.label}`;
    select.appendChild(opt);
  });

  // mantener selección previa si existe
  select.value = categoriaActiva || "";

  // evento de cambio
  select.onchange = () => {
    categoriaActiva = select.value || null;
    renderTodo();
  };
}



/* ---------------------------------------
   VISTA LISTA / MAPA
---------------------------------------- */
function bindViewTabs() {
  const btnLista = document.getElementById("viewLista");
  const btnMapa  = document.getElementById("viewMapa");
  const secLista = document.getElementById("vistaLista");
  const secMapa  = document.getElementById("vistaMapa");

  function updateView() {
    btnLista.classList.toggle("active", vista === "lista");
    btnMapa.classList.toggle("active", vista === "mapa");

    secLista.style.display = vista === "lista" ? "block" : "none";
    secMapa.style.display  = vista === "mapa" ? "block" : "none";

    if (vista === "mapa") {
      setTimeout(() => mapCiudad?.invalidateSize(), 200);
    }
  }

  btnLista.addEventListener("click", () => {
    vista = "lista";
    updateView();
  });

  btnMapa.addEventListener("click", () => {
    vista = "mapa";
    updateView();
  });

  updateView();
}

/* ---------------------------------------
   RENDER LISTA
---------------------------------------- */
function renderLista() {
  const cont   = document.getElementById("listaCiudad");
  const titulo = document.getElementById("tituloLista");
  const sub    = document.getElementById("subLista");

  cont.innerHTML = "";

  /* ----- ACCIONES MUNICIPALES ----- */
  if (modoTab === "acciones") {
    const arr = getAccionesFiltradas();
    titulo.textContent = "Acciones municipales recientes";
    sub.textContent = "Trabajos e intervenciones de la Municipalidad en el periodo seleccionado.";

    if (!arr.length) {
      cont.innerHTML = `<div class="empty-msg">No hay acciones registradas en este periodo.</div>`;
      return;
    }

    arr.forEach(a => {
      const info = getInfoAccionCat(a.categoria);
      const fecha = a.created_at
        ? new Date(a.created_at).toLocaleString("es-PY", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";

      const fotosArr = Array.isArray(a.fotos_url) ? a.fotos_url : [];

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">
            <span class="card-title-main">
              ${info.emoji} ${info.label}
            </span>
            <span class="card-meta">
              ${fecha} · ${a.creado_por_nombre || "Municipalidad"}
            </span>
          </div>
          <div class="card-toggle">▼</div>
        </div>

        <div class="card-body">
          <p>${a.detalle || "Acción registrada."}</p>
          ${a.observacion ? `<p><b>Observación:</b> ${a.observacion}</p>` : ""}
          ${
            fotosArr.length
              ? `<div class="fotos-line">
                  ${fotosArr
                    .map(
                      (u, idx) =>
                        `<img src="${u}" class="foto-mini" data-idx="${idx}" alt="Foto acción"/>`
                    )
                    .join("")}
                 </div>`
              : ""
          }
          ${
            a.social_url
              ? `<br><a class="link-social" href="${a.social_url}" target="_blank" rel="noopener">
                   🔗 Ver publicación
                 </a>`
              : ""
          }
          <br>
          <button class="btn-map">Ver en mapa</button>
        </div>
      `;

      const header = card.querySelector(".card-header");
      const body   = card.querySelector(".card-body");
      const btnMap = card.querySelector(".btn-map");

      header.addEventListener("click", () => {
        const visible = body.style.display === "block";
        body.style.display = visible ? "none" : "block";
      });

      btnMap.addEventListener("click", () => {
        if (!mapCiudad) return;
        vista = "mapa";
        document.getElementById("viewMapa").click(); // dispara updateView
        mapCiudad.flyTo([a.lat, a.lng], 18, { duration: 0.6, easeLinearity: 0.25 });
      });

      if (fotosArr.length) {
        card.querySelectorAll(".foto-mini").forEach(img => {
          img.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const idx = parseInt(img.dataset.idx || "0", 10);
            if (window.openFotoViewer) {
              window.openFotoViewer(fotosArr, idx);
            }
          });
        });
      }

      cont.appendChild(card);
    });

  /* ----- REPORTES CIUDADANOS ----- */
  } else {
    const arr = getReportesFiltrados();
    titulo.textContent = "Reportes ciudadanos";
    sub.textContent = "Denuncias y avisos registrados por la ciudadanía en el periodo seleccionado.";

    if (!arr.length) {
      cont.innerHTML = `<div class="empty-msg">No hay reportes ciudadanos en este periodo.</div>`;
      return;
    }

    arr.forEach(r => {
      const infoCat = getInfoReporteCat(r.categoria);
      const fecha = r.created_at
        ? new Date(r.created_at).toLocaleString("es-PY", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";

      const fotosArr = Array.isArray(r.fotos_url) ? r.fotos_url : [];

      const estadoBadgeClass =
        r.estado === "solucionado" ? "badge-estado-sol" : "badge-estado-pend";

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">
            <span class="card-title-main">
              ${infoCat.emoji} ${infoCat.label} – ${r.barrio || "Sin barrio"}
            </span>
            <span class="card-meta">
              ${fecha} · <span class="${estadoBadgeClass}">${r.estado}</span>
            </span>
          </div>
          <div class="card-toggle">▼</div>
        </div>

        <div class="card-body">
          <p>${r.detalle || "Sin descripción."}</p>
          ${
            fotosArr.length
              ? `<div class="fotos-line">
                   ${fotosArr
                     .map(
                       (u, idx) =>
                         `<img src="${u}" class="foto-mini" data-idx="${idx}" alt="Foto reporte"/>`
                     )
                     .join("")}
                 </div>`
              : ""
          }
          <br>
          <button class="btn-map">Ver en mapa</button>
        </div>
      `;

      const header = card.querySelector(".card-header");
      const body   = card.querySelector(".card-body");
      const btnMap = card.querySelector(".btn-map");

      header.addEventListener("click", () => {
        const visible = body.style.display === "block";
        body.style.display = visible ? "none" : "block";
      });

      btnMap.addEventListener("click", () => {
        if (!mapCiudad) return;
        vista = "mapa";
        document.getElementById("viewMapa").click();
        mapCiudad.flyTo([r.lat, r.lng], 18, { duration: 0.6, easeLinearity: 0.25 });
      });

      if (fotosArr.length) {
        card.querySelectorAll(".foto-mini").forEach(img => {
          img.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const idx = parseInt(img.dataset.idx || "0", 10);
            if (window.openFotoViewer) {
              window.openFotoViewer(fotosArr, idx);
            }
          });
        });
      }

      cont.appendChild(card);
    });
  }
}

/* ---------------------------------------
   MAPA
---------------------------------------- */
function initMapCiudad() {
  mapCiudad = L.map("mapCiudad").setView([-25.282, -57.63], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(mapCiudad);
  layerCiudad = L.layerGroup().addTo(mapCiudad);
}

function renderMapa() {
  if (!mapCiudad) return;
  layerCiudad.clearLayers();

  /* ----- ACCIONES MUNICIPALES ----- */
  if (modoTab === "acciones") {
    const arr = getAccionesFiltradas();

    arr.forEach(a => {
      const info = getInfoAccionCat(a.categoria);
      const fotosArr = Array.isArray(a.fotos_url) ? a.fotos_url : [];

      const icon = L.divIcon({
        className: "emoji-marker",
        html: `<span>${info.emoji}</span>`
      });

      const popupHtml = `
        <b>${info.label}</b><br>
        ${a.detalle || "Acción municipal."}
        ${a.observacion ? `<br><i>${a.observacion}</i>` : ""}
        ${
          fotosArr.length
            ? `<br><button type="button" class="popup-fotos-btn">
                 Ver fotos (${fotosArr.length})
               </button>`
            : ""
        }
        ${
          a.social_url
            ? `<br><a href="${a.social_url}" target="_blank" rel="noopener">
                 🔗 Publicación
               </a>`
            : ""
        }
      `;

      const marker = L.marker([a.lat, a.lng], { icon })
        .addTo(layerCiudad)
        .bindPopup(popupHtml);

      marker.on("click", () => {
        mapCiudad.flyTo([a.lat, a.lng], 18, { duration: 0.6 });
      });

      if (fotosArr.length) {
        marker.on("popupopen", e => {
          const el = e.popup.getElement();
          if (!el) return;
          const btn = el.querySelector(".popup-fotos-btn");
          if (!btn) return;
          btn.addEventListener("click", () => {
            if (window.openFotoViewer) {
              window.openFotoViewer(fotosArr, 0);
            }
          }, { once: true });
        });
      }
    });

  /* ----- REPORTES CIUDADANOS ----- */
  } else {
    const arr = getReportesFiltrados();

    arr.forEach(r => {
      const info = getInfoReporteCat(r.categoria);
      const fotosArr = Array.isArray(r.fotos_url) ? r.fotos_url : [];

      const icon = L.divIcon({
        className: "emoji-marker",
        html: `<span>${info.emoji}</span>`
      });

      const popupHtml = `
        <b>${info.label}</b><br>
        ${r.barrio || ""}<br>
        ${r.detalle || "Sin descripción."}
        ${
          fotosArr.length
            ? `<br><button type="button" class="popup-fotos-btn">
                 Ver fotos (${fotosArr.length})
               </button>`
            : ""
        }
      `;

      const marker = L.marker([r.lat, r.lng], { icon })
        .addTo(layerCiudad)
        .bindPopup(popupHtml);

      marker.on("click", () => {
        mapCiudad.flyTo([r.lat, r.lng], 18, { duration: 0.6 });
      });

      if (fotosArr.length) {
        marker.on("popupopen", e => {
          const el = e.popup.getElement();
          if (!el) return;
          const btn = el.querySelector(".popup-fotos-btn");
          if (!btn) return;
          btn.addEventListener("click", () => {
            if (window.openFotoViewer) {
              window.openFotoViewer(fotosArr, 0);
            }
          }, { once: true });
        });
      }
    });
  }
}

/* ---------------------------------------
   RENDER GLOBAL
---------------------------------------- */
function renderTodo() {
  renderLista();
  if (!mapCiudad) initMapCiudad();
  renderMapa();
}

/* ---------------------------------------
   INIT
---------------------------------------- */
(async () => {
  modoTab = getParamTab();
  await cargarDatos();
  initFotoModal();
  bindTabs();
  bindFiltrosTiempo();
  renderCategoriasDropdown();
  bindViewTabs();
  renderTodo();
})();
