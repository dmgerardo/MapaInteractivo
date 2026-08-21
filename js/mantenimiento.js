// Vista de mantenimiento de la capa "Mis Localidades". Único lugar de la app que
// escribe en Firebase — requiere sesión de un correo autorizado (ver AGENTS.md
// sección 8.2 y database.rules.json).
import { agregar, actualizar, eliminar, suscribir } from './db.js?v=5';
import { esc, urlSegura } from './utilidades.js?v=4';
import { ICONOS } from './iconos.js?v=5';
import {
  iniciarSesionGoogle, cerrarSesion, onCambioSesion, esAdmin,
} from './auth.js?v=1';
import { subirFoto } from './storage.js?v=1';

const CAPA_ID = 'misLocalidades';

const zonaSesion = document.getElementById('zona-sesion');
const pantallaAcceso = document.getElementById('pantalla-acceso');
const contenidoMantenimiento = document.getElementById('contenido-mantenimiento');
const iconoCandado = document.querySelector('.icono-candado');
const tituloAcceso = document.getElementById('titulo-acceso');
const mensajeAcceso = document.getElementById('mensaje-acceso');
const botonAcceso = document.getElementById('boton-acceso');
const botonAgregar = document.getElementById('boton-agregar');
const listaLocalidades = document.getElementById('lista-localidades');

const fondoModal = document.getElementById('fondo-modal');
const modal = document.getElementById('modal-localidad');
const form = document.getElementById('form-localidad');
const tituloModal = document.getElementById('titulo-modal');
const campoFoto = document.getElementById('campo-foto');
const entradaArchivoFoto = document.getElementById('entrada-archivo-foto');
const botonEliminar = document.getElementById('boton-eliminar-localidad');
const botonCancelar = document.getElementById('boton-cancelar-localidad');
const botonGuardar = document.getElementById('boton-guardar-localidad');

botonAgregar.querySelector('.icono-inline').innerHTML = ICONOS.agregar;
botonCancelar.innerHTML = ICONOS.cerrar;
botonGuardar.innerHTML = ICONOS.guardar;
botonEliminar.innerHTML = ICONOS.eliminar;
iconoCandado.innerHTML = ICONOS.candado;

let usuarioActual = null;
let localidades = {};
let idEnEdicion = null;
let fotoUrlActual = null;

// Nada de la vista (ni siquiera la lista) se muestra hasta que quede claro si hay
// sesión o no — antes el botón de "Iniciar sesión" vivía solo en la esquina y era
// fácil no verlo y asumir que ya se tenía sesión iniciada.
function renderPantallaAcceso() {
  const admin = esAdmin(usuarioActual);
  pantallaAcceso.classList.toggle('oculto', admin);
  contenidoMantenimiento.classList.toggle('oculto', !admin);

  if (!usuarioActual) {
    tituloAcceso.textContent = 'Inicia sesión para continuar';
    mensajeAcceso.textContent = 'Esta página es solo para administrar las localidades del mapa.';
    botonAcceso.innerHTML = `${ICONOS.iniciarSesion} Iniciar sesión con Google`;
    botonAcceso.onclick = iniciarSesionGoogle;
  } else if (!admin) {
    tituloAcceso.textContent = 'Sin permiso de administrador';
    mensajeAcceso.textContent = `La sesión ${usuarioActual.email} no tiene permiso para administrar localidades.`;
    botonAcceso.innerHTML = `${ICONOS.cerrarSesion} Cerrar sesión`;
    botonAcceso.onclick = cerrarSesion;
  }
}

function renderZonaSesion() {
  zonaSesion.innerHTML = '';
  if (esAdmin(usuarioActual)) {
    const nombre = document.createElement('span');
    nombre.textContent = usuarioActual.email;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.innerHTML = `${ICONOS.cerrarSesion} Cerrar sesión`;
    boton.addEventListener('click', cerrarSesion);
    zonaSesion.append(nombre, boton);
  }
  botonAgregar.classList.toggle('oculto', !esAdmin(usuarioActual));
}

function renderizarLista() {
  const ids = Object.keys(localidades);
  if (ids.length === 0) {
    listaLocalidades.innerHTML = '<p class="mensaje-vacio">Sin localidades todavía.</p>';
    return;
  }
  listaLocalidades.innerHTML = '';
  for (const id of ids) {
    const loc = localidades[id];
    const fila = document.createElement('div');
    fila.className = 'fila-localidad';
    const fotoHref = loc.fotoUrl ? urlSegura(loc.fotoUrl) : null;
    fila.innerHTML = `
      ${fotoHref ? `<img class="miniatura" src="${esc(fotoHref)}" alt="" />` : '<div class="miniatura"></div>'}
      <div class="info-fila">
        <strong>${esc(loc.titulo || 'Sin nombre')}</strong>
        <span>${loc.nivelRiesgo ? `Riesgo ${esc(loc.nivelRiesgo)}` : ''}</span>
      </div>
    `;
    if (esAdmin(usuarioActual)) {
      fila.addEventListener('click', () => abrirFormulario(id));
    }
    listaLocalidades.appendChild(fila);
  }
}

