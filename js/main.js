// Monta el globo interactivo y lo alimenta de los nodos capas/eventos que van
// poblando los agentes de IA. Ver AGENTS.md sección 8 (Modelo de datos).
import { suscribir } from './db.js?v=4';
import { esc, urlSegura } from './utilidades.js?v=4';
import { ICONOS } from './iconos.js?v=1';

const contenedor = document.getElementById('contenedor-globo');
const panelInfo = document.getElementById('panel-info');
const panelInfoContenido = document.getElementById('panel-info-contenido');
const botonCerrarPanel = document.getElementById('cerrar-panel-info');

botonCerrarPanel.innerHTML = ICONOS.cerrar;
botonCerrarPanel.addEventListener('click', () => panelInfo.classList.add('oculto'));

const globo = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .pointLat('lat')
  .pointLng('lon')
  .pointColor('color')
  .pointAltitude(0.01)
  .pointRadius(0.35)
  .pointLabel((punto) => esc(punto.titulo))
  .onPointClick(mostrarPanelEvento)
  (contenedor);

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

function repintarPuntos() {
  const puntos = [];
  for (const [capaId, eventos] of Object.entries(eventosPorCapa)) {
    const capa = capas[capaId];
    if (capa && capa.activa === false) continue; // capa desactivada explícitamente
    const color = capa?.color || COLOR_CAPA_DEFAULT;
    for (const [eventoId, evento] of Object.entries(eventos || {})) {
      if (typeof evento?.lat !== 'number' || typeof evento?.lon !== 'number') continue;
      puntos.push({ ...evento, capaId, eventoId, color });
    }
  }
  globo.pointsData(puntos);
}

function mostrarPanelEvento(punto) {
  const fuenteHref = punto.fuenteUrl ? urlSegura(punto.fuenteUrl) : null;
  const fecha = punto.fechaUTC ? formateadorFecha.format(new Date(punto.fechaUTC)) : null;
  panelInfoContenido.innerHTML = `
    <h2>${esc(punto.titulo)}</h2>
    ${punto.categoria ? `<p class="meta">${esc(punto.categoria)}</p>` : ''}
    ${fecha ? `<p>${esc(fecha)}</p>` : ''}
    ${punto.descripcion ? `<p>${esc(punto.descripcion)}</p>` : ''}
    ${fuenteHref ? `<p><a href="${esc(fuenteHref)}" target="_blank" rel="noopener noreferrer">Ver noticia</a></p>` : ''}
  `;
  panelInfo.classList.remove('oculto');
}

suscribir('capas', (datos) => {
  capas = datos || {};
  repintarPuntos();
});

suscribir('eventos', (datos) => {
  eventosPorCapa = datos || {};
  repintarPuntos();
});
