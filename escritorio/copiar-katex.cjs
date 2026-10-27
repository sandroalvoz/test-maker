// Copia KaTeX (fórmulas) desde node_modules a vendor/katex para que funcione sin internet.
// Uso: npm run katex
'use strict';
const fs = require('fs');
const path = require('path');

const origen = path.join(__dirname, '..', 'node_modules', 'katex', 'dist');
const destino = path.join(__dirname, '..', 'vendor', 'katex');

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(path.join(destino, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(destino, 'contrib'), { recursive: true });

for (const f of ['katex.min.js', 'katex.min.css', 'contrib/auto-render.min.js']) {
  fs.copyFileSync(path.join(origen, f), path.join(destino, f));
}
// La licencia MIT de KaTeX exige distribuir su aviso junto al código.
fs.copyFileSync(path.join(origen, '..', 'LICENSE'), path.join(destino, 'LICENSE'));
// Solo woff2: todos los navegadores actuales lo soportan y es el primer formato que pide el CSS.
let n = 0;
for (const f of fs.readdirSync(path.join(origen, 'fonts'))) {
  if (f.endsWith('.woff2')) {
    fs.copyFileSync(path.join(origen, 'fonts', f), path.join(destino, 'fonts', f));
    n++;
  }
}
const version = require(path.join(origen, '..', 'package.json')).version;
console.log(`KaTeX ${version} copiado a vendor/katex (${n} fuentes).`);
