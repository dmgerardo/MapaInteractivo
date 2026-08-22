# Playbook de desarrollo

> Prompt de arranque para Claude Code. Se construyó destilando las prácticas reales
> del proyecto **Planeador de Viajes Familiar** — no es teoría, es lo que de verdad
> se usó, ronda tras ronda. Completa la **Sección 0** con la necesidad del proyecto
> nuevo; todo lo demás (secciones 1–8) es la metodología y la tecnología a conservar.
> Pégalo como primer mensaje al iniciar el repo, o guárdalo directo como
> `AGENTS.md`/`CLAUDE.md` inicial.

---

## 0. Necesidad y funcionalidad

- **Problema que resuelve:** Necesito un mapa del globo terraqueo interactivo, en dicho mapa iré agregando capas que se irán poblando con información que irán generando agentes de IA que se irán creando uno por uno en el futuro.
- **Para quién** (audiencia, cuántos usuarios simultáneos, confianza entre ellos): 10 personas máximo
- **Alcance del MVP** (lo mínimo que ya es útil, no la lista completa de ideas): mapa interactivo usable desde navegador de PC y smartphone
- **Idioma de la UI y de los comentarios/nombres de código:** Español e Inglés, depende de la preferencia del usuario 
- **¿Necesita funcionar sin conexión?** no 
- **¿Dato sensible o solo uso privado/familiar de bajo riesgo?** la información publicada ahi debe estar protegida

---

## 1. Stack tecnológico

- **Sin build ni framework**: HTML + CSS + JS vanilla (ES6+), cargado directo con
  `<script>`. Nada de React/Vue/webpack/Vite/npm salvo que el proyecto lo pida
  explícitamente — resolver el problema real no debería requerir una cadena de build.
  Sugerencia: usar la librería de https://github.com/vasturiano/react-globe.gl 
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

Si es necesario agregar backend cambiaría la arquitectura a usar Windows + IIS + SQL Server 

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
- **Eventos sobre el globo**: cada uno se pinta con un ícono SVG según su
  `categoria` (`js/iconos.js`, objeto `ICONOS_EVENTO`), no con un punto genérico —
  agrega el ícono correspondiente ahí cuando un agente nuevo introduzca una
  categoría; si no hay uno, cae en `ICONO_EVENTO_DEFAULT` (un pin genérico), nunca
  se queda sin ícono. Se implementa con la capa `htmlElementsData` de globe.gl
  (`.htmlElement()`), no con `pointsData` — permite usar cualquier SVG/HTML en vez
  de la cápsula 3D default.
- **Menú flotante de capas** (`#menu-capas`, abajo a la izquierda): un chip por
  capa existente en `/capas`, generado dinámicamente — nunca hay que tocar el menú
  a mano al agregar un agente nuevo. Sigue el mismo patrón de `Set` de ocultos
  descrito arriba: ocultar una capa la agrega a `capasOcultasPorUsuario` en
  `js/main.js`, es estado de sesión (no se guarda en Firebase, el cliente no tiene
  permiso de escritura ahí — ver Sección 8).
- **Vista inicial centrada en México** (`CENTRO_MEXICO`, `js/main.js`): el
  `pointOfView` de arranque usa el centro geográfico aproximado del país
  (`lat: 23.6345, lng: -102.5528`) en vez del `(0,0)` por defecto de globe.gl —
  aplica sin importar qué vista (`satelite`/`satelite-fronteras`/`fronteras`)
  esté activa al cargar.
- **Menú de vista del mapa** (`#menu-vista`, abajo a la derecha, `js/main.js`):
  tres modos — `satelite` (default), `satelite-fronteras` (misma imagen satelital +
  contorno de países) y `fronteras` (mapa político plano, sin satélite, al estilo
  Google Maps). Los contornos vienen de un GeoJSON público de Natural Earth
  (`//unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson`,
  ~480 KB) que se descarga **una sola vez, perezosamente** (`obtenerPaises()`, solo
  al elegir un modo con fronteras por primera vez) y se cachea en memoria — nunca en
  `satelite` puro. El color de océano plano del modo `fronteras` se genera con un
  `<canvas>` de 2×2px en tiempo de ejecución (`generarColorPlano()`), no es un
  archivo de imagen — evita depender de un asset extra solo para un color sólido.
  Usa las capas `polygonsData`/`polygonCapColor`/`polygonStrokeColor` de globe.gl,
  no `htmlElementsData` (esa es para los marcadores de eventos). El
  `polygonAltitude` de `fronteras` es `0.012`, más alto que el de
  `satelite-fronteras` (`0.001`) — a una altitud tan baja las paredes laterales de
  países grandes y cóncavos (ej. Brasil) generaban z-fighting visible (picos/rayas
  parpadeantes); en `satelite-fronteras` no aplica porque ahí la pared es
  transparente.
