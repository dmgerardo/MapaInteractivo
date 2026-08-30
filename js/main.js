// Monta el globo interactivo y lo alimenta de los nodos capas/eventos que van
// poblando los agentes de IA. Ver AGENTS.md sección 8 (Modelo de datos).
import { suscribir, consultarHistorico } from './db.js?v=12';
import { esc, urlSegura } from './utilidades.js?v=12';
import { ICONOS, ICONOS_EVENTO, ICONO_EVENTO_DEFAULT } from './iconos.js?v=12';
import { APP_VERSION } from './version.js?v=12';

const contenedor = document.getElementById('contenedor-globo');
const panelInfo = document.getElementById('panel-info');
const panelInfoContenido = document.getElementById('panel-info-contenido');
const botonCerrarPanel = document.getElementById('cerrar-panel-info');
const botonMenuCapas = document.getElementById('boton-menu-capas');
const listaCapas = document.getElementById('lista-capas');
const botonMenuVista = document.getElementById('boton-menu-vista');
const listaVistas = document.getElementById('lista-vistas');
const botonGiro = document.getElementById('boton-giro');
const panelGiro = document.getElementById('panel-giro');
const controlVelocidadGiro = document.getElementById('control-velocidad-giro');
const botonReporte = document.getElementById('boton-reporte');
const panelReporte = document.getElementById('panel-reporte');
const botonCerrarReporte = document.getElementById('cerrar-panel-reporte');
const listaReporte = document.getElementById('lista-reporte');
const botonHistorico = document.getElementById('boton-historico');
const panelHistorico = document.getElementById('panel-historico');
const inputHistoricoDesde = document.getElementById('historico-desde');
const inputHistoricoHasta = document.getElementById('historico-hasta');
const checkboxOcultarActuales = document.getElementById('ocultar-eventos-actuales');
const botonAplicarHistorico = document.getElementById('boton-aplicar-historico');
const estadoHistorico = document.getElementById('estado-historico');
const enlaceMantenimiento = document.getElementById('enlace-mantenimiento');
const botonVersion = document.getElementById('boton-version');
const marcaApp = document.getElementById('marca-app');

marcaApp.innerHTML = ICONOS.marca;
enlaceMantenimiento.innerHTML = ICONOS.ajustes;

botonVersion.textContent = `v${APP_VERSION}`;
botonVersion.addEventListener('click', () => window.location.reload());

botonCerrarPanel.innerHTML = ICONOS.cerrar;
botonCerrarPanel.addEventListener('click', () => panelInfo.classList.add('oculto'));

botonMenuCapas.innerHTML = ICONOS.capas;
botonMenuCapas.addEventListener('click', () => {
  const abierto = listaCapas.classList.toggle('oculto') === false;
  botonMenuCapas.setAttribute('aria-expanded', String(abierto));
});

botonMenuVista.innerHTML = ICONOS.mapa;
botonMenuVista.addEventListener('click', () => {
  const abierto = listaVistas.classList.toggle('oculto') === false;
  botonMenuVista.setAttribute('aria-expanded', String(abierto));
});

botonReporte.innerHTML = ICONOS.reporte;
botonCerrarReporte.innerHTML = ICONOS.cerrar;
botonHistorico.innerHTML = ICONOS.historico;

// Altitud de las etiquetas de fronteras: tiene que quedar por encima de la altitud
// más alta usada por los polígonos (ALTITUD_POLIGONO_ESTADOS_FRONTERAS, 0.016 — ver
// más abajo) o el texto queda "por debajo" de la superficie del país/estado y se ve
// cortado/tapado por sus paredes laterales (reportado 2026-08-22).
const ALTITUD_ETIQUETAS = 0.02;

const globo = Globe()(contenedor)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .htmlLat('lat')
  .htmlLng('lon')
  .htmlElement(crearMarcadorEvento)
  // Los eventos históricos se pintan más tenues (ver crearMarcadorEvento) mediante la
  // clase 'historico' — esta función solo alterna 0/visible↔invisible por hemisferio,
  // así que respeta esa opacidad base en vez de imponer 1 a secas (que la taparía).
  .htmlElementVisibilityModifier((el, esVisible) => {
    const opacidadBase = el.classList.contains('historico') ? 0.55 : 1;
    el.style.opacity = esVisible ? opacidadBase : 0;
  })
  .onZoom(alCambiarCamara)
  // Etiquetas de país/estado/ciudad del modo Fronteras (ver "Detalle por zoom" más
  // abajo) — accesores fijos, el contenido se actualiza con .labelsData() según el
  // nivel de zoom.
  .labelLat('lat')
  .labelLng('lon')
  .labelText('texto')
  .labelSize((d) => (d.nivel === 'pais' ? 0.45 : d.nivel === 'estado' ? 0.3 : 0.2))
  .labelColor((d) => colorEtiqueta(d.nivel))
  .labelDotRadius(0)
  .labelResolution(3)
  .labelAltitude(ALTITUD_ETIQUETAS);

