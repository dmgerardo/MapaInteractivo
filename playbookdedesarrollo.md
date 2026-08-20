# Playbook de desarrollo

> Prompt de arranque para Claude Code. Se construyó destilando las prácticas reales
> del proyecto **Planeador de Viajes Familiar** — no es teoría, es lo que de verdad
> se usó, ronda tras ronda. Completa la **Sección 0** con la necesidad del proyecto
> nuevo; todo lo demás (secciones 1–8) es la metodología y la tecnología a conservar.
> Pégalo como primer mensaje al iniciar el repo, o guárdalo directo como
> `AGENTS.md`/`CLAUDE.md` inicial.

---

## 0. Necesidad y funcionalidad — POR DEFINIR

*(Completar antes de usar este prompt. Sin esto, todo lo de abajo es un contenedor
vacío.)*

- **Problema que resuelve:** Necesito un mapa del globo terraqueo interactivo, en dicho mapa iré agregando capas que se irán poblando con información que irán generando agentes de IA que se irán creando uno por uno en el futuro.
- **Para quién** (audiencia, cuántos usuarios simultáneos, confianza entre ellos): 10 personas máximo
- **Alcance del MVP** (lo mínimo que ya es útil, no la lista completa de ideas): mapa interactivo usable desde navegador de PC y smartphone
- **Idioma de la UI y de los comentarios/nombres de código:** *(el proyecto de
  referencia usó español en todo — UI, variables, funciones y comentarios; ajusta
  si el nuevo proyecto es para otra audiencia)* Español e Inglés, depende de la preferencia del usuario 
- **¿Necesita funcionar sin conexión?** *(afecta la sección 5)* no 
- **¿Dato sensible o solo uso privado/familiar de bajo riesgo?** *(afecta cuánto
  urge resolver la Fase 1 de seguridad de la sección 4)* la información publicada ahi debe estar protegida

---

## 1. Stack tecnológico

- **Sin build ni framework**: HTML + CSS + JS vanilla (ES6+), cargado directo con
  `<script>`. Nada de React/Vue/webpack/Vite/npm salvo que el proyecto lo pida
  explícitamente — resolver el problema real no debería requerir una cadena de build.
  sugiero usar las librerías de https://github.com/vasturiano/react-globe.gl 
- **Backend: Firebase** — acepto sugerencias para ir almacenando información de eventos sobre lugares que se pintarán sobre el mapa.
- **Hosting: Firebase Hosting**, con **deploy automático en cada push a `main`** vía
  GitHub Actions:

  ```yaml
  name: Deploy a Firebase Hosting al hacer push a main
  on:
    push:
      branches: [main]
    workflow_dispatch: {}
  jobs:
    build_and_deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: FirebaseExtended/action-hosting-deploy@v0
          with:
            repoToken: '${{ secrets.GITHUB_TOKEN }}'
            firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_<PROYECTO> }}'
            channelId: live
            projectId: <id-del-proyecto-firebase>
  ```

  El secreto de la cuenta de servicio vive en GitHub → Settings → Secrets, **nunca**
  en el repo.

si es necesario agregar backend cambiaría la arquitectura a usar Windows + IIS + SQL Server 

## 2. Arquitectura de código

- Cada "pantalla" (cada `.html`) carga los mismos scripts base — configuración de
  Firebase, utilidades de render, capa de acceso a datos, auth — y luego los scripts
  propios de las vistas que necesita.
- **Patrón por vista**: `montarVistaX(contenedor, id, sesion)` que (1) pinta su HTML
  en `contenedor`, (2) se suscribe a los nodos de Firebase que necesita, (3) devuelve
  una función de limpieza que cancela esos listeners — quien cambia de vista la llama
  al salir. **Nunca dejar un listener de Firebase sin su limpieza.**
- **Capa de acceso a datos centralizada** (`db.js`): `agregar()` / `actualizar()` /
  `eliminar()` / `actualizarMultiple()` — nunca `ref.set()`/`ref.update()` directo
  desde una vista. Esa capa es también el único lugar que sabe:
  - Dar confirmación visual (toast "Guardado ✓" / "Agregado ✓" / "Eliminado") en cada
    escritura.
  - Envolver renders con un helper de **"un render por frame"**, para no repintar N
    veces si Firebase entrega varios `value` seguidos.
  - Mantener el caché offline de solo lectura (ver sección 5).
