import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ----------------------
// CONFIG SUPABASE
// ----------------------
const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ----------------------
// VARIABLES GLOBALES
// ----------------------
let map;
let layerReportesPend, layerReportesSol, layerAcciones;
let reportes = [];
let acciones = [];
let rangoDias = 7;

let puntoSeleccionado = null;
let markerSeleccion = null;

let fotos = [];
let videoStream = null;
let categoriaReporte = null;

let fotoModalEl, fotoModalImg, fotoPrevBtn, fotoNextBtn, fotoCloseBtn;

const fotoViewerState = {
  urls: [],
  index: 0
};

// ICONOS para reportes ciudadanos
const iconosCiudadano = {
  bache: "🚧",
  basura: "🗑️",
  arbol_caido: "🌳",
  cano_roto: "🚰"
};

// ----------------------
// MODAL GENÉRICO
// ----------------------
function abrirModal(html) {
  const modal = document.getElementById("modalAsu");
  const content = document.getElementById("modalAsuContent");

  content.innerHTML = html;
  modal.classList.add("open");

  modal.onclick = (e) => {
    if (e.target.id === "modalAsu") {
      modal.classList.remove("open");
    }
  };
}

// ----------------------
// SI BD VACÍA → DUMMY
// ----------------------
function seedDummyIfNeeded() {
  if (!reportes || reportes.length === 0) {
    reportes = [
      {
        id:1,
        lat:-25.2825, lng:-57.635,
        categoria:"bache",
        detalle:"Bache profundo sobre Artigas esquina Brasil.",
        barrio:"Barrio Jara",
        estado:"pendiente",
        created_at:new Date().toISOString(),
        fotos_url:[]
      }
    ];
  }

  if (!acciones || acciones.length === 0) {
    acciones = [
      {
        id:101,
        lat:-25.283, lng:-57.632,
        categoria:"bacheo",
        titulo:"Bacheo de emergencia",
        detalle:"Se realizó bacheo sobre España.",
        observacion:"Señalizado.",
        creado_por:"Dirección de Obras",
        created_at:new Date().toISOString(),
        fotos_url:[]
      }
    ];
  }
}

// ----------------------
// RANGO DE DÍAS
// ----------------------
function dentroDeRango(fechaStr, dias){
  if (!fechaStr) return false;
  const d = new Date(fechaStr);
  const ahora = new Date();
  const desde = new Date();
  desde.setDate(ahora.getDate() - (dias-1));
  desde.setHours(0,0,0,0);
  return d >= desde && d <= ahora;
}

