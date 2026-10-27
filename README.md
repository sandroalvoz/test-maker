# TestMaker

App para hacer exámenes tipo test (web y de escritorio para Windows), más una skill de Claude que los genera.

## Descargar

- **Windows**: descarga `TestMaker-1.0.0-win-x64.zip` desde la sección *Releases* del repositorio, descomprímelo y abre `TestMaker.exe`. No necesita instalación.
  La app no está firmada, así que Windows puede mostrar "Windows protegió su PC". Pulsa *Más información* → *Ejecutar de todas formas*.
- **Navegador**: clona o descarga el repositorio y abre `index.html`.

## Usar la app

Abre `index.html` con doble clic (Chrome, Edge o Firefox) o usa la app de escritorio. No necesita instalación ni servidor.

- **Cargar un examen**: arrastra uno o varios `.json` a la página, o usa *Abrir archivo* / *Pegar JSON*. *Probar la demo* carga un examen de ejemplo.
- **Modos**: *Examen* (corrección al entregar) y *Práctica* (ves si aciertas y la explicación en cada pregunta).
- **Opciones antes de empezar**: filtrar por temas, número de preguntas, barajar preguntas u opciones y tiempo límite.
- **Durante el examen**: navegador de preguntas, marcar para revisar, reloj y atajos de teclado (`A`–`H` o `1`–`8` para responder, `←` `→` para moverte, `M` para marcar).
- **Resultados**: nota sobre 10 (con penalización por fallo si el examen la tiene), aciertos por tema, corrección pregunta a pregunta con explicación y botón para repasar solo las falladas y en blanco.

Los exámenes cargados, el historial de intentos y el examen en curso se guardan en el navegador (`localStorage`). Si borras los datos del navegador se pierden; los archivos `.json` originales no se tocan.

Las fórmulas (`$...$`) se dibujan con KaTeX, incluido en `vendor/katex`, así que funcionan sin internet.

Las preguntas y las opciones pueden llevar imágenes (clic para ampliarlas). Si todas las opciones tienen imagen, se muestran en cuadrícula. Las rutas relativas se buscan desde la carpeta del `.json` en la app de escritorio, y desde `index.html` en el navegador.

La fuente es Libron (`fuentes/`).

## App de escritorio

Ejecutable: `dist/TestMaker-win32-x64/TestMaker.exe`. Para tenerla a mano, crea un acceso directo a ese archivo (clic derecho → *Enviar a* → *Escritorio*). La carpeta `TestMaker-win32-x64` se puede mover a otro sitio entera.

Es la misma app, con estos añadidos:

- **Carpeta de exámenes sincronizada**: por defecto `Documentos\TestMaker` (la primera vez incluye el examen de ejemplo). Todo `.json` que se guarde o modifique ahí entra solo en la biblioteca. Se cambia desde el menú *Archivo* o desde la pantalla de inicio.
- **Menú Archivo**: *Abrir examen…* (`Ctrl+O`), abrir o cambiar la carpeta de exámenes, volver a leerla (`F5`).
- **Abrir con**: puedes abrir un `.json` con TestMaker desde el Explorador (clic derecho → *Abrir con*).
- Recuerda el tamaño y la posición de la ventana.

La carpeta elegida se guarda en `~/.testmaker/config.json`. La skill `generar-test` lee ese archivo y guarda los exámenes ahí, así que aparecen en la app sin hacer nada.

Desarrollo (necesita Node.js):

```bash
npm install
```

```bash
npm start
```

```bash
npm run empaquetar
```

`npm start` abre la app sin empaquetar; `npm run empaquetar` regenera `dist/`. `npm run katex` y `npm run icono` regeneran `vendor/katex` y el icono.

## Generar exámenes con Claude

La skill está en `.claude/skills/generar-test/`. Abriendo Claude Code en esta carpeta, pide por ejemplo:

- "Hazme un test de 20 preguntas sobre la Revolución Francesa"
- "Genera un examen tipo test a partir de `apuntes/tema3.pdf`, que reste los fallos"
- También puedes invocarla directamente con `/generar-test`.

Claude guarda el examen (en la carpeta de la app de escritorio si la usas, o en `examenes/`), lo valida y te dice cómo abrirlo.

La skill también está instalada en `~/.claude/skills/generar-test`, así que funciona desde cualquier carpeta. Si cambias la de este proyecto, vuelve a copiarla allí.

## Formato

Especificación completa: [`.claude/skills/generar-test/references/formato.md`](.claude/skills/generar-test/references/formato.md). Resumen:

```json
{
  "formato": "testmaker-v1",
  "titulo": "Mi examen",
  "config": { "puntuacion": { "acierto": 1, "fallo": -0.25, "blanco": 0 }, "barajarOpciones": true },
  "preguntas": [
    {
      "tipo": "unica",
      "tema": "Tema 1",
      "enunciado": "¿Pregunta?",
      "opciones": ["A", "B", "C", "D"],
      "correctas": [1],
      "explicacion": "Por qué es la B."
    }
  ]
}
```

`tipo` puede ser `unica`, `multiple` o `vf` (verdadero/falso, sin `opciones`). `correctas` son índices empezando en 0. Para imágenes: `"imagen": "img/figura.png"` en la pregunta, opciones como `{ "texto": "...", "imagen": "img/a.png" }`, o `![texto](img/b.png)` dentro de cualquier texto.

Para validar un archivo a mano:

```bash
node .claude/skills/generar-test/scripts/validar.cjs examenes/mi-examen.json --clave
```

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `app.js`, `estilos.css` | La app |
| `escritorio/` | App de escritorio (Electron): proceso principal, puente con la app e icono |
| `vendor/katex/` | KaTeX para fórmulas sin internet |
| `fuentes/` | Fuente Libron |
| `LICENSE` | Licencia del proyecto |

## Licencia

El código de TestMaker es software libre bajo licencia [MIT](LICENSE).

Componentes de terceros incluidos, con su propia licencia:

- **Libron** (`fuentes/`), de Nico Verbruggen, basada en Readerly y Newsreader: [SIL Open Font License 1.1](fuentes/OFL.txt).
- **KaTeX** (`vendor/katex/`): [MIT](vendor/katex/LICENSE).
- **Electron**, en la app de escritorio: MIT. Sus licencias van dentro del zip de la release (`LICENSE` y `LICENSES.chromium.html`).
| `dist/` | App de escritorio empaquetada (`TestMaker.exe`) |
| `validador.js` | Validación del formato (la usa la app; copia idéntica en la skill como `validador.cjs`) |
| `examenes/` | Exámenes generados |
| `.claude/skills/generar-test/` | La skill: `SKILL.md`, especificación del formato y validador |
