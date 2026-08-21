// Agente "eventos geológicos": puebla /capas/eventosGeologicos y
// /eventos/eventosGeologicos con sismos recientes. Ver AGENTS.md sección 8/9.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { logger } = require('firebase-functions');

initializeApp();

const CAPA_ID = 'eventosGeologicos';
const CONFIG_DEFAULT = { diasHaciaAtras: 7, magnitudMinima: 5.5 };

async function actualizarEventosGeologicos() {
  const db = getDatabase();

  const configSnap = await db.ref(`config/${CAPA_ID}`).get();
  const config = configSnap.exists() ? { ...CONFIG_DEFAULT, ...configSnap.val() } : CONFIG_DEFAULT;
  if (!configSnap.exists()) {
    await db.ref(`config/${CAPA_ID}`).set(CONFIG_DEFAULT);
  }

  await db.ref(`capas/${CAPA_ID}`).update({
    nombre: 'Eventos geológicos',
    descripcion: 'Sismos recientes reportados por el USGS',
    color: '#ff9800',
    activa: true,
  });

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - config.diasHaciaAtras * 24 * 60 * 60 * 1000);

  const urlUsgs = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
  urlUsgs.searchParams.set('format', 'geojson');
  urlUsgs.searchParams.set('starttime', desde.toISOString());
  urlUsgs.searchParams.set('endtime', ahora.toISOString());
  urlUsgs.searchParams.set('minmagnitude', String(config.magnitudMinima));
  urlUsgs.searchParams.set('orderby', 'time');

  const respuesta = await fetch(urlUsgs);
  if (!respuesta.ok) throw new Error(`USGS respondió ${respuesta.status}`);
  const datos = await respuesta.json();

  logger.info(`USGS devolvió ${datos.features.length} sismos (>= M${config.magnitudMinima}, últimos ${config.diasHaciaAtras} días)`);

  const idsVigentes = new Set(datos.features.map((f) => f.id));
  const existentesSnap = await db.ref(`eventos/${CAPA_ID}`).get();
  const idsHuerfanos = Object.keys(existentesSnap.val() || {}).filter((id) => !idsVigentes.has(id));
  if (idsHuerfanos.length > 0) {
    // Sismos que salieron de la ventana de días o ya no cumplen la magnitud mínima
    // configurada — si no se borran, se quedan pintados en el mapa para siempre.
    const bajas = {};
    for (const id of idsHuerfanos) bajas[`eventos/${CAPA_ID}/${id}`] = null;
    await db.ref().update(bajas);
    logger.info(`Eliminados ${idsHuerfanos.length} eventos que salieron de la ventana/umbral configurado`);
  }

  // Procesar en lotes concurrentes (no uno por uno): con cientos de sismos, buscar la
  // noticia de cada uno en serie excede el timeout de la function antes de terminar.
  // Se escribe lote por lote para no perder lo ya resuelto si el proceso se corta.
  const TAMANO_LOTE = 10;
  let totalEscritos = 0;
  for (let i = 0; i < datos.features.length; i += TAMANO_LOTE) {
    const lote = datos.features.slice(i, i + TAMANO_LOTE);
    const actualizaciones = {};
    await Promise.all(lote.map(async (feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      const { mag, place, time, url: paginaUsgs, title } = feature.properties;
      const fuenteUrl = (await buscarNoticia(place)) || paginaUsgs;

      actualizaciones[`eventos/${CAPA_ID}/${feature.id}`] = {
        lat,
        lon,
        titulo: title || `M ${mag} - ${place}`,
        descripcion: `Magnitud ${mag} · ${place}`,
        categoria: 'sismo',
        fechaUTC: new Date(time).toISOString(),
        fuenteUrl,
        creadoUTC: new Date().toISOString(),
      };
    }));
    await db.ref().update(actualizaciones);
    totalEscritos += Object.keys(actualizaciones).length;
    if (i + TAMANO_LOTE < datos.features.length) await esperar(300); // no saturar Google News
  }

  logger.info(`Escritos ${totalEscritos} eventos en /eventos/${CAPA_ID}`);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Búsqueda best-effort de una noticia relacionada al lugar del sismo (Google News RSS,
// sin API key). Si falla o no encuentra nada, quien llama usa la página del USGS como
// respaldo — nunca deja el evento sin fuente.
async function buscarNoticia(lugar) {
  try {
    // El "place" de USGS suele venir como "62 km NNW of Ende, Indonesia" — buscar ese
    // texto literal casi nunca matchea una noticia real. Se busca solo el nombre del
    // lugar (lo que sigue al "of "), que sí es lo que usaría un titular de noticias.
    const lugarBusqueda = lugar.replace(/^[\d.]+\s*km\s+[NSEW]*\s*of\s+/i, '');
    const consulta = encodeURIComponent(`sismo ${lugarBusqueda}`);
    const respuesta = await fetch(`https://news.google.com/rss/search?q=${consulta}&hl=es-419&gl=MX&ceid=MX:es-419`);
    if (!respuesta.ok) return null;
    const xml = await respuesta.text();
    // No basta con tomar el segundo <link> del XML completo: <channel><image> también
    // trae uno antes del primer <item>. Hay que acotar la búsqueda al primer <item>.
    const primerItem = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!primerItem) return null;
    const link = primerItem[1].match(/<link>([^<]*)<\/link>/);
    return link ? link[1] : null;
  } catch (error) {
    logger.warn(`Búsqueda de noticia falló para "${lugar}": ${error.message}`);
    return null;
  }
}

