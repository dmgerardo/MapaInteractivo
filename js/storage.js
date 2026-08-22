// Subida de fotos a Firebase Storage — solo usado por páginas de mantenimiento con
// escritura (ver AGENTS.md sección 8.2). storage.rules exige el mismo correo
// autorizado que database.rules.json.
import { firebaseConfig, CONFIGURADO } from './firebase-config.js?v=9';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

let storage = null;
if (CONFIGURADO) {
  const app = getApps()[0] || initializeApp(firebaseConfig);
  storage = getStorage(app);
}

const TAMANO_MAXIMO = 8 * 1024 * 1024;

export async function subirFoto(archivo) {
  if (!storage) throw new Error('Firebase no está configurado.');
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  if (archivo.size > TAMANO_MAXIMO) throw new Error('La imagen no puede pesar más de 8 MB.');

  const nombreArchivo = `${Date.now()}-${crypto.randomUUID()}`;
  const archivoRef = ref(storage, `capas-manuales/${nombreArchivo}`);
  await uploadBytes(archivoRef, archivo, { contentType: archivo.type });
  return getDownloadURL(archivoRef);
}
