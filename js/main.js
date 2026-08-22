// Monta el globo interactivo y lo alimenta de los nodos capas/eventos que van
// poblando los agentes de IA. Ver AGENTS.md sección 8 (Modelo de datos).
import { suscribir } from './db.js?v=7';
import { esc, urlSegura } from './utilidades.js?v=7';
import { ICONOS, ICONOS_EVENTO, ICONO_EVENTO_DEFAULT } from './iconos.js?v=7';
import { APP_VERSION } from './version.js?v=7';

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

// Altitud de las etiquetas de fronteras: tiene que quedar por encima de la altitud
// más alta usada por los polígonos (ALTITUD_POLIGONO_FRONTERAS, 0.012 — ver más
// abajo) o el texto queda "por debajo" de la superficie del país y se ve cortado/
// tapado por sus paredes laterales (reportado 2026-08-22).
const ALTITUD_ETIQUETAS = 0.02;

const globo = Globe()(contenedor)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .htmlLat('lat')
  .htmlLng('lon')
  .htmlElement(crearMarcadorEvento)
  .htmlElementVisibilityModifier((el, esVisible) => { el.style.opacity = esVisible ? 1 : 0; })
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

// Capas que el usuario ocultó a mano desde el menú — se guarda lo OCULTO, no lo
// activo, para que una capa nueva aparezca visible por default sin tener que
// "activarla". Ver AGENTS.md sección 3 (convenciones de filtros).
const capasOcultasPorUsuario = new Set();

function capaVisible(capaId) {
  const capa = capas[capaId];
  if (capa && capa.activa === false) return false; // desactivada por el propio agente/dato
  return !capasOcultasPorUsuario.has(capaId);
}

function crearMarcadorEvento(punto) {
  const el = document.createElement('div');
  el.className = 'marcador-evento';
  el.style.color = punto.color;
  el.innerHTML = ICONOS_EVENTO[punto.categoria] || ICONO_EVENTO_DEFAULT;
  el.title = punto.titulo;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    mostrarPanelEvento(punto);
  });
  return el;
}

function repintarPuntos() {
  const puntos = [];
  for (const [capaId, eventos] of Object.entries(eventosPorCapa)) {
    if (!capaVisible(capaId)) continue;
    const capa = capas[capaId];
    const color = capa?.color || COLOR_CAPA_DEFAULT;
    for (const [eventoId, evento] of Object.entries(eventos || {})) {
      if (typeof evento?.lat !== 'number' || typeof evento?.lon !== 'number') continue;
      puntos.push({ ...evento, capaId, eventoId, color });
    }
  }
  puntosActuales = puntos;
  globo.htmlElementsData(puntos);
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

// A diferencia de obtenerPaises(), estas dos degradan a "sin detalle extra" en vez de
// romper el resto del mapa si la fuente externa falla o cambia de URL — son mejora
// visual, no datos de los que dependa el resto de la app.
async function obtenerEstados() {
  if (!estadosGeoJSON) {
    try {
      const respuesta = await fetch(URL_ESTADOS_GEOJSON);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      estadosGeoJSON = datos.features;
    } catch (error) {
      console.warn('No se pudieron cargar las fronteras estatales:', error);
      estadosGeoJSON = [];
    }
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
// las variantes conocidas en vez de asumir una sola.
function nombreDeFeature(feature) {
  const p = feature.properties || {};
  return p.NAME || p.name || p.NAMEASCII || p.nameascii || p.NAME_EN || '';
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

let nivelDetalleActual = null; // 'pais' | 'estado' | 'ciudad' — evita recalcular en cada tick de zoom

function nivelParaAltitud(altitude) {
  if (altitude < UMBRAL_ALTITUD_CIUDADES) return 'ciudad';
  if (altitude < UMBRAL_ALTITUD_ESTADOS) return 'estado';
  return 'pais';
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
      .polygonAltitude(ALTITUD_POLIGONO_SATELITE_FRONTERAS);
  } else if (vista === 'fronteras') {
    globo
      .globeImageUrl(OCEANO_PLANO)
      .bumpImageUrl(null)
      // El estado se pinta transparente (solo el trazo) para no repintar encima del
      // relleno del país — el efecto es "líneas estatales sobre el mapa político".
      .polygonCapColor((d) => (d.nivel === 'estado' ? 'rgba(0,0,0,0)' : '#f2efe9'))
      .polygonSideColor((d) => (d.nivel === 'estado' ? 'rgba(0,0,0,0)' : '#d9d4c7'))
      .polygonStrokeColor((d) => (d.nivel === 'estado' ? '#c7c2b4' : '#9aa0a6'))
      .polygonAltitude(ALTITUD_POLIGONO_FRONTERAS);
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

// --- Reporte: elementos actualmente en la vista (hemisferio visible) --------------

let camaraActual = { ...CENTRO_MEXICO, altitude: 2.5 };

function alCambiarCamara(pov) {
  camaraActual = pov;
  if (!panelReporte.classList.contains('oculto')) renderizarReporte();
  actualizarDetallePorZoom(pov.altitude);
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
