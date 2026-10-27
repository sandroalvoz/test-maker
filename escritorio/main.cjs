/* TestMaker escritorio: proceso principal de Electron.
 * Carga la misma app web (index.html) y añade:
 *  - una carpeta de exámenes que se vigila: cada .json que aparezca o cambie entra en la biblioteca;
 *  - abrir archivos .json desde el menú, arrastrándolos o con "Abrir con…";
 *  - menú nativo y recuerdo del tamaño de la ventana.
 * La configuración vive en ~/.testmaker/config.json (la skill generar-test la lee para saber dónde guardar).
 */
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const RAIZ = path.join(__dirname, '..');
const DIR_CONFIG = process.env.TESTMAKER_HOME || path.join(os.homedir(), '.testmaker');
const ARCHIVO_CONFIG = path.join(DIR_CONFIG, 'config.json');
const MAX_BYTES = 5 * 1024 * 1024;

let ventana = null;
let vigilante = null;
let pendientes = []; // archivos abiertos antes de que la ventana esté lista
let listo = false;

/* ---------- Configuración ---------- */
function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, 'utf8'));
  } catch (e) {
    return {};
  }
}
function guardarConfig(cambios) {
  const c = { ...leerConfig(), ...cambios };
  fs.mkdirSync(DIR_CONFIG, { recursive: true });
  fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(c, null, 2));
  return c;
}

function carpetaExamenes() {
  const c = leerConfig();
  const dir = c.carpetaExamenes || path.join(app.getPath('documents'), 'TestMaker');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    sembrarEjemplos(dir);
  }
  if (c.carpetaExamenes !== dir) guardarConfig({ carpetaExamenes: dir });
  return dir;
}

// La primera vez copia los exámenes de ejemplo incluidos con la app.
function sembrarEjemplos(dir) {
  const ejemplos = path.join(RAIZ, 'examenes');
  try {
    for (const f of fs.readdirSync(ejemplos)) {
      if (f.endsWith('.json')) fs.copyFileSync(path.join(ejemplos, f), path.join(dir, f));
    }
  } catch (e) { /* sin ejemplos */ }
}

/* ---------- Lectura de exámenes ---------- */
function listarJson(dir, profundidad = 0) {
  if (profundidad > 3) return [];
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const res = [];
  for (const e of entradas) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) res.push(...listarJson(ruta, profundidad + 1));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) res.push(ruta);
  }
  return res;
}

function leerArchivo(ruta) {
  try {
    const st = fs.statSync(ruta);
    if (st.size > MAX_BYTES) return { nombre: path.basename(ruta), ruta, error: 'El archivo pesa más de 5 MB.' };
    return {
      nombre: path.basename(ruta),
      ruta,
      modificado: st.mtimeMs,
      texto: fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''),
    };
  } catch (e) {
    return { nombre: path.basename(ruta), ruta, error: `No se pudo leer: ${e.message}` };
  }
}

function vigilar(dir) {
  if (vigilante) vigilante.close();
  vigilante = null;
  let temporizador = null;
  try {
    vigilante = fs.watch(dir, { recursive: true }, (evento, archivo) => {
      if (archivo && !String(archivo).toLowerCase().endsWith('.json')) return;
      clearTimeout(temporizador);
      // Espera a que el archivo termine de escribirse.
      temporizador = setTimeout(() => ventana && ventana.webContents.send('carpeta-cambiada'), 400);
    });
    vigilante.on('error', () => {});
  } catch (e) { /* carpeta no vigilable: se sincroniza al abrir y con Ctrl+R */ }
}