exports.actualizarEventosGeologicos = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Mexico_City', timeoutSeconds: 300 },
  actualizarEventosGeologicos,
);

// Agente "riesgo operativo": la búsqueda de noticias la hace una sesión programada de
// Claude Code (con web search real, ver AGENTS.md sección 8.3), no esta función — esta
// función es solo el punto de escritura protegido, sigue el mismo principio que el
// resto del proyecto de que el Admin SDK solo se toca desde el backend. Ver
// AGENTS.md sección 8.3.
const RIESGO_INGEST_TOKEN = defineSecret('RIESGO_INGEST_TOKEN');

const METADATA_CAPAS_RIESGO = {
  riesgoOrdenPublico: {
    nombre: 'Orden público',
    descripcion: 'Protestas, bloqueos, huelgas e inestabilidad política',
    color: '#d32f2f',
    categoria: 'orden-publico',
  },
  riesgoSeguridad: {
    nombre: 'Seguridad',
    descripcion: 'Crimen organizado y extorsión a transportistas',
    color: '#6a1b9a',
    categoria: 'seguridad',
  },
  riesgoVialidad: {
    nombre: 'Vialidad',
    descripcion: 'Obras y cierres viales en corredores clave',
    color: '#f9a825',
    categoria: 'vialidad',
  },
  riesgoClima: {
    nombre: 'Clima extremo',
    descripcion: 'Fenómenos climáticos extremos con impacto operativo',
    color: '#0288d1',
    categoria: 'clima',
  },
  riesgoAduanas: {
    nombre: 'Aduanas y fronteras',
    descripcion: 'Cierres de frontera o aduana',
    color: '#00695c',
    categoria: 'aduanas',
  },
};

// Las claves de Realtime Database no pueden llevar . # $ [ ] / ni control chars — el
// slug lo arma el LLM que llama a este endpoint, pero se sanea también acá por si acaso.
function sanitizarId(id) {
  return String(id).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function validarEvento(evento) {
  return (
    evento &&
    typeof evento.id === 'string' && evento.id.trim() !== '' &&
    typeof evento.lat === 'number' && typeof evento.lon === 'number' &&
    typeof evento.titulo === 'string' && evento.titulo.trim() !== '' &&
    typeof evento.fechaUTC === 'string'
  );
}

async function ingerirRiesgoOperativoHandler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (token !== RIESGO_INGEST_TOKEN.value()) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const capasPayload = (req.body && req.body.capas) || {};
  const capaIdsDesconocidos = Object.keys(capasPayload).filter((id) => !METADATA_CAPAS_RIESGO[id]);
  if (capaIdsDesconocidos.length > 0) {
    res.status(400).json({ error: `capaId desconocido: ${capaIdsDesconocidos.join(', ')}` });
    return;
  }
  for (const [capaId, eventos] of Object.entries(capasPayload)) {
    if (!Array.isArray(eventos) || !eventos.every(validarEvento)) {
      res.status(400).json({ error: `eventos inválidos en ${capaId} (requiere id, lat, lon, titulo, fechaUTC)` });
      return;
    }
  }

  const db = getDatabase();
  const ahoraUTC = new Date().toISOString();
  const actualizaciones = {};
  const resumen = {};

  for (const [capaId, meta] of Object.entries(METADATA_CAPAS_RIESGO)) {
    const eventos = capasPayload[capaId] || [];

    actualizaciones[`capas/${capaId}`] = {
      nombre: meta.nombre,
      descripcion: meta.descripcion,
      color: meta.color,
      activa: true,
    };

    const idsVigentes = new Set();
    for (const evento of eventos) {
      const id = sanitizarId(evento.id);
      if (!id) continue;
      idsVigentes.add(id);
      actualizaciones[`eventos/${capaId}/${id}`] = {
        lat: evento.lat,
        lon: evento.lon,
        titulo: evento.titulo,
        descripcion: evento.descripcion || '',
        categoria: meta.categoria,
        nivelRiesgo: typeof evento.nivelRiesgo === 'number' ? evento.nivelRiesgo : null,
        fechaUTC: evento.fechaUTC,
        fuenteUrl: evento.fuenteUrl || null,
        creadoUTC: ahoraUTC,
      };
    }

    // Reemplazo completo por capa: lo que no vino en esta corrida ya no está activo
    // ("silencio = despejado", ver AGENTS.md sección 8.3) y se borra.
    const existentesSnap = await db.ref(`eventos/${capaId}`).get();
    const idsHuerfanos = Object.keys(existentesSnap.val() || {}).filter((id) => !idsVigentes.has(id));
    for (const id of idsHuerfanos) actualizaciones[`eventos/${capaId}/${id}`] = null;

    resumen[capaId] = { escritos: idsVigentes.size, borrados: idsHuerfanos.length };
  }

  await db.ref().update(actualizaciones);
  logger.info('Ingesta de riesgo operativo', resumen);
  res.status(200).json({ ok: true, resumen });
}

exports.ingerirRiesgoOperativo = onRequest(
  { secrets: [RIESGO_INGEST_TOKEN], timeoutSeconds: 60 },
  ingerirRiesgoOperativoHandler,
);
