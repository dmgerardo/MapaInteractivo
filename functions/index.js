// Agente "eventos geológicos": puebla /capas/eventosGeologicos y
// /eventos/eventosGeologicos con sismos recientes. Ver AGENTS.md sección 8/9.
// (redeploy forzado tras corregir permisos de la cuenta de servicio)
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { logger } = require('firebase-functions');

initializeApp();

const CAPA_ID = 'eventosGeologicos';
const CONFIG_DEFAULT = { diasHaciaAtras: 7, magnitudMinima: 4.5 };

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
  }

  logger.info(`Escritos ${totalEscritos} eventos en /eventos/${CAPA_ID}`);
}

// Búsqueda best-effort de una noticia relacionada al lugar del sismo (Google News RSS,
// sin API key). Si falla o no encuentra nada, quien llama usa la página del USGS como
// respaldo — nunca deja el evento sin fuente.
async function buscarNoticia(lugar) {
  try {
    const consulta = encodeURIComponent(`sismo ${lugar}`);
    const respuesta = await fetch(`https://news.google.com/rss/search?q=${consulta}&hl=es-419&gl=MX&ceid=MX:es-419`);
    if (!respuesta.ok) return null;
    const xml = await respuesta.text();
    // El primer <link> del feed es el del canal; el segundo es el del primer artículo.
    const enlaces = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]);
    return enlaces[1] || null;
  } catch (error) {
    logger.warn(`Búsqueda de noticia falló para "${lugar}": ${error.message}`);
    return null;
  }
}

exports.actualizarEventosGeologicos = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Mexico_City', timeoutSeconds: 300 },
  actualizarEventosGeologicos,
);