/* ---------- Abrir archivos ---------- */
function rutasJsonDeArgs(argv) {
  return argv.filter((a) => !a.startsWith('-') && a.toLowerCase().endsWith('.json') && fs.existsSync(a)).map((a) => path.resolve(a));
}
function abrirArchivos(rutas) {
  if (!rutas.length) return;
  const archivos = rutas.map(leerArchivo);
  if (listo && ventana) ventana.webContents.send('abrir-archivos', archivos);
  else pendientes.push(...archivos);
}
async function dialogoAbrir() {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Abrir examen',
    defaultPath: carpetaExamenes(),
    filters: [{ name: 'Exámenes TestMaker', extensions: ['json'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (!r.canceled) abrirArchivos(r.filePaths);
}
async function dialogoCarpeta() {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elegir carpeta de exámenes',
    defaultPath: carpetaExamenes(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  guardarConfig({ carpetaExamenes: r.filePaths[0] });
  vigilar(r.filePaths[0]);
  if (ventana) ventana.webContents.send('carpeta-cambiada');
  return r.filePaths[0];
}

/* ---------- Guardar desde el editor ---------- */
// Las imágenes que la app resolvió a file:///... vuelven a ser rutas relativas al .json si están dentro de su carpeta.
function relativizarImagenes(datos, dir) {
  const relativa = (src) => {
    if (typeof src !== 'string' || !src.startsWith('file:')) return src;
    try {
      const abs = url.fileURLToPath(src);
      const rel = path.relative(dir, abs);
      return !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : abs;
    } catch (e) {
      return src;
    }
  };
  const enTexto = (t) => (typeof t === 'string' ? t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, s) => `![${alt}](${relativa(s.trim())})`) : t);
  for (const p of datos.preguntas || []) {
    if (p.imagen) p.imagen = relativa(p.imagen);
    p.enunciado = enTexto(p.enunciado);
    if (p.explicacion) p.explicacion = enTexto(p.explicacion);
    if (Array.isArray(p.opciones)) {
      p.opciones = p.opciones.map((o) => (typeof o === 'string' ? enTexto(o) : o && o.imagen ? { ...o, imagen: relativa(o.imagen) } : o));
    }
  }
  return datos;
}

function guardarExamen({ ruta, nombre, datos }) {
  let destino = typeof ruta === 'string' && /\.json$/i.test(ruta) ? ruta : null;
  if (!destino) {
    const carpeta = carpetaExamenes();
    const base = String(nombre || 'examen').replace(/[^a-z0-9-]/gi, '') || 'examen';
    destino = path.join(carpeta, `${base}.json`);
    for (let n = 2; fs.existsSync(destino); n++) destino = path.join(carpeta, `${base}-${n}.json`);
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${JSON.stringify(relativizarImagenes(datos, path.dirname(destino)), null, 2)}\n`);
  return { ruta: destino, modificado: fs.statSync(destino).mtimeMs };
}

/* ---------- IPC ---------- */
ipcMain.handle('guardar-examen', (e, args) => guardarExamen(args));
ipcMain.handle('leer-carpeta', () => {
  const carpeta = carpetaExamenes();
  return { carpeta, archivos: listarJson(carpeta).map(leerArchivo) };
});
ipcMain.handle('elegir-carpeta', () => dialogoCarpeta());
ipcMain.handle('abrir-carpeta', () => shell.openPath(carpetaExamenes()));
ipcMain.handle('archivos-pendientes', () => {
  listo = true;
  const p = pendientes;
  pendientes = [];
  return p;
});

/* ---------- Ventana y menú ---------- */
function crearVentana() {
  const c = leerConfig();
  const b = c.ventana || {};
  ventana = new BrowserWindow({
    width: b.width || 1200,
    height: b.height || 860,
    x: b.x,
    y: b.y,
    minWidth: 420,
    minHeight: 500,
    title: 'TestMaker',
    icon: path.join(__dirname, 'icono.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12141c' : '#f6f7fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (b.maximizada) ventana.maximize();
  ventana.once('ready-to-show', () => ventana.show());

  // Enlaces externos al navegador del sistema; nada de navegar fuera de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  ventana.on('close', () => {
    guardarConfig({ ventana: { ...ventana.getNormalBounds(), maximizada: ventana.isMaximized() } });
  });
  ventana.on('closed', () => { ventana = null; listo = false; });

  ventana.loadFile(path.join(RAIZ, 'index.html'));
}

function crearMenu() {
  const plantilla = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir examen…', accelerator: 'CmdOrCtrl+O', click: dialogoAbrir },
        { type: 'separator' },
        { label: 'Abrir carpeta de exámenes', click: () => shell.openPath(carpetaExamenes()) },
        { label: 'Cambiar carpeta de exámenes…', click: dialogoCarpeta },
        { label: 'Volver a leer la carpeta', accelerator: 'F5', click: () => ventana && ventana.webContents.send('carpeta-cambiada') },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { type: 'separator' },
        { label: 'Aumentar texto', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: 'Reducir texto', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ label: 'Herramientas de desarrollo', role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de TestMaker',
          click: () => dialog.showMessageBox(ventana, {
            type: 'info',
            title: 'TestMaker',
            message: `TestMaker ${app.getVersion()}`,
            detail: `App para hacer exámenes tipo test (formato testmaker-v1).\n\nCarpeta de exámenes:\n${carpetaExamenes()}\n\nConfiguración:\n${ARCHIVO_CONFIG}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

/* ---------- Arranque ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    abrirArchivos(rutasJsonDeArgs(argv));
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.testmaker.app');
    abrirArchivos(rutasJsonDeArgs(process.argv.slice(1)));
    crearMenu();
    vigilar(carpetaExamenes());
    crearVentana();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) crearVentana(); });
  });

  app.on('window-all-closed', () => {
    if (vigilante) vigilante.close();
    if (process.platform !== 'darwin') app.quit();
  });
}
