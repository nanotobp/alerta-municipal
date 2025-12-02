// ======================================================
//  OPERADOR MOVIL – VERSIÓN FINAL (multi-foto + ruta + push)
// ======================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL  = "https://wreqfthiuqwzusthjcjv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZXFmdGhpdXF3enVzdGhqY2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0MTI1NjUsImV4cCI6MjA3OTk4ODU2NX0.O9AaAi34paGxTc7ek5FTgouuTuh0J9c6hLAgik_EpWE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// -------------------------------------------
// AUTH FRONTEND (JWT obligatorio)
// -------------------------------------------
const TOKEN   = localStorage.getItem("asu_jwt");
const ROL     = localStorage.getItem("asu_rol");
const operador_email  = localStorage.getItem("asu_email");
const operador_nombre = operador_email?.split("@")[0] || "Operador";
const operador_ident  = localStorage.getItem("asu_identificador") || "brigada";
const operador_depart = localStorage.getItem("asu_departamento");

if (!TOKEN) {
  alert("Tu sesión venció o no es válida. Volvé a iniciar sesión en el panel.");
  window.location.href = "/admin/";
  throw new Error("Sin JWT");
}

// -------------------------------------------
// ESTADO
// -------------------------------------------
let categorias = [];
let categoriaSeleccionada = null;

let latActual = null;
let lngActual = null;

// fotos múltiples
let fotosFiles = [];

// tracking ruta
let mapPrev = null;
let markerPrev = null;
let layerOSM = null;
let layerSat = null;
let modoSatelite = false;
let routingControl = null;
let accuracyCircle = null;
let trackCoords = [];
let trackPolyline = null;

// brújula
let compassArrowEl = null;
let headingTextEl  = null;

// -------------------------------------------
// CARGAR CATEGORÍAS MUNICIPALES
// -------------------------------------------
async function cargarCategorias() {
  const { data, error } = await supabase
    .from("categorias_municipales")
    .select("id, nombre, slug, icono, color")
    .order("id");

  if (error) {
    console.warn("Error categorías:", error);
    return;
  }
  categorias = data || [];
  renderChipsCategorias();
}

function renderChipsCategorias() {
  const select = document.getElementById("selectCategoriaMovil");
  select.innerHTML = `<option value="">Seleccioná una categoría…</option>`;

  categorias.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.slug;
    opt.textContent = `${cat.icono} ${cat.nombre}`;
    select.appendChild(opt);
  });

  select.addEventListener("change", e => {
    categoriaSeleccionada = e.target.value || null;
  });
}

// -------------------------------------------
// DETECTAR REPORTE CERCANO (40m) – vía RPC
// -------------------------------------------
async function detectarReporteAsociado(lat, lng) {
  try {
    const { data, error } = await supabase
      .rpc("reportes_cercanos", { lat_in: lat, lng_in: lng, radio_metros: 40 });

    if (error) {
      console.warn("RPC reportes_cercanos error:", error);
      return null;
    }
    if (!data || !data.length) return null;
    return data[0].id;
  } catch (e) {
    console.warn("RPC reportes_cercanos ex:", e);
    return null;
  }
}

// -------------------------------------------
// MAPA Y GEOLOCALIZACIÓN
// -------------------------------------------
function initMapaPreview() {
  if (mapPrev) return;

  compassArrowEl = document.getElementById("compassArrow");
  headingTextEl  = document.getElementById("headingText");

  mapPrev = L.map("mapPreview", {
    center: [latActual || -25.28, lngActual || -57.63],
    zoom: 17,
    zoomControl: false
  });

  layerOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  });
  layerSat = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19 }
  );

  layerOSM.addTo(mapPrev);

  markerPrev = L.marker([latActual || -25.28, lngActual || -57.63], {
    draggable: true
  }).addTo(mapPrev);

  markerPrev.on("dragend", e => {
    const pos = e.target.getLatLng();
    latActual = pos.lat;
    lngActual = pos.lng;
  });

  mapPrev.on("click", e => {
    latActual = e.latlng.lat;
    lngActual = e.latlng.lng;
    markerPrev.setLatLng([latActual, lngActual]);
  });

  document.getElementById("btnRecentrar")?.addEventListener("click", () => {
    if (!latActual) return;
    mapPrev.flyTo([latActual, lngActual], 17);
    markerPrev.setLatLng([latActual, lngActual]);
  });

  const btnModo = document.getElementById("btnModoMapa");
  if (btnModo) {
    btnModo.addEventListener("click", () => {
      modoSatelite = !modoSatelite;
      if (modoSatelite) {
        if (mapPrev.hasLayer(layerOSM)) mapPrev.removeLayer(layerOSM);
        mapPrev.addLayer(layerSat);
        btnModo.textContent = "🗺️ Calle";
      } else {
        if (mapPrev.hasLayer(layerSat)) mapPrev.removeLayer(layerSat);
        mapPrev.addLayer(layerOSM);
        btnModo.textContent = "🛰️ Satélite";
      }
    });
  }

  const btnRuta = document.getElementById("btnRuta");
  if (btnRuta) {
    btnRuta.addEventListener("click", () => {
      if (!latActual || !lngActual) return;

      if (routingControl) {
        mapPrev.removeControl(routingControl);
        routingControl = null;
      }

      navigator.geolocation.getCurrentPosition(pos => {
        const latOp = pos.coords.latitude;
        const lngOp = pos.coords.longitude;

        routingControl = L.Routing.control({
          waypoints: [L.latLng(latOp, lngOp), L.latLng(latActual, lngActual)],
          lineOptions: {
            styles: [{ color: "#d32f2f", weight: 5 }]
          },
          addWaypoints: false,
          routeWhileDragging: false,
          show: false
        }).addTo(mapPrev);
      });
    });
  }

  trackPolyline = L.polyline([], {
    color: "#ef4444",
    weight: 3,
    opacity: 0.7
  }).addTo(mapPrev);
}