- **Detalle progresivo por zoom en los modos con fronteras** (2026-08-21,
  `js/main.js`): además de las fronteras de país (siempre visibles en estos dos
  modos), se agregan fronteras estatales/provinciales y nombres de país/estado/
  ciudad según la altitud de cámara — mismo espíritu "estilo Google Maps" que pidió
  el usuario, sin tile server ni librería nueva. Reutiliza el `.onZoom()` que ya
  alimenta `alCambiarCamara()`, no hay mecanismo de detección de zoom aparte.
  Tres niveles (`nivelParaAltitud()`): país siempre · +estados bajo
  `UMBRAL_ALTITUD_ESTADOS` (`1.0`) · +ciudades bajo `UMBRAL_ALTITUD_CIUDADES`
  (`0.4`) — solo se recalcula cuando el nivel realmente cambia, no en cada tick de
  zoom. Estados y ciudades se descargan perezosamente igual que `obtenerPaises()`
  (`obtenerEstados()`/`obtenerLugares()`, Natural Earth 50m y 110m respectivamente
  — Natural Earth no publica fronteras estatales a 110m, por eso el nivel de
  detalle no es uniforme entre las tres fuentes) pero **degradan a "sin detalle
  extra" si la fuente falla** (`try/catch` → `[]`) en vez de romper el resto del
  mapa — es mejora visual, no dato del que dependa la app. Las fronteras
  estatales se pintan con relleno transparente (solo el trazo) para no repintar
  encima del color del país. Los nombres se dibujan con la capa `labelsData` de
  globe.gl (`labelLat`/`labelLng`/`labelText`, tamaño/color según el nivel), con
  un centroide aproximado por promedio de vértices del anillo más grande de cada
  polígono (`centroideDePoligono()`) — no es un centroide geográfico exacto, solo
  necesita alcanzar para ubicar el texto. **Altitud y color de las etiquetas
  (2026-08-22, corrección):** `ALTITUD_ETIQUETAS` (`0.02`) tiene que quedar por
  encima de la altitud más alta usada por los polígonos (`ALTITUD_POLIGONO_ESTADOS_FRONTERAS`,
  `0.016`) — con una altitud menor el texto queda por debajo de la superficie del
  país/estado y las paredes laterales de la extrusión lo cortan/tapan. El color
  (`colorEtiqueta()`) lee `vistaActual` en vez de ser fijo: blanco en
  `satelite-fronteras` (fondo de imagen satelital oscura, un gris oscuro ahí se
  perdía por completo) y gris oscuro en `fronteras` (fondo plano claro). `labelSize`
  también se redujo (país `0.45`/estado `0.3`/ciudad `0.2`, antes hasta `1.15`) —
  los valores originales generaban texto desproporcionadamente grande frente al
  tamaño real de los países. **Altitud de los polígonos de estado (2026-08-22,
  corrección):** un estado ocupa exactamente la misma área que su país, así que a
  la misma altitud que `ALTITUD_POLIGONO_FRONTERAS`/`ALTITUD_POLIGONO_SATELITE_FRONTERAS`
  el borde estatal competía por el mismo plano que el país (z-fighting) y ganaba o
  perdía el desempate según la geometría exacta de cada país, sin relación con los
  datos — los estados de EE.UU. se veían, los de México no, con la misma fuente
  para ambos. `polygonAltitude` pasó de un número fijo a una función
  (`altitudPoligono()`) que sube el nivel "estado" claramente por encima del país
  (`ALTITUD_POLIGONO_ESTADOS_FRONTERAS` `0.016` / `ALTITUD_POLIGONO_ESTADOS_SATELITE_FRONTERAS`
  `0.004`) en vez de compartir la misma altitud.
