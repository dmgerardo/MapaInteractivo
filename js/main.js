// Monta el globo interactivo y lo alimenta de los nodos capas/eventos que van
// poblando los agentes de IA. Ver AGENTS.md sección 8 (Modelo de datos).
import { suscribir } from './db.js?v=5';
import { esc, urlSegura } from './utilidades.js?v=4';
import { ICONOS, ICONOS_EVENTO, ICONO_EVENTO_DEFAULT } from './iconos.js?v=4';

const contenedor = document.getElementById('contenedor-globo');
const panelInfo = document.getElementById('panel-info');
const panelInfoContenido = document.getElementById('panel-info-contenido');
const botonCerrarPanel = document.getElementById('cerrar-panel-info');
const botonMenuCapas = document.getElementById('boton-menu-capas');
const listaCapas = document.getElementById('lista-capas');
const enlaceMantenimiento = document.getElementById('enlace-mantenimiento');

enlaceMantenimiento.innerHTML = ICONOS.ajustes;

botonCerrarPanel.innerHTML = ICONOS.cerrar;
botonCerrarPanel.addEventListener('click', () => panelInfo.classList.add('oculto'));

botonMenuCapas.innerHTML = ICONOS.capas;
botonMenuCapas.addEventListener('click', () => {
  const abierto = listaCapas.classList.toggle('oculto') === false;
  botonMenuCapas.setAttribute('aria-expanded', String(abierto));
});

const globo = Globe()(contenedor)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .htmlLat('lat')
  .htmlLng('lon')
  .htmlElement(crearMarcadorEvento)
  .htmlElementVisibilityModifier((el, esVisible) => { el.style.opacity = esVisible ? 1 : 0; });

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
  globo.htmlElementsData(puntos);
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
