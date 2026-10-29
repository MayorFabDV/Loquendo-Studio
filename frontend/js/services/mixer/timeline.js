// services/mixer/timeline.js - ConstrucciÃ³n del multitrack, envelope y controles por pista
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const cfg = app.config;
    const { state } = app.store;
    const { COLORES, ALTURAS, NOMBRE_TITULO, ORDEN_PISTAS, ZOOM_INICIAL, ZOOM_MIN, ZOOM_MAX, PEAKS_POINTS } = cfg;
    const { clamp, numero, dbALineal, linealADb, percentDeDb, dbDePercent, uid, notificar, urlCompleta, baseAPI } = app.util;

    const ALTURA_RESERVA = ALTURAS.sfx;

    let contenedor = null;
    let multitrack = null;
    let reconstruyendo = false;
    let pendienteRebuild = false;
    let tokenRebuild = 0;
    let previewContext = null;
    let previewNodes = [];
    let posicionPendiente = 0;
    let listo = false;

    function liberarPreview() {
        for (const item of previewNodes) {
            for (const node of item.nodes) node.disconnect();
        }
        previewNodes = [];
        if (previewContext) previewContext.close().catch(() => {});
        previewContext = null;
    }

    function actualizarPreview() {
        for (const item of previewNodes) {
            const clip = app.store.buscarClip(item.id);
            if (!clip) continue;
            const track = state.tracks.get(clip.trackId) || {};
            const pan = clamp((track.pan || 0) + clip.pan, -1, 1);
            const gain = track.mute ? 0 : dbALineal((track.gainDb || 0) + (state.master.gainDb || 0));
            item.left.gain.value = gain * (pan > 0 ? 1 - pan : 1);
            item.right.gain.value = gain * (pan < 0 ? 1 + pan : 1);
        }
    }

    function conectarPreview() {
        if (previewContext || !multitrack) return;
        previewContext = new (global.AudioContext || global.webkitAudioContext)();
        clipsOrdenados().forEach((clip, i) => {
            const audio = multitrack.audios[i];
            if (!(audio instanceof global.HTMLMediaElement)) return;
            const source = previewContext.createMediaElementSource(audio);
            const split = previewContext.createChannelSplitter(2);
            const stereo = previewContext.createGain();
            stereo.channelCount = 2; stereo.channelCountMode = 'explicit';
            const merge = previewContext.createChannelMerger(2);
            const left = previewContext.createGain(), right = previewContext.createGain();
            // Forzar stereo duplica mono antes de aplicar el balance usado por FFmpeg.
            source.connect(stereo); stereo.connect(split);
            split.connect(left, 0); split.connect(right, 1);
            left.connect(merge, 0, 0); right.connect(merge, 0, 1);
            merge.connect(previewContext.destination);
            previewNodes.push({ id: clip.id, left, right, nodes: [source,stereo,split,merge,left,right] });
        });
        actualizarPreview();
    }

    function inicializar(raiz) {
        contenedor = raiz;
        if (!contenedor) return;
        if (contenedor.dataset.mezcladorIniciado === '1') {
            rebuild();
            return;
        }
        contenedor.dataset.mezcladorIniciado = '1';

        contenedor.addEventListener('dragover', (evento) => {
            const tipos = evento.dataTransfer && evento.dataTransfer.types;
            if (!tipos) return;
            if (tipos.includes('Files') || tipos.includes('text/plain')) evento.preventDefault();
        });
        contenedor.addEventListener('drop', (evento) => app.media.onDropArchivo(evento));

        app.store.cargarLocal();
        rebuild();
        app.media.cargarBiblioteca();
    }

    function clipsOrdenados() {
        return state.clips.slice().sort((a, b) => {
            const oa = ORDEN_PISTAS[a.trackId] ?? 9;
            const ob = ORDEN_PISTAS[b.trackId] ?? 9;
            return oa - ob || (a._orden || 0) - (b._orden || 0);
        });
    }

    function indiceDeClip(id) {
        return clipsOrdenados().findIndex((c) => c.id === id);
    }

    function duracionFuente(clip) {
        if (clip.out > clip.in) return clip.out - clip.in;
        return Math.max(0.01, clip.duration || 0);
    }

    async function calcularPicos(clip) {
        if (Array.isArray(clip.peaks) && clip.peaks.length && clip.duration > 0) return true;
        try {
            const respuesta = await fetch(`${baseAPI()}/api/audio/peaks?src=${encodeURIComponent(clip.src)}&points=${PEAKS_POINTS}`);
            if (!respuesta.ok) return false;
            const datos = await respuesta.json();
            if (!datos || !Array.isArray(datos.peaks) || !datos.peaks.length) return false;
            clip.peaks = datos.peaks;
            clip.peaksPoints = datos.peaks.length;
            if (datos.duration > 0) {
                clip.duration = datos.duration;
                if (clip.in >= clip.duration) clip.in = 0;
                if (!clip.out || clip.out > clip.duration) clip.out = clip.duration;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async function asegurarPicos(clips) {
        const cola = clips.filter((c) => !(Array.isArray(c.peaks) && c.peaks.length && c.duration > 0));
        const trabajadores = Array.from({ length: Math.min(3, cola.length) }, async () => {
            while (cola.length) {
                const clip = cola.shift();
                await calcularPicos(clip);
            }
        });
        await Promise.all(trabajadores);
    }

    function asegurarEndpoints(clip) {
        const duracion = clip.duration || 1;
        const base = dbALineal(clip.gainDb);
        const inicio = clip.in > 0 && clip.in < duracion ? clip.in : 0;
        const fin = clip.out > clip.in && clip.out <= duracion ? clip.out : duracion;
        const puntos = clip.automation.slice().sort((a, b) => a.t - b.t);

        if (!puntos.length) {
            puntos.push({ id: uid('pt'), t: inicio, gain: base });
            if (fin > inicio + 0.005) puntos.push({ id: uid('pt'), t: fin, gain: base });
        } else {
            const primero = puntos[0];
            const ultimo = puntos[puntos.length - 1];
            if (inicio < primero.t - 0.005) puntos.unshift({ id: uid('pt'), t: inicio, gain: primero.gain });
            if (fin > ultimo.t + 0.005) puntos.push({ id: uid('pt'), t: fin, gain: ultimo.gain });
        }

        clip.automation = puntos;
        return puntos;
    }

    function construirEnvelope(clip) {
        const puntos = asegurarEndpoints(clip);
        const duracion = Math.max(0.1, clip.duration || 1);
        const inicioClip = clamp(clip.in || 0, 0, duracion);
        const finClip = clamp(clip.out > clip.in ? clip.out : duracion, 0, duracion);
        const finFadeIn = clip.fadeIn > 0 ? inicioClip + clip.fadeIn : inicioClip;
        const inicioFadeOut = clip.fadeOut > 0 ? finClip - clip.fadeOut : finClip;

        const lista = puntos
            .map((p) => ({ id: p.id, time: clamp(p.t, 0, duracion), volume: clamp(p.gain, 0, 1) }))
            .filter((p) => {
                if (clip.fadeIn > 0 && p.time <= inicioClip + 0.005) return false;
                if (clip.fadeOut > 0 && p.time >= finClip - 0.005) return false;
                return true;
            });

        if (clip.fadeIn > 0) {
            if (inicioClip <= 0.0001 && !lista.some((p) => p.id === 'startCue')) {
                lista.push({ id: 'startCue', time: 0, volume: 0 });
            }
            if (!lista.some((p) => p.id === 'fadeInEnd')) {
                lista.push({ id: 'fadeInEnd', time: clamp(finFadeIn, 0, duracion), volume: dbALineal(clip.gainDb) });
            }
        }

        if (clip.fadeOut > 0) {
            if (!lista.some((p) => p.id === 'fadeOutStart')) {
                lista.push({ id: 'fadeOutStart', time: clamp(inicioFadeOut, 0, duracion), volume: dbALineal(clip.gainDb) });
            }
            if (!lista.some((p) => p.id === 'endCue')) {
                lista.push({ id: 'endCue', time: finClip, volume: 0 });
            }
        }

        return lista;
    }

    function opcionesPista() {
        return {
            container: contenedor,
            minPxPerSec: state.zoomPx,
            trackBackground: 'rgba(255, 255, 255, 0.04)',
            trackBorderColor: 'rgba(0, 0, 0, 0.35)',
            cursorColor: '#ffffff',
            cursorWidth: 2,
            envelopeOptions: {
                lineColor: 'rgba(255, 255, 255, 0.55)',
                dragPointFill: 'rgba(255, 255, 255, 0.9)',
                dragPointStroke: '#0f172a',
                dragPointSize: 10
            }
        };
    }

    function pistaDeClip(clip) {
        const color = COLORES[clip.trackId];
        const duracion = Math.max(0.1, clip.duration || 1);
        const pista = {
            id: clip.id,
            url: urlCompleta(clip.src),
            // Multitrack cuenta desde el inicio del archivo, el proyecto desde clip.in.
            startPosition: clip.start - clip.in,
            volume: dbALineal(clip.gainDb),
            draggable: true,
            envelope: construirEnvelope(clip),
            options: {
                height: ALTURAS[clip.trackId],
                waveColor: color.wave,
                progressColor: color.progress,
                cursorColor: 'transparent',
                barWidth: 2,
                barRadius: 2,
                dragToSeek: false
            }
        };

        if (Array.isArray(clip.peaks) && clip.peaks.length) {
            pista.peaks = [clip.peaks];
        }
        if (clip.in > 0.001) pista.startCue = clip.in;
        if (clip.out > clip.in + 0.001 && clip.out < duracion - 0.001) pista.endCue = clip.out;
        if (clip.fadeIn > 0) pista.fadeInEnd = clamp((clip.in || 0) + clip.fadeIn, 0, duracion);
        if (clip.fadeOut > 0) {
            const fin = clip.out > clip.in ? clip.out : duracion;
            pista.fadeOutStart = clamp(fin - clip.fadeOut, 0, duracion);
        }
        return pista;
    }

    function pistaReserva() {
        return {
            id: 'sfx-slot-reserva',
            startPosition: 0,
            draggable: false,
            options: { height: ALTURA_RESERVA }
        };
    }

    function nodosPista() {
        if (!contenedor) return [];
        const fila = contenedor.firstElementChild;
        if (!fila || !fila.firstElementChild) return [];
        return Array.from(fila.firstElementChild.children).filter((nodo) => {
            return nodo && nodo.style && nodo.style.position === 'relative';
        });
    }

    function decorarPistas() {
        if (!contenedor) return;
        const clips = clipsOrdenados();
        const nodos = nodosPista();

        for (let i = 0; i < clips.length && i < nodos.length; i++) {
            const clip = clips[i];
            const nodoPista = nodos[i];
            if (!nodoPista || typeof nodoPista.prepend !== 'function') continue;

            nodoPista.dataset.clipId = clip.id;
            nodoPista.classList.toggle('mezclador-pista-seleccionada', state.selectedId === clip.id);
            nodoPista.onclick = (evento) => {
                if (evento && evento.target && evento.target.closest && evento.target.closest('.mezclador-quitar, .mezclador-volumen')) return;
                if (app.inspector) app.inspector.seleccionar(clip.id);
            };

            const previo = nodoPista.querySelector('.mezclador-chip');
            if (previo) previo.remove();
            const chip = document.createElement('span');
            chip.className = `mezclador-chip mezclador-chip-${clip.trackId}`;
            const titulo = NOMBRE_TITULO[clip.trackId] || clip.trackId;
            const nombre = clip.nombre ? ` Â· ${clip.nombre}` : '';
            const pan = Math.abs(clip.pan) > 0.005 ? ` Â· ${clip.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(clip.pan) * 100)}` : '';
            chip.textContent = `${titulo}${nombre}${pan}`;
            chip.title = `${titulo} â€” ${clip.src}${nombre}`;
            nodoPista.prepend(chip);

            let volumen = nodoPista.querySelector('.mezclador-volumen');
            if (!volumen) {
                volumen = document.createElement('input');
                volumen.type = 'range';
                volumen.min = '0';
                volumen.max = '100';
                volumen.className = 'mezclador-volumen';
                volumen.title = 'Volumen del clip';
                volumen.addEventListener('pointerdown', (e) => e.stopPropagation());
                volumen.addEventListener('input', () => {
                    aplicarVolumen(nodoPista.dataset.clipId, Number(volumen.value));
                });
                nodoPista.appendChild(volumen);
            }
            volumen.dataset.clipId = clip.id;
            volumen.value = String(percentDeDb(clip.gainDb));

            let quitar = nodoPista.querySelector('.mezclador-quitar');
            if (!quitar) {
                quitar = document.createElement('button');
                quitar.type = 'button';
                quitar.className = 'mezclador-quitar';
                quitar.textContent = 'Ã—';
                quitar.title = 'Quitar pista';
                quitar.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });
                quitar.addEventListener('click', (evento) => {
                    if (evento) evento.stopPropagation();
                    const id = nodoPista.dataset.clipId;
                    app.store.quitarClip(id);
                    rebuild();
                });
                nodoPista.appendChild(quitar);
            }
            quitar.dataset.clipId = clip.id;
        }
    }

    function actualizarEstado() {
        const estado = document.getElementById('mezcladorEstado');
        if (!estado) return;
        if (!state.clips.length) {
            estado.textContent = 'Sin pistas cargadas';
            return;
        }
        const dur = app.store.duracionProyecto();
        estado.textContent = `${state.clips.length} pista(s) Â· ${app.util.tiempo(dur)} Â· zoom ${state.zoomPx}px/s`;
    }

    function _actualizarDuraciones() {
        if (!multitrack || !multitrack.audios) return;
        for (let i = 0; i < multitrack.tracks.length; i++) {
            const audio = multitrack.audios[i];
            const clip = app.store.buscarClip(multitrack.tracks[i].id);
            if (!audio || !clip) continue;
            if (isFinite(audio.duration) && audio.duration > 0) {
                clip.duration = Math.max(clip.duration || 0, audio.duration);
                if (!clip.out || clip.out > audio.duration) clip.out = audio.duration;
                if (clip.in >= audio.duration) clip.in = 0;
            }
        }
        app.store.guardarLocal({ historial: false });
        actualizarEstado();
    }

    function _bindEventos() {
        const instancia = multitrack;
        const on = (nombre, callback) => instancia.on(nombre, (...args) => {
            if (instancia === multitrack) callback(...args);
        });
        on('start-position-change', (detalle) => {
            const clip = app.store.buscarClip(detalle.id);
            if (!clip) return;
            clip.start = Math.max(0, detalle.startPosition + clip.in);
            clip.startPosition = clip.start;
            app.store.guardarLocal();
            actualizarEstado();
        });

        on('canplay', () => {
            if (pendienteRebuild) return;
            _actualizarDuraciones();
            decorarPistas();
            conectarPreview();
            listo = true;
            multitrack.setTime(posicionPendiente);
        });

        on('envelope-points-change', (detalle) => {
            const clip = app.store.buscarClip(detalle.id);
            if (!clip) return;
            const puntos = Array.isArray(detalle.points) ? detalle.points : [];
            const duracion = clip.duration || 1;
            const fin = clip.out > clip.in ? clip.out : duracion;

            const fadeInEnd = puntos.find((p) => p.id === 'fadeInEnd');
            const fadeOutStart = puntos.find((p) => p.id === 'fadeOutStart');
            if (fadeInEnd) clip.fadeIn = clamp(fadeInEnd.time - (clip.in || 0), 0, Math.min(120, duracion));
            if (fadeOutStart) clip.fadeOut = clamp(fin - fadeOutStart.time, 0, Math.min(120, duracion));

            const reservados = new Set(['startCue', 'fadeInEnd', 'fadeOutStart', 'endCue']);
            clip.automation = puntos
                .filter((p) => !reservados.has(p.id))
                .map((p) => ({
                    id: p.id,
                    t: Math.round(clamp(p.time, 0, duracion) * 1000) / 1000,
                    gain: Math.round(clamp(p.volume, 0, 1) * 10000) / 10000
                }))
                .sort((a, b) => a.t - b.t);

            app.store.guardarLocal();
            if (app.inspector) app.inspector.refresh();
        });

        on('start-cue-change', (detalle) => {
            const clip = app.store.buscarClip(detalle.id);
            if (!clip) return;
            if (Math.abs(clip.in - detalle.startCue) < 0.0001) return;
            clip.in = clamp(detalle.startCue, 0, clip.duration || detalle.startCue);
            if (clip.out > 0 && clip.in >= clip.out) clip.out = clip.duration || clip.out;
            app.store.guardarLocal();
            if (app.inspector) app.inspector.refresh();
            rebuild();
        });

        on('end-cue-change', (detalle) => {
            const clip = app.store.buscarClip(detalle.id);
            if (!clip) return;
            if (Math.abs(clip.out - detalle.endCue) < 0.0001) return;
            clip.out = clamp(detalle.endCue, clip.in + 0.05, clip.duration || detalle.endCue);
            app.store.guardarLocal();
            if (app.inspector) app.inspector.refresh();
            rebuild();
        });
    }

    function esperarAncho(maxFrames = 30) {
        return new Promise((resolve) => {
            let frames = 0;
            const comprobar = () => {
                if (!contenedor) return resolve(false);
                if (contenedor.clientWidth > 0) return resolve(true);
                if (++frames >= maxFrames) return resolve(false);
                global.requestAnimationFrame(comprobar);
            };
            comprobar();
        });
    }

    async function rebuild() {
        if (!contenedor) return;
        if (reconstruyendo) {
            pendienteRebuild = true;
            return;
        }
        const token = ++tokenRebuild;
        reconstruyendo = true;
        listo = false;

        try {
            const clips = clipsOrdenados();
            state.clips = clips;

            if (!clips.length) {
                liberarPreview();
                if (multitrack) {
                    try { multitrack.destroy(); } catch (e) { /* noop */ }
                    multitrack.audioContext?.close().catch(() => {});
                    multitrack = null;
                }
                contenedor.innerHTML = '<div class="mezclador-vacio">AÃ±ade una pista de voz, mÃºsica o SFX para empezar.</div>';
                actualizarEstado();
                if (app.inspector) app.inspector.refresh();
                return;
            }

            const disponibilidad = await Promise.all(clips.map(async clip => ({
                clip, disponible: await app.util.head(clip.src)
            })));
            const faltantes = disponibilidad.filter(item => !item.disponible);
            if (faltantes.length) {
                if (multitrack) {
                    multitrack.destroy();
                    multitrack.audioContext?.close().catch(() => {});
                    multitrack = null;
                }
                liberarPreview();
                contenedor.textContent = 'Medios no disponibles: ' + faltantes.map(item => item.clip.nombre || item.clip.id).join(', ')
                    + '. Los clips siguen en el proyecto. Recupera los archivos y vuelve a abrir el mezclador.';
                return;
            }

            await asegurarPicos(clips);
            if (token !== tokenRebuild) return;

            if (!(await esperarAncho())) {
                if (token === tokenRebuild) {
                    global.setTimeout(() => {
                        if (token !== tokenRebuild || !contenedor) return;
                        if (contenedor.closest('.audio-group-hidden')) return;
                        rebuild();
                    }, 200);
                }
                return;
            }
            if (token !== tokenRebuild) return;

            clips.forEach(asegurarEndpoints);
            app.store.guardarLocal({ historial: false });

            if (multitrack) {
                posicionPendiente = multitrack.getCurrentTime();
                liberarPreview();
                try { multitrack.destroy(); } catch (e) { console.warn('Mixer: error al destruir instancia previa', e); }
                multitrack.audioContext?.close().catch(() => {});
                multitrack = null;
            }
            contenedor.innerHTML = '';

            const pistas = clips.map(pistaDeClip).concat([pistaReserva()]);
            multitrack = Multitrack.create(pistas, opcionesPista());

            (multitrack.audios || []).forEach((audio) => {
                if (audio && !audio.src) audio.play = () => Promise.resolve();
            });

            _bindEventos();
            // No destruir una instancia mientras initAllAudios sigue cargando.
            // Las ediciones rápidas se acumulan en pendienteRebuild.
            await new Promise((resolve, reject) => {
                const cancelar = multitrack.once('canplay', () => { clearTimeout(timer); resolve(); });
                const timer = global.setTimeout(() => {
                    cancelar(); reject(new Error('Tiempo de carga del mezclador agotado'));
                }, 15000);
            });
        } catch (error) {
            console.error('Mixer: error creando multitrack', error);
            notificar('error', 'No se pudo crear el mezclador');
        } finally {
            reconstruyendo = false;
            if (token === tokenRebuild && !pendienteRebuild) {
                actualizarEstado();
                decorarPistas();
                if (app.inspector) app.inspector.refresh();
            }
            if (pendienteRebuild) {
                pendienteRebuild = false;
                rebuild();
            }
        }
    }

    function envelopeDeClip(clip) {
        if (!multitrack) return;
        const indice = indiceDeClip(clip.id);
        if (indice < 0) return;
        try { multitrack.setEnvelopePoints(indice, construirEnvelope(clip)); } catch (e) { /* noop */ }
    }

    function aplicarVolumen(id, percent) {
        const clip = app.store.buscarClip(id);
        if (!clip) return;
        const anterior = dbALineal(clip.gainDb);
        const nuevo = clamp(percent, 0, 100) / 100;
        const ratio = anterior > 0.00001 ? nuevo / anterior : 1;

        clip.gainDb = dbDePercent(percent);
        clip.volumen = nuevo;
        if (Array.isArray(clip.automation) && clip.automation.length) {
            clip.automation = clip.automation.map((p) => ({ ...p, gain: clamp(p.gain * ratio, 0, 1) }));
        }

        const indice = indiceDeClip(id);
        if (multitrack && indice >= 0) {
            if (clip.fadeIn > 0 || clip.fadeOut > 0) {
                rebuild();
            } else if (clip.automation.length) {
                envelopeDeClip(clip);
            } else {
                try { multitrack.setTrackVolume(indice, nuevo); } catch (e) { /* noop */ }
            }
        }
        app.store.guardarLocal();
        if (app.inspector) app.inspector.refresh();
    }

    function aplicarPan(id, pan) {
        const clip = app.store.buscarClip(id);
        if (!clip) return;
        clip.pan = clamp(pan, -1, 1);
        app.store.guardarLocal();
        if (app.inspector) app.inspector.refresh();
        decorarPistas();
        actualizarPreview();
    }

    function aplicarFade(id, tipo, valor) {
        const clip = app.store.buscarClip(id);
        if (!clip) return;
        const max = Math.min(120, clip.duration || 120);
        if (tipo === 'in') clip.fadeIn = clamp(valor, 0, max);
        if (tipo === 'out') clip.fadeOut = clamp(valor, 0, max);
        app.store.guardarLocal();
        rebuild();
    }

    function agregarPunto(id) {
        const clip = app.store.buscarClip(id);
        if (!clip) return;
        const tiempoTimeline = multitrack ? multitrack.getCurrentTime() : 0;
        const t = clamp(tiempoTimeline - clip.start + clip.in, clip.in, clip.out || clip.duration || 0);
        const gain = dbALineal(clip.gainDb);
        clip.automation = clip.automation
            .filter((p) => Math.abs(p.t - t) > 0.02)
            .concat([{ id: uid('pt'), t: Math.round(t * 1000) / 1000, gain }])
            .sort((a, b) => a.t - b.t);
        app.store.guardarLocal();
        envelopeDeClip(clip);
        if (app.inspector) app.inspector.refresh();
    }

    function limpiarAutomatizacion(id) {
        const clip = app.store.buscarClip(id);
        if (!clip) return;
        clip.automation = [];
        asegurarEndpoints(clip);
        app.store.guardarLocal();
        if (clip.fadeIn > 0 || clip.fadeOut > 0) rebuild();
        else envelopeDeClip(clip);
        if (app.inspector) app.inspector.refresh();
    }

    function zoom(valor) {
        state.zoomPx = clamp(valor, ZOOM_MIN, ZOOM_MAX);
        app.store.guardarLocal();
        if (!multitrack) return;
        try {
            multitrack.zoom(state.zoomPx);
            multitrack.options.minPxPerSec = state.zoomPx;
        } catch (e) {
            console.warn('Mixer: fallo al hacer zoom', e);
        }
        actualizarEstado();
    }

    app.timeline = {
        estaListo: () => listo && !reconstruyendo,
        resumePreview: () => previewContext ? previewContext.resume() : Promise.resolve(),
        inicializar,
        rebuild,
        decorarPistas,
        actualizarEstado,
        clipsOrdenados,
        indiceDeClip,
        aplicarVolumen,
        aplicarPan,
        aplicarFade,
        agregarPunto,
        limpiarAutomatizacion,
        zoom,
        getMultitrack: () => multitrack,
        getContenedor: () => contenedor,
        duracionFuente
    };
})(window);