- **Giro automático** (`#menu-giro`, junto al menú de vista, `js/main.js`):
  usa directo `globo.controls().autoRotate`/`.autoRotateSpeed` — son propiedades
  de los controles de three.js/OrbitControls que expone globe.gl, no hace falta
  estado ni librería propia. El botón alterna ícono `reproducir`/`pausar`
  (`js/iconos.js`) según el estado; un slider (`#control-velocidad-giro`) que solo
  aparece mientras gira ajusta `autoRotateSpeed` en vivo. Preferencia de sesión,
  no se guarda en Firebase (mismo criterio que `capasOcultasPorUsuario`).
- **Reporte de elementos en vista** (`#panel-reporte`, botón junto al de capas,
  `js/main.js`): lista en vivo de los eventos que caen en el **hemisferio visible**
  respecto a la cámara actual — mismo criterio de "cerca/lejos de la cámara" que
  usa three-globe internamente para mostrar/ocultar marcadores (distancia angular
  < 90°, `enHemisferioVisible()`), calculado con la posición de cámara que entrega
  `.onZoom()` en cada rotación/zoom. La lista solo se recalcula mientras el panel
  está abierto (`panelReporte` sin la clase `oculto`), para no gastar trabajo de
  render en cada frame de rotación cuando nadie la está viendo. Clic en una fila
  llama `globo.pointOfView({ lat, lng }, 1000)` para centrar la cámara ahí, sin
  tocar la altitude actual (mantiene el zoom del usuario).

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
- **Hook de pre-commit** (`.githooks/pre-commit`, implementado 2026-08-21) que sube
  automáticamente un número de versión único y lo sincroniza en **todos** los `?v=N`
  de cache-busting (`index.html`, `mantenimiento.html`, los `import` entre módulos
  en `js/*.js`) más la constante `APP_VERSION` (`js/version.js`, se muestra junto al
  título en el mapa) — cuando el commit toca algún `.css`/`.js`. Un solo número
  global, no un contador independiente por archivo. Actívalo una vez por clon con
  `git config core.hooksPath .githooks`, porque git no lo hace solo sin un gestor de
  paquetes de por medio — **sin ese paso el número de versión nunca sube**, aunque
  el resto de la app se despliegue bien.
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

## 8. Modelo de datos (Realtime Database)

Decidido 2026-08-20: **una capa = un agente de IA**. Cada agente tiene su propio
nodo de capa; no comparten nodos entre sí, así se evitan colisiones de escritura y
los permisos quedan simples.

```
/capas/{capaId}
  nombre:      string   — nombre visible de la capa/agente
  descripcion: string
  color:       string   — color hex para pintar los puntos de esta capa en el globo
  activa:      boolean  — si se muestra por default al cargar el mapa
  creadaUTC:   string   — ISO 8601

/eventos/{capaId}/{eventoId}
  lat:         number
  lon:         number
  titulo:      string
  descripcion: string
  categoria:   string
  fechaUTC:    string   — ISO 8601, cuándo ocurrió el evento (no cuándo se registró)
  fuenteUrl:   string   — opcional, enlace a la fuente que usó el agente
  creadoUTC:   string   — ISO 8601, cuándo el agente lo escribió
```

- **Los agentes de IA escriben con el SDK Admin de Firebase (backend), nunca desde
  el cliente web.** Por eso `database.rules.json` tiene `capas`/`eventos` en
  `.write: false` — el Admin SDK usa una cuenta de servicio y **ignora las reglas
  de la base de datos por diseño**, así que ese `false` no bloquea a los agentes,
  solo bloquea escrituras accidentales o maliciosas desde el navegador.
- El cliente web (este repo) es **solo lectura** de `capas`/`eventos` — se suscribe
  vía `suscribir()` (`js/db.js`) y nunca llama `agregar()`/`actualizar()`/
  `eliminar()` sobre estos nodos. Esas funciones de escritura existen en `db.js`
  para el día que la UI necesite captura manual (fuera del alcance del MVP), no
  para el flujo de los agentes.
