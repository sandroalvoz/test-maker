# Formato `testmaker-v1`

Un examen es **un archivo JSON** (UTF-8) con un objeto en la raíz.

## Raíz

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `formato` | `"testmaker-v1"` | sí | Versión del formato. Siempre exactamente este texto. |
| `titulo` | texto | sí | Título del examen. Identifica el examen en la biblioteca: cargar otro archivo con el mismo título lo **reemplaza**. |
| `descripcion` | texto | no | Una o dos frases: de qué trata y a quién va dirigido. |
| `autor` | texto | no | Autor o fuente (p. ej. "Apuntes de Biología, tema 3"). |
| `idioma` | texto | no | Código de idioma, por defecto `"es"`. |
| `config` | objeto | no | Ver abajo. Todo tiene valor por defecto. |
| `preguntas` | lista | sí | Al menos una pregunta. |

## `config`

| Campo | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `tiempoLimite` | número | `0` | Minutos. `0` = sin límite. Al acabar el tiempo el examen se entrega solo. |
| `puntuacion.acierto` | número | `1` | Puntos por acierto (> 0). |
| `puntuacion.fallo` | número | `0` | Puntos por fallo. **Negativo para penalizar**: `-0.25` (4 opciones), `-0.33` (3 opciones), `-0.5` (V/F). |
| `puntuacion.blanco` | número | `0` | Puntos por pregunta en blanco. |
| `aprobado` | número 0–10 | `5` | Nota mínima para aprobar. |
| `barajarPreguntas` | booleano | `false` | Orden aleatorio de preguntas (el usuario puede cambiarlo antes de empezar). |
| `barajarOpciones` | booleano | `false` | Orden aleatorio de opciones dentro de cada pregunta. |

La nota se calcula así: `nota = clamp(puntos / (nPreguntas × acierto) × 10, 0, 10)`.

## Pregunta

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | texto | no | Identificador único dentro del examen. Si falta: `p1`, `p2`… |
| `tipo` | `"unica"` \| `"multiple"` \| `"vf"` | no (por defecto `"unica"`) | Ver tipos abajo. |
| `tema` | texto | no | Agrupa preguntas: la app permite filtrar por tema y da la nota por tema. Usa nombres cortos y consistentes. |
| `enunciado` | texto (Markdown) | sí | La pregunta. |
| `imagen` | texto | no | URL o ruta relativa a `index.html` de una imagen que acompaña al enunciado. |
| `opciones` | lista de textos (Markdown) u objetos `{ "texto", "imagen" }` | sí, salvo en `vf` | Entre 2 y 8 opciones, sin repetir. Ver "Imágenes". |
| `correctas` | lista de enteros | sí | **Índices empezando en 0** de las opciones correctas. `[0]` = primera opción (A), `[2]` = tercera (C). |
| `explicacion` | texto (Markdown) | recomendado | Se muestra al corregir. |
| `fijarOrden` | booleano | no | `true` para que sus opciones nunca se barajen (necesario si una opción dice "Todas las anteriores", "A y B"…). |

### Tipos

- **`unica`**: exactamente un índice en `correctas`. Se muestra con casillas redondas.
- **`multiple`**: uno o más índices en `correctas`. Solo cuenta como acierto si se marcan **exactamente** todas las correctas y ninguna incorrecta; cualquier otra combinación es fallo. La app avisa al alumno de que puede haber varias.
- **`vf`**: verdadero/falso. Omite `opciones` (la app usa `["Verdadero", "Falso"]`). `correctas: [0]` = verdadero, `correctas: [1]` = falso. Nunca se barajan.

## Texto enriquecido (Markdown reducido)

Válido en `enunciado`, `opciones` y `explicacion`:

- `**negrita**`, `*cursiva*`, `` `código` ``
- Bloques de código con triple acento grave: ` ```python\n...\n``` `
- Listas con `- ` o `1. ` al principio de línea
- Saltos de línea con `\n`; párrafo nuevo con `\n\n`
- Imágenes `![texto](url)`
- Fórmulas LaTeX con KaTeX: `$x^2$` en línea, `$$\int_0^1 x\,dx$$` en bloque

