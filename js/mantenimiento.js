// Vista de mantenimiento de las capas administradas a mano (Mis Localidades, Mis
// Vecinos, ...). Único lugar de la app que escribe en Firebase — requiere sesión de
// un correo autorizado (ver AGENTS.md sección 8.2 y database.rules.json).
import { agregar, actualizar, eliminar, suscribir } from './db.js?v=12';
import { esc, urlSegura } from './utilidades.js?v=12';
import { ICONOS } from './iconos.js?v=12';
import {
  iniciarSesionGoogle, cerrarSesion, onCambioSesion, esAdmin,
} from './auth.js?v=12';
import { subirFoto } from './storage.js?v=12';

// Agregar una capa nueva aquí es lo único que hace falta para que aparezca como
// pestaña en esta página, con el mismo formulario y la misma carga masiva — ver
// AGENTS.md sección 8.2.
const CAPAS = [
  {
    id: 'misLocalidades', nombre: 'Mis Localidades', nombreSingular: 'localidad', categoria: 'localidad', color: '#8e44ad', descripcion: 'Localidades registradas manualmente',
  },
  {
    id: 'misVecinos', nombre: 'Mis Vecinos', nombreSingular: 'vecino', categoria: 'vecino', color: '#27ae60', descripcion: 'Vecinos registrados manualmente',
  },
];

const tituloPagina = document.getElementById('titulo-pagina');
const pestanasCapas = document.getElementById('pestanas-capas');
const zonaSesion = document.getElementById('zona-sesion');
const pantallaAcceso = document.getElementById('pantalla-acceso');
const contenidoMantenimiento = document.getElementById('contenido-mantenimiento');
const iconoCandado = document.querySelector('.icono-candado');
const tituloAcceso = document.getElementById('titulo-acceso');
const mensajeAcceso = document.getElementById('mensaje-acceso');
const botonAcceso = document.getElementById('boton-acceso');
const botonAgregar = document.getElementById('boton-agregar');
const listaLocalidades = document.getElementById('lista-localidades');
const enlacePlantillaCSV = document.getElementById('enlace-plantilla-csv');
const botonSubirCSV = document.getElementById('boton-subir-csv');
const entradaArchivoCSV = document.getElementById('entrada-archivo-csv');
const resultadoCSV = document.getElementById('resultado-csv');

const fondoModal = document.getElementById('fondo-modal');
const modal = document.getElementById('modal-localidad');
const form = document.getElementById('form-localidad');
const tituloModal = document.getElementById('titulo-modal');
const campoFoto = document.getElementById('campo-foto');
const entradaArchivoFoto = document.getElementById('entrada-archivo-foto');
const botonEliminar = document.getElementById('boton-eliminar-localidad');
const botonCancelar = document.getElementById('boton-cancelar-localidad');
const botonGuardar = document.getElementById('boton-guardar-localidad');

botonCancelar.innerHTML = ICONOS.cerrar;
botonGuardar.innerHTML = ICONOS.guardar;
botonEliminar.innerHTML = ICONOS.eliminar;
iconoCandado.innerHTML = ICONOS.candado;
enlacePlantillaCSV.querySelector('.icono-inline').innerHTML = ICONOS.descargar;
botonSubirCSV.querySelector('.icono-inline').innerHTML = ICONOS.subirArchivo;
enlacePlantillaCSV.href = URL.createObjectURL(new Blob([generarPlantillaCSV()], { type: 'text/csv' }));

let usuarioActual = null;
let capaActualId = CAPAS[0].id;
let localidades = {};
let idEnEdicion = null;
let fotoUrlActual = null;
let cancelarSuscripcionEventos = null;

function capaActual() {
  return CAPAS.find((c) => c.id === capaActualId);
}

