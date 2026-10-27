/*
 * Validador del formato de examen "testmaker-v1".
 * Funciona en el navegador (window.TestMakerValidador) y en Node (require).
 * La skill generar-test lleva una copia idéntica en scripts/validador.cjs.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TestMakerValidador = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMATO = 'testmaker-v1';
  const TIPOS = ['unica', 'multiple', 'vf'];
  const OPCIONES_VF = ['Verdadero', 'Falso'];
  const CONFIG_POR_DEFECTO = {
    tiempoLimite: 0,
    puntuacion: { acierto: 1, fallo: 0, blanco: 0 },
    aprobado: 5,
    barajarPreguntas: false,
    barajarOpciones: false,
  };
  // Opciones que dependen de la posición de las demás y se rompen al barajar.
  const REF_POSICIONAL = /(todas|ninguna|ambas)\s+(las\s+)?(anteriores|opciones)|^\s*(a|b|c|d)\s+y\s+(b|c|d|e)\b|(all|none)\s+of\s+the\s+above/i;

  const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
  const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
  const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const IMAGEN_MD = /!\[[^\]]*\]\(([^)]+)\)/g;

  // Una opción es un texto o un objeto { texto?, imagen? }. Internamente se convierte a texto Markdown.
  function textoOpcion(o) {
    if (typeof o === 'string') return o;
    if (!esObjeto(o)) return null;
    const t = typeof o.texto === 'string' ? o.texto.trim() : '';
    const img = typeof o.imagen === 'string' ? o.imagen.trim() : '';
    if (!t && !img) return null;
    return [t, img ? `![${t ? '' : 'Opción'}](${img})` : ''].filter(Boolean).join('\n\n');
  }

  // Lista las imágenes de un examen normalizado: [{ pregunta (1..n), src }].
  function imagenes(examen) {
    const res = [];
    examen.preguntas.forEach((p, i) => {
      if (p.imagen) res.push({ pregunta: i + 1, src: p.imagen });
      for (const t of [p.enunciado, p.explicacion, ...p.opciones]) {
        for (const m of String(t || '').matchAll(IMAGEN_MD)) res.push({ pregunta: i + 1, src: m[1].trim() });
      }
    });
    return res;
  }

  function validar(datos) {
    const errores = [];
    const avisos = [];

    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      return { ok: false, errores: ['El archivo debe contener un objeto JSON ({ ... }).'], avisos };
    }

    if (datos.formato === undefined) avisos.push(`Falta "formato": "${FORMATO}". Se asume esa versión.`);
    else if (datos.formato !== FORMATO) errores.push(`"formato" debe ser "${FORMATO}" (es "${datos.formato}").`);

    if (!esTexto(datos.titulo)) errores.push('Falta "titulo" (texto no vacío).');
    for (const campo of ['descripcion', 'autor', 'idioma']) {
      if (datos[campo] !== undefined && typeof datos[campo] !== 'string') errores.push(`"${campo}" debe ser texto.`);
    }

    validarConfig(datos.config, errores, avisos);

    if (!Array.isArray(datos.preguntas) || datos.preguntas.length === 0) {
      errores.push('"preguntas" debe ser una lista con al menos una pregunta.');
      return { ok: errores.length === 0, errores, avisos };
    }

    const barajarGlobal = !!(datos.config && datos.config.barajarOpciones);
    const ids = new Map();
    const posicionesUnica = [];

    datos.preguntas.forEach((p, i) => {
      const et = `Pregunta ${i + 1}`;
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        errores.push(`${et}: debe ser un objeto.`);
        return;
      }
      const tipo = p.tipo === undefined ? 'unica' : p.tipo;
      if (!TIPOS.includes(tipo)) {
        errores.push(`${et}: "tipo" debe ser uno de ${TIPOS.map((t) => `"${t}"`).join(', ')} (es "${p.tipo}").`);
        return;
      }

      if (p.id !== undefined) {
        if (!esTexto(String(p.id))) errores.push(`${et}: "id" no puede estar vacío.`);
        else if (ids.has(String(p.id))) errores.push(`${et}: "id" "${p.id}" repetido (ya usado en la pregunta ${ids.get(String(p.id))}).`);
        else ids.set(String(p.id), i + 1);
      }
      if (!esTexto(p.enunciado)) errores.push(`${et}: falta "enunciado".`);
      if (p.tema !== undefined && typeof p.tema !== 'string') errores.push(`${et}: "tema" debe ser texto.`);
      if (p.imagen !== undefined && !esTexto(p.imagen)) errores.push(`${et}: "imagen" debe ser una URL o ruta.`);
      if (p.fijarOrden !== undefined && typeof p.fijarOrden !== 'boolean') errores.push(`${et}: "fijarOrden" debe ser true o false.`);
      if (p.explicacion === undefined || p.explicacion === '') avisos.push(`${et}: no tiene "explicacion".`);
      else if (typeof p.explicacion !== 'string') errores.push(`${et}: "explicacion" debe ser texto.`);

      // Opciones
      let opciones = p.opciones;
      if (tipo === 'vf') {
        if (opciones === undefined) opciones = OPCIONES_VF;
        else if (!Array.isArray(opciones) || opciones.length !== 2) {
          errores.push(`${et}: en "vf" las "opciones" se omiten o son exactamente 2.`);
          return;
        }
      }
      if (!Array.isArray(opciones) || opciones.length < 2) {
        errores.push(`${et}: "opciones" debe tener al menos 2 elementos.`);
        return;
      }
      if (opciones.length > 8) avisos.push(`${et}: tiene ${opciones.length} opciones; más de 8 es difícil de leer.`);
      const vistas = new Set();
      opciones.forEach((o, j) => {
        if (esObjeto(o)) {
          if (o.texto !== undefined && typeof o.texto !== 'string') errores.push(`${et}: en la opción ${j}, "texto" debe ser texto.`);
          if (o.imagen !== undefined && !esTexto(o.imagen)) errores.push(`${et}: en la opción ${j}, "imagen" debe ser una URL o ruta.`);
        }
        const ot = textoOpcion(o);
        if (!esTexto(ot)) {
          errores.push(`${et}: la opción ${j} está vacía o no es válida (usa un texto o { "texto": "...", "imagen": "..." }).`);
          return;
        }
        const norm = ot.trim().toLowerCase();
        if (vistas.has(norm)) errores.push(`${et}: la opción ${j} ("${ot}") está repetida.`);
        vistas.add(norm);
        const soloTexto = typeof o === 'string' ? o : (o.texto || '');
        const seBaraja = (barajarGlobal && tipo !== 'vf' && p.fijarOrden !== true);
        if (seBaraja && REF_POSICIONAL.test(soloTexto)) {
          avisos.push(`${et}: la opción "${soloTexto}" depende del orden y "barajarOpciones" está activo; añade "fijarOrden": true.`);
        }
      });

      // Correctas
      let correctas = p.correctas;
      if (correctas === undefined) {
        errores.push(`${et}: falta "correctas" (lista de índices empezando en 0).`);
        return;
      }
      if (esNumero(correctas)) correctas = [correctas];
      if (!Array.isArray(correctas) || correctas.length === 0) {
        errores.push(`${et}: "correctas" debe ser una lista no vacía de índices (empezando en 0).`);
        return;
      }
      const unicos = new Set();
      for (const c of correctas) {
        if (!Number.isInteger(c)) errores.push(`${et}: "correctas" contiene "${c}", que no es un entero.`);
        else if (c < 0 || c >= opciones.length) errores.push(`${et}: el índice correcto ${c} no existe (hay ${opciones.length} opciones, de 0 a ${opciones.length - 1}).`);
        else if (unicos.has(c)) errores.push(`${et}: el índice ${c} aparece repetido en "correctas".`);
        unicos.add(c);
      }
      if ((tipo === 'unica' || tipo === 'vf') && correctas.length !== 1) {
        errores.push(`${et}: el tipo "${tipo}" necesita exactamente 1 respuesta correcta (tiene ${correctas.length}). Usa "multiple" si hay varias.`);
      }
      if (tipo === 'multiple' && correctas.length === opciones.length) {
        avisos.push(`${et}: todas las opciones son correctas; la pregunta no discrimina.`);
      }
      if (tipo === 'unica' && correctas.length === 1 && Number.isInteger(correctas[0])) {
        posicionesUnica.push({ pos: correctas[0], n: opciones.length });
      }
    });

    // Reparto de la posición de la respuesta correcta (solo si no se baraja).
    if (!barajarGlobal && posicionesUnica.length >= 6) {
      const cuenta = {};
      posicionesUnica.forEach(({ pos }) => (cuenta[pos] = (cuenta[pos] || 0) + 1));
      const [pos, veces] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
      if (veces / posicionesUnica.length > 0.5) {
        avisos.push(`La respuesta correcta está en la posición ${pos} (${letra(+pos)}) en ${veces} de ${posicionesUnica.length} preguntas de tipo "unica". Repártela mejor.`);
      }
    }

    return { ok: errores.length === 0, errores, avisos };
  }

  function validarConfig(config, errores, avisos) {
    if (config === undefined) return;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errores.push('"config" debe ser un objeto.');
      return;
    }
    if (config.tiempoLimite !== undefined && !(esNumero(config.tiempoLimite) && config.tiempoLimite >= 0)) {
      errores.push('"config.tiempoLimite" debe ser un número de minutos ≥ 0 (0 = sin límite).');
    }
    if (config.aprobado !== undefined && !(esNumero(config.aprobado) && config.aprobado >= 0 && config.aprobado <= 10)) {
      errores.push('"config.aprobado" debe ser una nota entre 0 y 10.');
    }
    for (const b of ['barajarPreguntas', 'barajarOpciones']) {
      if (config[b] !== undefined && typeof config[b] !== 'boolean') errores.push(`"config.${b}" debe ser true o false.`);
    }
    const pu = config.puntuacion;
    if (pu !== undefined) {
      if (!pu || typeof pu !== 'object' || Array.isArray(pu)) errores.push('"config.puntuacion" debe ser un objeto.');
      else {
        for (const k of ['acierto', 'fallo', 'blanco']) {
          if (pu[k] !== undefined && !esNumero(pu[k])) errores.push(`"config.puntuacion.${k}" debe ser un número.`);
        }
        if (esNumero(pu.acierto) && pu.acierto <= 0) errores.push('"config.puntuacion.acierto" debe ser mayor que 0.');
        if (esNumero(pu.fallo) && pu.fallo > 0) avisos.push(`"config.puntuacion.fallo" es positivo (${pu.fallo}): los fallos suman puntos. Para penalizar usa un valor negativo, p. ej. -0.25.`);
      }
    }
  }

  /* Devuelve una copia del examen con todos los valores por defecto aplicados. Llamar solo si validar() da ok. */
  function normalizar(datos) {
    const c = datos.config || {};
    const config = {
      tiempoLimite: c.tiempoLimite ?? CONFIG_POR_DEFECTO.tiempoLimite,
      puntuacion: { ...CONFIG_POR_DEFECTO.puntuacion, ...(c.puntuacion || {}) },
      aprobado: c.aprobado ?? CONFIG_POR_DEFECTO.aprobado,
      barajarPreguntas: c.barajarPreguntas ?? CONFIG_POR_DEFECTO.barajarPreguntas,
      barajarOpciones: c.barajarOpciones ?? CONFIG_POR_DEFECTO.barajarOpciones,
    };
    const preguntas = datos.preguntas.map((p, i) => {
      const tipo = p.tipo || 'unica';
      return {
        id: p.id !== undefined ? String(p.id) : `p${i + 1}`,
        tipo,
        tema: (p.tema || '').trim(),
        enunciado: p.enunciado,
        imagen: p.imagen || '',
        opciones: tipo === 'vf' && !p.opciones ? OPCIONES_VF.slice() : p.opciones.map(textoOpcion),
        correctas: (typeof p.correctas === 'number' ? [p.correctas] : p.correctas.slice()).sort((a, b) => a - b),
        explicacion: p.explicacion || '',
        fijarOrden: tipo === 'vf' || p.fijarOrden === true,
      };
    });
    return {
      formato: FORMATO,
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion || '',
      autor: datos.autor || '',
      idioma: datos.idioma || 'es',
      config,
      preguntas,
    };
  }

  function letra(i) {
    return String.fromCharCode(65 + i);
  }

  return { FORMATO, TIPOS, CONFIG_POR_DEFECTO, validar, normalizar, letra, imagenes };
});
