# Próxima sesión — dónde retomar

> Este archivo es un resumen de contexto para arrancar una conversación nueva sin
> perder el hilo. La fuente de verdad de arquitectura/convenciones sigue siendo
> **`AGENTS.md`** (léelo completo) — esto es solo "qué se hizo" y "qué falta".

## Estado del proyecto (2026-08-21)

- **App en producción:** https://globo-01.web.app/ (Firebase Hosting, deploy
  automático en cada push a `main` vía GitHub Actions)
- **Mantenimiento:** https://globo-01.web.app/mantenimiento.html (login Google,
  solo `dmgerardo@gmail.com` autorizado por ahora)
- **Repo:** https://github.com/dmgerardo/MapaInteractivo
- **Firebase project:** `globo-01` (plan Blaze — necesario para Cloud Functions)
- **Versión actual de la app:** v2 (botón junto al título, clic recarga la página)

## Qué existe hoy

1. **Globo interactivo** (`index.html`, `js/main.js`) con `globe.gl` — sin build,
   vanilla JS. Tres modos de vista: satelital / satelital+fronteras / fronteras
   (político, estilo Google Maps). Menú flotante de capas (mostrar/ocultar), panel
   de detalle lateral derecho, panel de "reporte" lateral izquierdo (elementos en
   el hemisferio visible de la cámara, clic centra el mapa ahí).
2. **Modelo de datos** en Realtime Database: `/capas/{capaId}` +
   `/eventos/{capaId}/{eventoId}` — ver `AGENTS.md` sección 8 para el esquema
   completo.
3. **Agente `eventosGeologicos`** (`functions/index.js`, Cloud Function
   programada, corre 1x/día): sismos M≥5.5 de los últimos 7 días desde USGS, con
   noticia relacionada vía Google News RSS cuando la encuentra. Ver
   `AGENTS.md` sección 8.1 para el patrón a seguir si se agrega un agente nuevo.
4. **Capas administradas a mano** (`mantenimiento.html` + `js/mantenimiento.js`):
   `misLocalidades` y `misVecinos`, mismo comportamiento, con pestañas para
   cambiar entre ellas. Requieren Google Sign-In + correo autorizado. Incluye
   carga masiva por CSV (botón "Subir CSV" + "Plantilla CSV"). Ver `AGENTS.md`
   sección 8.2 para el detalle completo (autenticación, Storage para fotos,
   formato del CSV, cómo agregar una capa manual nueva).
5. **Hook de pre-commit activo** (`.githooks/pre-commit`) que sube `APP_VERSION`
   y sincroniza todos los `?v=N` de cache-busting en cada commit que toca
   `.css`/`.js`. Ya está activado en este clon (`git config core.hooksPath
   .githooks`) — **si se clona el repo en otra máquina/sesión, hay que activarlo
   de nuevo con ese comando**, si no el número de versión se queda pegado.
6. **Seguridad**: `database.rules.json` y `storage.rules` con raíz bloqueada por
   default; solo `capas`/`eventos` de lectura pública, y escritura restringida por
   correo (`auth.token.email`) en las capas manuales. Detalle completo y plan de
   fases en `SEGURIDAD.md`.

## Deuda / pendientes conocidos

- **`js/mantenimiento.js` tenía un diagnóstico `TEMPORAL` que ya se limpió**, pero
  si algo similar vuelve a fallar con `permission_denied`, el patrón de diagnóstico
  usado (log de `getIdTokenResult()` para comparar el email del token vs. el de
  `auth.currentUser`) está en el historial de commits (`611ffe7`) por si sirve de
  referencia.
- **No hay changelog visible dentro de la app** (`historial.html` o equivalente) —
  el playbook original lo pide pero nunca se construyó. Si se sigue iterando,
  vale la pena agregarlo (una entrada por cada versión, tono para el usuario
  final).
- **Los toasts de "Agregado ✓" pueden spamear** durante una carga masiva por CSV
  grande, porque `agregar()` (en `db.js`) muestra un toast por cada escritura y el
  CSV escribe fila por fila. Funciona bien, pero la UX de "muchos toasts
  encimados" no se pulió.
- **Sin pruebas de Firebase Storage con archivo real subido por Claude** en esta
  sesión — se verificó la lectura pública contra la carpeta `capas-manuales/` vía
  REST (404 en vez de 403 confirma que la regla de lectura pasa), pero la subida
  real de una foto la probó el usuario, no un test automatizado.
- **Ambiente de esta sesión de Claude Code**: durante buena parte del trabajo, el
  panel de vista previa del navegador (Browser pane) no estaba visible del lado
  del cliente (`document.hidden = true`), lo que pausa `requestAnimationFrame` —
  afecta específicamente: renderizado de `htmlElementsData` (los íconos SVG sobre
  el globo) y las transiciones animadas de `pointOfView()`. La lógica se verificó
  igual por otras vías (inspección de estado vía `javascript_tool`, transiciones
  con `ms=0`), pero **no hubo confirmación visual (captura de pantalla) de varias
  features en esta sesión** — el usuario las confirmó a ojo en producción en su
  lugar. Si el Browser pane vuelve a fallar con ese mismo mensaje de error, es un
  tema de la sesión/entorno, no necesariamente un bug del código.

## Ideas no pedidas todavía (no implementar sin que el usuario las pida)

- Roles más allá de "un solo correo admin" (ej. lectura pública / escritura para
  varios colaboradores) — Fase 2 de `SEGURIDAD.md` ya lo menciona como posible
  siguiente paso si el caso de uso lo pide.
- Más agentes de IA poblando otras capas (el patrón en `AGENTS.md` sección 8.1
  ya está listo para replicarse).
- Filtro del reporte por capa, o búsqueda de texto dentro del reporte.
- Edición/borrado de localidades y vecinos también disponible desde un botón en
  el panel de detalle del mapa público (hoy solo se edita desde
  `mantenimiento.html`).

## Cómo retomar

1. Lee `AGENTS.md` completo antes de tocar código (es la fuente de verdad).
2. Si vas a hacer commits, activa el hook una vez: `git config core.hooksPath
   .githooks`.
3. Para probar local: no hay build — `.claude/launch.json` ya tiene configurado
   un server con `python -m http.server 8080` (usar la herramienta de preview del
   navegador, no levantar servidores por tu cuenta).
4. Cualquier cambio a `database.rules.json` o `storage.rules` requiere que el
   usuario los vuelva a pegar manualmente en Firebase Console (no hay forma
   automática todavía) — avisarle explícitamente cada vez.
