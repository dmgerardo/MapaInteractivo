// Monta el globo interactivo y lo alimenta de los nodos capas/eventos que van
// poblando los agentes de IA. Ver AGENTS.md sección 8 (Modelo de datos).
import { suscribir } from './db.js?v=5';
import { esc, urlSegura } from './utilidades.js?v=4';
import { ICONOS, ICONOS_EVENTO, ICONO_EVENTO_DEFAULT } from './iconos.js?v=6';
import { APP_VERSION } from './version.js?v=1';

const contenedor = document.getElementById('contenedor-globo');
const panelInfo = document.getElementById('panel-info');
const panelInfoContenido = document.getElementById('panel-info-contenido');
const botonCerrarPanel = document.getElementById('cerrar-panel-info');
const botonMenuCapas = document.getElementById('boton-menu-capas');
const listaCapas = document.getElementById('lista-capas');
const botonMenuVista = document.getElementById('boton-menu-vista');
const listaVistas = document.getElementById('lista-vistas');
const botonReporte = document.getElementById('boton-reporte');
const panelReporte = document.getElementById('panel-reporte');
const botonCerrarReporte = document.getElementById('cerrar-panel-reporte');
const listaReporte = document.getElementById('lista-reporte');
const enlaceMantenimiento = document.getElementById('enlace-mantenimiento');
const botonVersion = document.getElementById('boton-version');

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

const globo = Globe()(contenedor)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .htmlLat('lat')
  .htmlLng('lon')
  .htmlElement(crearMarcadorEvento)
  .htmlElementVisibilityModifier((el, esVisible) => { el.style.opacity = esVisible ? 1 : 0; })
  .onZoom(alCambiarCamara);

globo.pointOfView({ altitude: 2.5 });

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

const VISTAS = [
  { id: 'satelite', nombre: 'Satelital' },
  { id: 'satelite-fronteras', nombre: 'Satelital + fronteras' },
  { id: 'fronteras', nombre: 'Fronteras' },
];

let vistaActual = 'satelite';
let paisesGeoJSON = null;

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

async function aplicarVista(vista) {
  vistaActual = vista;
  renderizarMenuVista();

  if (vista === 'satelite') {
    globo.globeImageUrl(URL_SATELITE).bumpImageUrl(URL_TOPOLOGIA).polygonsData([]);
    return;
  }

  const paises = await obtenerPaises();
  if (vista === 'satelite-fronteras') {
    globo
      .globeImageUrl(URL_SATELITE)
      .bumpImageUrl(URL_TOPOLOGIA)
      .polygonsData(paises)
      .polygonCapColor(() => 'rgba(0,0,0,0)')
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(255,255,255,0.85)')
      .polygonAltitude(0.001);
  } else if (vista === 'fronteras') {
    globo
      .globeImageUrl(OCEANO_PLANO)
      .bumpImageUrl(null)
      .polygonsData(paises)
      .polygonCapColor(() => '#f2efe9')
      .polygonSideColor(() => '#d9d4c7')
      .polygonStrokeColor(() => '#9aa0a6')
      .polygonAltitude(0.001);
  }
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

let camaraActual = { lat: 0, lng: 0 };

function alCambiarCamara(pov) {
  camaraActual = pov;
  if (!panelReporte.classList.contains('oculto')) renderizarReporte();
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
