/* Editor visual de exámenes (pestaña "Editor").
 * app.js lo crea con TestMakerEditor(ctx) y le pasa las utilidades que necesita.
 * El borrador se guarda en localStorage a cada cambio, así que no se pierde al cerrar.
 */
(function () {
  'use strict';

  window.TestMakerEditor = function crearEditor(ctx) {
    const { V, esc, md, mdLinea, letra, plural, aviso, modal, cerrarModal } = ctx;
    const LS_BORRADOR = 'testmaker.borrador.v1';
    const MAX_OPCIONES = 8;
    const TIPOS = { unica: 'Respuesta única', multiple: 'Respuesta múltiple', vf: 'Verdadero / falso' };
    const ICONO_IMAGEN = '<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';

    let b = ctx.leer(LS_BORRADOR, null); // borrador en edición, o null
    const plegadas = new Set(); // claves (_k) de preguntas contraídas
    const previas = new Set(); // claves con la vista previa abierta
    let destinoImagen = null; // { p, o } al elegir imagen
    let temporizador = null;
    let validacion = { errores: [], avisos: [] };
    let borradorGuardado = true;

    /* ---------- Modelo ---------- */
    const clave = () => Math.random().toString(36).slice(2, 10);
    const texto = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    const op = (t = '', imagen = '') => ({ texto: t, imagen });

    function preguntaVacia(tipo = 'unica', tema = '') {
      return {
        _k: clave(), id: '', tipo, tema, enunciado: '', imagen: '',
        opciones: tipo === 'vf' ? [] : [op(), op(), op(), op()],
        correctas: [], explicacion: '', fijarOrden: false,
      };
    }
    function nuevoBorrador() {
      return {
        origenId: null, ruta: null, cambios: false,
        titulo: '', descripcion: '', autor: '',
        config: JSON.parse(JSON.stringify(V.CONFIG_POR_DEFECTO)),
        preguntas: [preguntaVacia()],
      };
    }

    // "texto\n\n![](img)" (como lo deja el validador) -> { texto, imagen }
    function separarOpcion(s) {
      const m = texto(s).match(/^([\s\S]*?)\s*!\[[^\]]*\]\(([^)]+)\)\s*$/);
      return m ? op(m[1].trim(), m[2].trim()) : op(texto(s));
    }

    // Convierte un examen (válido o no, normalizado o tal cual) al modelo del editor.
    function desdeDatos(d, origenId = null, ruta = null) {
      d = d && typeof d === 'object' ? d : {};
      const c = d.config && typeof d.config === 'object' ? d.config : {};
      const pu = c.puntuacion && typeof c.puntuacion === 'object' ? c.puntuacion : {};
      const def = V.CONFIG_POR_DEFECTO;
      const preguntas = (Array.isArray(d.preguntas) ? d.preguntas : []).map((p) => {
        p = p && typeof p === 'object' ? p : {};
        const tipo = V.TIPOS.includes(p.tipo) ? p.tipo : 'unica';
        let opciones = Array.isArray(p.opciones)
          ? p.opciones.map((o) => (o && typeof o === 'object' ? op(texto(o.texto), texto(o.imagen)) : separarOpcion(o)))
          : [];
        if (tipo === 'vf' && opciones.length === 2 && opciones[0].texto === 'Verdadero' && opciones[1].texto === 'Falso' && !opciones[0].imagen && !opciones[1].imagen) opciones = [];
        if (tipo !== 'vf') while (opciones.length < 2) opciones.push(op());
        const correctas = typeof p.correctas === 'number' ? [p.correctas] : Array.isArray(p.correctas) ? p.correctas.filter(Number.isInteger) : [];
        return {
          _k: clave(), id: p.id != null ? String(p.id) : '', tipo, tema: texto(p.tema),
          enunciado: texto(p.enunciado), imagen: texto(p.imagen), opciones, correctas,
          explicacion: texto(p.explicacion), fijarOrden: tipo !== 'vf' && p.fijarOrden === true,
        };
      });
      if (!preguntas.length) preguntas.push(preguntaVacia());
      return {
        origenId, ruta, cambios: false,
        titulo: texto(d.titulo), descripcion: texto(d.descripcion), autor: texto(d.autor),
        config: {
          tiempoLimite: c.tiempoLimite ?? def.tiempoLimite,
          aprobado: c.aprobado ?? def.aprobado,
          puntuacion: { acierto: pu.acierto ?? 1, fallo: pu.fallo ?? 0, blanco: pu.blanco ?? 0 },
          barajarPreguntas: !!c.barajarPreguntas,
          barajarOpciones: !!c.barajarOpciones,
        },
        preguntas,
      };
    }

    // Modelo del editor -> formato testmaker-v1.
    function aFormato(x) {
      const t = (s) => texto(s).trim();
      const n = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
      const c = x.config;
      const out = { formato: V.FORMATO, titulo: t(x.titulo) };
      if (t(x.descripcion)) out.descripcion = t(x.descripcion);
      if (t(x.autor)) out.autor = t(x.autor);
      out.config = {
        tiempoLimite: n(c.tiempoLimite),
        puntuacion: { acierto: n(c.puntuacion.acierto), fallo: n(c.puntuacion.fallo), blanco: n(c.puntuacion.blanco) },
        aprobado: n(c.aprobado),
        barajarPreguntas: !!c.barajarPreguntas,
        barajarOpciones: !!c.barajarOpciones,
      };
      out.preguntas = x.preguntas.map((p) => {
        const q = {};
        if (t(p.id)) q.id = t(p.id);
        q.tipo = p.tipo;
        if (t(p.tema)) q.tema = t(p.tema);
        q.enunciado = t(p.enunciado);
        if (t(p.imagen)) q.imagen = t(p.imagen);
        if (p.tipo !== 'vf' || p.opciones.length === 2) {
          q.opciones = p.opciones.map((o) => {
            const ot = t(o.texto);
            const oi = t(o.imagen);
            return oi ? (ot ? { texto: ot, imagen: oi } : { imagen: oi }) : ot;
          });
        }
        q.correctas = p.correctas.slice().sort((a, b2) => a - b2);
        if (t(p.explicacion)) q.explicacion = t(p.explicacion);
        if (p.fijarOrden && p.tipo !== 'vf') q.fijarOrden = true;
        return q;
      });
      return JSON.parse(JSON.stringify(out)); // quita los campos undefined
    }

    function cambiarTipo(p, tipo) {
      if (p.tipo === tipo) return;
      if (tipo === 'vf') {
        p.correctas = p.correctas.length === 1 && p.correctas[0] < 2 ? p.correctas : [];
        if (p.opciones.length === 2 && p.opciones.every((o) => !o.texto.trim() && !o.imagen)) p.opciones = [];
      } else {
        while (p.opciones.length < 2) p.opciones.push(op());
        if (p.tipo === 'vf' && p.opciones.length === 2 && !p.opciones[0].texto && !p.opciones[1].texto) p.opciones.push(op(), op());
        if (tipo === 'unica' && p.correctas.length > 1) p.correctas = p.correctas.slice(0, 1);
      }
      p.tipo = tipo;
    }

    /* ---------- Persistencia y validación ---------- */
    function guardarBorrador() {
      borradorGuardado = b ? ctx.guardar(LS_BORRADOR, b) : (ctx.borrar(LS_BORRADOR), true);
    }
    function marcarCambio() {
      b.cambios = true;
      guardarBorrador();
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { validar(); pintarValidacion(); }, 250);
      pintarEstado();
    }
    function validar() {
      validacion = b ? V.validar(aFormato(b)) : { errores: [], avisos: [] };
    }

    // Traduce los mensajes del validador a algo claro para quien usa el editor.
    function legible(msg) {
      const reglas = [
        [/falta "correctas"|"correctas" debe ser una lista no vacía/, () => 'Marca cuál es la respuesta correcta.'],
        [/necesita exactamente 1 respuesta correcta/, () => 'Marca una sola respuesta correcta, o cambia el tipo a «Respuesta múltiple».'],
        [/el índice correcto (\d+) no existe/, () => 'La respuesta marcada como correcta ya no existe. Vuelve a marcarla.'],
        [/falta "enunciado"/, () => 'Escribe el enunciado.'],
        [/la opción (\d+) está vacía/, (m) => `La opción ${letra(+m[1])} está vacía.`],
        [/la opción (\d+) \(.*\) está repetida/, (m) => `La opción ${letra(+m[1])} está repetida.`],
        [/no tiene "explicacion"/, () => 'Sin explicación (opcional, pero ayuda a repasar).'],
        [/^Falta "titulo"/, () => 'Ponle un título al examen.'],
        [/"id" "(.+)" repetido/, (m) => `El identificador «${m[1]}» está repetido.`],
        [/todas las opciones son correctas/, () => 'Todas las opciones están marcadas como correctas: la pregunta no sirve para evaluar.'],
        [/depende del orden y "barajarOpciones" está activo/, () => 'Una opción depende del orden (p. ej. «Todas las anteriores»): activa «No barajar las opciones de esta pregunta».'],
      ];
      for (const [re, f] of reglas) {
        const m = msg.match(re);
        if (m) return f(m);
      }
      return msg;
    }
    function porPregunta(lista) {
      const general = [];
      const mapa = {};
      for (const msg of lista) {
        const m = msg.match(/^Pregunta (\d+): (.*)$/);
        if (m) (mapa[+m[1] - 1] = mapa[+m[1] - 1] || []).push(legible(m[2]));
        else general.push(legible(msg));
      }
      return { general, mapa };
    }

    function pintarEstado() {
      const el = document.getElementById('ed-estado');
      if (!el || !b) return;
      const n = validacion.errores.length;
      const partes = [];
      partes.push(n ? `<span class="chip chip-mal">${plural(n, 'cosa pendiente', 'cosas pendientes')}</span>` : '<span class="chip chip-ok">Listo para guardar</span>');
      partes.push(b.cambios ? '<span class="chip">Cambios sin guardar</span>'
        : b.origenId ? '<span class="chip">Guardado en la biblioteca</span>' : '<span class="chip">Sin guardar todavía</span>');
      if (!borradorGuardado) partes.push('<span class="chip chip-mal" title="El navegador no tiene espacio para el borrador (¿imágenes muy grandes?)">Borrador no guardado</span>');
      el.innerHTML = partes.join('');
    }

    function pintarValidacion() {
      if (!b || !document.getElementById('ed-estado')) return;
      const e = porPregunta(validacion.errores);
      const a = porPregunta(validacion.avisos);
      b.preguntas.forEach((p, i) => {
        const errs = e.mapa[i] || [];
        const avs = a.mapa[i] || [];
        const caja = document.getElementById(`ed-err-${i}`);
        if (caja) {
          caja.innerHTML = errs.map((m) => `<li class="pend">${esc(m)}</li>`).join('') + avs.map((m) => `<li class="aviso">${esc(m)}</li>`).join('');
          caja.hidden = !errs.length && !avs.length;
        }
        const estado = document.getElementById(`ed-pe-${i}`);
        if (estado) estado.innerHTML = errs.length ? `<span class="chip chip-mal">${plural(errs.length, 'pendiente', 'pendientes')}</span>` : '<span class="chip chip-ok">✓</span>';
        const punto = document.getElementById(`ed-dot-${i}`);
        if (punto) punto.className = `ed-punto ${errs.length ? 'pend' : 'ok'}`;
      });
      const gen = document.getElementById('ed-generales');
      if (gen) {
        gen.innerHTML = e.general.map((m) => `<li class="pend">${esc(m)}</li>`).join('') + a.general.map((m) => `<li class="aviso">${esc(m)}</li>`).join('');
        gen.hidden = !e.general.length && !a.general.length;
      }
      pintarEstado();
    }

    function primerPendiente() {
      const m = validacion.errores.map((x) => x.match(/^Pregunta (\d+):/)).find(Boolean);
      return m ? +m[1] - 1 : -1;
    }
    function irAPregunta(i) {
      const p = b.preguntas[i];
      if (!p) return;
      if (plegadas.delete(p._k)) ctx.render();
      const el = document.getElementById(`ed-p-${i}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ---------- Imágenes ---------- */
    // Lee una imagen y la reduce (máx. 1200 px) para que el examen no pese demasiado.
    async function leerImagen(archivo) {
      const dataUrl = await new Promise((ok, mal) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = mal;
        r.readAsDataURL(archivo);
      });
      if (/svg|gif/.test(archivo.type)) return dataUrl;
      const img = await new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = mal;
        i.src = dataUrl;
      });
      const escala = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      if (escala === 1 && archivo.size < 300 * 1024) return dataUrl;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.naturalWidth * escala);
      lienzo.height = Math.round(img.naturalHeight * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const webp = lienzo.toDataURL('image/webp', 0.85);
      return webp.length < dataUrl.length ? webp : dataUrl;
    }
    function ponerImagen(src) {
      if (!destinoImagen) return;
      const p = b.preguntas[destinoImagen.p];
      if (destinoImagen.o == null) p.imagen = src;
      else p.opciones[destinoImagen.o].imagen = src;
      destinoImagen = null;
      cerrarModal();
      marcarCambio();
      ctx.render();
    }
    function textoImagen(src) {
      if (!src) return '';
      return src.startsWith('data:') ? 'Imagen incrustada en el examen' : src;
    }
    // Carpeta del archivo del examen como URL file:/// (solo en escritorio, si se conoce).
    function urlCarpeta() {
      if (!b || !b.ruta) return null;
      try {
        return new URL('.', new URL(`file:///${b.ruta.replace(/\\/g, '/').replace(/^\/+/, '')}`)).href;
      } catch (e) {
        return null;
      }
    }
    // Ruta que se enseña en el campo: relativa al examen cuando se puede ("img/a.png").
    function rutaLegible(src) {
      const dir = urlCarpeta();
      if (dir && src.startsWith(dir)) {
        try { return decodeURI(src.slice(dir.length)); } catch (e) { return src.slice(dir.length); }
      }
      return src;
    }
    // URL para mostrar la imagen: las rutas relativas se resuelven desde la carpeta del examen.
    function urlVisible(src) {
      const dir = urlCarpeta();
      if (!dir || /^[a-z][a-z0-9+.-]*:/i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) return src;
      try { return new URL(src.replace(/\\/g, '/'), dir).href; } catch (e) { return src; }
    }

    /* ---------- Vistas ---------- */
    function vista() {
      if (!b) return vistaInicio();
      validar();
      const temas = [...new Set(b.preguntas.map((p) => p.tema.trim()).filter(Boolean))];
      const c = b.config;
      const pu = c.puntuacion;
      return `
        <section class="editor">
          <div class="ed-barra">
            <div class="ed-barra-titulo">
              <h1 id="ed-h1">${esc(b.titulo.trim() || 'Examen sin título')}</h1>
              <div class="chips" id="ed-estado"></div>
            </div>
            <div class="fila">
              <button class="btn btn-fantasma" data-accion="ed-cerrar">Cerrar</button>
              <button class="btn" data-accion="ed-descargar" title="Descargar el examen como archivo .json">Descargar JSON</button>
              <button class="btn" data-accion="ed-probar" title="Guardar y abrir el examen">Probar</button>
              <button class="btn btn-primario" data-accion="ed-guardar" title="Ctrl+S">Guardar</button>
            </div>
          </div>
          <ul class="ed-avisos" id="ed-generales" hidden></ul>

          <div class="ed-rejilla">
            <div class="ed-principal">
              <section class="panel">
                <h2>Datos del examen</h2>
                <label class="ed-campo"><span>Título</span>
                  <input class="control" data-ed="titulo" value="${esc(b.titulo)}" placeholder="Ej.: Biología, tema 3: la célula"></label>
                <label class="ed-campo"><span>Descripción <small>(opcional)</small></span>
                  <textarea class="control" data-ed="descripcion" rows="2" placeholder="De qué trata y a quién va dirigido">${esc(b.descripcion)}</textarea></label>
                <label class="ed-campo"><span>Autor o fuente <small>(opcional)</small></span>
                  <input class="control" data-ed="autor" value="${esc(b.autor)}"></label>
              </section>

              <section class="panel">
                <h2>Configuración</h2>
                <div class="ed-config">
                  <label class="ed-campo"><span>Tiempo límite <small>(minutos, 0 = sin límite)</small></span>
                    <input class="control corto" type="number" min="0" step="1" data-ed="tiempoLimite" value="${esc(c.tiempoLimite)}"></label>
                  <label class="ed-campo"><span>Nota para aprobar <small>(sobre 10)</small></span>
                    <input class="control corto" type="number" min="0" max="10" step="0.5" data-ed="aprobado" value="${esc(c.aprobado)}"></label>
                  <label class="ed-campo"><span>Puntos por acierto</span>
                    <input class="control corto" type="number" step="0.1" data-ed="acierto" value="${esc(pu.acierto)}"></label>
                  <label class="ed-campo"><span>Puntos por fallo <small>(negativo para restar)</small></span>
                    <input class="control corto" type="number" step="0.01" data-ed="fallo" id="ed-fallo" value="${esc(pu.fallo)}">
                    <span class="chips ed-atajos">
                      <button type="button" class="chip" data-accion="ed-fallo" data-v="0">No resta</button>
                      <button type="button" class="chip" data-accion="ed-fallo" data-v="-0.25">−1/4</button>
                      <button type="button" class="chip" data-accion="ed-fallo" data-v="-0.33">−1/3</button>
                      <button type="button" class="chip" data-accion="ed-fallo" data-v="-0.5">−1/2</button>
                    </span></label>
                  <label class="ed-campo"><span>Puntos por pregunta en blanco</span>
                    <input class="control corto" type="number" step="0.1" data-ed="blanco" value="${esc(pu.blanco)}"></label>
                </div>
                <label class="check"><input type="checkbox" data-ed="barajarPreguntas" ${c.barajarPreguntas ? 'checked' : ''}> Barajar el orden de las preguntas</label>
                <label class="check"><input type="checkbox" data-ed="barajarOpciones" ${c.barajarOpciones ? 'checked' : ''}> Barajar el orden de las opciones</label>
                <p class="meta">Quien haga el examen puede cambiar el orden y el tiempo antes de empezar; esto son los valores por defecto.</p>
              </section>

              <div class="fila separado ed-cab-preguntas">
                <h2>Preguntas <span class="meta">(${b.preguntas.length})</span></h2>
                <div class="fila">
                  <button class="btn btn-fantasma" data-accion="ed-plegar-todas">Contraer todas</button>
                  <button class="btn btn-fantasma" data-accion="ed-desplegar-todas">Expandir todas</button>
                </div>
              </div>
              <datalist id="ed-temas">${temas.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
              ${b.preguntas.map(tarjeta).join('')}

              <div class="panel ed-anadir">
                <span class="etiqueta">Añadir pregunta</span>
                <div class="fila">
                  ${Object.entries(TIPOS).map(([k, v]) => `<button class="btn" data-accion="ed-anadir" data-tipo="${k}">+ ${v}</button>`).join('')}
                </div>
              </div>
            </div>

            <aside class="panel ed-indice">
              <h2>Índice</h2>
              <ol>${b.preguntas.map((p, i) => `
                <li><button class="ed-idx" data-accion="ed-ir" data-p="${i}"><span class="ed-punto" id="ed-dot-${i}"></span>
                <span class="ed-idx-num">${i + 1}</span><span class="ed-idx-t" id="ed-idx-t-${i}">${esc(resumen(p))}</span></button></li>`).join('')}</ol>
              <p class="meta">${plural(b.preguntas.length, 'pregunta', 'preguntas')}${temas.length ? ` · ${plural(temas.length, 'tema', 'temas')}` : ''}</p>
            </aside>
          </div>
        </section>`;
    }

    function resumen(p) {
      const t = p.enunciado.replace(/!\[[^\]]*\]\([^)]+\)/g, '[imagen]').replace(/[`*_$#>]/g, '').replace(/\s+/g, ' ').trim();
      return t ? (t.length > 70 ? `${t.slice(0, 68)}…` : t) : '(sin enunciado)';
    }

    function bloqueImagen(src, p, o) {
      const datosO = o == null ? '' : `data-o="${o}"`;
      return `
        <div class="ed-imagen">
          <img src="${esc(urlVisible(src))}" alt="">
          <div class="ed-imagen-info">
            <input class="control" data-ed="${o == null ? 'imagen' : 'opcion-imagen'}" data-p="${p}" ${datosO} value="${esc(src.startsWith('data:') ? '' : rutaLegible(src))}"
              placeholder="${esc(textoImagen(src))}" ${src.startsWith('data:') ? 'readonly' : ''}>
            <div class="fila">
              <button class="btn btn-fantasma" data-accion="ed-imagen" data-p="${p}" ${datosO}>Cambiar</button>
              <button class="btn btn-fantasma btn-peligro" data-accion="ed-quitar-imagen" data-p="${p}" ${datosO}>Quitar imagen</button>
            </div>
          </div>
        </div>`;
    }

    function tarjeta(p, i) {
      const plegada = plegadas.has(p._k);
      const n = b.preguntas.length;
      const cab = `
        <header class="ed-p-cab">
          <button class="btn-icono" data-accion="ed-plegar" data-p="${i}" aria-expanded="${!plegada}" title="${plegada ? 'Expandir' : 'Contraer'}">${plegada ? '▸' : '▾'}</button>
          <span class="pregunta-num">Pregunta ${i + 1}</span>
          <span class="chip">${TIPOS[p.tipo]}</span>
          ${plegada ? `<span class="ed-resumen">${esc(resumen(p))}</span>` : '<span class="ed-espacio"></span>'}
          <span id="ed-pe-${i}"></span>
          <span class="ed-p-acciones">
            <button class="btn-icono" data-accion="ed-subir" data-p="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-icono" data-accion="ed-bajar" data-p="${i}" title="Bajar" ${i === n - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-icono" data-accion="ed-duplicar" data-p="${i}" title="Duplicar">⧉</button>
            <button class="btn-icono btn-peligro" data-accion="ed-eliminar" data-p="${i}" title="Eliminar">✕</button>
          </span>
        </header>`;
      if (plegada) return `<article class="panel ed-pregunta plegada" id="ed-p-${i}">${cab}</article>`;

      const opciones = p.tipo === 'vf'
        ? `<div class="ed-vf">${[0, 1].map((j) => `
            <label class="ed-vf-op"><input type="radio" name="ed-c-${p._k}" data-ed="correcta" data-p="${i}" data-o="${j}" ${p.correctas.includes(j) ? 'checked' : ''}>
            ${esc((p.opciones[j] && p.opciones[j].texto) || (j ? 'Falso' : 'Verdadero'))}</label>`).join('')}
            <span class="meta">Marca si la afirmación es verdadera o falsa.</span></div>`
        : `${p.opciones.map((o, j) => `
            <div class="ed-opcion">
              <div class="ed-opcion-fila">
                <label class="ed-correcta" title="Marcar como correcta">
                  <input type="${p.tipo === 'multiple' ? 'checkbox' : 'radio'}" name="ed-c-${p._k}" data-ed="correcta" data-p="${i}" data-o="${j}" ${p.correctas.includes(j) ? 'checked' : ''}>
                  <span class="letra">${letra(j)}</span></label>
                <input class="control" data-ed="opcion" data-p="${i}" data-o="${j}" value="${esc(o.texto)}" placeholder="${o.imagen ? 'Texto (opcional si hay imagen)' : `Opción ${letra(j)}`}">
                ${o.imagen ? '' : `<button class="btn-icono" data-accion="ed-imagen" data-p="${i}" data-o="${j}" title="Añadir imagen a la opción" aria-label="Añadir imagen a la opción">${ICONO_IMAGEN}</button>`}
                <button class="btn-icono btn-peligro" data-accion="ed-quitar-opcion" data-p="${i}" data-o="${j}" title="Quitar opción" ${p.opciones.length <= 2 ? 'disabled' : ''}>✕</button>
              </div>
              ${o.imagen ? bloqueImagen(o.imagen, i, j) : ''}
            </div>`).join('')}
          ${p.opciones.length < MAX_OPCIONES ? `<button class="btn btn-fantasma" data-accion="ed-anadir-opcion" data-p="${i}">+ Añadir opción</button>` : ''}`;

      return `
        <article class="panel ed-pregunta" id="ed-p-${i}">
          ${cab}
          <div class="ed-fila2">
            <label class="ed-campo"><span>Tipo</span>
              <select class="control" data-ed="tipo" data-p="${i}">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="ed-campo"><span>Tema <small>(opcional)</small></span>
              <input class="control" list="ed-temas" data-ed="tema" data-p="${i}" value="${esc(p.tema)}" placeholder="Ej.: Orgánulos"></label>
          </div>
          <label class="ed-campo"><span>Enunciado</span>
            <textarea class="control" data-ed="enunciado" data-p="${i}" rows="3" placeholder="Escribe la pregunta">${esc(p.enunciado)}</textarea></label>
          ${p.imagen ? bloqueImagen(p.imagen, i, null) : `<button class="btn btn-fantasma ed-mas" data-accion="ed-imagen" data-p="${i}">${ICONO_IMAGEN} Añadir imagen al enunciado</button>`}

          <div class="ed-campo">
            <span>${p.tipo === 'vf' ? 'Respuesta' : `Opciones <small>(${p.tipo === 'multiple' ? 'marca todas las correctas' : 'marca la correcta'})</small>`}</span>
            ${opciones}
          </div>

          <label class="ed-campo"><span>Explicación <small>(se muestra al corregir)</small></span>
            <textarea class="control" data-ed="explicacion" data-p="${i}" rows="2" placeholder="Por qué es correcta y por qué fallan las demás">${esc(p.explicacion)}</textarea></label>
          ${p.tipo !== 'vf' ? `<label class="check"><input type="checkbox" data-ed="fijarOrden" data-p="${i}" ${p.fijarOrden ? 'checked' : ''}> No barajar las opciones de esta pregunta</label>` : ''}

          <ul class="ed-avisos" id="ed-err-${i}" hidden></ul>
          <div class="fila separado ed-p-pie">
            <span class="meta">Admite **negrita**, *cursiva*, \`código\`, fórmulas $x^2$ y listas.</span>
            <button class="btn btn-fantasma" data-accion="ed-previa" data-p="${i}">${previas.has(p._k) ? 'Ocultar vista previa' : 'Vista previa'}</button>
          </div>
          <div class="ed-previa" id="ed-prev-${i}" ${previas.has(p._k) ? '' : 'hidden'}>${previas.has(p._k) ? htmlPrevia(p) : ''}</div>
        </article>`;
    }

    function htmlPrevia(p) {
      const ops = p.tipo === 'vf'
        ? [0, 1].map((j) => (p.opciones[j] && p.opciones[j].texto) || (j ? 'Falso' : 'Verdadero'))
        : p.opciones.map((o) => [o.texto.trim(), o.imagen ? `![](${urlVisible(o.imagen)})` : ''].filter(Boolean).join('\n\n'));
      const conImg = p.tipo !== 'vf' && p.opciones.every((o) => o.imagen);
      return `
        <div class="enunciado">${md(p.enunciado) || '<p class="meta">(sin enunciado)</p>'}</div>
        ${p.imagen ? `<img class="imagen-pregunta" src="${esc(urlVisible(p.imagen))}" alt="">` : ''}
        <ol class="opciones ${conImg ? 'con-imagenes' : ''}">${ops.map((o, j) => `
          <li><div class="opcion ${p.tipo === 'multiple' ? 'multiple' : ''} ${p.correctas.includes(j) ? 'correcta' : ''}">
            <span class="letra">${letra(j)}</span><span class="texto">${mdLinea(o) || '<span class="meta">(vacía)</span>'}</span>
            ${p.correctas.includes(j) ? '<span class="estado">Correcta</span>' : ''}</div></li>`).join('')}</ol>
        ${p.explicacion.trim() ? `<div class="feedback blanco"><strong>Explicación</strong>${md(p.explicacion)}</div>` : ''}`;
    }
    function refrescarPrevia(i) {
      const p = b.preguntas[i];
      const el = document.getElementById(`ed-prev-${i}`);
      if (!p || !el || !previas.has(p._k)) return;
      el.innerHTML = htmlPrevia(p);
      ctx.formulas(el);
    }

    function vistaInicio() {
      const lista = ctx.biblioteca();
      return `
        <section class="editor">
          <h1>Editor de exámenes</h1>
          <p class="subtitulo">Crea un examen desde cero o modifica uno que ya tengas, sin tocar el formato JSON.</p>
          <div class="fila">
            <button class="btn btn-primario btn-grande" data-accion="ed-nuevo">Nuevo examen</button>
            <button class="btn btn-grande" data-accion="ed-importar">Abrir un archivo .json</button>
          </div>
          <div class="seccion">
            <h2>Editar un examen de la biblioteca</h2>
            ${lista.length ? `<div class="panel ed-lista">${lista.map((e) => `
              <div class="ed-lista-item">
                <div><strong>${esc(e.datos.titulo)}</strong><div class="meta">${plural(e.datos.preguntas.length, 'pregunta', 'preguntas')}</div></div>
                <button class="btn" data-accion="ed-editar" data-id="${esc(e.id)}">Editar</button>
              </div>`).join('')}</div>`
              : '<div class="panel vacio">La biblioteca está vacía.</div>'}
          </div>
        </section>`;
    }

    // Tras pintar la vista: validación, foco pendiente y vistas previas con fórmulas.
    let enfocar = null;
    function trasPintar() {
      if (!b) return;
      pintarValidacion();
      document.querySelectorAll('.ed-previa:not([hidden])').forEach((el) => ctx.formulas(el));
      if (enfocar != null) {
        const el = document.getElementById(`ed-p-${enfocar}`);
        enfocar = null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const t = el.querySelector('textarea[data-ed="enunciado"]');
          if (t) t.focus({ preventScroll: true });
        }
      }
    }

    /* ---------- Entrada de datos ---------- */
    function alEntrada(el) {
      if (!b || !el) return;
      const campo = el.dataset.ed;
      const i = +el.dataset.p;
      const j = +el.dataset.o;
      const p = b.preguntas[i];
      const numero = (v) => (v === '' ? '' : Number(v));
      switch (campo) {
        case 'titulo':
          b.titulo = el.value;
          document.getElementById('ed-h1').textContent = el.value.trim() || 'Examen sin título';
          break;
        case 'descripcion': case 'autor': b[campo] = el.value; break;
        case 'tiempoLimite': case 'aprobado': b.config[campo] = numero(el.value); break;
        case 'acierto': case 'fallo': case 'blanco': b.config.puntuacion[campo] = numero(el.value); break;
        case 'barajarPreguntas': case 'barajarOpciones': b.config[campo] = el.checked; break;
        case 'tema': case 'explicacion': case 'imagen': p[campo] = el.value; break;
        case 'enunciado':
          p.enunciado = el.value;
          { const t = document.getElementById(`ed-idx-t-${i}`); if (t) t.textContent = resumen(p); }
          break;
        case 'opcion': p.opciones[j].texto = el.value; break;
        case 'opcion-imagen': p.opciones[j].imagen = el.value; break;
        case 'fijarOrden': p.fijarOrden = el.checked; break;
        case 'correcta':
          if (p.tipo === 'multiple') {
            p.correctas = el.checked ? [...new Set([...p.correctas, j])].sort((a, c) => a - c) : p.correctas.filter((x) => x !== j);
          } else p.correctas = [j];
          break;
        case 'tipo':
          cambiarTipo(p, el.value);
          marcarCambio();
          ctx.render();
          return;
        default: return;
      }
      marcarCambio();
      if (p) refrescarPrevia(i);
    }

    /* ---------- Guardar ---------- */
    async function guardar(forzar = false) {
      if (!b) return false;
      clearTimeout(temporizador);
      validar();
      pintarValidacion();
      if (validacion.errores.length) {
        aviso(`Antes de guardar, completa ${plural(validacion.errores.length, 'cosa pendiente', 'cosas pendientes')}.`);
        const i = primerPendiente();
        if (i >= 0) irAPregunta(i);
        else window.scrollTo({ top: 0, behavior: 'smooth' });
        return false;
      }
      const res = await ctx.guardarExamen(aFormato(b), { origenId: b.origenId, ruta: b.ruta, forzar });
      if (res.conflicto) {
        modal(`<h2>Ya existe «${esc(res.titulo)}»</h2>
          <p>Hay otro examen con este título en la biblioteca. Si continúas, se sustituirá por este. También puedes cambiar el título.</p>
          <div class="fila"><button class="btn" data-accion="cerrar-modal">Cambiar el título</button>
          <button class="btn btn-primario" data-accion="ed-guardar-forzado">Sustituir</button></div>`);
        return false;
      }
      if (!res.ok) {
        aviso('No se pudo guardar.');
        return false;
      }
      b.origenId = res.id;
      b.ruta = res.ruta || b.ruta;
      b.cambios = false;
      guardarBorrador();
      pintarEstado();
      aviso(res.ruta ? `Guardado en la biblioteca y en ${res.ruta.split(/[\\/]/).pop()}` : 'Guardado en la biblioteca');
      return true;
    }

    function confirmarDescarte(accion, extra = '') {
      modal(`<h2>¿Descartar los cambios?</h2>
        <p>«${esc(b.titulo.trim() || 'Examen sin título')}» tiene cambios sin guardar.</p>
        <div class="fila"><button class="btn" data-accion="cerrar-modal">Volver al editor</button>
        <button class="btn btn-primario" data-accion="${accion}" ${extra}>Descartar</button></div>`);
    }
    function abrir(nuevo) {
      b = nuevo;
      plegadas.clear();
      previas.clear();
      if (b.preguntas.length > 6) b.preguntas.forEach((p) => plegadas.add(p._k));
      guardarBorrador();
      cerrarModal();
      ctx.ir({ nombre: 'editor' });
    }
    function editarId(id) {
      const e = ctx.examenPorId(id);
      if (e) abrir(desdeDatos(e.datos, e.id, e.ruta || null));
    }

    function importar() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        let datos;
        try {
          datos = JSON.parse(await f.text());
        } catch (e) {
          aviso(`No es un JSON válido: ${e.message}`);
          return;
        }
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
          aviso('El archivo no contiene un examen.');
          return;
        }
        // Se abre aunque tenga errores: el editor ayuda a corregirlos.
        const nuevo = desdeDatos(datos, null, ctx.rutaDe(f));
        nuevo.cambios = true;
        abrir(nuevo);
      });
      input.click();
    }

    /* ---------- Acciones ---------- */
    const estructural = (fn) => (el, ev) => {
      if (!b) return;
      fn(el, ev);
      marcarCambio();
      ctx.render();
    };
    const pIdx = (el) => +el.dataset.p;

    const acciones = {
      'ed-nuevo': () => (b && b.cambios ? confirmarDescarte('ed-nuevo-forzado') : abrir(nuevoBorrador())),
      'ed-nuevo-forzado': () => abrir(nuevoBorrador()),
      'ed-editar': (el) => (b && b.cambios && b.origenId !== el.dataset.id ? confirmarDescarte('ed-editar-forzado', `data-id="${esc(el.dataset.id)}"`) : b && b.origenId === el.dataset.id ? ctx.ir({ nombre: 'editor' }) : editarId(el.dataset.id)),
      'ed-editar-forzado': (el) => editarId(el.dataset.id),
      'ed-importar': () => importar(),
      'ed-cerrar': () => (b && b.cambios ? confirmarDescarte('ed-cerrar-forzado') : acciones['ed-cerrar-forzado']()),
      'ed-cerrar-forzado': () => { b = null; guardarBorrador(); cerrarModal(); ctx.ir({ nombre: 'editor' }); },
      'ed-guardar': () => guardar(),
      'ed-guardar-forzado': () => { cerrarModal(); guardar(true); },
      'ed-probar': async () => { if (await guardar()) ctx.ir({ nombre: 'detalle', id: b.origenId }); },
      'ed-descargar': () => {
        validar();
        const datos = aFormato(b);
        ctx.descargar(`${ctx.slug(datos.titulo || 'examen')}.json`, datos);
        if (validacion.errores.length) aviso(`Descargado, pero tiene ${plural(validacion.errores.length, 'cosa pendiente', 'cosas pendientes')}.`);
      },
      'ed-fallo': (el) => {
        b.config.puntuacion.fallo = Number(el.dataset.v);
        const inp = document.getElementById('ed-fallo');
        if (inp) inp.value = el.dataset.v;
        marcarCambio();
      },
      'ed-anadir': estructural((el) => {
        const ultima = b.preguntas[b.preguntas.length - 1];
        b.preguntas.push(preguntaVacia(el.dataset.tipo, ultima ? ultima.tema : ''));
        enfocar = b.preguntas.length - 1;
      }),
      'ed-subir': estructural((el) => { const i = pIdx(el); if (i > 0) [b.preguntas[i - 1], b.preguntas[i]] = [b.preguntas[i], b.preguntas[i - 1]]; }),
      'ed-bajar': estructural((el) => { const i = pIdx(el); if (i < b.preguntas.length - 1) [b.preguntas[i + 1], b.preguntas[i]] = [b.preguntas[i], b.preguntas[i + 1]]; }),
      'ed-duplicar': estructural((el) => {
        const i = pIdx(el);
        const copia = JSON.parse(JSON.stringify(b.preguntas[i]));
        copia._k = clave();
        copia.id = '';
        b.preguntas.splice(i + 1, 0, copia);
        enfocar = i + 1;
      }),
      'ed-eliminar': (el) => {
        const i = pIdx(el);
        const p = b.preguntas[i];
        const vacia = !p.enunciado.trim() && p.opciones.every((o) => !o.texto.trim() && !o.imagen);
        if (vacia) return acciones['ed-eliminar-forzado'](el);
        modal(`<h2>¿Eliminar la pregunta ${i + 1}?</h2><p>${esc(resumen(p))}</p>
          <div class="fila"><button class="btn" data-accion="cerrar-modal">Cancelar</button>
          <button class="btn btn-primario" data-accion="ed-eliminar-forzado" data-p="${i}">Eliminar</button></div>`);
      },
      'ed-eliminar-forzado': (el) => {
        cerrarModal();
        b.preguntas.splice(pIdx(el), 1);
        if (!b.preguntas.length) b.preguntas.push(preguntaVacia());
        marcarCambio();
        ctx.render();
      },
      'ed-anadir-opcion': estructural((el) => { const p = b.preguntas[pIdx(el)]; if (p.opciones.length < MAX_OPCIONES) p.opciones.push(op()); }),
      'ed-quitar-opcion': estructural((el) => {
        const p = b.preguntas[pIdx(el)];
        const j = +el.dataset.o;
        if (p.opciones.length <= 2) return;
        p.opciones.splice(j, 1);
        p.correctas = p.correctas.filter((c) => c !== j).map((c) => (c > j ? c - 1 : c));
      }),
      'ed-plegar': (el) => {
        const p = b.preguntas[pIdx(el)];
        if (!plegadas.delete(p._k)) plegadas.add(p._k);
        ctx.render();
      },
      'ed-plegar-todas': () => { b.preguntas.forEach((p) => plegadas.add(p._k)); ctx.render(); },
      'ed-desplegar-todas': () => { plegadas.clear(); ctx.render(); },
      'ed-ir': (el) => irAPregunta(pIdx(el)),
      'ed-previa': (el) => {
        const i = pIdx(el);
        const p = b.preguntas[i];
        const abierta = previas.has(p._k);
        if (abierta) previas.delete(p._k);
        else previas.add(p._k);
        const caja = document.getElementById(`ed-prev-${i}`);
        caja.hidden = abierta;
        el.textContent = abierta ? 'Vista previa' : 'Ocultar vista previa';
        refrescarPrevia(i);
      },
      'ed-imagen': (el) => {
        destinoImagen = { p: pIdx(el), o: el.dataset.o != null ? +el.dataset.o : null };
        const p = b.preguntas[destinoImagen.p];
        const actual = destinoImagen.o == null ? p.imagen : p.opciones[destinoImagen.o].imagen;
        modal(`<h2>${destinoImagen.o == null ? 'Imagen del enunciado' : `Imagen de la opción ${letra(destinoImagen.o)}`}</h2>
          <p>Elige una imagen de tu equipo (se guarda dentro del examen) o escribe una dirección web.</p>
          <button class="btn" data-accion="ed-imagen-archivo">Elegir imagen…</button>
          <label class="ed-campo ed-modal-url"><span>O una URL / ruta</span>
            <input class="control" id="ed-img-url" value="${esc(actual && !actual.startsWith('data:') ? actual : '')}" placeholder="https://… o img/figura.png"></label>
          <div class="fila"><button class="btn" data-accion="cerrar-modal">Cancelar</button>
          <button class="btn btn-primario" data-accion="ed-imagen-url">Usar URL</button></div>`);
      },
      'ed-imagen-archivo': () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => {
          const f = input.files[0];
          if (!f) return;
          try {
            const src = await leerImagen(f);
            if (src.length > 1.5 * 1024 * 1024) aviso('La imagen es grande; el examen ocupará bastante.');
            ponerImagen(src);
          } catch (e) {
            aviso('No se pudo leer la imagen.');
          }
        });
        input.click();
      },
      'ed-imagen-url': () => {
        const v = document.getElementById('ed-img-url').value.trim();
        if (!v) { aviso('Escribe una URL o ruta.'); return; }
        ponerImagen(v);
      },
      'ed-quitar-imagen': estructural((el) => {
        const p = b.preguntas[pIdx(el)];
        if (el.dataset.o != null) p.opciones[+el.dataset.o].imagen = '';
        else p.imagen = '';
      }),
    };

    return {
      vista,
      trasPintar,
      acciones,
      alEntrada,
      guardar: () => guardar(),
      hayBorrador: () => !!b,
      editandoId: () => (b ? b.origenId : null),
    };
  };
})();
