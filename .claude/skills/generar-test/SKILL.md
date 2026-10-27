---
name: generar-test
description: Genera exámenes tipo test (respuesta única, respuesta múltiple y verdadero/falso) como archivos JSON en formato testmaker-v1, listos para abrir en la app TestMaker. Úsala cuando el usuario pida crear un test, examen, cuestionario, batería de preguntas, simulacro o preguntas de repaso/autoevaluación sobre un tema, o a partir de apuntes, PDFs, diapositivas, documentos o una web.
---

# Generar exámenes tipo test (formato testmaker-v1)

Produces un archivo `.json` que la app TestMaker (`index.html`) carga y corrige. La especificación completa del formato está en `references/formato.md` (dentro de la carpeta de esta skill): léela antes de escribir el primer examen de la conversación.

## 1. Requisitos

Saca de la petición, o usa el valor por defecto sin preguntar:

| Dato | Por defecto |
|---|---|
| Tema o material de origen | — (si no hay ni tema ni material, pregunta; es lo único imprescindible) |
| Número de preguntas | 20 |
| Tipos | ~70 % `unica`, ~15 % `multiple`, ~15 % `vf` |
| Opciones por pregunta `unica`/`multiple` | 4 |
| Dificultad | media, con mezcla (≈30 % fácil, 50 % media, 20 % difícil) |
| Penalización | ninguna (`fallo: 0`). Si el usuario habla de "restar fallos" o de un examen oficial que penaliza: `-1/(nº opciones − 1)` |
| Tiempo límite | 0 (sin límite), salvo que lo pida o sea un simulacro (≈1 min por pregunta) |
| Idioma | el de la conversación |

Si el usuario pide algo concreto (nivel, enfoque práctico, tipo de examen oficial, número de opciones), eso manda.

## 2. Contenido

- **Con material de origen** (apuntes, PDF, web, código): léelo entero antes de escribir. Cada pregunta debe poder responderse con ese material; no metas datos que no estén en él salvo que el usuario lo pida. Reparte las preguntas por todo el material, no solo por el principio.
- **Sin material**: usa conocimiento consolidado. Si no estás seguro de un dato, no lo preguntes.
- Antes de redactar, haz una lista breve de temas (3–8) y cuántas preguntas van a cada uno, proporcional a su peso. Esos temas son el campo `tema` de cada pregunta (nombres cortos y siempre iguales).

## 3. Calidad de las preguntas

**Enunciado**
- Una sola idea por pregunta; que se entienda sin leer las opciones.
- Mezcla niveles: recordar (definiciones, datos), comprender (por qué, qué diferencia), aplicar (casos, cálculos, qué imprime este código, qué ocurre si…).
- Evita negaciones. Si hace falta, resáltala: "¿Cuál **NO** es…?".
- En `multiple`, el enunciado debe pedir explícitamente "Selecciona todas las correctas" o equivalente.

**Opciones**
- Exactamente una correcta en `unica`, sin ambigüedad: un experto no debe poder discutirla.
- Distractores plausibles: errores típicos, confusiones habituales, conceptos vecinos. Nada absurdo ni de relleno.
- Todas con longitud, estilo y gramática parecidos. La correcta no puede ser la más larga ni la única que concuerda con el enunciado.
- Sin pistas: evita "siempre"/"nunca" en distractores y repetir palabras del enunciado solo en la correcta.
- Evita "Todas las anteriores" y "Ninguna de las anteriores". Si las usas, pon `"fijarOrden": true` en esa pregunta.
- **Reparte la posición de la correcta** entre A, B, C y D de forma equilibrada y sin patrón (no A, B, C, D, A, B…).
- En `multiple`: entre 2 y (nº opciones − 1) correctas; varía cuántas son de una pregunta a otra.
- En `vf`: equilibra verdaderas y falsas. Las falsas deben serlo por un detalle concreto, no por ser absurdas.

**Explicación** (siempre)
- Por qué la correcta lo es y por qué falla el distractor más tentador. 1–3 frases.
- Si hay material de origen, indica dónde está ("Tema 2, apartado de mitosis").

## 4. Imágenes