- Todo lo que no sea `capas`/`eventos` sigue bloqueado por la regla raíz
  (`.read: false` / `.write: false`) — cualquier nodo nuevo necesita su propia
  entrada explícita en `database.rules.json` antes de usarse (ver Sección 4 y
  `SEGURIDAD.md`).

## 8.1 Cómo agregar un agente nuevo

Cada agente es una **Firebase Cloud Function programada** (2nd gen, `onSchedule`)
que vive en `functions/index.js`, exportada con su propio nombre. Patrón a seguir
para el siguiente agente:

1. Elegir un `CAPA_ID` único (mismo criterio que la clave del nodo en `/capas`).
2. Leer su configuración desde `/config/{capaId}` vía Admin SDK, con un default
   razonable si el nodo aún no existe (y escribirlo la primera vez) — así queda
   ajustable sin redeploy, con **cambios directo en Firebase Console → Realtime
   Database** (ese nodo no es visible desde la app web: la raíz lo bloquea por
   default, ver Sección 8).
3. Hacer upsert de la metadata en `/capas/{capaId}` (nombre, color, activa).
4. Escribir cada evento en `/eventos/{capaId}/{eventoId}` — usar un id estable
   de la fuente original (no `push()`) para que correr el agente de nuevo
   **actualice**, no duplique.
5. Exportar la función con `onSchedule({ schedule: '...', timeZone: '...' }, fn)`.
6. Agregar el deploy en `.github/workflows/deploy-functions.yml` (ya cubre todo
   `functions/**`, no requiere cambios si solo se agrega una función al mismo
   archivo).

**Primer agente — `eventosGeologicos`** (`functions/index.js`,
`actualizarEventosGeologicos`): sismos del feed FDSN del USGS (gratis, sin API key,
coordenadas exactas), filtrados por `config.diasHaciaAtras` y
`config.magnitudMinima` (default 7 días / M5.5). Por cada sismo intenta encontrar
una noticia relacionada vía Google News RSS (`buscarNoticia()`, best-effort, con una
pausa de 300ms entre lotes de 10 para no saturar el servicio); si no encuentra nada,
usa la página del evento en USGS como `fuenteUrl` — un evento **nunca** se queda sin
fuente. En cada corrida también **borra** los eventos que ya salieron de la ventana
de días o dejaron de cumplir la magnitud mínima (si no, se quedarían pintados en el
mapa para siempre). Corre una vez al día.

⚠️ **Cloud Functions programadas requieren plan Blaze** (pago por uso) en el
proyecto de Firebase, aunque el uso real quede dentro de la capa gratuita — Spark
(el plan default) no permite Cloud Scheduler. Sin esto, el deploy falla.

## 8.2 Capas con captura manual (escritura desde el navegador)

`mantenimiento.html` + `js/mantenimiento.js` administran **todas** las capas de
este tipo — no es una página por capa. Capas actuales: **`misLocalidades`** y
**`misVecinos`** (2026-08-21, mismo comportamiento exacto, solo cambian nombre,
color y `categoria`). A diferencia de los agentes (Sección 8.1), acá **una
persona** captura los datos desde el navegador — por eso sí necesita autenticación
real, distinto del resto de la app que es de solo lectura.

- **Agregar una capa manual nueva** = un objeto más en el array `CAPAS` al inicio
  de `js/mantenimiento.js` (`id`, `nombre`, `nombreSingular`, `categoria`, `color`,
  `descripcion`) — aparece sola como pestaña nueva, con el mismo formulario, la
  misma carga masiva y el mismo ícono-por-categoría en el mapa (agregar la entrada
  correspondiente en `ICONOS_EVENTO`, `js/iconos.js`). También hay que agregar su
  entrada de `.write` en `database.rules.json` (ver el punto de abajo) — eso sí es
  manual, las reglas no pueden generarse solas desde una lista en el cliente.
- **Autenticación: Google Sign-In** (`js/auth.js`), solo en páginas de
  mantenimiento — `index.html` (el mapa público) no la importa ni la necesita.
