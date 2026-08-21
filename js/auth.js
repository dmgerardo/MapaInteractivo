// Autenticación (Google Sign-In) — solo se usa en páginas de mantenimiento que
// necesitan escribir datos. El mapa público (index.html) no la importa.
import { firebaseConfig, CONFIGURADO } from './firebase-config.js?v=6';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// La lista real de quién puede escribir vive en database.rules.json / storage.rules
// (auth.token.email) — esto solo controla qué botones mostrar en la UI. Mantener
// sincronizada con esas reglas al agregar un administrador nuevo.
export const ADMINS_AUTORIZADOS = ['dmgerardo@gmail.com'];

let auth = null;
if (CONFIGURADO) {
  const app = getApps()[0] || initializeApp(firebaseConfig);
  auth = getAuth(app);
} else {
  console.warn('Firebase no está configurado todavía (js/firebase-config.js). El login no funcionará.');
}

export function esAdmin(usuario) {
  return !!usuario && ADMINS_AUTORIZADOS.includes(usuario.email);
}

export async function iniciarSesionGoogle() {
  if (!auth) return;
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function cerrarSesion() {
  if (!auth) return;
  await signOut(auth);
}

export function onCambioSesion(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export { auth };
