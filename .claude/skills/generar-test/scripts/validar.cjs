#!/usr/bin/env node
/*
 * Valida uno o varios exámenes en formato testmaker-v1.
 *
 *   node validar.cjs examen.json [otro.json ...] [--clave]
 *
 * --clave  imprime la clave de respuestas (pregunta → opción correcta) para revisarla.
 * Sale con código 1 si algún archivo tiene errores.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');
const V = require('./validador.cjs');

const args = process.argv.slice(2);
const conClave = args.includes('--clave');
const archivos = args.filter((a) => !a.startsWith('--'));

if (!archivos.length) {
  console.log('Uso: node validar.cjs examen.json [otro.json ...] [--clave]');
  process.exit(2);
}

const recorta = (s, n = 70) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

let hayErrores = false;

for (const archivo of archivos) {
  const nombre = path.basename(archivo);
  console.log(`\n=== ${nombre} ===`);
  let texto;
  try {
    texto = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '');
  } catch (e) {
    console.log(`ERROR  No se puede leer: ${e.message}`);
    hayErrores = true;
    continue;
  }
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    let donde = '';
    if (m) {
      const pos = +m[1];
      const antes = texto.slice(0, pos);
      const linea = antes.split('\n').length;
      const col = pos - antes.lastIndexOf('\n');
      donde = ` (línea ${linea}, columna ${col})`;
    }
    console.log(`ERROR  JSON no válido${donde}: ${e.message}`);
    console.log('       Pistas: comillas dobles sin escapar dentro de textos (usa \\"), barras de LaTeX sin duplicar (\\\\frac), comas finales.');
    hayErrores = true;
    continue;
  }

  const r = V.validar(datos);
  r.errores.forEach((e) => console.log(`ERROR  ${e}`));
  r.avisos.forEach((a) => console.log(`AVISO  ${a}`));
  if (!r.ok) {
    hayErrores = true;
    console.log(`\n✗ ${r.errores.length} error(es). Corrígelos y vuelve a validar.`);
    continue;
  }

  const ex = V.normalizar(datos);

  // Imágenes locales: deben existir, con la ruta relativa a la carpeta del .json.
  const imgs = V.imagenes(ex);
  const dirJson = path.dirname(path.resolve(archivo));
  let faltan = 0;
  for (const { pregunta, src } of imgs) {
    if (/^(https?|data):/i.test(src)) continue;
    let ruta;
    try {
      ruta = src.startsWith('file:') ? url.fileURLToPath(src) : path.resolve(dirJson, decodeURI(src));
    } catch (e) {
      ruta = path.resolve(dirJson, src);
    }
    if (!fs.existsSync(ruta)) {
      console.log(`ERROR  Pregunta ${pregunta}: no existe la imagen "${src}" (buscada en ${ruta}).`);
      faltan++;
    }
  }
  if (faltan) {
    hayErrores = true;
    console.log(`\n✗ ${faltan} imagen(es) no encontradas. Las rutas relativas se buscan desde la carpeta del .json.`);
    continue;
  }

  const porTipo = {};
  const porTema = {};
  const posiciones = {};
  ex.preguntas.forEach((p) => {
    porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
    const t = p.tema || '(sin tema)';
    porTema[t] = (porTema[t] || 0) + 1;
    if (p.tipo === 'unica') {
      const l = V.letra(p.correctas[0]);
      posiciones[l] = (posiciones[l] || 0) + 1;
    }
  });
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ');
  console.log(`✓ Válido: «${ex.titulo}» con ${ex.preguntas.length} preguntas.`);
  console.log(`  Tipos:   ${fmt(porTipo)}`);
  console.log(`  Temas:   ${fmt(porTema)}`);
  if (imgs.length) console.log(`  Imágenes: ${imgs.length} (todas encontradas)`);
  if (Object.keys(posiciones).length) {
    const orden = Object.keys(posiciones).sort();
    console.log(`  Posición de la correcta (unica): ${orden.map((k) => `${k}: ${posiciones[k]}`).join(' · ')}${ex.config.barajarOpciones ? ' (se barajan al hacer el examen)' : ''}`);
  }
  const pu = ex.config.puntuacion;
  console.log(`  Config:  acierto ${pu.acierto} · fallo ${pu.fallo} · blanco ${pu.blanco} · aprobado ${ex.config.aprobado} · tiempo ${ex.config.tiempoLimite || 'sin límite'}${ex.config.tiempoLimite ? ' min' : ''}`);

  if (conClave) {
    console.log('\n  Clave de respuestas:');
    ex.preguntas.forEach((p, i) => {
      console.log(`  ${String(i + 1).padStart(3)}. [${p.tipo}] ${recorta(p.enunciado)}`);
      p.correctas.forEach((c) => console.log(`        → ${V.letra(c)}) ${recorta(p.opciones[c], 64)}`));
    });
  }
}

process.exit(hayErrores ? 1 : 0);