// Nada de la vista (ni siquiera la lista) se muestra hasta que quede claro si hay
// sesión o no — antes el botón de "Iniciar sesión" vivía solo en la esquina y era
// fácil no verlo y asumir que ya se tenía sesión iniciada.
function renderPantallaAcceso() {
  const admin = esAdmin(usuarioActual);
  pantallaAcceso.classList.toggle('oculto', admin);
  contenidoMantenimiento.classList.toggle('oculto', !admin);
  pestanasCapas.classList.toggle('oculto', !admin);

  if (!usuarioActual) {
    tituloAcceso.textContent = 'Inicia sesión para continuar';
    mensajeAcceso.textContent = 'Esta página es solo para administrar las capas manuales del mapa.';
    botonAcceso.innerHTML = `${ICONOS.iniciarSesion} Iniciar sesión con Google`;
    botonAcceso.onclick = iniciarSesionGoogle;
  } else if (!admin) {
    tituloAcceso.textContent = 'Sin permiso de administrador';
    mensajeAcceso.textContent = `La sesión ${usuarioActual.email} no tiene permiso para administrar estas capas.`;
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
}

function renderPestanas() {
  pestanasCapas.innerHTML = '';
  for (const capa of CAPAS) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `pestana-capa${capa.id === capaActualId ? ' activa' : ''}`;
    boton.textContent = capa.nombre;
    boton.addEventListener('click', () => cambiarCapa(capa.id));
    pestanasCapas.appendChild(boton);
  }
}

function actualizarTextosCapa() {
  const capa = capaActual();
  tituloPagina.textContent = capa.nombre;
  botonAgregar.innerHTML = `<span class="icono-inline">${ICONOS.agregar}</span> Agregar ${esc(capa.nombreSingular)}`;
}

function cambiarCapa(id) {
  if (id === capaActualId && cancelarSuscripcionEventos) return;
  capaActualId = id;
  localidades = {};
  renderPestanas();
  actualizarTextosCapa();
  renderizarLista();

  if (cancelarSuscripcionEventos) cancelarSuscripcionEventos();
  cancelarSuscripcionEventos = suscribir(`eventos/${id}`, (datos) => {
    localidades = datos || {};
    renderizarLista();
  });

  if (esAdmin(usuarioActual)) asegurarCapa();
}

function renderizarLista() {
  const ids = Object.keys(localidades);
  if (ids.length === 0) {
    listaLocalidades.innerHTML = '<p class="mensaje-vacio">Sin elementos todavía.</p>';
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
  tituloModal.textContent = id ? `Editar ${capaActual().nombreSingular}` : `Agregar ${capaActual().nombreSingular}`;
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
  if (!window.confirm('¿Eliminar este elemento?')) return;
  await eliminar(`eventos/${capaActualId}/${idEnEdicion}`);
  cerrarFormulario();
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const capa = capaActual();
  const datos = {
    lat: Number(form.lat.value),
    lon: Number(form.lon.value),
    titulo: form.nombre.value.trim(),
    descripcion: form.comentarios.value.trim(),
    categoria: capa.categoria,
    nivelRiesgo: form.nivelRiesgo.value ? Number(form.nivelRiesgo.value) : null,
    fuenteUrl: form.liga.value.trim() || null,
    fotoUrl: fotoUrlActual,
  };

  try {
    if (idEnEdicion) {
      await actualizar(`eventos/${capa.id}/${idEnEdicion}`, datos);
    } else {
      await agregar(`eventos/${capa.id}`, { ...datos, creadoUTC: new Date().toISOString() });
    }
    cerrarFormulario();
  } catch (error) {
    window.alert(`No se pudo guardar: ${error.message}`);
  }
});

async function asegurarCapa() {
  const capa = capaActual();
  await actualizar(`capas/${capa.id}`, {
    nombre: capa.nombre,
    descripcion: capa.descripcion,
    color: capa.color,
    activa: true,
  });
}

// --- Carga masiva por CSV ----------------------------------------------------------

