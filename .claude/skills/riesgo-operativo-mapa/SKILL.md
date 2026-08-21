---
name: riesgo-operativo-mapa
description: "Busca alertas de orden público, vialidad, clima extremo y cierres de aduana en las ubicaciones monitoreadas, y las escribe como eventos geolocalizados en las capas de riesgo del Mapa Interactivo (dmgerardo/MapaInteractivo). Pensada para correr sin supervisión desde una Routine programada — no genera un reporte de texto, escribe directo en Firebase."
---

# Skill: Agente de riesgo operativo → mapa

Cuando esta skill sea invocada, ejecuta el proceso completo de monitoreo descrito
abajo y termina llamando al endpoint de ingesta. No entregues un reporte en el
chat — el resultado final es la llamada `curl` de la sección "Publicar en el
mapa"; al terminar, reporta solo un resumen corto (cuántos eventos por capa).

Ver `AGENTS.md` sección 8.3 para el contexto de arquitectura completo (por qué
existe esta skill, cómo se reparte el trabajo con la Cloud Function
`ingerirRiesgoOperativo`, y el modelo de datos).

---

## ROL

Eres un analista de riesgo operativo. A diferencia del reporte de texto que
existía antes, **no cubras commodities, combustibles ni flete marítimo** —
esos no son eventos geolocalizables y quedaron fuera de este agente a
propósito. Cubre solo las cuatro categorías de la tabla de abajo.

No uses datos de tu entrenamiento para alertas o noticias — todo dato debe
venir de búsquedas web hechas en el momento de ejecución. Resuelve la fecha de
hoy a partir de las fechas de publicación de los resultados de búsqueda más
recientes (zona horaria Ciudad de México, UTC-6); no preguntes al usuario.

---

## UBICACIONES MONITOREADAS (con coordenadas fijas)

Usa **exactamente estas coordenadas** para cada ciudad — no las inventes ni
las aproximes de memoria. Si una alerta es de una carretera/corredor entre dos
ciudades de la lista, usa las coordenadas de la ciudad monitoreada más cercana
al tramo afectado.

| Ciudad | País | lat | lon |
|---|---|---|---|
| Saltillo | México | 25.4232 | -101.0053 |
| Monterrey | México | 25.6866 | -100.3161 |
| Celaya | México | 20.5232 | -100.8157 |
| San Luis Potosí | México | 22.1565 | -100.9855 |
| Querétaro | México | 20.5888 | -100.3899 |
| Ciudad de México | México | 19.4326 | -99.1332 |
| Escuintla | Guatemala | 14.3050 | -90.7850 |
| San Salvador | El Salvador | 13.6929 | -89.2182 |
| Heredia | Costa Rica | 9.9989 | -84.1169 |
| San José | Costa Rica | 9.9281 | -84.0907 |
| Manizales | Colombia | 5.0703 | -75.5138 |
| Bogotá | Colombia | 4.7110 | -74.0721 |
| Guayaquil | Ecuador | -2.1894 | -79.8891 |
| Lima | Perú | -12.0464 | -77.0428 |
| Santiago | Chile | -33.4489 | -70.6693 |
| Buenos Aires | Argentina | -34.6037 | -58.3816 |
| Haedo | Argentina | -34.6402 | -58.5772 |
| San Luis | Argentina | -33.2950 | -66.3356 |
| Córdoba | Argentina | -31.4201 | -64.1888 |
| Río Segundo | Argentina | -31.6500 | -63.9000 |
| Luque | Paraguay | -25.2637 | -57.4854 |
| Brantford | Canadá | 43.1394 | -80.2644 |
| Burlington | Canadá | 43.3255 | -79.7990 |
| Moncton | Canadá | 46.0878 | -64.7782 |
| Calgary | Canadá | 51.0447 | -114.0719 |

> ⚠️ "Luque" viene listado en el prompt original bajo "Argentina", pero la
> única ciudad real con ese nombre es Luque, Paraguay (área metropolitana de
> Asunción) — se usa esa coordenada. Si el usuario confirma que se refería a
> otro lugar, actualizar esta tabla.

Carreteras clave en México (ancla al extremo más cercano de la tabla de
arriba): Monterrey–Saltillo · Saltillo–SLP · SLP–Querétaro ·
Querétaro–Celaya · Querétaro–CDMX (esp. tramo El Marqués) · Celaya–CDMX.

---

## CATEGORÍAS DE RIESGO → capa del mapa

Cada alerta que encuentres se clasifica en **una** de estas 4 capas — la
`categoria` interna (para el ícono) la asigna la Cloud Function sola a partir
del `capaId`, tú solo mandas el `capaId` correcto:

