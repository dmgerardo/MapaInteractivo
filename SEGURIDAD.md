# Seguridad — deuda conocida y plan

## Estado actual (2026-08-20)

- **Realtime Database en modo bloqueado**: `database.rules.json` tiene la raíz en
  `.read: false` / `.write: false`. Hoy **nadie** puede leer ni escribir datos, ni
  siquiera la propia app — es intencional mientras no exista un modelo de datos ni
  autenticación.
- ⚠️ **Las reglas en el repo no protegen nada hasta que se publican de verdad**
  (`firebase deploy --only database:rules`, o a mano en la consola). Verificar en
  Firebase Console → Realtime Database → Reglas que lo publicado coincide con
  `database.rules.json` antes de asumir que el proyecto está protegido.
- **Sin autenticación todavía**: no hay Firebase Auth ni ningún control de sesión.
  Cuando se agregue el primer nodo de datos (eventos por lugar), su regla debe
  condicionar lectura/escritura a un usuario autenticado — nunca abrir un nodo a
  `true` a secas, ni copiar la regla de un nodo vecino sin revisarla.
- **`apiKey` de Firebase visible en el cliente** (`js/firebase-config.js`, público en
  el repo): esto es **normal y esperado** para apps web de Firebase — no es una
  clave secreta, es un identificador de proyecto. La protección real vive
  exclusivamente en las reglas de la base de datos, no en ocultar esta clave.

## Plan de remediación por fases

1. **Fase 1 (antes de guardar el primer dato real)**: definir el modelo de datos de
   capas/eventos y su regla específica por nodo — cada nodo nuevo se agrega ya con
   su propia entrada en `database.rules.json`, nunca después.
2. **Fase 2 (cuando haya escritura desde la UI)**: agregar Firebase Auth (login con
   Google o email/password, dado el tope de 10 personas del proyecto) y condicionar
   `write` a `auth != null` como mínimo; evaluar roles (lectura pública / escritura
   solo para colaboradores) si el caso de uso lo pide.
3. **Fase 3**: revisar `storage.rules` si se agrega Firebase Storage (fotos/adjuntos
   por evento) — mismo criterio de raíz bloqueada por default.

## Severidad si se saltara este plan

Si se desplegara una regla abierta (`".read": true, ".write": true"`) por
comodidad de desarrollo y se olvidara revertir, **cualquier persona en internet
podría leer o borrar todos los datos del mapa** — no hay capa intermedia (backend
propio) que lo evite. Por eso el default de este repo es bloqueado, y cualquier
apertura debe ser deliberada, acotada a un nodo, y revisada antes de cada deploy de
reglas.
