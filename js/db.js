// Capa de acceso a datos centralizada — ninguna vista debe llamar a
// ref.set()/ref.update() directo. Ver AGENTS.md sección 2.
import { firebaseConfig, CONFIGURADO } from './firebase-config.js?v=13';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, push, set, update, remove, onValue, off,
  query, orderByChild, startAt, endAt, limitToLast, get,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let db = null;

// Se probó inicializar Firebase incondicionalmente al cargar la app; si el proyecto
// aún no tiene credenciales reales (ver firebase-config.js) el SDK lanza un error que
// tumba toda la página, incluyendo el globo. Por eso el init queda condicionado a
// CONFIGURADO y el resto de la app sigue funcionando (sin persistencia) mientras tanto.
if (CONFIGURADO) {
  const app = getApps()[0] || initializeApp(firebaseConfig);
  db = getDatabase(app);
} else {
  console.warn('Firebase no está configurado todavía (js/firebase-config.js). La app funciona sin persistencia.');
}

function mostrarToast(mensaje) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export async function agregar(ruta, datos) {
  if (!db) return null;
  const nuevaRef = push(ref(db, ruta));
  await set(nuevaRef, datos);
  mostrarToast('Agregado ✓');
  return nuevaRef.key;
}

export async function actualizar(ruta, datos) {
  if (!db) return;
  await update(ref(db, ruta), datos);
  mostrarToast('Guardado ✓');
}

export async function eliminar(ruta) {
  if (!db) return;
  await remove(ref(db, ruta));
  mostrarToast('Eliminado');
}

export async function actualizarMultiple(actualizaciones) {
  if (!db) return;
  await update(ref(db), actualizaciones);
  mostrarToast('Guardado ✓');
}

export function suscribir(ruta, callback) {
  if (!db) return () => {};
  const nodoRef = ref(db, ruta);
  const manejarCambio = (snapshot) => callback(snapshot.val());
  onValue(nodoRef, manejarCambio);
  return () => off(nodoRef, 'value', manejarCambio);
}

// Tope defensivo por capa: aunque /historico/{capaId} esté indexado por fechaUTC
// (database.rules.json), un rango de fechas muy amplio en una capa con mucho volumen
// podría devolver miles de filas — se corta acá antes de que lleguen al cliente. Es
// una consulta única (get), nunca un listener en vivo (onValue): el histórico no pesa
// nada mientras nadie lo pide. Ver AGENTS.md sección 8.4.
const LIMITE_HISTORICO_POR_CAPA = 300;

export async function consultarHistorico(capaId, desdeUTC, hastaUTC) {
  if (!db) return { eventos: [], truncado: false };
  const consulta = query(
    ref(db, `historico/${capaId}`),
    orderByChild('fechaUTC'),
    startAt(desdeUTC),
    endAt(hastaUTC),
    limitToLast(LIMITE_HISTORICO_POR_CAPA),
  );
  const snapshot = await get(consulta);
  const datos = snapshot.val() || {};
  const eventos = Object.entries(datos).map(([id, evento]) => ({ ...evento, id }));
  return { eventos, truncado: eventos.length >= LIMITE_HISTORICO_POR_CAPA };
}

export { db };