- **Autorización por lista de correos**, no por rol en la base de datos: el mismo
  correo literal aparece en **tres lugares** que hay que mantener sincronizados al
  agregar un administrador nuevo (y una entrada más por cada capa manual en los dos
  primeros):
  1. `database.rules.json` → `.write` de `capas/{capaId}` y `eventos/{capaId}` por
     cada capa manual (`auth.token.email == '...'`)
  2. `storage.rules` → mismo patrón para `/capas-manuales/**` (carpeta compartida
     por todas las capas manuales, no una por capa — ver el punto de fotos)
  3. `js/auth.js` → `ADMINS_AUTORIZADOS` (solo controla qué botones se muestran en
     la UI; la protección real vive en las reglas de los puntos 1 y 2, no aquí)
- **Modelo de datos**: mismo esquema genérico de `/eventos/{capaId}/{eventoId}`
  (Sección 8) más dos campos propios de estas capas: `nivelRiesgo` (number) y
  `fotoUrl` (string — URL de Firebase Storage o una URL externa pegada a mano,
  ambas se validan con `urlSegura()` al mostrarse, igual que `fuenteUrl`).
- **Fotos → Firebase Storage**, carpeta compartida `capas-manuales/{nombreArchivo}`
  para todas las capas manuales (nombre generado con `crypto.randomUUID()`, nunca
  el nombre original del archivo — así no colisionan aunque sean de capas
  distintas). La carpeta vieja `localidades/` (de antes de `misVecinos`) se dejó de
  usar para subir, pero sigue de solo lectura en `storage.rules` para no romper
  fotos ya subidas ahí. Límite 8 MB y `contentType` debe empezar con `image/`,
  exigido tanto en `storage.rules` como en `js/storage.js` (dos capas de la misma
  validación: la del cliente es solo UX, la de las reglas es la que realmente
  protege). Lectura pública (igual que `capas`/`eventos`), escritura solo para los
  correos autorizados.
- El botón "+" de foto ofrece tres orígenes (subir archivo, pegar del portapapeles
  vía `navigator.clipboard.read()`, o pegar una URL ya existente) — los primeros
  dos suben a Storage, el tercero solo guarda el link tal cual.
- **Carga masiva por CSV** (`procesarCSV()`): botón "Subir CSV" junto a "Agregar",
  más un link de "Plantilla CSV" que descarga un ejemplo con las columnas
  esperadas: `nombre,lat,lon,comentarios,nivelRiesgo,liga,fotoUrl` (solo
  `nombre`/`lat`/`lon` son obligatorias; el resto pueden ir vacías o la columna
  completa puede faltar). El parser (`analizarCSV()`) es propio, sin librería —
  soporta campos entre comillas con comas y comillas escapadas (`""`), que es lo
  que exportan Excel/Google Sheets por default. Cada fila se sube con `agregar()`
  una por una (no en lote) para poder reportar en qué fila exacta falló cada error,
  y al final se muestra un resumen de agregados vs. errores. La foto en modo masivo
  solo acepta URL (columna `fotoUrl`) — no hay forma de subir archivos binarios
  desde un CSV, así que ese campo usa el mismo origen "URL" del formulario
  individual, nunca sube a Storage por esta vía.
- La propia página de mantenimiento crea/actualiza `/capas/{capaId}` (nombre,
  color, activa) la primera vez que una sesión de administrador carga esa pestaña —
  mismo patrón de auto-inicialización que usan los agentes en `/capas/{capaId}`,
  para no depender de un seed manual en Firebase Console.
- **`mantenimiento.html` no muestra nada de su contenido (ni la lista, de solo
  lectura) hasta resolver la sesión** — pantalla de acceso a página completa
  (`#pantalla-acceso`) con tres estados: sin sesión (botón de Google bien visible,
  no un link chico en la esquina), sesión de un correo no autorizado (mensaje +
  botón para cerrar esa sesión y probar con otro correo), o admin válido (se oculta
  la pantalla de acceso, aparece el contenido real, incluidas las pestañas de
  capas). Decidido así porque el link de "Iniciar sesión" en la esquina pasaba
  fácilmente desapercibido.

## 8.3 Agente de riesgo operativo (búsqueda en Claude Code + escritura en Cloud Function)

