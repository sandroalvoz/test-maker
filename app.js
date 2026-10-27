/* TestMaker: app para hacer exámenes tipo test en formato testmaker-v1. */
(() => {
  'use strict';

  const V = window.TestMakerValidador;
  const $app = document.getElementById('app');
  const $reloj = document.getElementById('reloj');
  const $input = document.getElementById('input-archivo');
  const $avisos = document.getElementById('avisos');

  const LS = {
    biblioteca: 'testmaker.biblioteca.v1',
    historial: 'testmaker.historial.v1',
    sesion: 'testmaker.sesion.v1',
    tema: 'testmaker.tema',
    vistos: 'testmaker.carpeta.v1',
  };
  // Solo existe dentro de la app de escritorio (escritorio/preload.cjs).
  const ESC = window.escritorio || null;

  /* ---------- Almacenamiento ---------- */
  function leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem(clave);
      return v ? JSON.parse(v) : porDefecto;
    } catch (e) {
      return porDefecto;
    }
  }
  function guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }
  function borrar(clave) {
    try { localStorage.removeItem(clave); } catch (e) { /* sin almacenamiento */ }
  }

  let biblioteca = leer(LS.biblioteca, []); // [{ id, datos, actualizado }]
  let historial = leer(LS.historial, {}); // { idExamen: [intento] }
  let sesion = leer(LS.sesion, null); // examen en curso
  let vista = { nombre: 'inicio' };
  let resultado = null; // último examen corregido
  let erroresCarga = []; // [{ archivo, errores, avisos }]
  let intervalo = null;
  let carpeta = null; // carpeta de exámenes (escritorio)
  let vistos = leer(LS.vistos, {}); // ruta -> fecha de modificación ya importada

  /* ---------- Utilidades ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const letra = (i) => String.fromCharCode(65 + i);
  const num = (n, dec = 2) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: dec });
  const fecha = (ms) => new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function slug(t) {
    return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'examen';
  }
  function barajar(lista) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function mismoConjunto(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }
  function duracion(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const pad = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
  }
  function aviso(texto) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = texto;
    $avisos.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* ---------- Markdown mínimo (negrita, cursiva, código, listas, fórmulas) ---------- */
  function md(texto) {
    if (!texto) return '';
    const guardados = [];
    const reservar = (html) => `\u0000${guardados.push(html) - 1}\u0000`;
    let t = String(texto).replace(/\r\n?/g, '\n');
    // Bloques de código ```
    t = t.replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, codigo) => `\n${reservar(`<pre><code>${esc(codigo.replace(/\n$/, ''))}</code></pre>`)}\n`);
    // Código en línea
    t = t.replace(/`([^`\n]+)`/g, (m, c) => reservar(`<code>${esc(c)}</code>`));
    // Fórmulas: se protegen para que KaTeX las procese intactas
    t = t.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (m) => reservar(esc(m)));
    // Imágenes ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => reservar(`<img src="${esc(url.trim())}" alt="${esc(alt)}" loading="lazy">`));
    t = esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');

    let html = '';
    let lista = null;
    let parrafo = [];
    const cerrarP = () => { if (parrafo.length) { html += `<p>${parrafo.join('<br>')}</p>`; parrafo = []; } };
    const cerrarL = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (const linea of t.split('\n')) {
      const l = linea.trim();
      let m;
      if (/^\u0000\d+\u0000$/.test(l) && guardados[+l.slice(1, -1)].startsWith('<pre')) {
        cerrarP(); cerrarL(); html += l;
      } else if ((m = l.match(/^[-*•]\s+(.*)/))) {
        cerrarP();
        if (lista !== 'ul') { cerrarL(); html += '<ul>'; lista = 'ul'; }
        html += `<li>${m[1]}</li>`;
      } else if ((m = l.match(/^\d+[.)]\s+(.*)/))) {
        cerrarP();
        if (lista !== 'ol') { cerrarL(); html += '<ol>'; lista = 'ol'; }
        html += `<li>${m[1]}</li>`;
      } else if (!l) {
        cerrarP(); cerrarL();
      } else {
        cerrarL(); parrafo.push(l);
      }
    }
    cerrarP(); cerrarL();
    return html.replace(/\u0000(\d+)\u0000/g, (m, i) => guardados[+i]);
  }
  // Para opciones: sin <p> envolvente si es una sola línea.
  function mdLinea(texto) {
    const h = md(texto);
    const m = h.match(/^<p>([\s\S]*)<\/p>$/);
    return m && !m[1].includes('<p>') ? m[1] : h;
  }

  // Si todas las opciones llevan imagen, se muestran en cuadrícula.
  function claseOpciones(q) {
    return q.opciones.every((o) => /!\[[^\]]*\]\([^)]+\)/.test(o)) ? 'opciones con-imagenes' : 'opciones';
  }

  function ampliarImagen(img) {
    modal(`<div class="imagen-ampliada"><img src="${esc(img.getAttribute('src'))}" alt="${esc(img.alt || '')}"></div>
      <div class="fila"><button class="btn btn-primario" data-accion="cerrar-modal">Cerrar</button></div>`)
      .querySelector('.modal').classList.add('modal-imagen');
  }

  function formulas(raiz = $app) {
    if (typeof window.renderMathInElement !== 'function') return;
    try {
      window.renderMathInElement(raiz, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    } catch (e) { /* fórmula mal escrita: se deja como texto */ }
  }

  /* ---------- Ejemplo integrado ---------- */
  // Polígono regular de n lados como imagen SVG incrustada (para la pregunta con imágenes).
  function poligono(n) {
    const pts = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n % 2 ? 0 : Math.PI / n);
      return `${(60 + 46 * Math.cos(a)).toFixed(1)},${(62 + 46 * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><polygon points="${pts}" fill="#e0e3ff" stroke="#4f46e5" stroke-width="4" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  const EJEMPLO = {
    formato: 'testmaker-v1',
    titulo: 'Demo de TestMaker',
    descripcion: 'Un examen corto para ver los tipos de pregunta: respuesta única, múltiple y verdadero/falso, con código y fórmulas.',
    autor: 'TestMaker',
    config: { tiempoLimite: 0, puntuacion: { acierto: 1, fallo: -0.25, blanco: 0 }, aprobado: 5, barajarPreguntas: false, barajarOpciones: true },
    preguntas: [
      {
        tipo: 'unica', tema: 'Matemáticas',
        enunciado: '¿Cuál es la derivada de $f(x) = x^3$?',
        opciones: ['$3x^2$', '$x^2$', '$3x$', '$\\frac{x^4}{4}$'],
        correctas: [0],
        explicacion: 'Regla de la potencia: $\\frac{d}{dx}x^n = n\\,x^{n-1}$, así que $3x^2$. $\\frac{x^4}{4}$ es la **primitiva**, no la derivada.',
      },
      {
        tipo: 'unica', tema: 'Matemáticas',
        enunciado: '¿Cuál de estas figuras es un **hexágono**?',
        opciones: [3, 4, 5, 6].map((n) => ({ imagen: poligono(n) })),
        correctas: [3],
        explicacion: 'Un hexágono tiene **6 lados**. Las otras figuras son un triángulo (3), un cuadrado (4) y un pentágono (5).',
      },
      {
        tipo: 'multiple', tema: 'Programación',
        enunciado: '¿Qué valores son *falsy* en JavaScript?',
        opciones: ['`0`', '`""` (cadena vacía)', '`[]` (array vacío)', '`null`', '`"false"`'],
        correctas: [0, 1, 3],
        explicacion: '`0`, `""` y `null` son falsy. Un array vacío es un objeto, y todo objeto es truthy. `"false"` es una cadena no vacía, así que también es truthy.',
      },
      {
        tipo: 'vf', tema: 'Programación',
        enunciado: 'Este código imprime `3`:\n```js\nconsole.log(1 + "2");\n```',
        correctas: [1],
        explicacion: 'Al sumar un número y una cadena, JavaScript concatena: imprime `"12"`.',
      },
      {
        tipo: 'unica', tema: 'Ciencias',
        enunciado: '¿Qué orgánulo celular produce la mayor parte del ATP?',
        opciones: ['Ribosoma', 'Mitocondria', 'Aparato de Golgi', 'Lisosoma'],
        correctas: [1],
        explicacion: 'La mitocondria realiza la respiración celular (ciclo de Krebs y cadena de transporte de electrones), donde se genera la mayor parte del ATP.',
      },
      {
        tipo: 'vf', tema: 'Ciencias',
        enunciado: 'La velocidad de la luz en el vacío es aproximadamente $3 \\times 10^8$ m/s.',
        correctas: [0],
        explicacion: 'Su valor exacto es 299 792 458 m/s, que redondeado es $3 \\times 10^8$ m/s.',
      },
    ],
  };

  /* ---------- Biblioteca ---------- */
  function examenPorId(id) {
    return biblioteca.find((e) => e.id === id);
  }
  function persistirBiblioteca() {
    if (!guardar(LS.biblioteca, biblioteca)) aviso('No se pudo guardar la biblioteca (¿almacenamiento lleno o bloqueado?).');
  }
  /* Imágenes con ruta relativa: se resuelven desde la carpeta del .json cuando se conoce
     (app de escritorio). Si no se conoce (navegador), quedan relativas a index.html. */
  function resolverUrl(src, base) {
    const s = String(src).trim();
    if (/^[a-zA-Z]:[\\/]/.test(s)) return new URL(`file:///${s.replace(/\\/g, '/')}`).href; // C:\...
    if (/^(https?|data|file|blob):/i.test(s) || !base) return s;
    try {
      return new URL(s.replace(/\\/g, '/'), base).href;
    } catch (e) {
      return s;
    }
  }
  function resolverImagenes(ex, ruta) {
    if (!ruta) return ex;
    const base = new URL(`file:///${ruta.replace(/\\/g, '/').replace(/^\/+/, '')}`).href;
    const enTexto = (t) => (t ? t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => `![${alt}](${resolverUrl(src, base)})`) : t);
    ex.preguntas.forEach((p) => {
      if (p.imagen) p.imagen = resolverUrl(p.imagen, base);
      p.enunciado = enTexto(p.enunciado);
      p.explicacion = enTexto(p.explicacion);
      p.opciones = p.opciones.map(enTexto);
    });
    return ex;
  }

  function añadirExamen(datos, archivo, ruta) {
    const r = V.validar(datos);
    if (!r.ok) {
      erroresCarga.push({ archivo, errores: r.errores, avisos: r.avisos });
      return null;
    }
    const norm = resolverImagenes(V.normalizar(datos), ruta);
    const id = slug(norm.titulo);
    const previo = biblioteca.findIndex((e) => e.id === id);
    // ruta: archivo de origen en disco (escritorio); el editor lo usa para guardar encima.
    const entrada = { id, datos: norm, actualizado: Date.now(), ruta: ruta || (previo >= 0 ? biblioteca[previo].ruta : undefined) };
    if (previo >= 0) biblioteca[previo] = entrada;
    else biblioteca.unshift(entrada);
    persistirBiblioteca();
    if (r.avisos.length) console.info(`[TestMaker] Avisos en ${archivo}:`, r.avisos);
    return { id, reemplazado: previo >= 0 };
  }
  function cargarTexto(texto, archivo, ruta) {
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (e) {
      erroresCarga.push({ archivo, errores: [`No es un JSON válido: ${e.message}`], avisos: [] });
      return null;
    }
    return añadirExamen(datos, archivo, ruta);
  }
  // Ruta en disco de un archivo arrastrado o elegido (solo en la app de escritorio).
  function rutaDe(f) {
    try {
      return ESC && ESC.rutaDeArchivo ? ESC.rutaDeArchivo(f) || null : null;
    } catch (e) {
      return null;
    }
  }
  async function cargarArchivos(lista) {
    const archivos = [...lista];
    if (!archivos.length) return;
    erroresCarga = [];
    const cargados = [];
    for (const f of archivos) {
      try {
        const r = cargarTexto(await f.text(), f.name, rutaDe(f));
        if (r) cargados.push(r);
      } catch (e) {
        erroresCarga.push({ archivo: f.name, errores: [`No se pudo leer el archivo: ${e.message}`], avisos: [] });
      }
    }
    trasCargar(cargados);
  }
  function trasCargar(cargados) {
    if (cargados.length === 1 && !erroresCarga.length) {
      aviso(cargados[0].reemplazado ? 'Examen actualizado' : 'Examen añadido');
      ir({ nombre: 'detalle', id: cargados[0].id });
      return;
    }
    if (cargados.length) aviso(`${plural(cargados.length, 'examen cargado', 'exámenes cargados')}`);
    ir({ nombre: 'inicio' });
  }
  /* ---------- Escritorio: carpeta sincronizada y archivos abiertos ---------- */
  // Importa los .json nuevos o modificados de la carpeta de exámenes.
  async function sincronizarCarpeta() {
    if (!ESC) return;
    let r;
    try {
      r = await ESC.leerCarpeta();
    } catch (e) {
      return;
    }
    const cambioCarpeta = carpeta !== r.carpeta;
    carpeta = r.carpeta;
    const previos = erroresCarga;
    erroresCarga = [];
    const procesados = new Set();
    const cargados = [];
    for (const a of r.archivos) {
      if (vistos[a.ruta] === a.modificado) continue;
      vistos[a.ruta] = a.modificado;
      procesados.add(a.nombre);
      if (a.error) erroresCarga.push({ archivo: a.nombre, errores: [a.error], avisos: [] });
      else {
        const res = cargarTexto(a.texto, a.nombre, a.ruta);
        if (res) cargados.push(res);
      }
    }
    const nuevos = erroresCarga;
    erroresCarga = [...previos.filter((e) => !procesados.has(e.archivo)), ...nuevos];
    guardar(LS.vistos, vistos);
    if (cargados.length === 1) {
      const t = examenPorId(cargados[0].id).datos.titulo;
      aviso(`«${t}» ${cargados[0].reemplazado ? 'actualizado' : 'añadido'} desde la carpeta`);
    } else if (cargados.length > 1) {
      aviso(`${cargados.length} exámenes sincronizados desde la carpeta`);
    }
    if (vista.nombre !== 'examen' && (cargados.length || nuevos.length || cambioCarpeta)) render();
  }

  function abrirDesdeEscritorio(archivos) {
    if (!archivos || !archivos.length) return;
    erroresCarga = [];
    const cargados = [];
    for (const a of archivos) {
      if (a.error) erroresCarga.push({ archivo: a.nombre, errores: [a.error], avisos: [] });
      else {
        const r = cargarTexto(a.texto, a.nombre, a.ruta);
        if (r) cargados.push(r);
      }
    }
    if (vista.nombre === 'examen' && sesion) {
      aviso(cargados.length ? 'Añadido a la biblioteca. Lo verás al terminar el examen.' : 'El archivo tiene errores. Los verás al terminar el examen.');
      return;
    }
    trasCargar(cargados);
  }

  function descargarJson(nombre, datos) {
    const blob = new Blob([`${JSON.stringify(datos, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportar(id) {
    const e = examenPorId(id);
    if (e) descargarJson(`${e.id}.json`, e.datos);
  }

  /* Guarda un examen que viene del editor. En escritorio también escribe su archivo .json.
     origenId: examen de la biblioteca que se está editando (puede cambiar de título). */
  async function guardarDesdeEditor(datos, { origenId = null, ruta = null, forzar = false } = {}) {
    const r = V.validar(datos);
    if (!r.ok) return { ok: false, errores: r.errores };
    const id = slug(datos.titulo.trim());
    const otro = examenPorId(id);
    if (!forzar && otro && id !== origenId) return { ok: false, conflicto: true, titulo: otro.datos.titulo };
    const previo = examenPorId(origenId);
    let rutaFinal = ruta || (previo && previo.ruta) || null;
    if (ESC && ESC.guardarExamen) {
      try {
        const res = await ESC.guardarExamen({ ruta: rutaFinal, nombre: id, datos });
        rutaFinal = res.ruta;
        vistos[res.ruta] = res.modificado; // que la carpeta sincronizada no lo vuelva a importar
        guardar(LS.vistos, vistos);
      } catch (e) {
        aviso('No se pudo escribir el archivo en la carpeta de exámenes; se guarda solo en la biblioteca.');
      }
    }
    const norm = resolverImagenes(V.normalizar(datos), rutaFinal);
    if (origenId && origenId !== id) {
      biblioteca = biblioteca.filter((e) => e.id !== origenId);
      if (historial[origenId]) {
        historial[id] = [...(historial[id] || []), ...historial[origenId]];
        delete historial[origenId];
        guardar(LS.historial, historial);
      }
    }
    const entrada = { id, datos: norm, actualizado: Date.now(), ruta: rutaFinal || undefined };
    const i = biblioteca.findIndex((e) => e.id === id);
    if (i >= 0) biblioteca[i] = entrada;
    else biblioteca.unshift(entrada);
    persistirBiblioteca();
    return { ok: true, id, ruta: rutaFinal };
  }

  /* ---------- Sesión de examen ---------- */
  function prepararPregunta(p, barajarOpciones, origen) {
    if (!barajarOpciones || p.fijarOrden) return { ...p, origen };
    const perm = barajar(p.opciones.map((_, i) => i));
    return {
      ...p,
      origen,
      opciones: perm.map((j) => p.opciones[j]),
      correctas: p.correctas.map((c) => perm.indexOf(c)).sort((a, b) => a - b),
    };
  }

  function iniciar(id, op) {
    const e = examenPorId(id);
    if (!e) return;
    const ex = e.datos;
    let indices = op.indices || ex.preguntas.map((_, i) => i);
    if (op.temas && op.temas.length) indices = indices.filter((i) => op.temas.includes(ex.preguntas[i].tema || 'Sin tema'));
    if (op.barajarPreguntas) indices = barajar(indices);
    if (op.n && op.n < indices.length) indices = indices.slice(0, op.n);
    if (!indices.length) { aviso('No hay preguntas con esos filtros.'); return; }
    const ahora = Date.now();
    sesion = {
      examenId: id,
      titulo: ex.titulo,
      modo: op.modo,
      opciones: op,
      config: ex.config,
      preguntas: indices.map((i) => prepararPregunta(ex.preguntas[i], op.barajarOpciones, i)),
      respuestas: indices.map(() => []),
      comprobadas: indices.map(() => false),
      marcadas: indices.map(() => false),
      actual: 0,
      inicio: ahora,
      limite: op.minutos > 0 ? ahora + op.minutos * 60000 : null,
    };
    guardarSesion();
    ir({ nombre: 'examen' });
  }
  function guardarSesion() {
    if (sesion) guardar(LS.sesion, sesion);
  }

  function estadoPregunta(q, resp) {
    if (!resp.length) return 'blanco';
    return mismoConjunto(resp, q.correctas) ? 'acierto' : 'fallo';
  }

  function seleccionar(k) {
    const i = sesion.actual;
    const q = sesion.preguntas[i];
    if (k < 0 || k >= q.opciones.length) return;
    if (sesion.modo === 'practica' && sesion.comprobadas[i]) return;
    const r = sesion.respuestas[i];
    if (q.tipo === 'multiple') {
      sesion.respuestas[i] = r.includes(k) ? r.filter((x) => x !== k) : [...r, k].sort((a, b) => a - b);
    } else {
      sesion.respuestas[i] = r[0] === k && sesion.modo !== 'practica' ? [] : [k];
      if (sesion.modo === 'practica') sesion.comprobadas[i] = true;
    }
    guardarSesion();
    render();
  }
  function comprobar() {
    const i = sesion.actual;
    if (!sesion.respuestas[i].length) { aviso('Elige al menos una opción.'); return; }
    sesion.comprobadas[i] = true;
    guardarSesion();
    render();
  }
  function navegar(i) {
    if (!sesion) return;
    sesion.actual = Math.max(0, Math.min(sesion.preguntas.length - 1, i));
    guardarSesion();
    render();
    $app.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function alternarMarca() {
    const i = sesion.actual;
    sesion.marcadas[i] = !sesion.marcadas[i];
    guardarSesion();
    render();
  }

  function pedirEntrega() {
    const blancos = sesion.respuestas.filter((r) => !r.length).length;
    const marcadas = sesion.marcadas.filter(Boolean).length;
    const detalles = [];
    if (blancos) detalles.push(`Te quedan <b>${plural(blancos, 'pregunta', 'preguntas')} en blanco</b>.`);
    if (marcadas) detalles.push(`Tienes <b>${plural(marcadas, 'pregunta marcada', 'preguntas marcadas')}</b> para revisar.`);
    modal(`
      <h2>¿Entregar el examen?</h2>
      <p>${detalles.length ? detalles.join(' ') : 'Has respondido todas las preguntas.'}</p>
      <p class="meta">Después verás la nota y la corrección de cada pregunta.</p>
      <div class="fila">
        <button class="btn" data-accion="cerrar-modal">Seguir con el examen</button>
        <button class="btn btn-primario" data-accion="entregar">Entregar</button>
      </div>`);
  }

  function entregar(porTiempo) {
    if (!sesion) return;
    pararReloj();
    cerrarModal();
    const s = sesion;
    const pu = s.config.puntuacion;
    const estados = s.preguntas.map((q, i) => estadoPregunta(q, s.respuestas[i]));
    const aciertos = estados.filter((e) => e === 'acierto').length;
    const fallos = estados.filter((e) => e === 'fallo').length;
    const blancos = estados.length - aciertos - fallos;
    const puntos = aciertos * pu.acierto + fallos * pu.fallo + blancos * pu.blanco;
    const maximo = estados.length * pu.acierto;
    const nota = Math.max(0, Math.min(10, (puntos / maximo) * 10));
    const porTema = {};
    s.preguntas.forEach((q, i) => {
      const t = q.tema || 'Sin tema';
      porTema[t] = porTema[t] || { acierto: 0, fallo: 0, blanco: 0, total: 0 };
      porTema[t][estados[i]]++;
      porTema[t].total++;
    });
    const fin = Math.min(Date.now(), s.limite || Infinity);
    resultado = {
      ...s,
      estados, aciertos, fallos, blancos, puntos, maximo, nota, porTema,
      aprobado: nota >= s.config.aprobado,
      duracionMs: fin - s.inicio,
      fecha: Date.now(),
      porTiempo: !!porTiempo,
    };
    (historial[s.examenId] = historial[s.examenId] || []).unshift({
      fecha: resultado.fecha, modo: s.modo, nota, aciertos, fallos, blancos,
      total: estados.length, duracionMs: resultado.duracionMs,
    });
    historial[s.examenId] = historial[s.examenId].slice(0, 50);
    guardar(LS.historial, historial);
    sesion = null;
    borrar(LS.sesion);
    if (porTiempo) aviso('Se acabó el tiempo: examen entregado.');
    ir({ nombre: 'resultados', filtro: 'todas' });
  }

  function abandonar() {
    pararReloj();
    sesion = null;
    borrar(LS.sesion);
    cerrarModal();
    ir({ nombre: 'inicio' });
  }

  /* ---------- Reloj ---------- */
  function arrancarReloj() {
    pararReloj();
    if (!sesion) return;
    const tic = () => {
      if (!sesion) return pararReloj();
      const ahora = Date.now();
      if (sesion.limite) {
        const resta = sesion.limite - ahora;
        if (resta <= 0) { entregar(true); return; }
        $reloj.textContent = `⏱ ${duracion(resta)}`;
        $reloj.title = 'Tiempo restante';
        $reloj.classList.toggle('urgente', resta < 60000);
      } else {
        $reloj.textContent = `⏱ ${duracion(ahora - sesion.inicio)}`;
        $reloj.title = 'Tiempo transcurrido';
        $reloj.classList.remove('urgente');
      }
    };
    $reloj.hidden = false;
    tic();
    intervalo = setInterval(tic, 1000);
  }
  function pararReloj() {
    clearInterval(intervalo);
    intervalo = null;
    $reloj.hidden = true;
  }

  /* ---------- Modal ---------- */
  function modal(html) {
    cerrarModal();
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal panel" role="dialog" aria-modal="true">${html}</div>`;
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrarModal(); });
    document.body.appendChild(fondo);
    const foco = fondo.querySelector('textarea, .btn-primario, button');
    if (foco) foco.focus();
    return fondo;
  }
  function cerrarModal() {
    document.querySelectorAll('.modal-fondo').forEach((m) => m.remove());
  }
  const hayModal = () => !!document.querySelector('.modal-fondo');

  /* ---------- Vistas ---------- */
  function ir(v) {
    vista = v;
    if (v.nombre !== 'examen') pararReloj();
    render();
    window.scrollTo({ top: 0 });
  }

  function render() {
    const vistas = { inicio: vInicio, detalle: vDetalle, examen: vExamen, resultados: vResultados, editor: () => editor.vista() };
    if (vista.nombre === 'examen' && !sesion) vista = { nombre: 'inicio' };
    if (vista.nombre === 'resultados' && !resultado) vista = { nombre: 'inicio' };
    if (vista.nombre === 'detalle' && !examenPorId(vista.id)) vista = { nombre: 'inicio' };
    $app.innerHTML = vistas[vista.nombre]();
    if (vista.nombre === 'examen' && !intervalo) arrancarReloj();
    // Pestañas de la cabecera: el editor tiene la suya; todo lo demás es la biblioteca.
    const pestana = vista.nombre === 'editor' ? 'editor' : 'inicio';
    document.querySelectorAll('.pestana').forEach((p) => {
      const activa = p.dataset.pestana === pestana;
      p.classList.toggle('activa', activa);
      if (activa) p.setAttribute('aria-current', 'page');
      else p.removeAttribute('aria-current');
    });
    if (vista.nombre === 'editor') editor.trasPintar();
    else formulas();
  }

  function resumenHistorial(id) {
    const h = historial[id] || [];
    if (!h.length) return '';
    const mejor = Math.max(...h.map((x) => x.nota));
    return `Mejor nota: <b>${num(mejor)}</b> · ${plural(h.length, 'intento', 'intentos')}`;
  }

  function vInicio() {
    const banner = sesion ? `
      <div class="banner">
        <div><strong>Tienes un examen a medias</strong><span class="meta">${esc(sesion.titulo)} · ${sesion.respuestas.filter((r) => r.length).length}/${sesion.preguntas.length} respondidas</span></div>
        <div class="fila">
          <button class="btn btn-fantasma" data-accion="abandonar">Descartar</button>
          <button class="btn btn-primario" data-accion="continuar">Continuar</button>
        </div>
      </div>` : '';

    const errores = erroresCarga.length ? `
      <div class="panel errores" role="alert">
        <div class="fila separado"><h2>No se pudo cargar ${erroresCarga.length === 1 ? 'el archivo' : `${erroresCarga.length} archivos`}</h2>
        <button class="btn btn-fantasma" data-accion="cerrar-errores">Cerrar</button></div>
        ${erroresCarga.map((e) => `
          <h3>${esc(e.archivo)}</h3>
          <ul>${e.errores.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${e.avisos.length ? `<ul class="avisos">${e.avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`).join('')}
      </div>` : '';

    const tarjetas = biblioteca.map((e) => {
      const d = e.datos;
      const temas = new Set(d.preguntas.map((p) => p.tema).filter(Boolean));
      return `
        <article class="panel tarjeta">
          <h3>${esc(d.titulo)}</h3>
          ${d.descripcion ? `<p class="desc">${esc(d.descripcion)}</p>` : ''}
          <div class="chips">
            <span class="chip">${plural(d.preguntas.length, 'pregunta', 'preguntas')}</span>
            ${temas.size ? `<span class="chip">${plural(temas.size, 'tema', 'temas')}</span>` : ''}
            ${d.config.tiempoLimite ? `<span class="chip">⏱ ${d.config.tiempoLimite} min</span>` : ''}
            ${d.config.puntuacion.fallo < 0 ? '<span class="chip">Resta fallos</span>' : ''}
          </div>
          <div class="meta">${resumenHistorial(e.id) || 'Sin intentos todavía'}</div>
          <div class="pie">
            <button class="btn btn-primario" data-accion="abrir" data-id="${esc(e.id)}">Abrir</button>
            <button class="btn-icono" data-accion="ed-editar" data-id="${esc(e.id)}" title="Editar" aria-label="Editar">✎</button>
            <button class="btn-icono" data-accion="exportar" data-id="${esc(e.id)}" title="Descargar JSON" aria-label="Descargar JSON">⤓</button>
            <button class="btn-icono btn-peligro" data-accion="eliminar" data-id="${esc(e.id)}" title="Quitar de la biblioteca" aria-label="Quitar de la biblioteca">✕</button>
          </div>
        </article>`;
    }).join('');

    return `
      <section>
        ${banner}
        <div class="zona-carga" id="zona-carga">
          <h1>Exámenes tipo test</h1>
          <p class="subtitulo">Arrastra aquí uno o varios archivos <code>.json</code> en formato <code>${V.FORMATO}</code>, o elige una opción.</p>
          <div class="fila">
            <button class="btn btn-primario btn-grande" data-accion="elegir-archivo">Abrir archivo</button>
            <button class="btn btn-grande" data-accion="pegar">Pegar JSON</button>
            <button class="btn btn-grande btn-fantasma" data-accion="ejemplo">Probar la demo</button>
          </div>
        </div>
        ${ESC ? `
        <div class="carpeta">
          <div class="carpeta-texto"><span class="meta">Carpeta de exámenes</span>
            <code title="${esc(carpeta || '')}">${esc(carpeta || '…')}</code>
            <span class="meta">Los .json que se guarden aquí aparecen solos en la biblioteca.</span></div>
          <div class="fila">
            <button class="btn" data-accion="abrir-carpeta">Abrir carpeta</button>
            <button class="btn btn-fantasma" data-accion="cambiar-carpeta">Cambiar…</button>
          </div>
        </div>` : ''}
        ${errores}
        <div class="seccion">
          <h2>Biblioteca</h2>
          ${biblioteca.length ? `<div class="rejilla">${tarjetas}</div>` : `
            <div class="panel vacio">Todavía no hay exámenes. Carga un archivo o genera uno con la skill <code>generar-test</code> de Claude.</div>`}
        </div>
      </section>`;
  }

  function vDetalle() {
    const e = examenPorId(vista.id);
    const d = e.datos;
    const c = d.config;
    const temas = {};
    d.preguntas.forEach((p) => { const t = p.tema || 'Sin tema'; temas[t] = (temas[t] || 0) + 1; });
    const nombresTemas = Object.keys(temas);
    const h = historial[e.id] || [];
    const pu = c.puntuacion;
    const signo = (x) => (x > 0 ? `+${num(x)}` : num(x));

    return `
      <section>
        <div class="fila separado">
          <button class="btn btn-fantasma volver" data-accion="ir-inicio">← Biblioteca</button>
          <button class="btn" data-accion="ed-editar" data-id="${esc(e.id)}">✎ Editar examen</button>
        </div>
        <h1>${esc(d.titulo)}</h1>
        ${d.descripcion ? `<p class="subtitulo">${esc(d.descripcion)}</p>` : ''}
        <div class="chips">
          <span class="chip">${plural(d.preguntas.length, 'pregunta', 'preguntas')}</span>
          ${d.autor ? `<span class="chip">${esc(d.autor)}</span>` : ''}
        </div>

        <div class="detalle-rejilla">
          <form class="panel" id="form-inicio" onsubmit="return false">
            <div class="campo">
              <span class="etiqueta">Modo</span>
              <div class="modos">
                <label class="modo"><input type="radio" name="modo" value="examen" checked>
                  <strong>Examen</strong><span>Respondes todo y ves la corrección al entregar.</span></label>
                <label class="modo"><input type="radio" name="modo" value="practica">
                  <strong>Práctica</strong><span>Ves si aciertas y la explicación en cada pregunta.</span></label>
              </div>
            </div>

            ${nombresTemas.length > 1 ? `
            <div class="campo">
              <span class="etiqueta">Temas</span>
              <div class="chips">
                ${nombresTemas.map((t) => `
                  <label class="chip chip-check"><input type="checkbox" name="tema" value="${esc(t)}" checked> ${esc(t)} <span class="meta">${temas[t]}</span></label>`).join('')}
              </div>
            </div>` : ''}

            <div class="campo">
              <label class="etiqueta" for="n-preguntas">Número de preguntas</label>
              <div class="fila"><input class="entrada" type="number" id="n-preguntas" min="1" max="${d.preguntas.length}" value="${d.preguntas.length}">
              <span class="meta" id="n-max">de ${d.preguntas.length}</span></div>
              <div class="ayuda">Si eliges menos, se toman las primeras (o al azar si barajas las preguntas).</div>
            </div>

            <div class="campo">
              <span class="etiqueta">Orden</span>
              <label class="check"><input type="checkbox" id="barajar-preguntas" ${c.barajarPreguntas ? 'checked' : ''}> Barajar preguntas</label>
              <label class="check"><input type="checkbox" id="barajar-opciones" ${c.barajarOpciones ? 'checked' : ''}> Barajar opciones de respuesta</label>
            </div>

            <div class="campo">
              <label class="etiqueta" for="minutos">Tiempo límite</label>
              <div class="fila"><input class="entrada" type="number" id="minutos" min="0" step="1" value="${c.tiempoLimite || 0}"><span class="meta">minutos (0 = sin límite)</span></div>
            </div>

            <div class="puntuacion-info">
              Puntuación: acierto <b>${signo(pu.acierto)}</b> · fallo <b>${signo(pu.fallo)}</b> · en blanco <b>${signo(pu.blanco)}</b> · aprobado con <b>${num(c.aprobado)}</b>/10
            </div>

            <button class="btn btn-primario btn-grande" data-accion="empezar" data-id="${esc(e.id)}">Empezar</button>
          </form>

          <aside class="panel">
            <div class="fila separado"><h2>Intentos</h2>
              ${h.length ? `<button class="btn btn-fantasma" data-accion="borrar-historial" data-id="${esc(e.id)}">Borrar</button>` : ''}</div>
            ${h.length ? `<ul class="historial">${h.slice(0, 12).map((x) => `
              <li><div><div>${fecha(x.fecha)}</div><div class="meta">${x.modo === 'practica' ? 'Práctica' : 'Examen'} · ${x.aciertos}✓ ${x.fallos}✗ ${x.blancos}○ · ${duracion(x.duracionMs)}</div></div>
              <span class="nota-mini ${x.nota >= c.aprobado ? 'aprobado' : 'suspenso'}">${num(x.nota)}</span></li>`).join('')}</ul>`
              : '<p class="meta">Aún no has hecho este examen.</p>'}
          </aside>
        </div>
      </section>`;
  }

  function vExamen() {
    const s = sesion;
    const i = s.actual;
    const q = s.preguntas[i];
    const resp = s.respuestas[i];
    const total = s.preguntas.length;
    const practica = s.modo === 'practica';
    const comprobada = practica && s.comprobadas[i];
    const respondidas = s.respuestas.filter((r) => r.length).length;
    const esMultiple = q.tipo === 'multiple';

    const opciones = q.opciones.map((o, k) => {
      const sel = resp.includes(k);
      const esCorrecta = q.correctas.includes(k);
      let clase = sel ? 'sel' : '';
      let estado = '';
      if (comprobada) {
        if (esCorrecta && sel) { clase = 'correcta'; estado = '✓'; }
        else if (esCorrecta) { clase = 'correcta correcta-no-marcada'; estado = 'Correcta'; }
        else if (sel) { clase = 'incorrecta'; estado = '✗'; }
      }
      return `<li><button type="button" class="opcion ${esMultiple ? 'multiple' : ''} ${clase}" data-accion="opcion" data-k="${k}"
        aria-pressed="${sel}" ${comprobada ? 'disabled' : ''}>
        <span class="letra">${letra(k)}</span><span class="texto">${mdLinea(o)}</span>${estado ? `<span class="estado">${estado}</span>` : ''}</button></li>`;
    }).join('');

    let feedback = '';
    if (comprobada) {
      const est = estadoPregunta(q, resp);
      feedback = `<div class="feedback ${est === 'acierto' ? 'ok' : 'mal'}">
        <strong>${est === 'acierto' ? '¡Correcto!' : `Incorrecto. ${q.correctas.length > 1 ? 'Las correctas son' : 'La correcta es'} ${q.correctas.map(letra).join(', ')}.`}</strong>
        ${q.explicacion ? md(q.explicacion) : ''}</div>`;
    }

    const nav = s.preguntas.map((p, j) => {
      const c = [];
      if (j === i) c.push('actual');
      if (practica && s.comprobadas[j]) c.push(estadoPregunta(p, s.respuestas[j]) === 'acierto' ? 'acierto' : 'fallo');
      else if (s.respuestas[j].length) c.push('respondida');
      if (s.marcadas[j]) c.push('marcada');
      return `<button class="nav-btn ${c.join(' ')}" data-accion="ir-pregunta" data-i="${j}" aria-label="Pregunta ${j + 1}">${j + 1}</button>`;
    }).join('');

    const pista = esMultiple ? 'Puede haber varias correctas' : q.tipo === 'vf' ? 'Verdadero o falso' : 'Una sola respuesta';
    const botonCentral = practica && esMultiple && !comprobada
      ? `<button class="btn btn-primario" data-accion="comprobar">Comprobar</button>` : '';
    const esUltima = i === total - 1;

    return `
      <section>
        <div class="examen-cab">
          <h1>${esc(s.titulo)}</h1>
          <div class="fila">
            <span class="chip chip-acento">${practica ? 'Práctica' : 'Examen'}</span>
            <button class="btn btn-fantasma" data-accion="pedir-abandonar">Salir</button>
          </div>
        </div>
        <div class="progreso" aria-hidden="true"><div style="width:${(respondidas / total) * 100}%"></div></div>

        <div class="examen-rejilla">
          <article class="panel">
            <div class="pregunta-meta">
              <span class="pregunta-num">Pregunta ${i + 1} de ${total}</span>
              ${q.tema ? `<span class="chip">${esc(q.tema)}</span>` : ''}
              <span class="chip">${pista}</span>
            </div>
            <div class="enunciado">${md(q.enunciado)}</div>
            ${q.imagen ? `<img class="imagen-pregunta" src="${esc(q.imagen)}" alt="Imagen de la pregunta ${i + 1}">` : ''}
            <ol class="${claseOpciones(q)}">${opciones}</ol>
            ${feedback}
            <div class="pregunta-pie">
              <button class="btn" data-accion="anterior" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
              <div class="fila">
                <button class="btn ${s.marcadas[i] ? 'marcada-on' : ''}" data-accion="marcar" title="Marcar para revisar (M)">⚑ ${s.marcadas[i] ? 'Marcada' : 'Marcar'}</button>
                ${botonCentral}
              </div>
              ${esUltima
                ? `<button class="btn btn-primario" data-accion="pedir-entrega">Entregar</button>`
                : `<button class="btn ${botonCentral ? '' : 'btn-primario'}" data-accion="siguiente">Siguiente →</button>`}
            </div>
            <div class="atajos">Atajos: <kbd>A</kbd>–<kbd>H</kbd> o <kbd>1</kbd>–<kbd>8</kbd> elegir · <kbd>←</kbd> <kbd>→</kbd> moverse · <kbd>M</kbd> marcar${practica && esMultiple ? ' · <kbd>Enter</kbd> comprobar' : ''}</div>
          </article>

          <aside class="panel navegador">
            <h2>Preguntas</h2>
            <div class="nav-rejilla">${nav}</div>
            <div class="leyenda">
              ${practica
                ? '<span><i class="l-ok"></i> Acertada</span><span><i class="l-mal"></i> Fallada</span>'
                : '<span><i class="l-resp"></i> Respondida</span>'}
              <span><i></i> Sin responder</span>
              <span><i class="l-marca"></i> Marcada para revisar</span>
            </div>
            <div class="contadores">${respondidas} de ${total} respondidas</div>
            <button class="btn btn-primario" data-accion="pedir-entrega">Entregar examen</button>
          </aside>
        </div>
      </section>`;
  }

  function vResultados() {
    const r = resultado;
    const filtro = vista.filtro || 'todas';
    const pct = Math.round(r.nota * 10);
    const color = r.aprobado ? 'var(--ok)' : 'var(--mal)';
    const nRepaso = r.fallos + r.blancos;

    const temas = Object.entries(r.porTema);
    const tablaTemas = temas.length > 1 ? `
      <div class="panel seccion">
        <h2>Por tema</h2>
        <table class="temas-tabla"><tbody>
          ${temas.sort((a, b) => a[1].acierto / a[1].total - b[1].acierto / b[1].total).map(([t, v]) => {
            const p = Math.round((v.acierto / v.total) * 100);
            return `<tr><td>${esc(t)}</td><td style="width:45%"><div class="barra-tema ${p < 50 ? 'baja' : ''}"><div style="width:${p}%"></div></div></td>
              <td class="num">${v.acierto}/${v.total} · ${p}%</td></tr>`;
          }).join('')}
        </tbody></table>
      </div>` : '';

    const items = r.preguntas.map((q, i) => ({ q, i, est: r.estados[i], resp: r.respuestas[i] }))
      .filter((x) => filtro === 'todas' || (filtro === 'falladas' && x.est === 'fallo') || (filtro === 'blanco' && x.est === 'blanco') || (filtro === 'acertadas' && x.est === 'acierto'))
      .map(({ q, i, est, resp }) => {
        const etiqueta = { acierto: '<span class="chip chip-ok">Acertada</span>', fallo: '<span class="chip chip-mal">Fallada</span>', blanco: '<span class="chip">En blanco</span>' }[est];
        const ops = q.opciones.map((o, k) => {
          const sel = resp.includes(k);
          const ok = q.correctas.includes(k);
          let clase = '';
          let estado = '';
          if (ok && sel) { clase = 'correcta'; estado = 'Tu respuesta ✓'; }
          else if (ok) { clase = 'correcta correcta-no-marcada'; estado = 'Correcta'; }
          else if (sel) { clase = 'incorrecta'; estado = 'Tu respuesta ✗'; }
          return `<li><div class="opcion ${q.tipo === 'multiple' ? 'multiple' : ''} ${clase}"><span class="letra">${letra(k)}</span><span class="texto">${mdLinea(o)}</span>${estado ? `<span class="estado">${estado}</span>` : ''}</div></li>`;
        }).join('');
        return `
          <article class="panel">
            <div class="pregunta-meta"><span class="pregunta-num">Pregunta ${i + 1}</span>${etiqueta}${q.tema ? `<span class="chip">${esc(q.tema)}</span>` : ''}</div>
            <div class="enunciado">${md(q.enunciado)}</div>
            ${q.imagen ? `<img class="imagen-pregunta" src="${esc(q.imagen)}" alt="">` : ''}
            <ol class="${claseOpciones(q)}">${ops}</ol>
            ${q.explicacion ? `<div class="feedback blanco"><strong>Explicación</strong>${md(q.explicacion)}</div>` : ''}
          </article>`;
      }).join('');

    const btnFiltro = (f, txt, n) => `<button class="btn ${filtro === f ? 'btn-activo' : ''}" data-accion="filtrar" data-f="${f}">${txt}${n !== undefined ? ` (${n})` : ''}</button>`;
    const pu = r.config.puntuacion;

    return `
      <section>
        <div class="panel resumen">
          <div class="anillo" style="--p:${pct};--color:${color}"><div><div><div class="nota">${num(r.nota)}</div><div class="sobre">sobre 10</div></div></div></div>
          <div>
            <div class="estado-final ${r.aprobado ? 'aprobado' : 'suspenso'}">${r.aprobado ? 'Aprobado' : 'Suspenso'}</div>
            <div class="meta">${esc(r.titulo)} · ${r.modo === 'practica' ? 'Práctica' : 'Examen'} · ${duracion(r.duracionMs)}${r.porTiempo ? ' · entregado al acabar el tiempo' : ''}</div>
            <div class="cifras">
              <div class="cifra ok"><b>${r.aciertos}</b><small>aciertos</small></div>
              <div class="cifra mal"><b>${r.fallos}</b><small>fallos</small></div>
              <div class="cifra"><b>${r.blancos}</b><small>en blanco</small></div>
              <div class="cifra"><b>${num(r.puntos)}</b><small>de ${num(r.maximo)} puntos</small></div>
            </div>
            ${pu.fallo < 0 && r.fallos ? `<p class="meta">Los fallos restan ${num(-pu.fallo)}: te han quitado ${num(-pu.fallo * r.fallos)} puntos.</p>` : ''}
            <div class="fila">
              <button class="btn btn-primario" data-accion="repetir">Repetir examen</button>
              ${nRepaso ? `<button class="btn" data-accion="repasar">Repasar falladas y en blanco (${nRepaso})</button>` : ''}
              <button class="btn btn-fantasma" data-accion="ir-inicio">Biblioteca</button>
            </div>
          </div>
        </div>
        ${tablaTemas}
        <div class="seccion">
          <h2>Corrección</h2>
          <div class="fila filtros">
            ${btnFiltro('todas', 'Todas', r.preguntas.length)}
            ${btnFiltro('falladas', 'Falladas', r.fallos)}
            ${btnFiltro('blanco', 'En blanco', r.blancos)}
            ${btnFiltro('acertadas', 'Acertadas', r.aciertos)}
          </div>
          <div class="revision">${items || '<div class="panel vacio">No hay preguntas en este filtro.</div>'}</div>
        </div>
      </section>`;
  }

  /* ---------- Acciones ---------- */
  function leerFormulario(id) {
    const f = document.getElementById('form-inicio');
    const e = examenPorId(id);
    const temas = [...f.querySelectorAll('input[name="tema"]:checked')].map((x) => x.value);
    const todosTemas = f.querySelectorAll('input[name="tema"]').length;
    return {
      modo: f.querySelector('input[name="modo"]:checked').value,
      temas: todosTemas && temas.length < todosTemas ? temas : null,
      n: Math.max(1, parseInt(f.querySelector('#n-preguntas').value, 10) || e.datos.preguntas.length),
      barajarPreguntas: f.querySelector('#barajar-preguntas').checked,
      barajarOpciones: f.querySelector('#barajar-opciones').checked,
      minutos: Math.max(0, parseFloat(f.querySelector('#minutos').value) || 0),
    };
  }

  const acciones = {
    'ir-inicio': () => {
      if (vista.nombre === 'examen' && sesion) { acciones['pedir-abandonar'](); return; }
      erroresCarga = [];
      ir({ nombre: 'inicio' });
    },
    'ir-editor': () => {
      if (vista.nombre === 'examen' && sesion) { acciones['pedir-abandonar'](); return; }
      ir({ nombre: 'editor' });
    },
    'cambiar-tema': () => {
      const raiz = document.documentElement;
      const oscuroAhora = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      raiz.dataset.theme = oscuroAhora ? 'light' : 'dark';
      try { localStorage.setItem(LS.tema, raiz.dataset.theme); } catch (e) { /* sin almacenamiento */ }
    },
    'elegir-archivo': () => $input.click(),
    pegar: () => modal(`
      <h2>Pegar examen en JSON</h2>
      <p class="meta">Pega aquí el contenido completo del archivo (formato <code>${V.FORMATO}</code>).</p>
      <textarea id="texto-pegado" spellcheck="false" placeholder='{ "formato": "${V.FORMATO}", "titulo": "...", "preguntas": [ ... ] }'></textarea>
      <div class="fila">
        <button class="btn" data-accion="cerrar-modal">Cancelar</button>
        <button class="btn btn-primario" data-accion="cargar-pegado">Cargar</button>
      </div>`),
    'cargar-pegado': () => {
      const t = document.getElementById('texto-pegado').value.trim();
      if (!t) return;
      cerrarModal();
      erroresCarga = [];
      const r = cargarTexto(t, 'Texto pegado');
      trasCargar(r ? [r] : []);
    },
    ejemplo: () => { erroresCarga = []; const r = añadirExamen(EJEMPLO, 'Demo'); trasCargar(r ? [r] : []); },
    'cerrar-errores': () => { erroresCarga = []; render(); },
    'cerrar-modal': cerrarModal,
    'abrir-carpeta': () => ESC && ESC.abrirCarpeta(),
    'cambiar-carpeta': () => ESC && ESC.elegirCarpeta(),
    abrir: (el) => ir({ nombre: 'detalle', id: el.dataset.id }),
    exportar: (el) => exportar(el.dataset.id),
    eliminar: (el) => {
      const e = examenPorId(el.dataset.id);
      modal(`<h2>¿Quitar «${esc(e.datos.titulo)}»?</h2>
        <p>Se quitará de la biblioteca junto con su historial de intentos. El archivo original no se toca${ESC ? ': si está en la carpeta de exámenes, volverá a aparecer cuando lo modifiques' : ''}.</p>
        <div class="fila"><button class="btn" data-accion="cerrar-modal">Cancelar</button>
        <button class="btn btn-primario" data-accion="confirmar-eliminar" data-id="${esc(e.id)}">Quitar</button></div>`);
    },
    'confirmar-eliminar': (el) => {
      const id = el.dataset.id;
      biblioteca = biblioteca.filter((e) => e.id !== id);
      delete historial[id];
      persistirBiblioteca();
      guardar(LS.historial, historial);
      cerrarModal();
      render();
    },
    'borrar-historial': (el) => { delete historial[el.dataset.id]; guardar(LS.historial, historial); render(); },
    empezar: (el) => {
      if (sesion) {
        modal(`<h2>Ya tienes un examen a medias</h2><p>«${esc(sesion.titulo)}». Si empiezas otro, se descartará.</p>
          <div class="fila"><button class="btn" data-accion="continuar">Continuar el anterior</button>
          <button class="btn btn-primario" data-accion="forzar-empezar" data-id="${esc(el.dataset.id)}">Empezar uno nuevo</button></div>`);
        vista.pendiente = leerFormulario(el.dataset.id);
        return;
      }
      iniciar(el.dataset.id, leerFormulario(el.dataset.id));
    },
    'forzar-empezar': (el) => { const op = vista.pendiente; cerrarModal(); sesion = null; iniciar(el.dataset.id, op); },
    continuar: () => { cerrarModal(); ir({ nombre: 'examen' }); },
    opcion: (el) => seleccionar(+el.dataset.k),
    comprobar,
    anterior: () => navegar(sesion.actual - 1),
    siguiente: () => navegar(sesion.actual + 1),
    'ir-pregunta': (el) => navegar(+el.dataset.i),
    marcar: alternarMarca,
    'pedir-entrega': pedirEntrega,
    entregar: () => entregar(false),
    'pedir-abandonar': () => modal(`<h2>¿Salir del examen?</h2>
      <p>Puedes dejarlo a medias y continuarlo después desde la biblioteca, o descartarlo.</p>
      <div class="fila"><button class="btn btn-fantasma" data-accion="abandonar">Descartar</button>
      <button class="btn" data-accion="pausar">Dejar a medias</button>
      <button class="btn btn-primario" data-accion="cerrar-modal">Seguir</button></div>`),
    pausar: () => { cerrarModal(); ir({ nombre: 'inicio' }); },
    abandonar,
    filtrar: (el) => { vista.filtro = el.dataset.f; render(); },
    repetir: () => {
      if (!examenPorId(resultado.examenId)) return aviso('Ese examen ya no está en la biblioteca.');
      iniciar(resultado.examenId, { ...resultado.opciones, indices: null });
    },
    repasar: () => {
      if (!examenPorId(resultado.examenId)) return aviso('Ese examen ya no está en la biblioteca.');
      const indices = resultado.preguntas.filter((_, i) => resultado.estados[i] !== 'acierto').map((q) => q.origen);
      iniciar(resultado.examenId, { ...resultado.opciones, indices, temas: null, n: null });
    },
  };

  /* ---------- Eventos ---------- */
  // Clic en una imagen (salvo dentro de una opción que se puede elegir): verla en grande.
  document.addEventListener('click', (ev) => {
    const img = ev.target.closest('#app img');
    if (img && !img.closest('button')) ampliarImagen(img);
  });

  // Imagen que no carga: se sustituye por un aviso con la ruta.
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement) || !$app.contains(img)) return;
    const aviso = document.createElement('span');
    aviso.className = 'img-rota';
    const src = img.getAttribute('src') || '';
    let legible = src;
    try { legible = decodeURI(src); } catch (e) { /* se deja tal cual */ }
    legible = legible.replace(/^file:\/\/\//, '');
    if (legible.length > 120) legible = `…${legible.slice(-110)}`;
    aviso.textContent = `No se pudo cargar la imagen: ${src.startsWith('data:') ? '(imagen incrustada)' : legible}`;
    img.replaceWith(aviso);
  }, true);

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-accion]');
    if (!el || el.disabled) return;
    const fn = acciones[el.dataset.accion];
    if (fn) { ev.preventDefault(); fn(el, ev); }
  });

  // Ajusta el máximo de preguntas al marcar/desmarcar temas.
  document.addEventListener('change', (ev) => {
    if (ev.target.name !== 'tema' || vista.nombre !== 'detalle') return;
    const e = examenPorId(vista.id);
    const marcados = [...document.querySelectorAll('input[name="tema"]:checked')].map((x) => x.value);
    const max = e.datos.preguntas.filter((p) => marcados.includes(p.tema || 'Sin tema')).length;
    const inp = document.getElementById('n-preguntas');
    inp.max = Math.max(1, max);
    inp.value = Math.max(1, max);
    document.getElementById('n-max').textContent = `de ${max}`;
  });

  $input.addEventListener('change', () => { cargarArchivos($input.files); $input.value = ''; });

  // Arrastrar y soltar en cualquier parte de la página.
  let profundidad = 0;
  const zona = () => document.getElementById('zona-carga');
  const conArchivos = (ev) => ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (ev) => { if (!conArchivos(ev)) return; profundidad++; zona()?.classList.add('arrastrando'); });
  document.addEventListener('dragleave', (ev) => { if (!conArchivos(ev)) return; if (--profundidad <= 0) { profundidad = 0; zona()?.classList.remove('arrastrando'); } });
  document.addEventListener('dragover', (ev) => { if (conArchivos(ev)) ev.preventDefault(); });
  document.addEventListener('drop', (ev) => {
    if (!conArchivos(ev)) return;
    ev.preventDefault();
    profundidad = 0;
    zona()?.classList.remove('arrastrando');
    if (vista.nombre === 'examen') { aviso('Termina el examen antes de cargar otro.'); return; }
    cargarArchivos(ev.dataTransfer.files);
  });

  // Editor: cada cambio en un campo actualiza el borrador sin volver a pintar la página.
  document.addEventListener('input', (ev) => {
    if (vista.nombre !== 'editor') return;
    const el = ev.target.closest('[data-ed]');
    if (el) editor.alEntrada(el);
  });

  document.addEventListener('keydown', (ev) => {
    if (vista.nombre === 'editor' && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      if (!hayModal()) editor.guardar();
      return;
    }
    if (ev.key === 'Escape' && hayModal()) { cerrarModal(); return; }
    if (hayModal() && ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') {
      const p = document.querySelector('.modal .btn-primario');
      if (p) { ev.preventDefault(); p.click(); }
      return;
    }
    if (vista.nombre !== 'examen' || !sesion || hayModal()) return;
    if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    const q = sesion.preguntas[sesion.actual];
    if (ev.key === 'ArrowRight') { ev.preventDefault(); navegar(sesion.actual + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); navegar(sesion.actual - 1); }
    else if (k === 'm') alternarMarca();
    else if (/^[1-8]$/.test(k)) seleccionar(+k - 1);
    else if (/^[a-h]$/.test(k)) seleccionar(k.charCodeAt(0) - 97);
    else if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON') {
      if (sesion.modo === 'practica' && q.tipo === 'multiple' && !sesion.comprobadas[sesion.actual]) comprobar();
      else if (sesion.actual < sesion.preguntas.length - 1) navegar(sesion.actual + 1);
    }
  });

  window.TestMaker = { formulas };

  // Editor de exámenes (editor.js).
  const editor = window.TestMakerEditor({
    V, esc, md, mdLinea, letra, plural, slug, aviso, modal, cerrarModal, formulas,
    leer, guardar, borrar, rutaDe, examenPorId,
    biblioteca: () => biblioteca,
    render: () => render(),
    ir: (v) => ir(v),
    descargar: descargarJson,
    guardarExamen: guardarDesdeEditor,
  });
  Object.assign(acciones, editor.acciones);

  render();

  if (ESC) {
    ESC.alCambiarCarpeta(sincronizarCarpeta);
    ESC.alAbrirArchivos(abrirDesdeEscritorio);
    sincronizarCarpeta()
      .then(() => ESC.archivosPendientes())
      .then(abrirDesdeEscritorio)
      .catch(() => {});
  }
})();
