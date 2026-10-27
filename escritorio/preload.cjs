// Puente seguro entre la app web y el proceso principal. La app lo detecta como window.escritorio.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('escritorio', {
  leerCarpeta: () => ipcRenderer.invoke('leer-carpeta'),
  elegirCarpeta: () => ipcRenderer.invoke('elegir-carpeta'),
  abrirCarpeta: () => ipcRenderer.invoke('abrir-carpeta'),
  archivosPendientes: () => ipcRenderer.invoke('archivos-pendientes'),
  // Ruta en disco de un archivo arrastrado o elegido; sirve para resolver imágenes relativas al .json.
  rutaDeArchivo: (archivo) => webUtils.getPathForFile(archivo),
  alCambiarCarpeta: (fn) => ipcRenderer.on('carpeta-cambiada', () => fn()),
  alAbrirArchivos: (fn) => ipcRenderer.on('abrir-archivos', (e, archivos) => fn(archivos)),
});