// ----------------------
// MAPA
// ----------------------
function initMap() {
  map = L.map("map").setView([-25.282, -57.63], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  layerReportesPend = L.layerGroup().addTo(map);
  layerReportesSol  = L.layerGroup().addTo(map);
  layerAcciones     = L.layerGroup().addTo(map);

  // seleccionar punto en el mapa
  map.on("click", e => {
    puntoSeleccionado = { lat:e.latlng.lat, lng:e.latlng.lng };
    marcarPuntoSeleccionado();

    const form = document.getElementById("formReporte");
    if (form) form.style.display = "block";
  });
}

function marcarPuntoSeleccionado() {
  if (!puntoSeleccionado) return;

  if (markerSeleccion) map.removeLayer(markerSeleccion);

  markerSeleccion = L.circleMarker([puntoSeleccionado.lat, puntoSeleccionado.lng], {
    color:"#d32f2f",
    radius:14,
    fillOpacity:0.9
  }).addTo(map);

  map.flyTo([puntoSeleccionado.lat, puntoSeleccionado.lng], 18, {
    duration:0.6
  });
}

// ----------------------
// CARGA DE TABLAS
// ----------------------
async function cargarReportes(){
  const { data } = await supabase
    .from("reportes")
    .select("*")
    .order("created_at", { ascending:false });
  if (data) reportes = data;
}

async function cargarAcciones(){
  const { data } = await supabase
    .from("acciones_municipales")
    .select("*")
    .order("created_at", { ascending:false });
  if (data) acciones = data;
}

// ----------------------
// VISOR DE FOTOS
// ----------------------
function initFotoModal(){
  fotoModalEl   = document.getElementById("fotoModal");
  fotoModalImg  = document.getElementById("fotoModalImg");
  fotoPrevBtn   = document.getElementById("fotoModalPrev");
  fotoNextBtn   = document.getElementById("fotoModalNext");
  fotoCloseBtn  = document.getElementById("fotoModalClose");

  if (!fotoModalEl) return;

  const cerrar = () => {
    fotoModalEl.style.display = "none";
    fotoViewerState.urls = [];
    fotoViewerState.index = 0;
  };

  const mostrar = (i) => {
    if (!fotoViewerState.urls.length) return;
    if (i < 0) i = fotoViewerState.urls.length - 1;
    if (i >= fotoViewerState.urls.length) i = 0;
    fotoViewerState.index = i;

    fotoModalImg.src = fotoViewerState.urls[i];
    fotoModalEl.style.display = "flex";
  };

  window.openFotoViewer = function(urls, start=0){
    fotoViewerState.urls = urls;
    mostrar(start);
  };

  if (fotoPrevBtn) fotoPrevBtn.onclick = () => mostrar(fotoViewerState.index - 1);
  if (fotoNextBtn) fotoNextBtn.onclick = () => mostrar(fotoViewerState.index + 1);
  if (fotoCloseBtn) fotoCloseBtn.onclick = cerrar;

  fotoModalEl.addEventListener("click", e => {
    if (e.target === fotoModalEl) cerrar();
  });
}

// ----------------------
// RENDER MAPA
// ----------------------
function renderMapa(){
  if (!map) return;

  layerReportesPend.clearLayers();
  layerReportesSol.clearLayers();
  layerAcciones.clearLayers();

  seedDummyIfNeeded();

  const iconosAccion = {
    bacheo:"🚧",
    limpieza:"🧹",
    arboles:"🌳",
    agua:"🚰",
    social:"🤝",
    cultura:"🎭"
  };

  const rep = reportes.filter(r => dentroDeRango(r.created_at, rangoDias));
  const acc = acciones.filter(a => dentroDeRango(a.created_at, rangoDias));

  // REPORTE CIUDADANO
  rep.forEach(r => {
    const icon = L.divIcon({
      className:"emoji-marker",
      html:`<span>${iconosCiudadano[r.categoria] || "📍"}</span>`
    });

    const capa = r.estado === "solucionado" ? layerReportesSol : layerReportesPend;

    const popup = `
      <b>${(r.categoria || "").toUpperCase()}</b><br>
      Barrio: ${r.barrio || "N/D"}<br>
      Estado: <b>${r.estado}</b><br>
      ${r.detalle || ""}
      ${r.fotos_url?.length ? `<br><button class="popup-fotos-btn">Ver fotos (${r.fotos_url.length})</button>` : ""}
    `;

    const marker = L.marker([r.lat, r.lng], {icon}).addTo(capa).bindPopup(popup);

    if (r.fotos_url?.length) {
      marker.on("popupopen", e => {
        const el = e.popup.getElement();
        const btn = el.querySelector(".popup-fotos-btn");
        if (btn) {
          btn.onclick = () => openFotoViewer(r.fotos_url);
        }
      });
    }
  });

  // ACCIONES MUNICIPALES
  acc.forEach(a => {
    const icon = L.divIcon({
      className:"emoji-marker",
      html:`<span>${iconosAccion[a.categoria] || "🏛️"}</span>`
    });

    const popup = `
      <b>${a.titulo || "Acción municipal"}</b><br>
      ${a.detalle || ""}
      ${a.observacion ? `<br><i>${a.observacion}</i>` : ""}
      ${a.fotos_url?.length ? `<br><button class="popup-fotos-btn">Ver fotos (${a.fotos_url.length})</button>` : ""}
    `;

    const marker = L.marker([a.lat, a.lng], {icon})
      .addTo(layerAcciones)
      .bindPopup(popup);

    if (a.fotos_url?.length) {
      marker.on("popupopen", e => {
        const el = e.popup.getElement();
        const btn = el.querySelector(".popup-fotos-btn");
        if (btn) btn.onclick = () => openFotoViewer(a.fotos_url);
      });
    }
  });
}

// ----------------------
// FORMULARIO
// ----------------------
function actualizarResumen(){
  const nombre  = document.getElementById("nombre").value.trim();
  const celular = document.getElementById("celular").value.trim();
  const barrio  = document.getElementById("barrio").value.trim();
  const resumen = document.getElementById("resumenReporte");
  const sendBtn = document.getElementById("sendReporte");

  if (categoriaReporte && nombre && celular && barrio && fotos.length > 0 && puntoSeleccionado) {
    resumen.style.display = "block";
    resumen.innerHTML = `
      <b>Revisá tu reporte:</b><br/>
      Tipo: ${categoriaReporte.toUpperCase()}<br/>
      Nombre: ${nombre}<br/>
      Celular: ${celular}<br/>
      Barrio: ${barrio}<br/>
      Fotos: ${fotos.length}
    `;
    sendBtn.style.display = "inline-block";
  } else {
    resumen.style.display = "none";
    sendBtn.style.display = "none";
  }
}

function bindFormulario(){
  const btnReportar = document.getElementById("btnReportar");
  const btnAcciones = document.getElementById("btnAccionesMunicipales");
  const selectRango = document.getElementById("rangoDias");
  const form = document.getElementById("formReporte");

  // rango días
  selectRango.onchange = () => {
    rangoDias = parseInt(selectRango.value);
    renderMapa();
  };

  // botón reportar → verificar pin
  btnReportar.onclick = () => {
    if (!puntoSeleccionado) {
      abrirModal(`
        <h2>Primero ubicá el problema</h2>
        <p>Tocá el mapa para marcar el lugar exacto.</p>
        <button class="modal-btn" onclick="document.getElementById('modalAsu').classList.remove('open')">Entendido</button>
      `);
      return;
    }

    form.style.display = "block";
  };

  // ACCIONES MUNICIPALES
  btnAcciones.onclick = () => {
    const primeras = acciones.slice(0, 5);

    const lista = primeras.map(a => `
      <div>
        <b>${a.titulo || a.categoria}</b><br>
        <small>${new Date(a.created_at).toLocaleString("es-PY")}</small>
      </div>
    `).join("");

    abrirModal(`
      <h2>Acciones municipales recientes</h2>
      <div class="acciones-list">${lista}</div>

      <button class="modal-btn"
        onclick="window.location.href='ciudad.html?tab=acciones'">
        Ver más
      </button>

      <button class="modal-btn-secondary"
        onclick="document.getElementById('modalAsu').classList.remove('open')">
        Cerrar
      </button>
    `);
  };

  // categorías
  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      categoriaReporte = btn.dataset.cat;
      actualizarResumen();
    };
  });

  // inputs
  ["nombre","celular","barrio","detalle"].forEach(id => {
    document.getElementById(id).oninput = actualizarResumen;
  });

  // FOTO
  const takePhotoBtn = document.getElementById("takePhoto");
  const video        = document.getElementById("camera");
  const canvas       = document.getElementById("canvas");
  const fotosCont    = document.getElementById("fotosContainer");

  takePhotoBtn.onclick = async () => {
    if (fotos.length >= 5) return alert("Máx. 5 fotos.");
    try {
      video.style.display = "block";
      videoStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
      video.srcObject = videoStream;
    } catch(e){
      alert("No se pudo acceder a la cámara");
      video.style.display = "none";
    }
  };

  video.onclick = () => {
    if (!videoStream) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video,0,0);

    canvas.toBlob(blob =>{
      if (!blob) return;
      fotos.push(blob);
      renderFotos();
      stopVideo();
      actualizarResumen();
    }, "image/jpeg", 0.85);
  };

  function renderFotos(){
    fotosCont.innerHTML = "";
    fotos.forEach((blob, idx) => {
      const url = URL.createObjectURL(blob);
      const d = document.createElement("div");
      d.className = "foto-thumb";
      d.innerHTML = `
        <img src="${url}" />
        <div class="remove-photo">×</div>
      `;
      d.querySelector(".remove-photo").onclick = () => {
        fotos.splice(idx,1);
        renderFotos();
        actualizarResumen();
      };
      d.querySelector("img").onclick = () => openFotoViewer([url]);
      fotosCont.appendChild(d);
    });
  }

  function stopVideo(){
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    video.style.display = "none";
  }

  // CANCELAR REPORTE
  document.getElementById("cancelReporte").onclick = () => {
    form.style.display = "none";
    fotos = [];
    document.getElementById("fotosContainer").innerHTML = "";
    categoriaReporte = null;
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("resumenReporte").style.display = "none";
    document.getElementById("sendReporte").style.display = "none";

    ["nombre","celular","barrio","detalle"].forEach(id => {
      document.getElementById(id).value = "";
    });

    stopVideo();
  };

  // ENVIAR REPORTE
  document.getElementById("sendReporte").onclick = async () => {
    const nombre  = document.getElementById("nombre").value.trim();
    const celular = document.getElementById("celular").value.trim();
    const barrio  = document.getElementById("barrio").value.trim();
    const detalle = document.getElementById("detalle").value.trim();

    if (!puntoSeleccionado) return alert("Tocá el mapa para ubicar.");
    if (!categoriaReporte || !nombre || !celular || !barrio || fotos.length === 0)
      return alert("Completá los datos y una foto.");

    const sendBtn = document.getElementById("sendReporte");
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando...";

    // subir fotos
    const urls = [];
    for (let i=0; i<fotos.length; i++){
      const name = `foto_${Date.now()}_${i}.jpg`;
      const { error:upErr } = await supabase
        .storage.from("fotos")
        .upload(name, fotos[i], { contentType:"image/jpeg", upsert:false });

      if (upErr) continue;

      const { data:pub } = supabase.storage.from("fotos").getPublicUrl(name);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }

    if (!urls.length) {
      alert("Falló la subida de fotos.");
      sendBtn.disabled = false;
      sendBtn.textContent = "Enviar reporte";
      return;
    }

    let departamento_id = 1;
    if (categoriaReporte === "basura") departamento_id = 2;
    else if (categoriaReporte === "arbol_caido") departamento_id = 3;
    else if (categoriaReporte === "cano_roto") departamento_id = 4;

    const payload = {
      lat:puntoSeleccionado.lat,
      lng:puntoSeleccionado.lng,
      categoria:categoriaReporte,
      detalle:detalle || null,
      nombre, celular, barrio,
      fotos_url:urls,
      estado:"pendiente",
      departamento_id
    };

    await supabase.from("reportes").insert(payload);

    alert("¡Gracias! Tu reporte fue enviado.");
    form.style.display = "none";
    fotos = [];
    document.getElementById("fotosContainer").innerHTML = "";
    categoriaReporte = null;
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("resumenReporte").style.display = "none";
    document.getElementById("sendReporte").style.display = "none";

    ["nombre","celular","barrio","detalle"].forEach(id => {
      document.getElementById(id).value = "";
    });

    await cargarReportes();
    renderMapa();

    sendBtn.disabled = false;
    sendBtn.textContent = "Enviar reporte";
  };
}

// ----------------------
// INIT GLOBAL
// ----------------------
(async () => {
  initMap();
  await Promise.all([cargarReportes(), cargarAcciones()]);
  renderMapa();
  bindFormulario();
  initFotoModal();

  supabase.channel("reportes")
    .on("postgres_changes",{event:"*",schema:"public",table:"reportes"}, async () => {
      await cargarReportes();
      renderMapa();
    }).subscribe();

  supabase.channel("acciones_municipales")
    .on("postgres_changes",{event:"*",schema:"public",table:"acciones_municipales"}, async () => {
      await cargarAcciones();
      renderMapa();
    }).subscribe();
})();