- **Iconos**: SVG de una librería libre (Lucide u otra) **embebidos inline como
  strings en un solo archivo** (`iconos.js`), nunca por CDN ni como font-icon — así
  siguen disponibles sin conexión. Antes de agregar uno nuevo, traer el `<path>`
  exacto de la fuente oficial (no aproximarlo a mano). Nunca usar emoji como icono
  funcional (botón/chip/bloque de datos) — como mucho, decorativo en un único lugar
  fijo (ej. el `<h1>` de la portada).
- **Permisos**: una única función central resuelve "¿esta persona puede
  agregar/editar/eliminar aquí?" a partir del estado de sesión + participantes/roles.
  Ninguna vista repite esa lógica a mano — la importa.
- **Comentarios**: solo cuando explican el **porqué** no obvio (una decisión con
  alternativas descartadas, una limitación externa, un workaround de un bug
  concreto) — nunca el qué, que ya dicen los nombres bien elegidos. Cuando una
  decisión de diseño se tomó por feedback real de alguien ("se probó X, reportaron Y,
  se resolvió con Z"), vale la pena dejarlo por escrito: evita que una ronda futura
  reintroduzca el mismo problema.
- **Sin sobre-ingeniería**: no agregar frameworks, abstracciones ni capas nuevas sin
  que el proyecto lo necesite de verdad hoy, no "por si acaso" más adelante.

## 3. Convenciones de UI/UX

- Captura de datos **siempre** en un modal con `<form>`, nunca `prompt()`.
  `confirm()` nativo solo para confirmar una acción destructiva (borrar), nunca para
  capturar datos.
- **Agregar y editar comparten el mismo formulario**: `abrirFormularioX(idExistente)`
  — sin id crea (título/botón "Agregar"), con id precarga los valores y actualiza. No
  duplicar el HTML del formulario entre el botón "+" y la fila de la lista.
- **Filas de lista sin botón "Editar" aparte**: la fila completa es clicable y abre
  el formulario de edición directo. "Eliminar" vive **dentro** de ese formulario, no
  suelto en la fila.
- Botones de acción dentro de un formulario (Guardar/Cancelar/Eliminar/Agregar) son
  icon-only, con `aria-label` + `title` — es la única pista de qué hacen.
- Selects en vez de texto libre cuando el valor debe ser válido contra un catálogo
  conocido (zona horaria, categoría, tipo).
- Filtros de listas como chips toggle (no `<select>` múltiple): guardar en un `Set`
  lo **oculto**, no lo activo, para que una categoría nueva aparezca visible por
  default sin tener que "activarla" a mano.
- Todo el idioma de la UI, nombres de variables/funciones y comentarios en el idioma
  definido en la Sección 0.

## 4. Seguridad — no negociable

- **`esc()` en todo texto dinámico** antes de insertarlo vía `innerHTML`. Sin
  excepciones — es la primera defensa anti-XSS.
- **`urlSegura()` (lista blanca de esquemas: http/https/mailto/tel/…) en cualquier
  URL que venga de la base y termine en un `href`** — `esc()` no basta ahí: escapa
  comillas y ángulos, pero un `javascript:…` no lleva ninguno de esos caracteres.
- **Nunca `Math.random()` para algo que deba ser impredecible** (claves de
  invitación, tokens, contraseñas temporales) — usar `crypto.getRandomValues()`.
- Reglas de Firebase (`database.rules.json` / `storage.rules`) **no se publican
  solas**: hay que desplegarlas a mano en la consola o con `firebase deploy --only
  ...`. Un cambio de reglas mergeado a `main` **no protege nada** hasta que se
  publica de verdad.
- Ningún nodo nuevo en el modelo de datos sin su propia regla — la raíz debe ser
  `.read:false` / `.write:false` por default, así que un nodo sin regla queda
  inaccesible (falla en silencio) y uno con la regla copiada del vecino puede quedar
  más abierto de lo que parece.
- **Documentar la deuda de seguridad en vez de esconderla.** Si el proyecto arranca
  con atajos (auth simplificada, sin backend propio, permisos solo verificados en el
  cliente), déjalo escrito en un archivo tipo `SEGURIDAD.md`, con severidad real y un
  plan de remediación por fases — nunca minimizarlo ni dejarlo implícito en el
  código. Si esos atajos implican que cualquiera en internet podría leer/borrar los
  datos, **dilo así de claro**, no lo suavices.

## 5. Fechas, datos y modo offline

- Fechas/horas se guardan **siempre en UTC** (ISO 8601). La conversión a hora local
  se hace solo al pintar, con `Intl.DateTimeFormat`. Nunca construir el offset a
  mano sumando/restando horas — los offsets de horario de verano varían por zona y
  por fecha.

## 6. Metodología de Git/GitHub

- Rama de trabajo dedicada, **reseteada desde `origin/<rama-base>` al inicio de cada
  ronda** de cambios (`git checkout -B <rama> origin/<rama-base>`) — nunca acumular
  rondas viejas ya mergeadas sobre la misma rama de trabajo.
- Cada commit es atómico y su mensaje explica el **porqué**, no el qué (el diff ya
  dice el qué).
- **Hook de pre-commit** que sube automáticamente un número de versión
  (`?v=N` de cache-busting en los `<script>`/`<link>` + una constante `APP_VERSION`)
  cuando el commit toca `.css`/`.js` — actívalo una vez por clon con
  `git config core.hooksPath .githooks`, porque git no lo hace solo sin un gestor de
  paquetes de por medio.
- **Changelog visible dentro de la propia app** (`historial.html` o equivalente), con
  una entrada nueva por cada bump de versión — **en el mismo PR que sube la
  versión**, nunca dejado para después. Tono para el usuario final (qué cambia para
  quien usa la app), el detalle de implementación ya vive en el mensaje del commit.
- Cada ronda de trabajo termina en un **Pull Request** — nunca push directo a la
  rama principal — con descripción de qué cambió y plan de pruebas.
- *(Definir con el usuario si el merge se hace automático tras verificar que no hay
  bloqueadores, o si se espera su aprobación manual en cada PR — el proyecto de
  referencia acordó explícitamente mergear y desplegar sin pedir confirmación en
  cada ronda, pero es una decisión, no un default.)*
- Tras el merge, **verificar que el workflow de deploy terminó en éxito** antes de
  dar la tarea por completada — un merge sin deploy verificado no está terminado.
- Etiquetar cada versión liberada (`release-vNN`, NN = el `APP_VERSION` resultante)
  como punto de retorno documentado, con su push del tag junto con la rama.

## 7. Verificación / testing

Sin framework de tests pesado por default — para un proyecto sin build, verificar
así, en orden:

1. `node --check archivo.js` para errores de sintaxis — rápido, pero **no** atrapa
   errores de runtime/DOM.
2. **Prueba real en navegador** (Playwright u otra herramienta de automatización)
   ejercitando el flujo de punta a punta antes de dar algo por terminado. Un chequeo
   de sintaxis limpio NO significa que la UI funcione.
3. Si el entorno de desarrollo no tiene salida de red hacia el backend real (común
   en sandboxes de agentes de IA): construir un **mock mínimo del SDK**
   (implementando solo lo que la app de verdad usa — `ref/get/on/set/update/
   remove/push`) en vez de saltarse la prueba en navegador.
4. Reportar explícitamente **qué se probó y qué no** (p. ej. "no se pudo confirmar
   contra Firebase real, solo contra el mock") — nunca reportar éxito sin haber
   corrido la app de verdad.

## 8. Documentación viva

- **`AGENTS.md`** (con `CLAUDE.md` apuntando a él en una línea) es la fuente de
  verdad de arquitectura, modelo de datos, convenciones y decisiones tomadas — se
  actualiza **en el mismo PR** que introduce el cambio que documenta, nunca después.
  Se espera que cualquier agente nuevo lo lea completo antes de tocar código.
- **`README.md`** para la puesta en marcha de una persona nueva (humana) — separado
  de `AGENTS.md`, que asume ya familiaridad con el repo.
- **`SEGURIDAD.md`** (si el proyecto tiene deuda de seguridad conocida, ver Sección
  4): hallazgos priorizados + plan de fases, no una lista genérica de buenas
  intenciones.

---

## Cómo usar este playbook

1. Completa la **Sección 0** con la necesidad real del proyecto nuevo — sin eso, el
   resto no tiene qué construir.
2. Pégalo como primer mensaje a Claude Code en el repo nuevo, o guárdalo directo
   como `AGENTS.md`/`CLAUDE.md` inicial del repo.
3. Ajusta cualquier convención que genuinamente no aplique (idioma, si el proyecto
   no necesita modo offline, si el hosting no es Firebase) — son puntos de partida
   probados en producción, no reglas absolutas grabadas en piedra.