Úsalas cuando aporten algo que el texto no puede: un diagrama, un mapa, una gráfica, una figura del material, "¿qué muestra esta imagen?". No las pongas de adorno. Detalles y ejemplos en la sección "Imágenes" de `references/formato.md`.

- Dónde: campo `imagen` de la pregunta (debajo del enunciado), opciones como objeto `{ "texto": "...", "imagen": "..." }` o `{ "imagen": "..." }`, o `![descripción](ruta)` dentro de cualquier texto.
- De dónde salen:
  - **Imágenes que da el usuario** (archivos, capturas, figuras de sus apuntes): cópialas a una subcarpeta `img/` junto al `.json` y usa rutas relativas (`img/figura-1.png`). No muevas ni borres los originales.
  - **Diagramas que puedes dibujar tú**: escríbelos como archivos SVG en `img/` (geometría, gráficas de funciones, circuitos sencillos, esquemas de bloques, tablas de colores…). Usa `viewBox`, colores con contraste sobre fondo blanco y texto legible (≥ 12 px). Revisa que el dibujo es correcto: un diagrama erróneo invalida la pregunta.
  - **URLs** solo si el usuario las da o sabes que son estables (p. ej. Wikimedia Commons). Necesitan internet.
- Nombres de archivo en minúsculas, sin espacios ni tildes: `img/bio-07-celula.svg`.
- La respuesta no debe deducirse del nombre del archivo: `img/q3-a.svg`, no `img/correcta.svg`.
- El validador comprueba que cada imagen local existe; si falta alguna, da ERROR.

## 5. Formato

- Archivo JSON con `"formato": "testmaker-v1"`, `titulo`, `descripcion` y `preguntas`.
- `correctas` es **una lista de índices empezando en 0**: A = 0, B = 1, C = 2, D = 3. Es el error más habitual; repásalo.
- `id` únicos con un prefijo del examen: `"bio-01"`, `"bio-02"`…
- Escapado: comillas `\"`, LaTeX con barra doble (`\\frac`, `\\times`), saltos de línea `\n`. No uses `$` para dinero.
- Usa `config.barajarOpciones: true` salvo que haya opciones que dependan del orden.

## 6. Guardar y validar

1. Nombre del archivo: `<nombre-en-minusculas-con-guiones>.json` (las imágenes, en `img/` junto a él). Carpeta, en este orden:
   1. La que diga el usuario.
   2. Si existe `~/.testmaker/config.json` (lo crea la app de escritorio de TestMaker), el valor de su campo `carpetaExamenes`. La app vigila esa carpeta y el examen aparece solo en su biblioteca.
   3. Si el directorio actual contiene la app (`index.html` + `app.js` de TestMaker), su carpeta `examenes/`.
   4. Si no, `examenes/` en el directorio actual (créala).

   Escribe el examen en un único archivo JSON, aunque sea largo.
2. Valida con el script de esta skill (necesita Node.js):
   ```bash
   node "<carpeta de esta skill>/scripts/validar.cjs" "examenes/<archivo>.json" --clave
   ```
3. Si hay **ERROR**, corrige y repite hasta que salga `✓ Válido`. Atiende también los **AVISO** (falta de explicación, posición de la correcta poco repartida, opciones que dependen del orden).
4. Con la clave impresa (`--clave`), repasa una por una que la opción marcada como correcta es la correcta de verdad. Corrige cualquier índice desplazado.
5. Si no hay Node.js, revisa a mano con la tabla de `references/formato.md` y comprueba que el JSON es válido.

## 7. Entrega

Dile al usuario, en 3–5 líneas:
- Ruta del archivo, número de preguntas y reparto por temas.
- Cómo abrirlo: si lo guardaste en la carpeta de la app de escritorio, ya está en su biblioteca. Si no, en la app (de escritorio o `index.html` en el navegador) se arrastra el archivo o se usa "Abrir archivo" / "Pegar JSON".
- Ajustes aplicados (penalización, tiempo) y que puede pedir cambios: más difícil, más preguntas de un tema, otra penalización, etc.

No pegues el JSON entero en el chat salvo que lo pida.