## Imágenes

Tres formas, combinables:

1. **Imagen del enunciado**: campo `imagen` de la pregunta. Se muestra debajo del enunciado y se amplía al hacer clic.
2. **Opciones con imagen**: una opción puede ser un objeto en lugar de un texto:
   - `{ "imagen": "img/a.png" }`: solo imagen.
   - `{ "texto": "Mitocondria", "imagen": "img/mito.png" }`: texto con la imagen debajo.

   Se pueden mezclar opciones de texto y de objeto. Si **todas** las opciones llevan imagen, la app las muestra en cuadrícula.
3. **Dentro del texto** (enunciado, opciones o explicación) con Markdown: `![descripción](img/b.png)`.

Rutas admitidas en cualquiera de las tres:

- **Relativa al archivo `.json`** (recomendado): `img/celula.png` busca `img/celula.png` junto al examen. Funciona en la app de escritorio. En la versión de navegador (`index.html`), las rutas relativas se buscan desde `index.html`.
- **URL**: `https://...` (necesita internet).
- **Incrustada**: `data:image/png;base64,...` (funciona en todas partes, pero engorda el archivo; solo para imágenes pequeñas).
- Ruta absoluta de Windows: `C:\\carpeta\\imagen.png` (con barras dobles en el JSON). Evítala si el examen se va a mover o compartir.

Formatos: los que muestre un navegador (PNG, JPG, GIF, WebP, SVG). Las imágenes se muestran sobre fondo blanco, así que los diagramas con fondo transparente se leen bien también en modo oscuro. Si una imagen no se encuentra, la app muestra un aviso con la ruta en su lugar.

```json
{
  "tipo": "unica",
  "enunciado": "¿Qué orgánulo señala la flecha?",
  "imagen": "img/celula-flecha.png",
  "opciones": [
    { "texto": "Mitocondria", "imagen": "img/mitocondria.png" },
    { "texto": "Cloroplasto", "imagen": "img/cloroplasto.png" },
    "Núcleo",
    "Ribosoma"
  ],
  "correctas": [0]
}
```

### Escapado en JSON (fuente habitual de errores)

- Comillas dobles dentro de un texto: `\"`.
- Barra invertida de LaTeX: **duplicarla**. `"$\\frac{a}{b}$"` en el JSON produce `$\frac{a}{b}$`.
  Igual con `\\times`, `\\sqrt`, `\\alpha`, `\\,`…
- Salto de línea: `\n` (no saltos de línea literales dentro de una cadena).
- No uses `$` para dinero: la app lo interpretaría como fórmula. Escribe "5 €" o "5 dólares".

## Ejemplo mínimo completo

```json
{
  "formato": "testmaker-v1",
  "titulo": "Repaso de la célula",
  "descripcion": "10 preguntas sobre orgánulos y membrana celular.",
  "config": { "puntuacion": { "acierto": 1, "fallo": -0.25, "blanco": 0 }, "barajarOpciones": true },
  "preguntas": [
    {
      "id": "celula-01",
      "tipo": "unica",
      "tema": "Orgánulos",
      "enunciado": "¿Qué orgánulo produce la mayor parte del ATP de la célula?",
      "opciones": ["Ribosoma", "Mitocondria", "Aparato de Golgi", "Lisosoma"],
      "correctas": [1],
      "explicacion": "La **mitocondria** realiza la respiración celular. El ribosoma sintetiza proteínas, no ATP."
    },
    {
      "id": "celula-02",
      "tipo": "multiple",
      "tema": "Membrana",
      "enunciado": "¿Qué componentes forman parte de la membrana plasmática?",
      "opciones": ["Fosfolípidos", "Colesterol", "Celulosa", "Proteínas integrales"],
      "correctas": [0, 1, 3],
      "explicacion": "La celulosa está en la **pared** celular de las plantas, no en la membrana."
    },
    {
      "id": "celula-03",
      "tipo": "vf",
      "tema": "Orgánulos",
      "enunciado": "Las células animales tienen cloroplastos.",
      "correctas": [1],
      "explicacion": "Falso: los cloroplastos son propios de células vegetales y algas."
    }
  ]
}
```
