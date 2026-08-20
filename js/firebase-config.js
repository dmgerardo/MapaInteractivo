// Configuración de Firebase — reemplazar con los valores reales del proyecto
// (Firebase Console → Configuración del proyecto → Tus apps → SDK setup and configuration).
// No es un secreto crítico (las claves de cliente de Firebase son públicas por diseño;
// la protección real vive en database.rules.json), pero cada proyecto tiene la suya.
export const firebaseConfig = {
  apiKey: 'AIzaSyC82nst7TVXggbNXneHDCm8zexgOwC1m9M',
  authDomain: 'globo-01.firebaseapp.com',
  databaseURL: 'https://globo-01-default-rtdb.firebaseio.com',
  projectId: 'globo-01',
  storageBucket: 'globo-01.firebasestorage.app',
  messagingSenderId: '811085827247',
  appId: '1:811085827247:web:8d87c3e4891c831055585a',
};

export const CONFIGURADO = firebaseConfig.apiKey !== 'PENDIENTE';