function actualizarMapaPreview(lat, lng, accuracy) {
  if (!mapPrev) return;

  markerPrev.setLatLng([lat, lng]);
  mapPrev.flyTo([lat, lng], 17);

  if (accuracy && !isNaN(accuracy)) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: "#3b82f6",
        weight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.15
      }).addTo(mapPrev);
    } else {
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(accuracy);
    }
  }

  trackCoords.push([lat, lng]);
  trackPolyline.setLatLngs(trackCoords);
}

function pedirUbicacion() {
  const gpsEl = document.getElementById("estadoGps");

  navigator.geolocation.watchPosition(
    pos => {
      latActual = pos.coords.latitude;
      lngActual = pos.coords.longitude;

      if (gpsEl) {
        gpsEl.textContent = `📍 ${latActual.toFixed(5)}, ${lngActual.toFixed(5)} · ±${Math.round(pos.coords.accuracy)}m`;
      }

      if (!mapPrev) {
        setTimeout(() => {
          initMapaPreview();
          actualizarMapaPreview(latActual, lngActual, pos.coords.accuracy);
        }, 300);
      } else {
        actualizarMapaPreview(latActual, lngActual, pos.coords.accuracy);
      }

      if (typeof pos.coords.heading === "number") {
        actualizarBrujula(pos.coords.heading);
      }
    },
    err => {
      console.warn("GPS error", err);
      if (gpsEl) {
        gpsEl.textContent = "⚠ No se pudo obtener la ubicación precisa.";
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  );

  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", ev => {
      if (typeof ev.alpha === "number") {
        actualizarBrujula(ev.alpha);
      }
    });
  }
}

function actualizarBrujula(grados) {
  if (!compassArrowEl || !headingTextEl) return;
  compassArrowEl.style.transform = `rotate(${grados}deg)`;
  headingTextEl.textContent = `${Math.round(grados)}°`;
}

// -------------------------------------------
// FOTOS MÚLTIPLES
// -------------------------------------------
function bindFotos() {
  const input = document.getElementById("fotoAccion");
  const cont  = document.getElementById("previewFotos");

  if (!input || !cont) return;

  input.addEventListener("change", e => {
    const files = Array.from(e.target.files || []);

    let total = 0;
    files.forEach(f => total += f.size);
    if (total > 5 * 1024 * 1024) {
      alert("El peso total de las fotos no puede superar 5MB.");
      input.value = "";
      fotosFiles = [];
      cont.innerHTML = "";
      return;
    }

    if (files.length > 5) {
      alert("Podés subir hasta 5 fotos.");
      input.value = "";
      fotosFiles = [];
      cont.innerHTML = "";
      return;
    }

    fotosFiles = files;
    renderPreviewFotos(cont);
  });
}

function renderPreviewFotos(cont) {
  cont.innerHTML = "";
  fotosFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement("div");
    div.className = "foto-thumb";

    div.innerHTML = `
      <img src="${url}" alt="Foto acción">
      <div class="remove-photo">×</div>
    `;

    div.querySelector(".remove-photo").addEventListener("click", () => {
      fotosFiles.splice(idx, 1);
      renderPreviewFotos(cont);
    });

    cont.appendChild(div);
  });
}

// -------------------------------------------
// SUBIR FOTOS (array) A SUPABASE STORAGE
// -------------------------------------------
async function subirMultiplesFotos(files) {
  if (!files || !files.length) return [];

  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = `accion_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.jpg`;

    const { error } = await supabase.storage
      .from("fotos_acciones")
      .upload(fileName, file, {
        contentType: "image/jpeg",
        upsert: false
      });

    if (error) {
      console.error("Upload error", error);
      continue;
    }

    urls.push(`${SUPABASE_URL}/storage/v1/object/public/fotos_acciones/${fileName}`);
  }
  return urls;
}

