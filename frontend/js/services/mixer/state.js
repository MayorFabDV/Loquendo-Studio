// services/mixer/state.js - Modelo de clips v2, validación y persistencia local
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { STORAGE_KEY, STORAGE_KEY_LEGACY, VERSION, ORDEN_PISTAS, ZOOM_INICIAL, ZOOM_MIN, ZOOM_MAX } = app.config;
    const { clamp, numero, rutaServidorDe, dbALineal, linealADb, uid, notificar } = app.util;

    const state = app.state = {
        clips: [],
        tracks: new Map(),
        zoomPx: ZOOM_INICIAL,
        projectId: '',
        nombre: 'Mezcla',
        selectedId: '',
        master: { gainDb: 0, limiter: true, loudness: { enabled: false } },
        dirty: false
    };

    let guardadoTimer = null;
    let historial = [];
    let indiceHistorial = -1;
    let restaurando = false;
    let portapapeles = null;

    function snapshot() {
        return JSON.stringify({ ...aProyecto(), zoomPx: state.zoomPx }, (key, value) =>
            key === 'peaks' || key === 'peaksPoints' ? undefined : value);
    }

    function registrarEstado() {
        if (restaurando) return;
        const actual = snapshot();
        if (historial[indiceHistorial] === actual) return;
        historial = historial.slice(0, indiceHistorial + 1);
        historial.push(actual);
        if (historial.length > 100) historial.shift();
        indiceHistorial = historial.length - 1;
    }

    function restaurarHistorial(delta) {
        const siguiente = indiceHistorial + delta;
        if (siguiente < 0 || siguiente >= historial.length) return false;
        restaurando = true;
        try {
            const selectedId = state.selectedId;
            aplicarEstado(normalizarEstado(JSON.parse(historial[siguiente])));
            state.selectedId = buscarClip(selectedId) ? selectedId : (state.clips[0]?.id || '');
            indiceHistorial = siguiente;
            guardarLocal();
        } finally { restaurando = false; }
        return true;
    }

    function trackValido(trackId) {
        return Object.prototype.hasOwnProperty.call(ORDEN_PISTAS, trackId);
    }

    function normalizarPunto(punto) {
        if (!punto || typeof punto !== 'object') return null;
        const t = numero(punto.t, NaN);
        if (!Number.isFinite(t) || t < 0) return null;
        let gain;
        if (punto.gain != null) {
            gain = clamp(punto.gain, 0, 1);
        } else if (punto.gainDb != null) {
            gain = dbALineal(numero(punto.gainDb, 0));
        } else if (punto.volume != null) {
            gain = clamp(punto.volume, 0, 1);
        } else {
            gain = 1;
        }
        return {
            id: typeof punto.id === 'string' && punto.id ? punto.id : uid('pt'),
            t: Math.round(t * 1000) / 1000,
            gain: Math.round(gain * 10000) / 10000
        };
    }

    function normalizarAutomatizacion(lista) {
        if (!Array.isArray(lista)) return [];
        const puntos = [];
        for (const raw of lista) {
            const punto = normalizarPunto(raw);
            if (punto) puntos.push(punto);
        }
        puntos.sort((a, b) => a.t - b.t);
        const unicos = [];
        for (const punto of puntos) {
            const previo = unicos[unicos.length - 1];
            if (previo && Math.abs(previo.t - punto.t) < 0.005) {
                unicos[unicos.length - 1] = punto;
            } else {
                unicos.push(punto);
            }
        }
        return unicos;
    }

    function normalizarClip(raw, indice) {
        if (!raw || typeof raw !== 'object') return null;
        const trackId = String(raw.trackId || raw.pista || 'voz');
        if (!trackValido(trackId)) return null;

        const asset = typeof raw.asset === 'string' ? raw.asset : '';
        const src = rutaServidorDe(raw.src || raw.url || raw.path || '');
        if (!src && !asset) return null;

        const inSec = Math.max(0, numero(raw.in, 0));
        let outSec = Math.max(0, numero(raw.out, 0));
        let duration = Math.max(0, numero(raw.duration, 0));
        if (outSec > 0 && outSec <= inSec) outSec = 0;
        if (!outSec && duration > 0) outSec = duration;
        if (outSec > 0) duration = Math.max(duration, outSec);

        const gainDb = raw.gainDb != null
            ? clamp(numero(raw.gainDb, 0), -60, 24)
            : (raw.volumen != null ? linealADb(clamp(numero(raw.volumen, 1), 0, 1)) : 0);

        const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('clip');

        return {
            id,
            trackId,
            pista: trackId,
            src,
            asset,
            nombre: typeof raw.nombre === 'string' ? raw.nombre : '',
            start: Math.max(0, numero(raw.start != null ? raw.start : raw.startPosition, 0)),
            startPosition: Math.max(0, numero(raw.start != null ? raw.start : raw.startPosition, 0)),
            in: inSec,
            out: outSec,
            duration,
            gainDb,
            volumen: raw.volumen != null ? clamp(numero(raw.volumen, 1), 0, 1) : dbALineal(gainDb),
            pan: clamp(numero(raw.pan, 0), -1, 1),
            fadeIn: Math.max(0, numero(raw.fadeIn, 0)),
            fadeOut: Math.max(0, numero(raw.fadeOut, 0)),
            fadeCurve: raw.fadeCurve || 'tri',
            effects: raw.effects && typeof raw.effects === 'object' ? JSON.parse(JSON.stringify(raw.effects)) : {},
            automation: normalizarAutomatizacion(raw.automation),
            peaks: Array.isArray(raw.peaks) ? raw.peaks : null,
            peaksPoints: Array.isArray(raw.peaks) ? raw.peaks.length : 0,
            _orden: indice
        };
    }

    function normalizarClips(lista) {
        const resultado = [];
        const ids = new Set();

        for (let i = 0; i < lista.length; i++) {
            const clip = normalizarClip(lista[i], i);
            if (!clip) continue;
            if (ids.has(clip.id)) clip.id = uid('clip');
            ids.add(clip.id);
            resultado.push(clip);
        }

        resultado.sort((a, b) => {
            const oa = ORDEN_PISTAS[a.trackId] ?? 9;
            const ob = ORDEN_PISTAS[b.trackId] ?? 9;
            return oa - ob || a._orden - b._orden;
        });

        return resultado;
    }

    function normalizarEstado(data) {
        if (!data || typeof data !== 'object') return null;
        const lista = Array.isArray(data) ? data : data.clips;
        if (!Array.isArray(lista)) return null;

        const clips = normalizarClips(lista);
        const projectId = typeof data.projectId === 'string'
            ? data.projectId
            : (typeof data.id === 'string' && /^p-/.test(data.id) ? data.id : '');

        for (const clip of clips) {
            if (clip.src || !clip.asset || !projectId) continue;
            const limpio = String(clip.asset).replace(/^\/+/, '');
            clip.src = `/media/projects/${encodeURIComponent(projectId)}/${limpio.split('/').map(encodeURIComponent).join('/')}`;
        }

        const vivos = clips.filter((clip) => clip.src);
        if (clips.length && !vivos.length) return null;

        return {
            clips: vivos,
            tracks: Array.isArray(data.tracks) ? data.tracks : [],
            master: data.master || { gainDb: 0, limiter: true, loudness: { enabled: false } },
            zoomPx: clamp(numero(data.zoomPx, ZOOM_INICIAL), ZOOM_MIN, ZOOM_MAX),
            projectId,
            nombre: typeof data.nombre === 'string' && data.nombre ? data.nombre : 'Mezcla'
        };
    }

    function reconstruirTracks() {
        const previas = state.tracks;
        // Una pista vacía también puede tener ajustes que el usuario quiera conservar.
        state.tracks = new Map(previas);
        for (const clip of state.clips) {
            if (!state.tracks.has(clip.trackId)) {
                state.tracks.set(clip.trackId, previas.get(clip.trackId) || {
                    id: clip.trackId,
                    nombre: app.config.NOMBRE_TITULO[clip.trackId] || clip.trackId,
                    gainDb: 0,
                    pan: 0,
                    mute: false,
                    effects: {}
                });
            }
        }
    }

    function aplicarEstado(estado, opciones = {}) {
        state.clips = estado.clips.map((clip, i) => ({ ...clip, _orden: i }));
        state.zoomPx = estado.zoomPx;
        state.projectId = estado.projectId || '';
        state.nombre = estado.nombre || state.nombre;
        state.master = estado.master || state.master;
        state.tracks = new Map((estado.tracks || []).map((t) => [t.id, JSON.parse(JSON.stringify(t))]));
        if (state.selectedId && !state.clips.some((c) => c.id === state.selectedId)) state.selectedId = '';
        reconstruirTracks();
        if (opciones.guardar) guardarLocal();
        return state.clips;
    }

    function guardarLocal(opciones = {}) {
        if (opciones.historial !== false) registrarEstado();
        else if (!restaurando) historial[indiceHistorial] = snapshot();
        state.dirty = true;
        if (guardadoTimer) clearTimeout(guardadoTimer);
        guardadoTimer = setTimeout(() => {
            guardadoTimer = null;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    version: VERSION,
                    projectId: state.projectId,
                    nombre: state.nombre,
                    zoomPx: state.zoomPx,
                    clips: state.clips,
                    tracks: [...state.tracks.values()],
                    master: state.master
                }));
            } catch (e) {
                notificar('error', 'No se pudo guardar la mezcla localmente; exporta el proyecto para conservar los cambios');
            }
            if (app.project && state.projectId) app.project.autoguardar();
        }, 350);
    }

    function cargarLocal() {
        let datos = null;
        try { datos = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { datos = null; }
        if (!datos) {
            try { datos = JSON.parse(localStorage.getItem(STORAGE_KEY_LEGACY) || 'null'); } catch (e) { datos = null; }
        }
        const estado = normalizarEstado(datos);
        if (!estado) return null;
        aplicarEstado(estado, { guardar: false });
        return estado;
    }

    function agregarClip(trackId, src, opciones = {}) {
        if (!trackValido(trackId)) return null;
        const ruta = rutaServidorDe(src);
        if (!ruta) return null;

        if (opciones.reemplazar) {
            const existentes = state.clips.filter((c) => c.trackId === trackId);
            for (const existente of existentes) quitarClip(existente.id, { silencioso: true, guardar: false });
        }

        const clip = normalizarClip({
            id: opciones.id || uid('clip'),
            trackId,
            src: ruta,
            asset: opciones.asset || '',
            nombre: opciones.nombre || '',
            start: opciones.start != null ? opciones.start : 0,
            in: opciones.in || 0,
            out: opciones.out || 0,
            duration: opciones.duration || 0,
            gainDb: opciones.gainDb != null ? opciones.gainDb : 0,
            pan: opciones.pan || 0,
            fadeIn: opciones.fadeIn || 0,
            fadeOut: opciones.fadeOut || 0,
            automation: opciones.automation || [],
            effects: opciones.effects || {},
            fadeCurve: opciones.fadeCurve || 'tri',
            peaks: opciones.peaks || null
        }, state.clips.length);

        if (!clip) return null;
        state.clips.push(clip);
        reconstruirTracks();
        state.selectedId = clip.id;
        guardarLocal();
        return clip;
    }

    function quitarClip(id, opciones = {}) {
        const indice = state.clips.findIndex((c) => c.id === id);
        if (indice < 0) return false;
        state.clips.splice(indice, 1);
        if (state.selectedId === id) state.selectedId = '';
        reconstruirTracks();
        if (!opciones.silencioso) {
            notificar('info', 'Pista quitada');
        }
        if (opciones.guardar !== false) guardarLocal();
        return true;
    }

    function buscarClip(id) {
        return state.clips.find((c) => c.id === id) || null;
    }

    function indiceClip(id) {
        return state.clips.findIndex((c) => c.id === id);
    }

    function seleccionar(id) {
        state.selectedId = buscarClip(id) ? id : '';
        return buscarClip(state.selectedId);
    }

    function clipSeleccionado() {
        return buscarClip(state.selectedId);
    }

    function moverClip(id, inicio) {
        const clip = buscarClip(id);
        if (!clip || !Number.isFinite(Number(inicio)) || Number(inicio) < 0) return false;
        clip.start = clip.startPosition = Number(inicio);
        guardarLocal();
        return true;
    }

    function recortarClip(id, entrada, salida) {
        const clip = buscarClip(id);
        const a = Number(entrada), b = Number(salida);
        if (!clip || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b - a < 0.01 || b > clip.duration) return false;
        clip.in = a; clip.out = b;
        clip.fadeIn = Math.min(clip.fadeIn, b - a);
        clip.fadeOut = Math.min(clip.fadeOut, b - a);
        guardarLocal();
        return true;
    }

    function dividirClip(id, tiempo) {
        const clip = buscarClip(id);
        const offset = Number(tiempo) - (clip ? clip.start : 0);
        if (!clip || !Number.isFinite(offset) || offset < 0.01 || duracionClip(clip) - offset < 0.01) return null;
        // No cambiar silenciosamente la forma de un fade al dividirlo por la mitad.
        if (offset < clip.fadeIn || duracionClip(clip) - offset < clip.fadeOut) return null;
        const corte = clip.in + offset;
        const derecho = normalizarClip({ ...clip, id: uid('clip'), start: Number(tiempo), in: corte,
            fadeIn: 0 }, state.clips.length);
        clip.out = corte;
        clip.fadeOut = 0;
        clip.fadeIn = Math.min(clip.fadeIn, offset);
        derecho.fadeOut = Math.min(derecho.fadeOut, duracionClip(derecho));
        state.clips.push(derecho);
        state.selectedId = derecho.id;
        guardarLocal();
        return derecho;
    }

    function copiarClip(id) {
        const clip = buscarClip(id);
        if (!clip) return false;
        portapapeles = JSON.parse(JSON.stringify(clip));
        return true;
    }

    function pegarClip(tiempo) {
        if (!portapapeles || !Number.isFinite(Number(tiempo)) || Number(tiempo) < 0) return null;
        return agregarClip(portapapeles.trackId, portapapeles.src,
            { ...JSON.parse(JSON.stringify(portapapeles)), id: uid('clip'), start: Number(tiempo), reemplazar: false });
    }

    function cortarClip(id) {
        if (!copiarClip(id)) return false;
        return quitarClip(id, { silencioso: true });
    }

    function duplicarClip(id) {
        const clip = buscarClip(id);
        if (!clip) return null;
        const anterior = portapapeles;
        copiarClip(id);
        const nuevo = pegarClip(clip.start + duracionClip(clip));
        portapapeles = anterior;
        return nuevo;
    }

    function limpiar() {
        state.clips = [];
        state.tracks = new Map();
        state.selectedId = '';
        state.projectId = '';
        state.nombre = 'Mezcla';
        state.master = { gainDb: 0, limiter: true, loudness: { enabled: false } };
        guardarLocal();
    }

    function duracionClip(clip) {
        if (clip.out > clip.in) return clip.out - clip.in;
        return Math.max(0, clip.duration - clip.in);
    }

    function duracionProyecto() {
        let max = 0;
        for (const clip of state.clips) {
            max = Math.max(max, clip.start + duracionClip(clip));
        }
        return max;
    }

    function aProyecto() {
        const clips = state.clips.map((c) => ({
            id: c.id,
            trackId: c.trackId,
            asset: c.asset || '',
            src: c.src,
            nombre: c.nombre || '',
            start: Number(c.start.toFixed(4)),
            in: Number(c.in.toFixed(4)),
            out: Number(c.out.toFixed(4)),
            duration: Number(c.duration.toFixed(4)),
            gainDb: Number(c.gainDb.toFixed(2)),
            pan: Number(c.pan.toFixed(3)),
            fadeIn: Number(c.fadeIn.toFixed(3)),
            fadeOut: Number(c.fadeOut.toFixed(3)),
            fadeCurve: c.fadeCurve,
            effects: c.effects || {},
            automation: c.automation.map((p) => ({
                id: p.id,
                t: Number(p.t.toFixed(3)),
                gain: Number(p.gain.toFixed(4))
            }))
        }));

        const assets = [];
        const vistos = new Set();
        for (const clip of state.clips) {
            if (!clip.asset || vistos.has(clip.asset)) continue;
            vistos.add(clip.asset);
            assets.push({ asset: clip.asset, nombre: clip.nombre || '' });
        }

        return {
            app: 'loquendo-studio',
            tipo: 'mezcla',
            version: VERSION,
            id: state.projectId || undefined,
            projectId: state.projectId || undefined,
            nombre: state.nombre,
            zoomPx: state.zoomPx,
            duration: Number(duracionProyecto().toFixed(3)),
            master: state.master,
            tracks: [...state.tracks.values()],
            clips,
            assets
        };
    }

    function importarProyecto(datos) {
        const estado = normalizarEstado(datos);
        if (!estado) return null;

        const projectId = estado.projectId || (datos && typeof datos.projectId === 'string' ? datos.projectId : '');
        if (projectId) {
            for (const clip of estado.clips) {
                if (!clip.asset || clip.src) continue;
                const limpio = String(clip.asset).replace(/^\/+/, '');
                clip.src = `/media/projects/${encodeURIComponent(projectId)}/${limpio.split('/').map(encodeURIComponent).join('/')}`;
            }
        }

        aplicarEstado({ ...estado, projectId }, { guardar: false });
        return estado;
    }

    registrarEstado();
    app.store = {
        moverClip, recortarClip, dividirClip, copiarClip, pegarClip, cortarClip, duplicarClip,
        deshacer: () => restaurarHistorial(-1),
        rehacer: () => restaurarHistorial(1),
        puedeDeshacer: () => indiceHistorial > 0,
        puedeRehacer: () => indiceHistorial < historial.length - 1,
        state,
        normalizarEstado,
        normalizarClips,
        aplicarEstado,
        guardarLocal,
        cargarLocal,
        agregarClip,
        quitarClip,
        buscarClip,
        indiceClip,
        seleccionar,
        clipSeleccionado,
        limpiar,
        duracionClip,
        duracionProyecto,
        aProyecto,
        importarProyecto,
        reconstruirTracks
    };
})(window);