// Centro de México (Zacatecas, aprox. geográfico del país) — el globo abre ahí en
// vez del (0,0) por defecto de globe.gl.
const CENTRO_MEXICO = { lat: 23.6345, lng: -102.5528 };
globo.pointOfView({ ...CENTRO_MEXICO, altitude: 2.5 });

// --- Giro automático ---------------------------------------------------------------
// globe.gl expone los controles de three.js/OrbitControls tal cual — autoRotate y
// autoRotateSpeed son propiedades de ese objeto, no hace falta estado propio ni
// librería nueva. Es preferencia de sesión (como capasOcultasPorUsuario), no se
// guarda en Firebase.

let girando = false;

function alternarGiro() {
  girando = !girando;
  globo.controls().autoRotate = girando;
  botonGiro.innerHTML = girando ? ICONOS.pausar : ICONOS.reproducir;
  botonGiro.classList.toggle('activo', girando);
  botonGiro.setAttribute('aria-expanded', String(girando));
  panelGiro.classList.toggle('oculto', !girando);
}

botonGiro.innerHTML = ICONOS.reproducir;
botonGiro.addEventListener('click', alternarGiro);

globo.controls().autoRotateSpeed = Number(controlVelocidadGiro.value);
controlVelocidadGiro.addEventListener('input', () => {
  globo.controls().autoRotateSpeed = Number(controlVelocidadGiro.value);
});

function ajustarTamano() {
  globo.width(contenedor.clientWidth).height(contenedor.clientHeight);
}
window.addEventListener('resize', ajustarTamano);
ajustarTamano();

const COLOR_CAPA_DEFAULT = '#4fc3f7';
const formateadorFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

// Estado local con la última foto de ambos nodos; se reconstruye el array de puntos
// completo en cada cambio de cualquiera de los dos (volumen esperado bajo: 10
// usuarios, unos pocos agentes) en vez de hacer merges incrementales.
let capas = {};
let eventosPorCapa = {};
let puntosActuales = [];

// --- Histórico de eventos (ver sección dedicada más abajo) e "ocultar actuales" —
// declarados acá porque repintarPuntos() y crearMarcadorEvento() ya los necesitan.
let historicoActivo = false;
let ocultarEventosActuales = false;
let puntosHistoricos = [];

// Celda de agrupación de marcadores (ver "Agrupar marcadores cercanos" más abajo) —
// declarada acá, no junto a las funciones que la usan, porque repintarPuntos() puede
// dispararse (vía suscribir()) antes de llegar a esa sección del archivo y celda*Actual
// debe existir ya inicializada en ese momento.
let celdaClusterActual = celdaClusterParaAltitud(2.5); // altitud inicial, ver CENTRO_MEXICO

// Capas que el usuario ocultó a mano desde el menú — se guarda lo OCULTO, no lo
// activo, para que una capa nueva aparezca visible por default sin tener que
// "activarla". Ver AGENTS.md sección 3 (convenciones de filtros).
const capasOcultasPorUsuario = new Set();

function capaVisible(capaId) {
  const capa = capas[capaId];
  if (capa && capa.activa === false) return false; // desactivada por el propio agente/dato
  return !capasOcultasPorUsuario.has(capaId);
}

// Radio (px) al que se despliegan los íconos individuales alrededor del círculo de
// conteo — ver crearMarcadorGrupo().
const RADIO_DESPLIEGUE_GRUPO = 34;

// Un grupo (ver "Agrupar marcadores cercanos" más abajo) no solo acerca la cámara al
// hacer clic: acercar nunca separa eventos que están genuinamente en el mismo lugar
// (o casi), así que el círculo con el conteo también se puede "abrir" para desplegar
// el ícono real de cada evento en abanico a su alrededor, cada uno clicable — es la
// única forma de llegar a un evento que tiene otro exactamente encima. El elemento
// raíz (`el`) es el mismo que devuelve globe.gl posicionado en lat/lon; los íconos
// desplegados son hijos posicionados con `transform` relativo a ese mismo punto, así
// que rotan/hacen zoom junto con el grupo sin cálculo de coordenadas propio.
function crearMarcadorGrupo(punto) {
  const el = document.createElement('div');
  el.className = 'marcador-grupo';

  const centro = document.createElement('div');
  centro.className = 'marcador-grupo-centro';
  centro.textContent = String(punto.grupo.length);
  centro.title = `${punto.grupo.length} eventos — clic para desplegar`;
  el.appendChild(centro);

  let desplegado = false;

  function colapsar() {
    desplegado = false;
    el.classList.remove('desplegado');
    el.querySelectorAll('.marcador-grupo-item').forEach((nodo) => nodo.remove());
  }

  function abrir() {
    desplegado = true;
    el.classList.add('desplegado');
    const total = punto.grupo.length;
    punto.grupo.forEach((evento, indice) => {
      const angulo = (2 * Math.PI * indice) / total - Math.PI / 2;
      const item = document.createElement('div');
      item.className = 'marcador-grupo-item';
      item.style.transform = `translate(${Math.cos(angulo) * RADIO_DESPLIEGUE_GRUPO}px, ${Math.sin(angulo) * RADIO_DESPLIEGUE_GRUPO}px)`;
      item.style.color = evento.color;
      item.innerHTML = ICONOS_EVENTO[evento.categoria] || ICONO_EVENTO_DEFAULT;
      item.title = evento.historico ? `${evento.titulo} (histórico)` : evento.titulo;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        mostrarPanelEvento(evento);
      });
      el.appendChild(item);
    });
  }

  centro.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (desplegado) colapsar(); else abrir();
  });

  return el;
}