function renderCampoFoto() {
  if (fotoUrlActual) {
    const href = urlSegura(fotoUrlActual);
    campoFoto.innerHTML = `
      <div class="previsualizacion-foto">
        <img src="${esc(href || '')}" alt="" />
        <button type="button" aria-label="Quitar foto" title="Quitar foto">${ICONOS.eliminar}</button>
      </div>
    `;
    campoFoto.querySelector('button').addEventListener('click', () => {
      fotoUrlActual = null;
      renderCampoFoto();
    });
    return;
  }
  campoFoto.innerHTML = `
    <button type="button" class="boton-agregar-foto" aria-label="Agregar foto" title="Agregar foto">${ICONOS.agregar}</button>
    <div class="opciones-foto oculto">
      <button type="button" data-accion="subir">${ICONOS.subir} Subir</button>
      <button type="button" data-accion="pegar">${ICONOS.pegar} Pegar</button>
      <button type="button" data-accion="url">${ICONOS.enlace} URL</button>
    </div>
  `;
  const opciones = campoFoto.querySelector('.opciones-foto');
  campoFoto.querySelector('.boton-agregar-foto').addEventListener('click', () => {
    opciones.classList.toggle('oculto');
  });
  opciones.querySelector('[data-accion="subir"]').addEventListener('click', () => entradaArchivoFoto.click());
  opciones.querySelector('[data-accion="pegar"]').addEventListener('click', pegarFotoDesdePortapapeles);
  opciones.querySelector('[data-accion="url"]').addEventListener('click', pedirUrlFoto);
}

async function subirYAsignarFoto(archivo) {
  try {
    fotoUrlActual = await subirFoto(archivo);
    renderCampoFoto();
  } catch (error) {
    window.alert(`No se pudo subir la foto: ${error.message}`);
  }
}

entradaArchivoFoto.addEventListener('change', () => {
  const archivo = entradaArchivoFoto.files[0];
  entradaArchivoFoto.value = '';
  if (archivo) subirYAsignarFoto(archivo);
});

async function pegarFotoDesdePortapapeles() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const tipoImagen = item.types.find((t) => t.startsWith('image/'));
      if (tipoImagen) {
        const blob = await item.getType(tipoImagen);
        await subirYAsignarFoto(blob);
        return;
      }
    }
    window.alert('El portapapeles no tiene una imagen.');
  } catch {
    window.alert('No se pudo leer el portapapeles. Copia una imagen primero y da permiso al navegador si lo pide.');
  }
}

function pedirUrlFoto() {
  const url = window.prompt('URL de la imagen:');
  if (!url) return;
  if (!urlSegura(url)) {
    window.alert('Esa URL no es válida.');
    return;
  }
  fotoUrlActual = url;
  renderCampoFoto();
}

function abrirFormulario(id) {
  idEnEdicion = id || null;
  const loc = id ? localidades[id] : null;
  tituloModal.textContent = id ? 'Editar localidad' : 'Agregar localidad';
  form.nombre.value = loc?.titulo || '';
  form.lat.value = loc?.lat ?? '';
  form.lon.value = loc?.lon ?? '';
  form.comentarios.value = loc?.descripcion || '';
  form.nivelRiesgo.value = loc?.nivelRiesgo ?? '';
  form.liga.value = loc?.fuenteUrl || '';
  fotoUrlActual = loc?.fotoUrl || null;
  renderCampoFoto();
  botonEliminar.classList.toggle('oculto', !id);
  fondoModal.classList.remove('oculto');
  modal.classList.remove('oculto');
}

function cerrarFormulario() {
  fondoModal.classList.add('oculto');
  modal.classList.add('oculto');
  idEnEdicion = null;
}

botonAgregar.addEventListener('click', () => abrirFormulario(null));
botonCancelar.addEventListener('click', cerrarFormulario);
fondoModal.addEventListener('click', cerrarFormulario);

botonEliminar.addEventListener('click', async () => {
  if (!idEnEdicion) return;
  if (!window.confirm('¿Eliminar esta localidad?')) return;
  await eliminar(`eventos/${CAPA_ID}/${idEnEdicion}`);
  cerrarFormulario();
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = {
    lat: Number(form.lat.value),
    lon: Number(form.lon.value),
    titulo: form.nombre.value.trim(),
    descripcion: form.comentarios.value.trim(),
    categoria: 'localidad',
    nivelRiesgo: form.nivelRiesgo.value ? Number(form.nivelRiesgo.value) : null,
    fuenteUrl: form.liga.value.trim() || null,
    fotoUrl: fotoUrlActual,
  };

  try {
    if (idEnEdicion) {
      await actualizar(`eventos/${CAPA_ID}/${idEnEdicion}`, datos);
    } else {
      await agregar(`eventos/${CAPA_ID}`, { ...datos, creadoUTC: new Date().toISOString() });
    }
    cerrarFormulario();
  } catch (error) {
    window.alert(`No se pudo guardar: ${error.message}`);
  }
});

async function asegurarCapa() {
  await actualizar(`capas/${CAPA_ID}`, {
    nombre: 'Mis Localidades',
    descripcion: 'Localidades registradas manualmente',
    color: '#8e44ad',
    activa: true,
  });
}

onCambioSesion((usuario) => {
  usuarioActual = usuario;
  renderPantallaAcceso();
  renderZonaSesion();
  renderizarLista();
  if (esAdmin(usuario)) asegurarCapa();
});

suscribir(`eventos/${CAPA_ID}`, (datos) => {
  localidades = datos || {};
  renderizarLista();
});