// -------------------------------------------
// NOTIFICACIONES PUSH (Web Notification)
// -------------------------------------------
async function notificarAccion(titulo, cuerpo) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(titulo, { body: cuerpo });
    return;
  }

  if (Notification.permission === "default") {
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        new Notification(titulo, { body: cuerpo });
      }
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }
}

// -------------------------------------------
// GUARDAR ACCIÓN – VÍA WORKER
// -------------------------------------------
async function guardarAccion() {
  const titulo      = document.getElementById("tituloAccion").value.trim();
  const detalle     = document.getElementById("detalleAccion").value.trim();
  const observacion = document.getElementById("observacionAccion").value.trim();
  const socialUrl   = document.getElementById("socialAccion").value.trim();

  if (!categoriaSeleccionada) {
    alert("Seleccioná tu departamento/categoría.");
    return;
  }
  if (!titulo) {
    alert("Ingresá un título para la acción.");
    return;
  }
  if (!latActual || !lngActual) {
    alert("Sin ubicación GPS. Esperá a que se obtenga la posición.");
    return;
  }
  if (!operador_depart) {
    alert("Error: el operador no tiene departamento asignado.");
    return;
  }

  const btn = document.getElementById("btnGuardarAccion");
  btn.disabled = true;
  btn.textContent = "Registrando...";

  try {
    // subir fotos si las hay
    let fotos_url = [];
    if (fotosFiles.length) {
      fotos_url = await subirMultiplesFotos(fotosFiles);
    }

    // asociar a reporte cercano (si existe)
    const reporte_id = await detectarReporteAsociado(latActual, lngActual);

    const payload = {
      categoria: categoriaSeleccionada,        // slug municipal
      titulo,
      detalle,
      observacion,
      social_url: socialUrl || null,
      fotos_url,
      lat: latActual,
      lng: lngActual,
      ruta_coords: trackCoords,               // para polyline en panel operador
      departamento_id: operador_depart,
      reporte_id,
      creado_por_email: operador_email,
      creado_por_nombre: operador_nombre,
      creado_por_identificador: operador_ident
    };

    const resp = await fetch("/registrarAccionMovil", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const out = await resp.json();
    if (!resp.ok || out.error) {
      console.error("Worker error:", out);
      alert("Error registrando la acción.");
      btn.disabled = false;
      btn.textContent = "Registrar acción";
      return;
    }

    await notificarAccion("Acción registrada", "La acción fue guardada correctamente.");
    alert("Acción registrada con éxito.");
    window.location.reload();

  } catch (e) {
    console.error(e);
    alert("Error inesperado registrando la acción.");
    btn.disabled = false;
    btn.textContent = "Registrar acción";
  }
}

// -------------------------------------------
// INIT
// -------------------------------------------
function initEventos() {
  const btn = document.getElementById("btnGuardarAccion");
  if (btn) {
    btn.addEventListener("click", guardarAccion);
  }
  bindFotos();
}

(async () => {
  await cargarCategorias();
  initEventos();
  pedirUbicacion();
})();

// -----------------------
// CÁMARA (igual que ciudadano, pero segura)
// -----------------------
let videoStreamOp = null;
const takeBtn   = document.getElementById("takePhotoOp");
const videoOp   = document.getElementById("cameraOp");
const canvasOp  = document.getElementById("canvasOp");
const contOp    = document.getElementById("previewFotos");

// Solo activamos la lógica de cámara si existen los elementos en el DOM
if (takeBtn && videoOp && canvasOp && contOp) {

  takeBtn.onclick = async () => {
    if (fotosFiles.length >= 5) {
      alert("Máx. 5 fotos.");
      return;
    }

    try {
      videoOp.style.display = "block";
      videoStreamOp = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      videoOp.srcObject = videoStreamOp;
    } catch (e) {
      alert("No se pudo acceder a la cámara.");
      videoOp.style.display = "none";
    }
  };

  videoOp.onclick = () => {
    if (!videoStreamOp) return;

    canvasOp.width = videoOp.videoWidth;
    canvasOp.height = videoOp.videoHeight;

    const ctx = canvasOp.getContext("2d");
    ctx.drawImage(videoOp, 0, 0);

    canvasOp.toBlob(blob => {
      if (!blob) return;

      fotosFiles.push(blob);
      renderPreviewFotos(contOp);

      // apagar cámara
      videoStreamOp.getTracks().forEach(t => t.stop());
      videoStreamOp = null;
      videoOp.style.display = "none";
    }, "image/jpeg", 0.85);
  };
}
