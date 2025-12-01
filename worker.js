// =====================================================
// UTILIDADES BASE64
// =====================================================
const enc = new TextEncoder();
function strToBuf(str) { return enc.encode(str); }

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64str) {
  const binary = atob(b64str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// =====================================================
// PBKDF2 – 100.000 iteraciones (Cloudflare OK)
// =====================================================
async function hashPassword(password, saltBase64) {
  const salt = saltBase64 ? b64ToBuf(saltBase64)
                          : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    strToBuf(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return {
    salt: b64(salt),
    hash: b64(derivedBits)
  };
}

// =====================================================
// JWT HS256 URL-SAFE
// =====================================================
async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const hB64 = btoa(JSON.stringify(header))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const pB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

  const unsigned = `${hB64}.${pB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    strToBuf(secret),
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, strToBuf(unsigned));
  let sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  sigB64 = sigB64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');

  return `${unsigned}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token inválido");

  const [h, p, s] = parts;

  let sigNormal = s.replace(/-/g,'+').replace(/_/g,'/');
  while (sigNormal.length % 4) sigNormal += "=";

  const unsigned = `${h}.${p}`;

  const key = await crypto.subtle.importKey(
    "raw",
    strToBuf(secret),
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(atob(sigNormal), c => c.charCodeAt(0));

  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, strToBuf(unsigned));
  if (!ok) throw new Error("Token inválido");

  let payloadNormal = p.replace(/-/g,'+').replace(/_/g,'/');
  while (payloadNormal.length % 4) payloadNormal += "=";

  return JSON.parse(atob(payloadNormal));
}

// =====================================================
// RESPUESTAS
// =====================================================
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// =====================================================
// SUPABASE SERVICE-ROLE
// =====================================================
async function sFetch(env, path, options = {}) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      ...(options.headers || {})
    }
  });
}

async function getDeptoId(env, slug) {
  const r = await sFetch(env, `/rest/v1/departamentos?slug=eq.${slug}`);
  const j = await r.json();
  return j[0]?.id;
}

// =====================================================
// LOGIN
// =====================================================
async function login(request, env) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return error("Faltan datos");

    const r = await sFetch(env, `/rest/v1/usuarios_municipales?email=eq.${email}`);
    const rows = await r.json();
    if (!rows.length) return error("Usuario no encontrado", 404);

    const u = rows[0];
    if (!u.salt || !u.password_hash)
      return error("Usuario sin contraseña", 403);

    const computed = await hashPassword(password, u.salt);
    if (computed.hash !== u.password_hash)
      return error("Contraseña incorrecta", 403);

    const token = await signJWT({
      id: u.id,
      email: u.email,
      rol: u.rol,
      departamento: u.departamento,
      exp: Math.floor(Date.now()/1000) + 60*60*8
    }, env.JWT_SECRET);

    return json({
      token,
      rol: u.rol,
      departamento: u.departamento
    });

  } catch (e) {
    return error(`Error en login: ${e.message}`, 500);
  }
}

// =====================================================
// AUTH MIDDLEWARE
// =====================================================
async function auth(request, env, handler) {
  const h = request.headers.get("Authorization");
  if (!h) return error("Sin token", 401);

  try {
    const token = h.replace("Bearer ", "");
    const payload = await verifyJWT(token, env.JWT_SECRET);

    if (payload.exp < Math.floor(Date.now()/1000))
      return error("Token expirado", 403);

    return handler(request, env, payload);
  } catch (e) {
    return error(e.message, 403);
  }
}

// =====================================================
// LISTAR REPORTES
// =====================================================
async function listarReportes(request, env, user) {
  let query = "/rest/v1/reportes?select=*";

  if (user.rol === "operador") {
    const depId = await getDeptoId(env, user.departamento);
    query += `&departamento_id=eq.${depId}`;
  }

  // operador_jefe, superadmin, intendente ven todos los reportes
  const r = await sFetch(env, query);
  return json({ data: await r.json() });
}