| capaId | Incluye | Nivel típico |
|---|---|---|
| `riesgoOrdenPublico` | Protestas, marchas, bloqueos de accesos, huelgas y paros laborales, inestabilidad política (decretos/medidas que afecten comercio) | según impacto |
| `riesgoSeguridad` | Inseguridad y crimen organizado — bloqueos de cárteles, extorsión a transportistas | normalmente alto |
| `riesgoVialidad` | Obras y mantenimiento vial con cierres o reducción de carriles en corredores clave (**no** ligado a una protesta — eso va en `riesgoOrdenPublico`) | según cierre |
| `riesgoClima` | Fenómenos climáticos extremos (lluvias severas, ciclones, nevadas, inundaciones, calor extremo, derrumbes causados por lluvia) | según severidad |
| `riesgoAduanas` | Cierres de frontera o aduana | según duración |

**No reportes sismos, erupciones ni otros desastres geológicos** — esos ya
los cubre la capa `eventosGeologicos` (agente separado, `functions/index.js`).

**Regla principal:** solo reporta ubicaciones con alertas activas confirmadas
en las últimas 24 horas. Si no encuentras novedad en una ciudad, simplemente
no la incluyas — silencio = despejado. No inventes un evento "todo tranquilo".

Nivel de riesgo → número: 🔴 Alto = `5` · 🟡 Medio = `3` · 🟢 Bajo = `1`.

---

## BÚSQUEDAS A REALIZAR

Ejecuta en paralelo (o en secuencia rápida), sustituyendo [fecha] por la fecha
de hoy:

- "bloqueos carreteras México hoy [fecha]"
- "protestas huelgas Nuevo León Coahuila San Luis Potosí Querétaro Guanajuato CDMX [fecha]"
- "bloqueos autopista México Querétaro El Marqués carretera 57 [fecha]"
- "reporte CAPUFE Guardia Nacional Carreteras hoy [fecha]"
- "obras mantenimiento autopistas México-Querétaro Querétaro-Celaya [fecha]"
- "cierre frontera aduana México [fecha]"
- "protestas bloqueos huelgas Guatemala El Salvador Costa Rica [fecha]"
- "protestas paro huelga Colombia Ecuador Perú [fecha]"
- "protestas paro huelga Chile Argentina [fecha]"
- "cierre frontera aduana Sudamérica Centroamérica [fecha]"
- "strikes protests extreme weather border closures Canada Brantford Burlington Moncton Calgary [date]"

---

## FUENTES PRIORITARIAS

El Universal · Reforma · N+ · Eje Central · Heraldo de México · Infobae · La
Nación (AR) · El Tiempo (CO) · La Tercera (CL) · CBC (CA) · worldmonitor.app ·
CAPUFE · Guardia Nacional Carreteras.

Un evento **nunca se queda sin `fuenteUrl`** — si no hay noticia clara,
enlaza la fuente oficial más cercana (ej. cuenta/boletín de CAPUFE o de la
autoridad local).

---

## PUBLICAR EN EL MAPA

En vez de un reporte, arma un único JSON con **las 5 claves de capa siempre
presentes** (arreglo vacío si esa categoría no tuvo novedad hoy — así se poda
lo que ya no está activo) y publícalo con `curl`.

### Formato del `id` de cada evento

Slug estable en minúsculas, sin espacios ni acentos:
`{código de país}-{ciudad-en-minúsculas}-{tipo-corto}`, ej.
`mx-saltillo-bloqueo-transportistas`. Si la misma alerta sigue activa mañana,
usa el mismo `id` para que se actualice en vez de duplicarse.

### Estructura del body

```json
{
  "capas": {
    "riesgoOrdenPublico": [
      {
        "id": "mx-saltillo-bloqueo-transportistas",
        "lat": 25.4232,
        "lon": -101.0053,
        "titulo": "Bloqueo de transportistas en acceso a Saltillo",
        "descripcion": "Situación: ... (2-3 oraciones). Impacto operativo: ...",
        "nivelRiesgo": 5,
        "fechaUTC": "2026-08-21T09:00:00Z",
        "fuenteUrl": "https://..."
      }
    ],
    "riesgoSeguridad": [],
    "riesgoVialidad": [],
    "riesgoClima": [],
    "riesgoAduanas": []
  }
}
```

Campos por evento: `id`, `lat`, `lon`, `titulo` y `fechaUTC` son
**obligatorios** (la Cloud Function rechaza todo el envío si falta alguno en
cualquier evento); `descripcion`, `nivelRiesgo` y `fuenteUrl` son opcionales
pero inclúyelos siempre que los tengas.

### Llamada

```bash
curl -sS -X POST "https://us-central1-globo-01.cloudfunctions.net/ingerirRiesgoOperativo" \
  -H "Authorization: Bearer $RIESGO_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data @payload.json
```

`$RIESGO_INGEST_TOKEN` debe existir como variable de entorno en esta sesión —
si no está definida, **detente y avisa** en vez de intentar adivinarla o
mandar la petición sin autenticación. La respuesta trae un `resumen` con
cuántos eventos se escribieron/borraron por capa — repórtalo como cierre.
