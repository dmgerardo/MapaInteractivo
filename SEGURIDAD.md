# Seguridad — deuda conocida y plan

## Estado actual (2026-08-21)

- **Escritura desde el navegador ahora existe** (capa `misLocalidades`,
  `mantenimiento.html`), protegida por Firebase Auth (Google) + lista de correos
  autorizados en las reglas — ver Fase 2 abajo y `AGENTS.md` sección 8.2. El resto
  de la app (`index.html`, cualquier capa poblada por un agente) sigue siendo
  estrictamente de solo lectura para el cliente.

- **Realtime Database bloqueada por default en la raíz**: `database.rules.json`
  tiene `.read: false` / `.write: false` en la raíz. Los nodos `capas` y `eventos`
  (ver modelo de datos en `AGENTS.md` sección 8) tienen `.read: true` explícito —
  son datos pensados para mostrarse en el mapa, no hay dato sensible ahí. Cualquier
  nodo nuevo que no sea uno de esos dos queda inaccesible hasta tener su propia
  regla.
- **Escritura bloqueada para el cliente web en todos los nodos**, incluidos
  `capas`/`eventos` (`.write: false`). Los agentes de IA escriben con el **SDK
  Admin de Firebase** desde un backend con cuenta de servicio, que **ignora las
  reglas de la base de datos por diseño** — el `.write: false` no los afecta, solo
  bloquea escrituras desde el navegador. Mientras la app web no tenga un flujo de
  captura manual, esto es intencional y no requiere autenticación de usuarios
  todavía.
- ⚠️ **Las reglas en el repo no protegen nada hasta que se publican de verdad**
  (`firebase deploy --only database:rules`, o a mano en la consola). Verificar en
  Firebase Console → Realtime Database → Reglas que lo publicado coincide con
  `database.rules.json` antes de asumir que el proyecto está protegido.
- **`apiKey` de Firebase visible en el cliente** (`js/firebase-config.js`, público en
  el repo): esto es **normal y esperado** para apps web de Firebase — no es una
  clave secreta, es un identificador de proyecto. La protección real vive
  exclusivamente en las reglas de la base de datos, no en ocultar esta clave.

## Plan de remediación por fases

1. ✅ **Fase 1 — hecha (2026-08-20)**: modelo de datos de capas/eventos definido con
   regla explícita por nodo (`.read: true` público, `.write: false` para el
   cliente).
2. ✅ **Fase 2 — hecha (2026-08-21)**: Firebase Auth (Google Sign-In,
   `js/auth.js`) para `mantenimiento.html`, con `write` condicionado no solo a
   `auth != null` sino a una lista explícita de correos autorizados
   (`auth.token.email == '...'` en `database.rules.json`) — ver el detalle de los
   tres lugares que hay que mantener sincronizados en `AGENTS.md` sección 8.2.
   Las escrituras de los agentes vía Admin SDK nunca dependieron de esta fase.
3. ✅ **Fase 3 — hecha (2026-08-21)**: `storage.rules` agregado junto con Firebase
   Storage para las fotos de `misLocalidades` — mismo criterio de raíz bloqueada
   por default (`allPaths=**` con `read`/`write` en `false`), solo `/localidades/**`
   tiene reglas explícitas (lectura pública, escritura solo para los correos
   autorizados, límite de 8 MB y `image/*` obligatorio).
4. ✅ **Fase 4 — hecha (2026-08-20)**: primer agente real (`eventosGeologicos`,
   `functions/index.js`) corre como **Firebase Cloud Function programada** (2nd
   gen, `onSchedule`, una vez al día) dentro del mismo proyecto `globo-01`. Su
   cuenta de servicio es la **identidad por defecto de Cloud Functions** del
   proyecto (no una clave descargada ni versionada) — Firebase la provee
   automáticamente al desplegar, con permisos ya acotados al propio proyecto.
   El deploy de `functions/` desde CI usa el mismo secreto
   `FIREBASE_SERVICE_ACCOUNT_GLOBO_01` que ya existía para Hosting (workflow
   `.github/workflows/deploy-functions.yml`) — esa cuenta de servicio solo
   despliega código, no es la identidad que corre la función.
   Fuentes de datos externas usadas por este agente (USGS, Google News RSS) son
   de solo lectura pública, sin API key ni credencial que proteger.

## Severidad si se saltara este plan

Si se desplegara una regla abierta (`".read": true, ".write": true"`) por
comodidad de desarrollo y se olvidara revertir, **cualquier persona en internet
podría leer o borrar todos los datos del mapa** — no hay capa intermedia (backend
propio) que lo evite. Por eso el default de este repo es bloqueado, y cualquier
apertura debe ser deliberada, acotada a un nodo, y revisada antes de cada deploy de
reglas.