// =====================================================
// MARCAR SOLUCIONADO
// =====================================================
async function marcarSolucionado(request, env, user) {
  if (user.rol === "intendente")
    return error("Intendente no puede modificar", 403);

  const { id } = await request.json();
  if (!id) return error("ID faltante");

  const r = await sFetch(env, `/rest/v1/reportes?id=eq.${id}&select=departamento_id`);
  const rows = await r.json();
  if (!rows.length) return error("Reporte no encontrado", 404);

  const repDept = rows[0].departamento_id;
  const usrDept = await getDeptoId(env, user.departamento);

  if (user.rol === "operador" && repDept !== usrDept)
    return error("No permitido", 403);

  // operador_jefe y superadmin pueden marcar cualquier reporte
  await sFetch(env, `/rest/v1/reportes?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      estado: "solucionado",
      resuelto_por: user.email,
      resuelto_at: new Date().toISOString()
    })
  });

  return json({ success: true });
}

// =====================================================
// REASIGNAR REPORTE
// =====================================================
async function reasignarReporte(request, env, user) {
  // operador_jefe y superadmin pueden reasignar
  if (user.rol !== "superadmin" && user.rol !== "operador_jefe")
    return error("Solo superadmin u operador_jefe", 403);

  const { id, nuevo_departamento } = await request.json();
  if (!id || !nuevo_departamento) return error("Datos faltantes");

  const depId = await getDeptoId(env, nuevo_departamento);
  if (!depId) return error("Departamento inválido");

  await sFetch(env, `/rest/v1/reportes?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ departamento_id: depId })
  });

  return json({ success: true });
}

// =====================================================
// ESTADISTICAS
// =====================================================
async function estadisticas(request, env, user) {
  const r = await sFetch(env, "/rest/v1/reportes?select=*");
  const data = await r.json();

  const total = data.length;
  const pendientes = data.filter(r=>r.estado!=="solucionado").length;
  const solucionados = data.filter(r=>r.estado==="solucionado").length;

  const resueltos = data.filter(r=>r.resuelto_at);
  let promedio = null;

  if (resueltos.length > 0) {
    const totalMs = resueltos.reduce(
      (acc,r)=>acc+(new Date(r.resuelto_at)-new Date(r.created_at)),0
    );
    promedio = totalMs / resueltos.length / 3600000;
  }

  return json({
    total,
    pendientes,
    solucionados,
    promedio_horas_resolucion: promedio
  });
}