function generarPlantillaCSV() {
  const encabezado = 'nombre,lat,lon,comentarios,nivelRiesgo,liga,fotoUrl';
  const ejemplo = 'Ejemplo,19.4326,-99.1332,Comentario de ejemplo,5,https://ejemplo.com,https://ejemplo.com/foto.jpg';
  return `${encabezado}\n${ejemplo}\n`;
}

// Parser mínimo pero correcto de CSV: soporta campos entre comillas con comas y
// comillas escapadas (""), que es lo que exporta Excel/Google Sheets por default.
function analizarCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else { entreComillas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      if (fila.some((v) => v.trim() !== '')) filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    if (fila.some((v) => v.trim() !== '')) filas.push(fila);
  }
  return filas;
}

async function procesarCSV(texto) {
  const filas = analizarCSV(texto);
  if (filas.length < 2) {
    window.alert('El CSV no tiene filas de datos.');
    return;
  }
  const encabezados = filas[0].map((h) => h.trim().toLowerCase());
  const idx = (nombre) => encabezados.indexOf(nombre);
  const iNombre = idx('nombre');
  const iLat = idx('lat');
  const iLon = idx('lon');
  const iComentarios = idx('comentarios');
  const iRiesgo = idx('nivelriesgo');
  const iLiga = idx('liga');
  const iFoto = idx('fotourl');

  if (iNombre === -1 || iLat === -1 || iLon === -1) {
    window.alert('El CSV debe tener al menos las columnas: nombre, lat, lon.');
    return;
  }

  const capa = capaActual();
  let agregados = 0;
  const errores = [];

  for (let f = 1; f < filas.length; f++) {
    const fila = filas[f];
    const nombre = fila[iNombre]?.trim();
    const lat = Number(fila[iLat]);
    const lon = Number(fila[iLon]);
    if (!nombre || Number.isNaN(lat) || Number.isNaN(lon)) {
      errores.push(`Fila ${f + 1}: falta nombre, lat o lon válidos`);
      continue;
    }
    const datos = {
      lat,
      lon,
      titulo: nombre,
      descripcion: iComentarios >= 0 ? (fila[iComentarios] || '').trim() : '',
      categoria: capa.categoria,
      nivelRiesgo: iRiesgo >= 0 && fila[iRiesgo] ? Number(fila[iRiesgo]) : null,
      fuenteUrl: iLiga >= 0 && fila[iLiga] ? fila[iLiga].trim() : null,
      fotoUrl: iFoto >= 0 && fila[iFoto] ? fila[iFoto].trim() : null,
      creadoUTC: new Date().toISOString(),
    };
    try {
      // eslint-disable-next-line no-await-in-loop -- se sube fila por fila a propósito, para poder reportar en qué fila falló cada error
      await agregar(`eventos/${capa.id}`, datos);
      agregados++;
    } catch (error) {
      errores.push(`Fila ${f + 1}: ${error.message}`);
    }
  }

  resultadoCSV.classList.remove('oculto');
  resultadoCSV.innerHTML = `<p>${esc(agregados)} agregados${errores.length ? `, ${esc(errores.length)} con error` : ''}.</p>${
    errores.length ? `<ul>${errores.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''
  }`;
}

botonSubirCSV.addEventListener('click', () => entradaArchivoCSV.click());
entradaArchivoCSV.addEventListener('change', async () => {
  const archivo = entradaArchivoCSV.files[0];
  entradaArchivoCSV.value = '';
  if (!archivo) return;
  const texto = await archivo.text();
  await procesarCSV(texto);
});

onCambioSesion((usuario) => {
  usuarioActual = usuario;
  renderPantallaAcceso();
  renderZonaSesion();
  renderizarLista();
  if (esAdmin(usuario)) asegurarCapa();
});

renderPestanas();
actualizarTextosCapa();
cancelarSuscripcionEventos = suscribir(`eventos/${capaActualId}`, (datos) => {
  localidades = datos || {};
  renderizarLista();
});
