// services/mixer/transport.js - Reproducción y zoom del mezclador
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { state } = app.store;
    const { notificar, clamp } = app.util;

    function play() {
        const mt = app.timeline.getMultitrack();
        if (!mt || !state.clips.length) {
            notificar('warning', 'Añade alguna pista antes de reproducir la mezcla');
            return;
        }
        try { mt.play(); } catch (e) { console.error('Mixer play', e); }
    }

    function pausa() {
        const mt = app.timeline.getMultitrack();
        if (!mt) return;
        try { mt.pause(); } catch (e) { /* noop */ }
    }

    function detener() {
        const mt = app.timeline.getMultitrack();
        if (!mt) return;
        try { mt.pause(); mt.setTime(0); } catch (e) { /* noop */ }
    }

    function irA(segundos) {
        const mt = app.timeline.getMultitrack();
        if (!mt) return;
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
