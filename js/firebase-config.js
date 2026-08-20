// Configuración de Firebase — reemplazar con los valores reales del proyecto
// (Firebase Console → Configuración del proyecto → Tus apps → SDK setup and configuration).
// No es un secreto crítico (las claves de cliente de Firebase son públicas por diseño;
// la protección real vive en database.rules.json), pero cada proyecto tiene la suya.
export const firebaseConfig = {
  apiKey: 'PENDIENTE',
  authDomain: 'PENDIENTE.firebaseapp.com',
  databaseURL: 'https://PENDIENTE.firebaseio.com',
  projectId: 'PENDIENTE',
  storageBucket: 'PENDIENTE.appspot.com',
  messagingSenderId: 'PENDIENTE',
  appId: 'PENDIENTE',
};

export const CONFIGURADO = firebaseConfig.apiKey !== 'PENDIENTE';
