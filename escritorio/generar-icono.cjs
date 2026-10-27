// Genera escritorio/icono.png e escritorio/icono.ico (cuadrado índigo con una marca de verificación).
// Sin dependencias: dibuja los píxeles, los codifica en PNG y los empaqueta en un ICO.
// Uso: npm run icono
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FONDO = [79, 70, 229]; // #4f46e5
const MARCA = [255, 255, 255];

// Geometría en una rejilla de 32x32 (igual que el favicon de index.html).
const RADIO = 8;
const TRAZO = 3.2;
const PUNTOS = [[9, 16.5], [13.5, 21], [23, 11]];

function distSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function dentroRedondeado(x, y) {
  const cx = Math.min(Math.max(x, RADIO), 32 - RADIO);
  const cy = Math.min(Math.max(y, RADIO), 32 - RADIO);
  return x >= 0 && x <= 32 && y >= 0 && y <= 32 && Math.hypot(x - cx, y - cy) <= RADIO;
}

function dibujar(tam) {
  const SS = 4; // supermuestreo para suavizar bordes
  const px = Buffer.alloc(tam * tam * 4);
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let fondo = 0, marca = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = ((x + (sx + 0.5) / SS) / tam) * 32;
          const gy = ((y + (sy + 0.5) / SS) / tam) * 32;
          if (!dentroRedondeado(gx, gy)) continue;
          fondo++;
          const d = Math.min(distSegmento(gx, gy, PUNTOS[0], PUNTOS[1]), distSegmento(gx, gy, PUNTOS[1], PUNTOS[2]));
          if (d <= TRAZO / 2) marca++;
        }
      }
      const total = SS * SS;
      const a = fondo / total;
      const m = fondo ? marca / fondo : 0;
      const i = (y * tam + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(FONDO[c] * (1 - m) + MARCA[c] * m);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}
function png(tam) {
  const px = dibujar(tam);
  const filas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) {
    filas[y * (tam * 4 + 1)] = 0;
    px.copy(filas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}
function ico(tamaños) {
  const imagenes = tamaños.map(png);
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(0, 0);
  cab.writeUInt16LE(1, 2);
  cab.writeUInt16LE(imagenes.length, 4);
  let desplazamiento = 6 + 16 * imagenes.length;
  const entradas = imagenes.map((img, i) => {
    const e = Buffer.alloc(16);
    e[0] = tamaños[i] >= 256 ? 0 : tamaños[i];
    e[1] = tamaños[i] >= 256 ? 0 : tamaños[i];
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += img.length;
    return e;
  });
  return Buffer.concat([cab, ...entradas, ...imagenes]);
}

fs.writeFileSync(path.join(__dirname, 'icono.png'), png(512));
fs.writeFileSync(path.join(__dirname, 'icono.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Iconos generados: escritorio/icono.png, escritorio/icono.ico');