Decidido 2026-08-21: a diferencia del patrón de la sección 8.1 (una Cloud
Function hace todo el trabajo), este agente **reparte el trabajo en dos
partes** porque la investigación necesita búsqueda web real tipo LLM, algo
que una Cloud Function no hace bien ni barato por su cuenta:

- **La "cabeza" (búsqueda + clasificación) corre en una sesión programada de
  Claude Code** (una Routine, no una Cloud Function), siguiendo
  `.claude/skills/riesgo-operativo-mapa/SKILL.md` — mismo repo, para que
  cualquier sesión (local o programada) la vea. Cubre 4 categorías
  geolocalizables: orden público, seguridad/crimen organizado, vialidad y
  clima extremo, más cierres de aduana. **No cubre commodities, combustibles
  ni flete marítimo** (no son eventos con ubicación) ni sismos/erupciones (ya
  cubiertos por `eventosGeologicos`, sección 8.1).
- **La escritura en Firebase sigue siendo exclusiva de una Cloud Function**
  (`ingerirRiesgoOperativo`, `functions/index.js`, HTTPS `onRequest`) — se
  mantiene el principio de que el Admin SDK solo se toca desde el backend,
  nunca desde una credencial portátil. Como es un endpoint HTTPS público (a
  diferencia de `onSchedule`, que nadie externo puede invocar), está protegido
  con un token simple vía Firebase Secret Manager
  (`defineSecret('RIESGO_INGEST_TOKEN')`) — un token opaco acotado a este
  endpoint, no una llave de servicio completa. El mismo valor debe existir
  como variable de entorno en el entorno de Claude Code que corre la Routine,
  para que el `curl` final la mande en `Authorization: Bearer`.

**5 capas nuevas** (mismo esquema genérico de `/capas`/`/eventos`, sección 8,
sin campos nuevos — reutiliza `nivelRiesgo`, el mismo campo numérico que ya
muestra `mostrarPanelEvento()` en `js/main.js` sin tocar código):

| capaId | categoria (ícono en `js/iconos.js`) | agrupa |
|---|---|---|
| `riesgoOrdenPublico` | `orden-publico` | protestas, bloqueos, huelgas, inestabilidad política |
| `riesgoSeguridad` | `seguridad` | crimen organizado, extorsión a transportistas |
| `riesgoVialidad` | `vialidad` | obras/cierres viales y accidentes/incidentes de tránsito, no ligados a protesta ni a clima |
| `riesgoClima` | `clima` | clima extremo, inundaciones/derrumbes por lluvia |
| `riesgoAduanas` | `aduanas` | cierres de frontera o aduana |

La metadata de estas 5 capas (nombre/color/`categoria`) vive hardcodeada en
`ingerirRiesgoOperativo` (`METADATA_CAPAS_RIESGO`) — el payload que manda la
skill **no** incluye `categoria`, la pone la función a partir del `capaId`,
para no depender de que el LLM la escriba bien.

**Semántica "silencio = despejado":** cada corrida hace **reemplazo completo
por capa** — la skill siempre manda las 5 claves (arreglo vacío si esa
categoría no tuvo novedad), y la función borra en cada capa cualquier evento
que no haya venido en el payload de esa corrida (mismo patrón de
`idsHuerfanos` que ya usa `actualizarEventosGeologicos`, sección 8.1). El
`id` de cada evento es un slug estable armado por la skill
(`{país}-{ciudad}-{tipo}`), no `push()`, para que una alerta que sigue activa
al día siguiente se actualice en vez de duplicarse.

**Programación:** una Routine de Claude Code (`create_new_session_on_fire`),
una vez al día, que clona/usa este repo y sigue la skill. No usa Cloud
Scheduler porque quien dispara el trabajo es una sesión de Claude Code, no
Firebase.

⚠️ **Reemplaza al skill de chat `reporte-riesgo-operativo`** (reporte en
Markdown/HTML bajo demanda) — se retiró porque esta información ahora vive en
el mapa. El skill `gv-reporte-riesgo-operativo` (de otro contexto/usuario) no
se tocó.

## 9. Documentación viva

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
