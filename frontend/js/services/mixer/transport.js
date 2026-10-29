// services/mixer/transport.js - Reproducción y zoom del mezclador
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { state } = app.store;
    const { notificar, clamp } = app.util;
    let finFrame = null;
    let tokenPlay = 0;

    function cancelarFin() {
        if (finFrame != null) global.cancelAnimationFrame(finFrame);
        finFrame = null;
    }

    function esperarAudio(audio) {
        if (!(audio instanceof global.HTMLMediaElement) || !audio.src || audio.readyState >= 2) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const terminar = (error) => {
                clearTimeout(timer);
                audio.removeEventListener('canplay', listo);
                audio.removeEventListener('error', fallo);
                if (error) reject(error); else resolve();
            };
            const listo = () => terminar();
            const fallo = () => terminar(new Error('No se pudo cargar el audio de la mezcla'));
            const timer = global.setTimeout(() => terminar(new Error('Tiempo de espera de audio agotado')), 10000);
            audio.addEventListener('canplay', listo, { once: true });
            audio.addEventListener('error', fallo, { once: true });
        });
    }

    async function play() {
        const token = ++tokenPlay;
        const mt = app.timeline.getMultitrack();
        if (!mt || !state.clips.length || !app.timeline.estaListo()) {
            notificar('warning', 'Añade un clip y espera a que termine de cargar antes de reproducir');
            return;
        }
        try {
            if (global.audioEditor) global.audioEditor.pause();
            if (mt.getCurrentTime() >= app.store.duracionProyecto()) mt.setTime(0);
            // Seek puede volver a dejar el media en HAVE_METADATA durante un instante.
            await Promise.all(mt.audios.map(esperarAudio));
            if (token !== tokenPlay || mt !== app.timeline.getMultitrack() || !app.timeline.estaListo()) return;
            await app.timeline.resumePreview();
            if (token !== tokenPlay || mt !== app.timeline.getMultitrack()) return;
            await mt.play();
            cancelarFin();
            const comprobarFin = () => {
                if (mt !== app.timeline.getMultitrack()) return;
                const fin = app.store.duracionProyecto();
                if (mt.getCurrentTime() >= fin) { mt.pause(); mt.setTime(fin); cancelarFin(); return; }
                finFrame = global.requestAnimationFrame(comprobarFin);
            };
            finFrame = global.requestAnimationFrame(comprobarFin);
        } catch (e) { console.error('Mixer play', e); }
    }

    function pausa() {
        tokenPlay++;
        cancelarFin();
        const mt = app.timeline.getMultitrack();
        if (!mt) return;
        try { mt.pause(); } catch (e) { /* noop */ }
    }

    function detener() {
        tokenPlay++;
        cancelarFin();
        const mt = app.timeline.getMultitrack();
        if (!mt) return;
        try { mt.pause(); mt.setTime(0); } catch (e) { /* noop */ }
    }

    function irA(segundos) {
        const mt = app.timeline.getMultitrack();
        if (!mt || !app.timeline.estaListo()) return;
        try { mt.setTime(clamp(segundos, 0, app.store.duracionProyecto())); } catch (e) { /* noop */ }
    }

    function tiempoActual() {
        const mt = app.timeline.getMultitrack();
        try { return mt ? mt.getCurrentTime() : 0; } catch (e) { return 0; }
    }

    function zoomIn() {
        app.timeline.zoom(state.zoomPx * 1.3);
    }

    function zoomOut() {
        app.timeline.zoom(state.zoomPx / 1.3);
    }

    function zoomReset() {
        app.timeline.zoom(app.config.ZOOM_INICIAL);
    }

    app.transport = { play, pausa, detener, irA, tiempoActual, zoomIn, zoomOut, zoomReset };
})(window);
