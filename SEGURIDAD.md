# Seguridad — deuda conocida y plan

## Estado actual (2026-08-20)

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
2. **Fase 2 (cuando la UI necesite captura/edición manual desde el navegador)**:
   agregar Firebase Auth (login con Google o email/password, dado el tope de 10
   personas del proyecto) y condicionar `write` a `auth != null` como mínimo;
   evaluar roles (lectura pública / escritura solo para colaboradores) si el caso
   de uso lo pide. Las escrituras de los agentes vía Admin SDK no dependen de esta
   fase.
3. **Fase 3**: revisar `storage.rules` si se agrega Firebase Storage (fotos/adjuntos
   por evento) — mismo criterio de raíz bloqueada por default.
4. **Fase 4**: cuando exista el primer agente real escribiendo por Admin SDK,
   documentar aquí dónde vive su cuenta de servicio (nunca en este repo) y qué
   proceso/infraestructura la ejecuta.

## Severidad si se saltara este plan

Si se desplegara una regla abierta (`".read": true, ".write": true"`) por
comodidad de desarrollo y se olvidara revertir, **cualquier persona en internet
podría leer o borrar todos los datos del mapa** — no hay capa intermedia (backend
propio) que lo evite. Por eso el default de este repo es bloqueado, y cualquier
apertura debe ser deliberada, acotada a un nodo, y revisada antes de cada deploy de
reglas.
