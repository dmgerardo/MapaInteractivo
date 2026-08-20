// Monta el globo interactivo. Las capas de datos (eventos por lugar, generadas por
// agentes de IA) se agregan aquí más adelante como fuentes independientes que se
// suscriben vía suscribir() (js/db.js) y alimentan .pointsData()/.labelsData() del globo.

const contenedor = document.getElementById('contenedor-globo');

const globo = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  (contenedor);

// Ajuste inicial de cámara: vista completa del globo, no demasiado cerca.
globo.pointOfView({ altitude: 2.5 });

function ajustarTamano() {
  globo.width(contenedor.clientWidth).height(contenedor.clientHeight);
}
window.addEventListener('resize', ajustarTamano);
ajustarTamano();