// Un punto sin agrupar llega con sus campos normales; uno agrupado llega con
// `esGrupo: true` y `grupo` (el array de puntos que representa) — ver
// "Agrupar marcadores cercanos" más abajo.
function crearMarcadorEvento(punto) {
  if (punto.esGrupo) return crearMarcadorGrupo(punto);
  const el = document.createElement('div');
  el.className = `marcador-evento${punto.historico ? ' historico' : ''}`;
  el.style.color = punto.color;
  el.innerHTML = ICONOS_EVENTO[punto.categoria] || ICONO_EVENTO_DEFAULT;
  el.title = punto.historico ? `${punto.titulo} (histórico)` : punto.titulo;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    mostrarPanelEvento(punto);
  });
  return el;
}

function repintarPuntos() {
  const puntos = [];
  if (!ocultarEventosActuales) {
    for (const [capaId, eventos] of Object.entries(eventosPorCapa)) {
      if (!capaVisible(capaId)) continue;
      const capa = capas[capaId];
      const color = capa?.color || COLOR_CAPA_DEFAULT;
      for (const [eventoId, evento] of Object.entries(eventos || {})) {
        if (typeof evento?.lat !== 'number' || typeof evento?.lon !== 'number') continue;
        puntos.push({ ...evento, capaId, eventoId, color });
      }
    }
  }
  if (historicoActivo) {
    for (const punto of puntosHistoricos) {
      if (!capaVisible(punto.capaId)) continue;
      puntos.push(punto);
    }
  }
  puntosActuales = puntos;
  aplicarClusterAlGlobo();
  if (!panelReporte.classList.contains('oculto')) renderizarReporte();
}

