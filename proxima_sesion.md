# Próxima sesión — dónde retomar

> Este archivo es un resumen de contexto para arrancar una conversación nueva sin
> perder el hilo. La fuente de verdad de arquitectura/convenciones sigue siendo
> **`AGENTS.md`** (léelo completo) — esto es solo "qué se hizo" y "qué falta".

## Estado del proyecto (2026-08-26, actualizado tras histórico de eventos, agrupar marcadores y revisión de performance)

- **App en producción:** https://globo-01.web.app/ (Firebase Hosting, deploy
  automático en cada push a `main` vía GitHub Actions)
- **Mantenimiento:** https://globo-01.web.app/mantenimiento.html (login Google,
  solo `dmgerardo@gmail.com` autorizado por ahora)
- **Repo:** https://github.com/dmgerardo/MapaInteractivo
- **Firebase project:** `globo-01` (plan Blaze — necesario para Cloud Functions)
- **Versión actual de la app:** v10 (botón junto al título, clic recarga la página)
- **8 PRs mergeados a `main`** (#1–#8) en dos sesiones: agente de riesgo operativo,
  ampliación de cobertura de esa skill, detalle por zoom + giro automático +
  centrado en México, favicon/marca, corrección de tamaño/altitud/contraste de
  etiquetas de fronteras, fix de z-fighting en polígonos de estado (no era la
  causa real), y el fix real de la división estatal de México (Natural Earth no
  la tiene, se agregó `datos/mexico-estados.geojson`). Esta ronda (histórico +
  clustering + performance) todavía no tiene PR — ver "Cómo retomar" abajo si la
  sesión se cortó antes de mergear.

## Qué existe hoy

1. **Globo interactivo** (`index.html`, `js/main.js`) con `globe.gl` — sin build,
   vanilla JS. Tres modos de vista: satelital / satelital+fronteras / fronteras.
   En los dos modos con fronteras, **detalle progresivo por zoom**: fronteras
   estatales (Natural Earth para 9 países grandes + `datos/mexico-estados.geojson`
   propio para México, ver deuda de cobertura si se agrega otro país) + nombres
   de país/estado/ciudad según la altitud de cámara. Menú flotante de capas, menú
   de vista, **control de giro automático** con slider de velocidad, panel de
   detalle lateral derecho, panel de "reporte" lateral izquierdo, **panel de
   histórico** (nuevo hoy, ver punto 4). El globo **abre centrado en México**
   (`CENTRO_MEXICO`), no en `(0,0)`. **Los marcadores de eventos cercanos se
   agrupan** (nuevo hoy, `agruparPuntos()`) en un badge con conteo cuando están
   muy juntos, para que no se sobrepongan — se separan solos al acercar la
   cámara. Ver `AGENTS.md` sección 3 para el detalle completo de cada pieza.
2. **Modelo de datos** en Realtime Database: `/capas/{capaId}` +
   `/eventos/{capaId}/{eventoId}` — ver `AGENTS.md` sección 8 para el esquema
   completo.
3. **Agente `eventosGeologicos`** (`functions/index.js`, Cloud Function
   programada, corre 1x/día): sismos M≥5.5 de los últimos 7 días desde USGS. Ver
   `AGENTS.md` sección 8.1.
4. **Histórico de eventos (nuevo hoy, `AGENTS.md` sección 8.4)**: cada vez que un
   agente poda un evento vencido/huérfano, antes de borrarlo se archiva en
   `/historico/{capaId}` (nunca se sobreescribe, `push()` + `eventoIdOriginal` +
   `archivadoUTC`). El cliente lo consulta por rango de fechas desde el panel
   `#menu-historico` (botón junto al de reporte) — **nunca un listener en vivo**,
   solo una consulta puntual indexada por `fechaUTC` cuando el usuario pulsa
   "Mostrar histórico", con tope de 300 eventos por capa. Casilla "Ocultar
   eventos actuales" independiente del histórico, para despejar el mapa.
5. **Agente `riesgoOperativo`** (`AGENTS.md` sección 8.3) — la búsqueda de
   noticias la hace una **Routine de Claude Code**
   (`trig_01Y73ijmDoSuRzRaSvrXvQY1`, diaria ~06:00 CDMX,
   `create_new_session_on_fire`), siguiendo
   `.claude/skills/riesgo-operativo-mapa/SKILL.md`; la escritura pasa por la
   Cloud Function `ingerirRiesgoOperativo` (HTTPS, protegida con el secreto
   `RIESGO_INGEST_TOKEN`, y hoy paraleliza sus 5 lecturas por capa con
   `Promise.all`). Puebla 5 capas: `riesgoOrdenPublico`, `riesgoSeguridad`,
   `riesgoVialidad`, `riesgoClima`, `riesgoAduanas`.
6. **Favicon y marca de la app**: `iconos/favicon.svg` + `iconos/mask-icon.svg` +
   `iconos/icono-180.png`/`icono-512.png` + `site.webmanifest`, todo SVG inline /
   sin CDN.
7. **Capas administradas a mano** (`mantenimiento.html` + `js/mantenimiento.js`):
   `misLocalidades` y `misVecinos`. Ver `AGENTS.md` sección 8.2. **No tienen
   punto de poda automática**, así que el borrado manual desde ahí todavía no
   archiva en `/historico` (deuda, ver abajo).
8. **Hook de pre-commit activo** (`.githooks/pre-commit`) — sube `APP_VERSION` y
   sincroniza todos los `?v=N` de cache-busting en cada commit que toca
   `.css`/`.js`/`.html` (`index.html`/`mantenimiento.html`/`js/*.js`, no
   `functions/**`). **Actívalo una vez por clon**: `git config core.hooksPath
   .githooks`.
9. **Seguridad**: `database.rules.json` y `storage.rules` con raíz bloqueada por
   default; `historico` es de solo lectura pública igual que `eventos`, con
   `.indexOn: ["fechaUTC"]`. Detalle completo y plan de fases en `SEGURIDAD.md`.

## Deuda / pendientes conocidos

- **Sin confirmación visual en navegador real del histórico ni del clustering
  de marcadores** (sesión 2026-08-26): el sandbox de esta sesión sigue
  bloqueando `cdn.jsdelivr.net`/`unpkg.com`/`gstatic.com`/`*.firebaseio.com`
  (política de red del proxy), así que el globo 3D real no carga acá. Sí se
  verificó con un **mock propio de globe.gl + Firebase** vía Playwright
  (`chromium.launch` necesita `--no-sandbox` en este entorno, y `pkill` está
  bloqueado por la política de comandos — usar `ps aux | grep` + `kill <pid>`
  si hace falta matar un proceso colgado): el panel de histórico abre, la
  consulta combina eventos vivos + históricos correctamente, el checkbox
  "ocultar actuales" funciona, y el clustering agrupa/desagrupa según la
  altitud simulada. También se probó `ingerirRiesgoOperativo` completo
  (escritura, poda, archivado en `/historico`, lecturas en paralelo) con un
  mock del Admin SDK. Falta que alguien confirme en producción real: (a) que
  los marcadores agrupados se ven bien y el zoom-al-hacer-clic funciona, (b)
  que el panel de histórico trae datos reales una vez que haya algo archivado
  (hoy `/historico` está vacío hasta la próxima poda de un agente), (c) que
  las reglas nuevas de `database.rules.json` (`historico` + su índice) se
  publicaron de verdad en Firebase Console — **avisar al usuario explícitamente**,
  ver Sección 4/Cómo retomar.
- **Descubrimiento de red útil para la próxima sesión**: aunque
  `cdn.jsdelivr.net`/`unpkg.com` siguen bloqueados en este sandbox,
  `raw.githubusercontent.com`, `media.githubusercontent.com` (para archivos
  LFS), `registry.npmjs.org` y `pypi.org` **sí son alcanzables** — útil para
  descargar datasets/paquetes de verificación sin depender de la tool MCP de
  GitHub (que solo cubre repos en el scope de la sesión).
- **El skill de chat `reporte-riesgo-operativo` sigue reapareciendo** en la
  lista de skills disponibles pese a haberlo borrado de
  `~/.claude/skills/synced/` — es un skill "custom" sincronizado desde la
  configuración de claude.ai del usuario, se resincroniza solo. Hay que
  retirarlo desde ahí (fuera del repo, no algo que Claude Code pueda hacer por
  su cuenta). `gv-reporte-riesgo-operativo` es de otro contexto/usuario, no se
  tocó y no hay que tocarlo.
- **El secreto `RIESGO_INGEST_TOKEN` vive en dos lugares** que hay que mantener
  sincronizados si se rota: Firebase Secret Manager (lo usa
  `ingerirRiesgoOperativo`) y una variable de entorno en el **entorno de
  Claude Code** (`env_01MybeHYELFBbKxHk8mb35De`) que usa la Routine diaria
  para el `curl` final. Si se rota uno sin el otro, la ingesta empieza a fallar
  con 401 — el prompt de la Routine ya instruye detenerse y avisar en ese caso,
  no reintentar a ciegas.
- **`js/mantenimiento.js` tenía un diagnóstico `TEMPORAL` que ya se limpió**;
  si vuelve a fallar `permission_denied`, el patrón de diagnóstico usado está
  en el historial (`611ffe7`).
- **No hay changelog visible dentro de la app** (`historial.html` o
  equivalente) — pendiente desde hace varias sesiones, nunca se construyó.
- **Los toasts de "Agregado ✓" pueden spamear** durante una carga masiva por
  CSV grande (un toast por fila).
- **Sin pruebas de Firebase Storage con archivo real subido por Claude** — la
  subida real de una foto la probó el usuario, no un test automatizado.
- **Las capas manuales (`misLocalidades`/`misVecinos`) no archivan en
  `/historico`** cuando se borran desde `mantenimiento.html` — el histórico
  (sección 8.4 de `AGENTS.md`) hoy solo lo llenan los dos agentes automáticos.
  Si se quiere histórico de esas capas también, hace falta decidir si vale la
  pena la escritura de cliente a `/historico` (mismas reglas de admin por
  correo que ya usan esas capas) — no implementado, ver AGENTS.md 8.4.

## Ideas no pedidas todavía (no implementar sin que el usuario las pida)

- **Favicon dinámico por nivel de riesgo** (punto ámbar → magenta cuando hay
  eventos nivel 4-5 en vista) — explícitamente marcado fuera de alcance por el
  usuario en la sesión de hoy, es una decisión de producto pendiente.
- Roles más allá de "un solo correo admin" — Fase 2 de `SEGURIDAD.md`.
- Más agentes de IA poblando otras capas (dos patrones ya listos para
  replicarse: Cloud Function pura, sección 8.1; o búsqueda en Claude Code +
  Cloud Function de ingesta, sección 8.3).
- Filtro del reporte por capa, o búsqueda de texto dentro del reporte.
- Edición/borrado de localidades y vecinos también disponible desde un botón en
  el panel de detalle del mapa público (hoy solo se edita desde
  `mantenimiento.html`).
- Correr la Routine del agente de riesgo más de 1x/día (se decidió 1x/día por
  costo; un bloqueo de unas horas podría no capturarse si aparece y se resuelve
  entre corridas).

## Cómo retomar

1. Lee `AGENTS.md` completo antes de tocar código (es la fuente de verdad,
   incluida la sección 8.4 nueva de hoy).
2. Si vas a hacer commits, activa el hook una vez: `git config core.hooksPath
   .githooks` (ya corregido el bug del bit +x, pero sigue sin activarse solo en
   un clon nuevo).
3. Para probar local: no hay build — `python -m http.server 8080` +
   herramienta de preview del navegador. **Si estás en un sandbox con política
   de red restrictiva** (revisa si `curl` a `unpkg.com`/`jsdelivr.net` da 403),
   el globo 3D no va a cargar — no es un bug del código, es el entorno. En ese
   caso, las pruebas de UI que no dependan de `Globe()` (favicon, `<head>`,
   íconos sueltos de `js/iconos.js`) sí se pueden hacer con Playwright + mock
   de los imports de Firebase (`page.route` sobre las URLs de
   `gstatic.com/firebasejs`).
4. Cualquier cambio a `database.rules.json` o `storage.rules` requiere que el
   usuario los vuelva a pegar manualmente en Firebase Console — avisarle
   explícitamente cada vez. **Pendiente de publicar (2026-08-26)**: el nodo
   `historico` nuevo (lectura pública, escritura bloqueada, `.indexOn` por
   `fechaUTC`) — sin publicar esto, la consulta del panel de histórico falla
   en silencio (`get()` sin índice explota con "Index not defined" en la
   consola del navegador, no rompe el resto del mapa).
5. Si tocas algo de `riesgoOperativo`: la skill vive en
   `.claude/skills/riesgo-operativo-mapa/SKILL.md`, la Cloud Function en
   `functions/index.js` (`ingerirRiesgoOperativo`), y la Routine se administra
   con `list_triggers`/`update_trigger` de la MCP `Claude_Code_Remote`
   (id `trig_01Y73ijmDoSuRzRaSvrXvQY1`).
6. Si tocas el histórico o el agrupado de marcadores: ambos están documentados
   en `AGENTS.md` secciones 3 y 8.4 — leerlas antes de cambiar altitudes de
   celda, el tope `LIMITE_HISTORICO_POR_CAPA`, o el helper `entradasHistorico()`
   compartido entre los dos agentes en `functions/index.js`.
