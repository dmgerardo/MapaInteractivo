# Próxima sesión — dónde retomar

> Este archivo es un resumen de contexto para arrancar una conversación nueva sin
> perder el hilo. La fuente de verdad de arquitectura/convenciones sigue siendo
> **`AGENTS.md`** (léelo completo) — esto es solo "qué se hizo" y "qué falta".

## Estado del proyecto (2026-08-21, actualizado tras la sesión del agente de riesgo + UI del globo + favicon)

- **App en producción:** https://globo-01.web.app/ (Firebase Hosting, deploy
  automático en cada push a `main` vía GitHub Actions)
- **Mantenimiento:** https://globo-01.web.app/mantenimiento.html (login Google,
  solo `dmgerardo@gmail.com` autorizado por ahora)
- **Repo:** https://github.com/dmgerardo/MapaInteractivo
- **Firebase project:** `globo-01` (plan Blaze — necesario para Cloud Functions)
- **Versión actual de la app:** v6 (botón junto al título, clic recarga la página)
- **4 PRs mergeados hoy a `main`** (#1–#4): agente de riesgo operativo, ampliación
  de cobertura de esa skill, detalle por zoom + giro automático + centrado en
  México, y favicon/marca.

## Qué existe hoy

1. **Globo interactivo** (`index.html`, `js/main.js`) con `globe.gl` — sin build,
   vanilla JS. Tres modos de vista: satelital / satelital+fronteras / fronteras.
   En los dos modos con fronteras, **detalle progresivo por zoom** (nuevo hoy):
   fronteras estatales + nombres de país/estado/ciudad aparecen según la altitud
   de cámara (`actualizarDetallePorZoom()`, umbrales en `UMBRAL_ALTITUD_ESTADOS`/
   `UMBRAL_ALTITUD_CIUDADES`). Menú flotante de capas, menú de vista, **control de
   giro automático** con slider de velocidad (`#menu-giro`,
   `globo.controls().autoRotate`/`.autoRotateSpeed`), panel de detalle lateral
   derecho, panel de "reporte" lateral izquierdo. El globo **abre centrado en
   México** (`CENTRO_MEXICO`), no en `(0,0)`. Ver `AGENTS.md` sección 3 para el
   detalle completo de cada pieza.
2. **Modelo de datos** en Realtime Database: `/capas/{capaId}` +
   `/eventos/{capaId}/{eventoId}` — ver `AGENTS.md` sección 8 para el esquema
   completo.
3. **Agente `eventosGeologicos`** (`functions/index.js`, Cloud Function
   programada, corre 1x/día): sismos M≥5.5 de los últimos 7 días desde USGS. Ver
   `AGENTS.md` sección 8.1.
4. **Agente `riesgoOperativo` (nuevo hoy, `AGENTS.md` sección 8.3)** — patrón
   distinto al anterior: la búsqueda de noticias la hace una **Routine de Claude
   Code** (`trig_01Y73ijmDoSuRzRaSvrXvQY1`, diaria ~06:00 CDMX,
   `create_new_session_on_fire`), siguiendo
   `.claude/skills/riesgo-operativo-mapa/SKILL.md`; la escritura pasa por la
   Cloud Function `ingerirRiesgoOperativo` (HTTPS, protegida con el secreto
   `RIESGO_INGEST_TOKEN`). Puebla 5 capas nuevas: `riesgoOrdenPublico`,
   `riesgoSeguridad`, `riesgoVialidad` (incluye accidentes de tránsito, no solo
   obras), `riesgoClima`, `riesgoAduanas`. Reemplaza al skill de chat
   `reporte-riesgo-operativo` (reporte de texto bajo demanda, ya retirado del
   proyecto — ver deuda abajo).
5. **Favicon y marca de la app (nuevo hoy)**: `iconos/favicon.svg` +
   `iconos/mask-icon.svg` + `iconos/icono-180.png`/`icono-512.png` +
   `site.webmanifest`, todo SVG inline / sin CDN. El emoji 🌍 del `<h1>` se
   reemplazó por `ICONOS.marca` (SVG inline, mismo patrón que el resto de la UI).
6. **Capas administradas a mano** (`mantenimiento.html` + `js/mantenimiento.js`):
   `misLocalidades` y `misVecinos`. Ver `AGENTS.md` sección 8.2.
7. **Hook de pre-commit activo** (`.githooks/pre-commit`, ahora con el bit +x
   correctamente commiteado — antes tenía un bug donde nunca corría en un clon
   nuevo aunque se activara con `git config core.hooksPath .githooks`, ya
   corregido) — sube `APP_VERSION` y sincroniza todos los `?v=N` de cache-busting
   en cada commit que toca `.css`/`.js`/`.html`... en realidad solo
   `index.html`/`mantenimiento.html`/`js/*.js`, no `functions/**` (server-side,
   no necesita cache-busting). **Actívalo una vez por clon**:
   `git config core.hooksPath .githooks`.
8. **Seguridad**: `database.rules.json` y `storage.rules` con raíz bloqueada por
   default. Detalle completo y plan de fases (incluida la Fase 5 de hoy, el
   token de `ingerirRiesgoOperativo`) en `SEGURIDAD.md`.

## Deuda / pendientes conocidos

- **Sin confirmación visual de la sesión de hoy en producción real**: el
  sandbox de esta sesión bloquea por política de red el CDN de globe.gl
  (`jsdelivr.net`, `unpkg.com`), los mirrors de Natural Earth para
  estados/ciudades, el endpoint de Cloud Functions (`cloudfunctions.net`), y
  llamadas directas a `api.github.com` (solo la tool MCP de GitHub funciona) —
  **nada de esto se pudo probar visualmente en navegador real dentro de esta
  sesión**. Se verificó todo lo posible por otras vías (mocks de Firebase +
  Playwright para el `<head>`/íconos, mock del Admin SDK para la Cloud
  Function, `node --check` para sintaxis), pero falta que alguien confirme en
  producción: (a) que el detalle por zoom (fronteras estatales + nombres)
  aparece y que el glitch de picos ya no sale, (b) que el control de giro/
  velocidad funciona, (c) que el favicon se ve bien en la pestaña y en
  dispositivos, (d) que las fuentes de Natural Earth
  (`ne_50m_admin_1_states_provinces.geojson`,
  `ne_110m_populated_places.geojson`, ambas vía
  `cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/...`) realmente existen en
  esas URLs/nombres de campo — si no, degradan con gracia (sin detalle extra,
  no rompen el mapa) pero conviene saberlo.
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
   incluida la sección 8.3 nueva de hoy).
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
   explícitamente cada vez.
5. Si tocas algo de `riesgoOperativo`: la skill vive en
   `.claude/skills/riesgo-operativo-mapa/SKILL.md`, la Cloud Function en
   `functions/index.js` (`ingerirRiesgoOperativo`), y la Routine se administra
   con `list_triggers`/`update_trigger` de la MCP `Claude_Code_Remote`
   (id `trig_01Y73ijmDoSuRzRaSvrXvQY1`).