function renderizarMenuCapas() {
  const idsCapas = Object.keys(capas);
  if (idsCapas.length === 0) {
    listaCapas.innerHTML = '<p class="meta">Sin capas todavía</p>';
    return;
  }
  listaCapas.innerHTML = '';
  for (const capaId of idsCapas) {
    const capa = capas[capaId];
    const visible = capaVisible(capaId);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-capa${visible ? '' : ' oculta'}`;
    chip.setAttribute('aria-pressed', String(visible));
    chip.innerHTML = `<span class="muestra-color" style="background:${esc(capa.color || COLOR_CAPA_DEFAULT)}"></span>${esc(capa.nombre || capaId)}`;
    chip.addEventListener('click', () => {
      if (capasOcultasPorUsuario.has(capaId)) {
        capasOcultasPorUsuario.delete(capaId);
      } else {
        capasOcultasPorUsuario.add(capaId);
      }
      renderizarMenuCapas();
      repintarPuntos();
    });
    listaCapas.appendChild(chip);
  }
}

function mostrarPanelEvento(punto) {
  const fuenteHref = punto.fuenteUrl ? urlSegura(punto.fuenteUrl) : null;
  const fotoHref = punto.fotoUrl ? urlSegura(punto.fotoUrl) : null;
  const fecha = punto.fechaUTC ? formateadorFecha.format(new Date(punto.fechaUTC)) : null;
  panelInfoContenido.innerHTML = `
    ${fotoHref ? `<img class="foto-evento" src="${esc(fotoHref)}" alt="" />` : ''}
    <h2>${esc(punto.titulo)}</h2>
    ${punto.categoria ? `<p class="meta">${esc(punto.categoria)}</p>` : ''}
    ${fecha ? `<p>${esc(fecha)}</p>` : ''}
    ${punto.descripcion ? `<p>${esc(punto.descripcion)}</p>` : ''}
    ${typeof punto.nivelRiesgo === 'number' ? `<p>Nivel de riesgo: ${esc(punto.nivelRiesgo)}</p>` : ''}
    ${fuenteHref ? `<p><a href="${esc(fuenteHref)}" target="_blank" rel="noopener noreferrer">Ver enlace</a></p>` : ''}
  `;
  panelInfo.classList.remove('oculto');
}

suscribir('capas', (datos) => {
  capas = datos || {};
  renderizarMenuCapas();
  repintarPuntos();
});

suscribir('eventos', (datos) => {
  eventosPorCapa = datos || {};
  repintarPuntos();
});

// --- Vista del mapa: satelital / satelital + fronteras / solo fronteras -----------

const URL_SATELITE = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const URL_TOPOLOGIA = '//unpkg.com/three-globe/example/img/earth-topology.png';
const URL_PAISES_GEOJSON = '//unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson';
// Fronteras estatales/provinciales y ciudades — Natural Earth no las bundlea con
// three-globe (solo trae países), así que se traen de un mirror del repo oficial de
// Natural Earth. 50m para estados (Natural Earth no publica admin-1 a 110m) y 110m
// para ciudades (alcanza para "ciudades principales por país", que es el objetivo).
const URL_ESTADOS_GEOJSON = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/geojson/ne_50m_admin_1_states_provinces.geojson';
const URL_LUGARES_GEOJSON = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/geojson/ne_110m_populated_places.geojson';
// El admin-1 de Natural Earth de arriba NO tiene cobertura global: solo trae 9 países
// grandes (Rusia, EE.UU., India, Indonesia, China, Brasil, Canadá, Australia,
// Sudáfrica) — verificado 2026-08-22 descargando el shapefile fuente completo
// (`50m_cultural/ne_50m_admin_1_states_provinces.shp` del propio repo), no es un
// límite de esta app ni un bug de zoom/altitud. México nunca estuvo ahí. Se completa
// con un archivo propio (32 estados, geoBoundaries CC BY 4.0 — Runfola et al. 2020 —
// simplificado con mapshaper de ~4 MB a ~165 KB) servido por Firebase Hosting junto
// al resto de la app en vez de depender de un tercero más.
const URL_ESTADOS_MEXICO_GEOJSON = '/datos/mexico-estados.geojson';

const VISTAS = [
  { id: 'satelite', nombre: 'Satelital' },
  { id: 'satelite-fronteras', nombre: 'Satelital + fronteras' },
  { id: 'fronteras', nombre: 'Fronteras' },
];

let vistaActual = 'satelite';
let paisesGeoJSON = null;
let estadosGeoJSON = null;
let lugaresGeoJSON = null;

// Un color plano generado en canvas (en vez de un archivo de imagen) para el modo
// "solo fronteras" — evita depender de un asset extra solo para un color sólido.
function generarColorPlano(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 2, 2);
  return canvas.toDataURL();
}
const OCEANO_PLANO = generarColorPlano('#aad3df');

async function obtenerPaises() {
  if (!paisesGeoJSON) {
    const respuesta = await fetch(URL_PAISES_GEOJSON);
    const datos = await respuesta.json();
    paisesGeoJSON = datos.features;
  }
  return paisesGeoJSON;
}

// A diferencia de obtenerPaises(), estas degradan a "sin detalle extra" en vez de
// romper el resto del mapa si una fuente falla o cambia de URL — son mejora visual,
// no datos de los que dependa el resto de la app. Cada fuente degrada por separado
// (si México falla pero Natural Earth no, el resto de los 9 países igual aparece).
async function obtenerEstadosNaturalEarth() {
  try {
    const respuesta = await fetch(URL_ESTADOS_GEOJSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    return datos.features;
  } catch (error) {
    console.warn('No se pudieron cargar las fronteras estatales (Natural Earth):', error);
    return [];
  }
}

async function obtenerEstadosMexico() {
  try {
    const respuesta = await fetch(URL_ESTADOS_MEXICO_GEOJSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    return datos.features;
  } catch (error) {
    console.warn('No se pudieron cargar los estados de México:', error);
    return [];
  }
}

async function obtenerEstados() {
  if (!estadosGeoJSON) {
    const [naturalEarth, mexico] = await Promise.all([obtenerEstadosNaturalEarth(), obtenerEstadosMexico()]);
    estadosGeoJSON = naturalEarth.concat(mexico);
  }
  return estadosGeoJSON;
}

async function obtenerLugares() {
  if (!lugaresGeoJSON) {
    try {
      const respuesta = await fetch(URL_LUGARES_GEOJSON);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      lugaresGeoJSON = datos.features;
    } catch (error) {
      console.warn('No se pudieron cargar los nombres de ciudades:', error);
      lugaresGeoJSON = [];
    }
  }
  return lugaresGeoJSON;
}

// El nombre del campo varía según la versión/export de Natural Earth — se prueban
// las variantes conocidas en vez de asumir una sola. `shapeName` es el campo que usa
// geoBoundaries (datos/mexico-estados.geojson), otra fuente distinta a Natural Earth.
function nombreDeFeature(feature) {
  const p = feature.properties || {};
  return p.NAME || p.name || p.NAMEASCII || p.nameascii || p.NAME_EN || p.shapeName || '';
}

// Centroide aproximado (promedio de vértices, no ponderado por área) del anillo con
// más puntos de la geometría — alcanza para ubicar una etiqueta de texto, evita que
// una isla o exclave pequeño jale la etiqueta fuera del territorio principal. No es
// un centroide geográfico exacto, no hace falta para este uso.
function centroideDePoligono(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  const anillos = geom.type === 'Polygon' ? [geom.coordinates[0]]
    : geom.type === 'MultiPolygon' ? geom.coordinates.map((poligono) => poligono[0])
    : [];
  if (anillos.length === 0) return null;
  const anilloPrincipal = anillos.reduce((mayor, actual) => (actual.length > mayor.length ? actual : mayor));
  let sumaLon = 0;
  let sumaLat = 0;
  for (const [lon, lat] of anilloPrincipal) {
    sumaLon += lon;
    sumaLat += lat;
  }
  return { lat: sumaLat / anilloPrincipal.length, lon: sumaLon / anilloPrincipal.length };
}

// --- Detalle progresivo por zoom (solo en Fronteras / Satelital+fronteras) --------
// Mismo espíritu que obtenerPaises(): fetch perezoso una sola vez, cacheado. Los 3
// niveles (país siempre, +estado, +ciudad) se activan por la altitud de cámara que ya
// entrega .onZoom() — no hace falta un mecanismo de detección de zoom nuevo.

const UMBRAL_ALTITUD_ESTADOS = 1.0;
const UMBRAL_ALTITUD_CIUDADES = 0.4;
// Subido de 0.001: a esa altitud tan baja, las paredes laterales de países grandes y
// cóncavos (ej. Brasil) generaban z-fighting visible (picos/rayas parpadeantes) a la
// distancia de cámara de este modo. En "satelite-fronteras" no aplica porque ahí las
// paredes son transparentes.
const ALTITUD_POLIGONO_FRONTERAS = 0.012;
const ALTITUD_POLIGONO_SATELITE_FRONTERAS = 0.001;
// El polígono de un estado ocupa exactamente la misma área que el país que lo
// contiene — a la misma altitud que ese país, la superficie coincidente genera
// z-fighting: el borde estatal "gana" o "pierde" el desempate de forma
// inconsistente según la geometría exacta de cada país (visto 2026-08-22: se veían
// los estados de EE.UU. pero no los de México, sin ninguna razón de datos — es la
// misma familia de bug que las paredes de Brasil, arriba). Por eso el nivel
// "estado" flota claramente más alto que el "país", nunca a la misma altitud.
const ALTITUD_POLIGONO_ESTADOS_FRONTERAS = 0.016;
const ALTITUD_POLIGONO_ESTADOS_SATELITE_FRONTERAS = 0.004;

let nivelDetalleActual = null; // 'pais' | 'estado' | 'ciudad' — evita recalcular en cada tick de zoom

function nivelParaAltitud(altitude) {
  if (altitude < UMBRAL_ALTITUD_CIUDADES) return 'ciudad';
  if (altitude < UMBRAL_ALTITUD_ESTADOS) return 'estado';
  return 'pais';
}

function altitudPoligono(d, altitudPais, altitudEstado) {
  return d.nivel === 'estado' ? altitudEstado : altitudPais;
}

// Color de las etiquetas según el modo de vista activo (lee `vistaActual`, no un
// parámetro, porque labelColor no recibe el modo — solo el datum de la etiqueta).
// En "satelite-fronteras" el fondo es la imagen satelital oscura: texto oscuro ahí
// se pierde por completo (reportado 2026-08-22), por eso usa blanco. En "fronteras"
// el fondo es el mapa plano claro (`OCEANO_PLANO`/`#f2efe9`), por eso sigue oscuro.
function colorEtiqueta(nivel) {
  const fondoOscuro = vistaActual === 'satelite-fronteras';
  if (nivel === 'pais') return fondoOscuro ? 'rgba(255,255,255,0.95)' : 'rgba(35,35,35,0.92)';
  if (nivel === 'estado') return fondoOscuro ? 'rgba(255,255,255,0.85)' : 'rgba(70,70,70,0.85)';
  return fondoOscuro ? 'rgba(255,255,255,0.78)' : 'rgba(95,95,95,0.8)';
}

async function construirPoligonosFronteras(nivel) {
  const paises = (await obtenerPaises()).map((f) => ({ ...f, nivel: 'pais' }));
  if (nivel === 'pais') return paises;
  const estados = (await obtenerEstados()).map((f) => ({ ...f, nivel: 'estado' }));
  return paises.concat(estados);
}

async function construirEtiquetasFronteras(nivel) {
  const etiquetas = [];
  for (const feature of await obtenerPaises()) {
    const centro = centroideDePoligono(feature);
    const texto = nombreDeFeature(feature);
    if (centro && texto) etiquetas.push({ ...centro, texto, nivel: 'pais' });
  }
  if (nivel === 'estado' || nivel === 'ciudad') {
    for (const feature of await obtenerEstados()) {
      const centro = centroideDePoligono(feature);
      const texto = nombreDeFeature(feature);
      if (centro && texto) etiquetas.push({ ...centro, texto, nivel: 'estado' });
    }
  }
  if (nivel === 'ciudad') {
    for (const feature of await obtenerLugares()) {
      const texto = nombreDeFeature(feature);
      if (feature.geometry?.type === 'Point' && texto) {
        const [lon, lat] = feature.geometry.coordinates;
        etiquetas.push({ lat, lon, texto, nivel: 'ciudad' });
      }
    }
  }
  return etiquetas;
}

async function actualizarDetallePorZoom(altitude) {
  if (vistaActual !== 'fronteras' && vistaActual !== 'satelite-fronteras') return;
  const nivel = nivelParaAltitud(altitude);
  if (nivel === nivelDetalleActual) return;
  nivelDetalleActual = nivel;

  const [poligonos, etiquetas] = await Promise.all([
    construirPoligonosFronteras(nivel),
    construirEtiquetasFronteras(nivel),
  ]);
  globo.polygonsData(poligonos).labelsData(etiquetas);
}

async function aplicarVista(vista) {
  vistaActual = vista;
  renderizarMenuVista();
  nivelDetalleActual = null; // fuerza recalcular el detalle para la vista nueva

  if (vista === 'satelite') {
    globo.globeImageUrl(URL_SATELITE).bumpImageUrl(URL_TOPOLOGIA).polygonsData([]).labelsData([]);
    return;
  }

  await obtenerPaises();
  if (vista === 'satelite-fronteras') {
    globo
      .globeImageUrl(URL_SATELITE)
      .bumpImageUrl(URL_TOPOLOGIA)
      .polygonCapColor(() => 'rgba(0,0,0,0)')
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((d) => (d.nivel === 'estado' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)'))
      .polygonAltitude((d) => altitudPoligono(d, ALTITUD_POLIGONO_SATELITE_FRONTERAS, ALTITUD_POLIGONO_ESTADOS_SATELITE_FRONTERAS));
  } else if (vista === 'fronteras') {
    globo
      .globeImageUrl(OCEANO_PLANO)
      .bumpImageUrl(null)
      // El estado se pinta transparente (solo el trazo) para no repintar encima del
      // relleno del país — el efecto es "líneas estatales sobre el mapa político".
      .polygonCapColor((d) => (d.nivel === 'estado' ? 'rgba(0,0,0,0)' : '#f2efe9'))
      .polygonSideColor((d) => (d.nivel === 'estado' ? 'rgba(0,0,0,0)' : '#d9d4c7'))
      .polygonStrokeColor((d) => (d.nivel === 'estado' ? '#c7c2b4' : '#9aa0a6'))
      .polygonAltitude((d) => altitudPoligono(d, ALTITUD_POLIGONO_FRONTERAS, ALTITUD_POLIGONO_ESTADOS_FRONTERAS));
  }
  await actualizarDetallePorZoom(camaraActual.altitude ?? 2.5);
}

function renderizarMenuVista() {
  listaVistas.innerHTML = '';
  for (const vista of VISTAS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip-vista${vista.id === vistaActual ? ' activa' : ''}`;
    chip.textContent = vista.nombre;
    chip.addEventListener('click', () => {
      aplicarVista(vista.id);
      listaVistas.classList.add('oculto');
      botonMenuVista.setAttribute('aria-expanded', 'false');
    });
    listaVistas.appendChild(chip);
  }
}
renderizarMenuVista();

// --- Agrupar marcadores cercanos (evita que se sobrepongan) -----------------------
// Sin librería de clustering nueva: se agrupan por celda de una grilla lat/lon cuyo
// tamaño depende de la altitud de cámara — mismo patrón que nivelParaAltitud()/
// actualizarDetallePorZoom() de arriba, reutiliza el mismo .onZoom() en vez de un
// mecanismo de detección de zoom aparte. Un evento solo se pinta con su ícono normal
// (crearMarcadorEvento); 2+ en la misma celda se agrupan en un marcador con el
// conteo (ver crearMarcadorGrupo() más arriba) — clic lo despliega en abanico para
// poder acceder a cada evento, incluso si dos están genuinamente en el mismo lugar
// (acercar la cámara no los separaría). El reporte (más abajo) sigue listando
// eventos individuales — agrupar es solo para el dibujo del globo, no para la lista.
function celdaClusterParaAltitud(altitude) {
  if (altitude >= 1.0) return 6;
  if (altitude >= 0.4) return 2;
  if (altitude >= 0.08) return 0.4;
  return 0.08;
}

function agruparPuntos(puntos, celda) {
  const celdas = new Map();
  for (const punto of puntos) {
    const clave = `${Math.round(punto.lat / celda)}_${Math.round(punto.lon / celda)}`;
    if (!celdas.has(clave)) celdas.set(clave, []);
    celdas.get(clave).push(punto);
  }
  const resultado = [];
  for (const grupo of celdas.values()) {
    if (grupo.length === 1) {
      resultado.push(grupo[0]);
      continue;
    }
    const lat = grupo.reduce((suma, p) => suma + p.lat, 0) / grupo.length;
    const lon = grupo.reduce((suma, p) => suma + p.lon, 0) / grupo.length;
    resultado.push({ lat, lon, grupo, esGrupo: true });
  }
  return resultado;
}

function aplicarClusterAlGlobo() {
  globo.htmlElementsData(agruparPuntos(puntosActuales, celdaClusterActual));
}

function actualizarClusterPorZoom(altitude) {
  const celda = celdaClusterParaAltitud(altitude);
  if (celda === celdaClusterActual) return;
  celdaClusterActual = celda;
  aplicarClusterAlGlobo();
}

// --- Reporte: elementos actualmente en la vista (hemisferio visible) --------------

let camaraActual = { ...CENTRO_MEXICO, altitude: 2.5 };

function alCambiarCamara(pov) {
  camaraActual = pov;
  if (!panelReporte.classList.contains('oculto')) renderizarReporte();
  actualizarDetallePorZoom(pov.altitude);
  actualizarClusterPorZoom(pov.altitude);
}

// Mismo criterio de "cercano a la cámara" que usa three-globe para decidir qué
// marcador mostrar u ocultar (hemisferio visible) — distancia angular < 90°.
function enHemisferioVisible(lat, lon) {
  const r = Math.PI / 180;
  const cosDistancia = Math.sin(camaraActual.lat * r) * Math.sin(lat * r)
    + Math.cos(camaraActual.lat * r) * Math.cos(lat * r) * Math.cos((camaraActual.lng - lon) * r);
  return cosDistancia > 0;
}

function renderizarReporte() {
  const visibles = puntosActuales.filter((p) => enHemisferioVisible(p.lat, p.lon));
  if (visibles.length === 0) {
    listaReporte.innerHTML = '<p class="mensaje-vacio-reporte">Sin elementos a la vista — gira o aleja el mapa.</p>';
    return;
  }
  listaReporte.innerHTML = '';
  for (const punto of visibles) {
    const fila = document.createElement('div');
    fila.className = 'fila-reporte';
    fila.innerHTML = `
      <span class="muestra-color" style="background:${esc(punto.color)}"></span>
      <div class="info-reporte">
        <strong>${esc(punto.titulo)}</strong>
        <span>${esc(punto.categoria || '')}</span>
      </div>
    `;
    fila.addEventListener('click', () => {
      globo.pointOfView({ lat: punto.lat, lng: punto.lon }, 1000);
    });
    listaReporte.appendChild(fila);
  }
}

botonReporte.addEventListener('click', () => {
  const abrir = panelReporte.classList.contains('oculto');
  panelReporte.classList.toggle('oculto', !abrir);
  botonReporte.setAttribute('aria-expanded', String(abrir));
  if (abrir) renderizarReporte();
});

botonCerrarReporte.addEventListener('click', () => {
  panelReporte.classList.add('oculto');
  botonReporte.setAttribute('aria-expanded', 'false');
});

// --- Histórico de eventos ----------------------------------------------------------
// Ver AGENTS.md sección 8.4. Nunca un listener en vivo (onValue): es una consulta
// única por rango de fechas (consultarHistorico() en db.js, indexada por fechaUTC)
// que solo corre cuando el usuario pulsa "Mostrar histórico" — mientras el panel
// está cerrado o nadie lo pidió, el histórico no descarga ni pinta nada.

function formatoFechaInput(fecha) {
  return fecha.toISOString().slice(0, 10);
}

const HOY = new Date();
inputHistoricoHasta.value = formatoFechaInput(HOY);
inputHistoricoDesde.value = formatoFechaInput(new Date(HOY.getTime() - 30 * 24 * 60 * 60 * 1000));

botonHistorico.addEventListener('click', () => {
  const abierto = panelHistorico.classList.toggle('oculto') === false;
  botonHistorico.setAttribute('aria-expanded', String(abierto));
});

checkboxOcultarActuales.addEventListener('change', () => {
  ocultarEventosActuales = checkboxOcultarActuales.checked;
  repintarPuntos();
});

async function mostrarHistorico() {
  const desde = inputHistoricoDesde.value;
  const hasta = inputHistoricoHasta.value;
  if (!desde || !hasta) return;
  botonAplicarHistorico.disabled = true;
  estadoHistorico.textContent = 'Cargando…';
  try {
    const desdeUTC = new Date(`${desde}T00:00:00.000Z`).toISOString();
    const hastaUTC = new Date(`${hasta}T23:59:59.999Z`).toISOString();
    // Se consulta cada capa que el cliente ya conoce (nunca una lista fija a mano,
    // mismo criterio que el menú de capas) — cada consulta va indexada y acotada por
    // separado, así que una capa sin histórico (ej. las manuales, ver deuda en
    // AGENTS.md) simplemente devuelve vacío sin afectar a las demás.
    const idsCapas = Object.keys(capas);
    const resultados = await Promise.all(
      idsCapas.map((capaId) => consultarHistorico(capaId, desdeUTC, hastaUTC)),
    );
    const puntos = [];
    let truncado = false;
    resultados.forEach(({ eventos, truncado: capaTruncada }, indice) => {
      const capaId = idsCapas[indice];
      const color = capas[capaId]?.color || COLOR_CAPA_DEFAULT;
      if (capaTruncada) truncado = true;
      for (const evento of eventos) {
        if (typeof evento.lat !== 'number' || typeof evento.lon !== 'number') continue;
        puntos.push({ ...evento, capaId, eventoId: evento.id, color, historico: true });
      }
    });
    puntosHistoricos = puntos;
    historicoActivo = true;
    botonHistorico.classList.add('activo');
    botonAplicarHistorico.textContent = 'Ocultar histórico';
    estadoHistorico.textContent = truncado
      ? `${puntos.length} eventos (alguna capa llegó al límite — acorta el rango para ver el resto)`
      : `${puntos.length} eventos históricos`;
  } catch (error) {
    console.warn('No se pudo consultar el histórico:', error);
    estadoHistorico.textContent = 'No se pudo cargar el histórico.';
  } finally {
    botonAplicarHistorico.disabled = false;
    repintarPuntos();
  }
}

botonAplicarHistorico.addEventListener('click', () => {
  if (historicoActivo) {
    historicoActivo = false;
    puntosHistoricos = [];
    botonHistorico.classList.remove('activo');
    botonAplicarHistorico.textContent = 'Mostrar histórico';
    estadoHistorico.textContent = '';
    repintarPuntos();
    return;
  }
  mostrarHistorico();
});

// --- Clic en el mapa cierra lo que esté abierto -----------------------------------
// Un clic en la zona central (el globo, fuera de cualquier marcador) cierra todos los
// paneles/menús flotantes de un golpe, para que la app se sienta más ágil — sin tener
// que ir a buscar cada botón de "cerrar" por separado. Se engancha en #contenedor-globo
// (no en document): los botones/paneles son hermanos de ese contenedor en el HTML, no
// hijos, así que un clic ahí nunca llega a este listener y no hace falta filtrarlos a
// mano. Los marcadores sí son hijos (globe.gl los agrega dentro del contenedor), pero
// crearMarcadorEvento()/crearMarcadorGrupo() ya hacen stopPropagation() en su propio
// clic — por eso abrir un evento o desplegar un grupo no dispara este cierre general.
// El panel de giro (#panel-giro) queda fuera a propósito: no es un popup que se
// "cierra", es el indicador en vivo de que el giro automático sigue activo — ocultarlo
// sin detener el giro dejaría el ícono del botón y el panel en estados contradictorios.
contenedor.addEventListener('click', () => {
  panelInfo.classList.add('oculto');

  panelReporte.classList.add('oculto');
  botonReporte.setAttribute('aria-expanded', 'false');

  listaCapas.classList.add('oculto');
  botonMenuCapas.setAttribute('aria-expanded', 'false');

  listaVistas.classList.add('oculto');
  botonMenuVista.setAttribute('aria-expanded', 'false');

  panelHistorico.classList.add('oculto');
  botonHistorico.setAttribute('aria-expanded', 'false');

  // Recalcula los marcadores agrupados desde cero — cualquier grupo desplegado en
  // abanico (ver crearMarcadorGrupo()) vuelve a su círculo con el conteo, sin llevar
  // registro aparte de cuáles estaban abiertos.
  aplicarClusterAlGlobo();
});