// =====================================================
// TRACKING OPERADORES (últimos 30 días)
// =====================================================
function toRad(g) { return g*Math.PI/180; }
function distHaversine(lat1,lng1,lat2,lng2) {
  const R=6371000;
  const dLat=toRad(lat2-lat1);
  const dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

async function trackingOperadoresHoy(request, env, user) {
  const inicio = new Date();
  inicio.setDate(inicio.getDate()-30);
  inicio.setHours(0,0,0,0);
  const inicioISO = inicio.toISOString();

  let query =
    `/rest/v1/acciones_municipales?select=id,lat,lng,departamento_id,` +
    `creado_por_nombre,creado_por_identificador,created_at` +
    `&created_at=gte.${inicioISO}`;

  if (user.rol === "operador") {
    const depId = await getDeptoId(env, user.departamento);
    query += `&departamento_id=eq.${depId}`;
  }

  const r = await sFetch(env, query);
  const rows = await r.json();
  if (!rows.length) return json({ data: [] });

  const agrupado = {};
  for (const a of rows) {
    const key = a.creado_por_identificador || a.creado_por_nombre || "SIN_ID";

    if (!agrupado[key]) {
      agrupado[key] = {
        operador_nombre: a.creado_por_nombre || "",
        operador_identificador: a.creado_por_identificador || null,
        departamento_id: a.departamento_id || null,
        puntos: []
      };
    }

    if (typeof a.lat==="number" && typeof a.lng==="number")
      agrupado[key].puntos.push({lat:a.lat,lng:a.lng,created_at:a.created_at});
  }

  const tracks=[];
  for (const key of Object.keys(agrupado)) {
    const item = agrupado[key];
    if (!item.puntos.length) continue;

    item.puntos.sort((p1,p2)=>new Date(p1.created_at)-new Date(p2.created_at));

    let dist=0;
    for (let i=1;i<item.puntos.length;i++)
      dist += distHaversine(
        item.puntos[i-1].lat, item.puntos[i-1].lng,
        item.puntos[i].lat, item.puntos[i].lng
      );

    const first = new Date(item.puntos[0].created_at);
    const last  = new Date(item.puntos[item.puntos.length-1].created_at);
    const mins = (last-first)/60000;

    tracks.push({
      operador_nombre: item.operador_nombre,
      operador_identificador: item.operador_identificador,
      departamento_id: item.departamento_id,
      acciones_count: item.puntos.length,
      distancia_m: dist,
      tiempo_min: mins,
      inicio: first.toISOString(),
      fin: last.toISOString(),
      puntos: item.puntos
    });
  }

  return json({ data: tracks });
}

// =====================================================
// ESTADISTICAS OPERADOR JEFE (TODOS LOS DEPARTAMENTOS)
// =====================================================
async function estadisticasOperadorJefe(request, env, user) {
  if (user.rol !== "operador_jefe" && user.rol !== "superadmin")
    return error("No autorizado", 403);

  // operador_jefe ve TODOS los departamentos
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const hoyISO = hoy.toISOString();

  // 1) traer todos los operadores normales
  const opsRes = await sFetch(
    env,
    `/rest/v1/usuarios_municipales?rol=eq.operador&select=id,email,nombre,identificador_publico,departamento`
  );
  const operadores = await opsRes.json();

  // 2) traer todas las acciones de hoy
  const accRes = await sFetch(
    env,
    `/rest/v1/acciones_municipales?select=*,categoria,creado_por_id,creado_por_nombre,creado_por_identificador&created_at=gte.${hoyISO}`
  );
  const accionesHoy = await accRes.json();

  // 3) mapa operador → resumen
  const map = {};

  // inicializar usuarios operadores
  operadores.forEach(op => {
    map[op.id] = {
      id: op.id,
      nombre: op.nombre,
      email: op.email,
      departamento: op.departamento,
      identificador: op.identificador_publico,
      accionesHoy: 0,
      ultimaAccion: null
    };
  });

  // sumar acciones
  accionesHoy.forEach(a => {
    if (!a.creado_por_id) return;

    // Si el operador móvil no está en tabla usuarios, lo agregamos dinamicamente
    if (!map[a.creado_por_id]) {
      map[a.creado_por_id] = {
        id: a.creado_por_id,
        nombre: a.creado_por_nombre || "",
        email: "",
        departamento: null,
        identificador: a.creado_por_identificador,
        accionesHoy: 0,
        ultimaAccion: null
      };
    }

    map[a.creado_por_id].accionesHoy++;

    const f = new Date(a.created_at);
    if (!map[a.creado_por_id].ultimaAccion || f > map[a.creado_por_id].ultimaAccion)
      map[a.creado_por_id].ultimaAccion = f;
  });

  const lista = Object.values(map);

  // 4) KPIs
  const KPIs = {
    totalOperadores: operadores.length,
    operadoresActivos: lista.filter(o => o.accionesHoy > 0).length,
    operadoresInactivos: operadores.length - lista.filter(o => o.accionesHoy > 0).length,
    accionesHoy: accionesHoy.length
  };

  return json({
    success: true,
    operadores: lista,
    kpis: KPIs
  });
}


// =====================================================
// ESTADISTICAS GLOBAL SUPERADMIN
// =====================================================
async function estadisticasGlobalesSuperadmin(request, env, user) {
  if (user.rol !== "superadmin")
    return error("Solo superadmin", 403);

  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const hoyISO = hoy.toISOString();

  const siete = new Date();
  siete.setDate(siete.getDate()-6);
  siete.setHours(0,0,0,0);
  const sieteISO = siete.toISOString();

  const repRes = await sFetch(env, "/rest/v1/reportes?select=*");
  const reportes = await repRes.json();

  const total = reportes.length;
  const pendientes = reportes.filter(r=>r.estado!=="solucionado").length;
  const solucionados = reportes.filter(r=>r.estado==="solucionado").length;

  const resueltos = reportes.filter(r=>r.resuelto_at);
  let tiempoPromedio = null;

  if (resueltos.length > 0) {
    const totalMs = resueltos.reduce(
      (acc,r)=>acc+(new Date(r.resuelto_at)-new Date(r.created_at)),0
    );
    tiempoPromedio = totalMs / resueltos.length / 3600000;
  }

  const accRes = await sFetch(env, "/rest/v1/acciones_municipales?select=*");
  const acciones = await accRes.json();

  const reportesHoy = reportes.filter(r=>r.created_at>=hoyISO).length;
  const accionesHoy = acciones.filter(a=>a.created_at>=hoyISO).length;

  const deptRes = await sFetch(env, "/rest/v1/departamentos?select=*");
  const deptos = await deptRes.json();

  const rankingDeptos = deptos.map(d => {
    const reps = reportes.filter(r=>r.departamento_id===d.id);
    const solved = reps.filter(r=>r.estado==="solucionado").length;
    return {
      id: d.id,
      nombre: d.nombre,
      slug: d.slug,
      totalReportes: reps.length,
      solucionados: solved,
      pendientes: reps.length - solved,
      porcentaje: reps.length ? Math.round((solved/reps.length)*100) : 0
    };
  }).sort((a,b)=>b.totalReportes - a.totalReportes);

  const userRes = await sFetch(
    env,
    "/rest/v1/usuarios_municipales?select=id,email,nombre,identificador_publico,rol"
  );
  const usuarios = await userRes.json();
  const operadores = usuarios.filter(u=>u.rol==="operador");

  const rankingOperadores = operadores.map(op => {
    const accTot = acciones.filter(a=>a.creado_por_id===op.id).length;
    const accHoy = acciones.filter(a=>a.creado_por_id===op.id && a.created_at>=hoyISO).length;
    const resOp = reportes.filter(r=>r.resuelto_por===op.email).length;

    return {
      id: op.id,
      nombre: op.nombre,
      email: op.email,
      identificador: op.identificador_publico,
      accionesTotales: accTot,
      accionesHoy: accHoy,
      reportesResueltos: resOp
    };
  }).sort((a,b)=>b.accionesTotales - a.accionesTotales);

  const mapCats = {};
  reportes.forEach(r=>{
    if (!r.categoria) return;
    if (!mapCats[r.categoria]) mapCats[r.categoria]=0;
    mapCats[r.categoria]++;
  });
  const categorias = Object.entries(mapCats)
    .map(([c,n])=>({categoria:c,cantidad:n}))
    .sort((a,b)=>b.cantidad-a.cantidad);

  const dias = {};
  for (let i=0;i<7;i++){
    const d = new Date(siete);
    d.setDate(d.getDate()+i);
    const key = d.toISOString().slice(0,10);
    dias[key] = {fecha:key, reportes:0, acciones:0};
  }

  reportes.forEach(r=>{
    const f = r.created_at?.slice(0,10);
    if (f && dias[f]) dias[f].reportes++;
  });
  acciones.forEach(a=>{
    const f = a.created_at?.slice(0,10);
    if (f && dias[f]) dias[f].acciones++;
  });

  const curva7 = Object.values(dias);

  const mapa = {
    reportes: reportes.map(r=>({
      id:r.id, lat:r.lat, lng:r.lng, estado:r.estado, categoria:r.categoria
    })),
    acciones: acciones.map(a=>({
      id:a.id, lat:a.lat, lng:a.lng,
      titulo:a.titulo, detalle:a.detalle, created_at:a.created_at
    }))
  };

  return json({
    success:true,
    totales: { total, pendientes, solucionados, tiempoPromedio },
    hoy: { reportesHoy, accionesHoy },
    rankingDeptos,
    rankingOperadores,
    categorias,
    curva7dias: curva7,
    mapa
  });
}

// =====================================================
// ROUTER
// =====================================================
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const m = request.method;

      if (m==="OPTIONS") {
        return new Response(null, {
          status:204,
          headers:{
            "Access-Control-Allow-Origin":"*",
            "Access-Control-Allow-Methods":"GET, POST, PATCH, OPTIONS",
            "Access-Control-Allow-Headers":"Content-Type, Authorization",
            "Access-Control-Max-Age":"86400"
          }
        });
      }

      if (url.pathname==="/" && m==="GET")
        return json({ message:"API Municipal funcionando", version:"1.0.0" });

      if (url.pathname==="/login" && m==="POST") return login(request, env);
      if (url.pathname==="/login" && m==="GET")
        return json({endpoint:"/login",method:"POST"});

      if (url.pathname==="/listarReportes" && m==="GET")
        return auth(request, env, listarReportes);

      if (url.pathname==="/marcarSolucionado" && m==="POST")
        return auth(request, env, marcarSolucionado);

      if (url.pathname==="/reasignarReporte" && m==="POST")
        return auth(request, env, reasignarReporte);

      if (url.pathname==="/estadisticas" && m==="GET")
        return auth(request, env, estadisticas);

      if (url.pathname==="/trackingOperadoresHoy" && m==="GET")
        return auth(request, env, trackingOperadoresHoy);

      if (url.pathname==="/estadisticasOperadorJefe" && m==="GET")
        return auth(request, env, estadisticasOperadorJefe);

      if (url.pathname==="/estadisticasGlobalesSuperadmin" && m==="GET")
        return auth(request, env, estadisticasGlobalesSuperadmin);

      return error(`Ruta no encontrada: ${m} ${url.pathname}`, 404);

    } catch(e) {
      return error(`Error interno: ${e.message}`, 500);
    }
  }
};