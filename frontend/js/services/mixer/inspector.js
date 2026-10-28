// services/mixer/inspector.js - Propiedades del clip seleccionado (volumen, pan, fades, automatización)
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { state } = app.store;
    const { clamp, dbALineal, percentDeDb } = app.util;

    let iniciado = false;
    let porId = {};

    function $(id) { return document.getElementById(id); }

    function seleccionar(id) {
        app.store.seleccionar(id);
        if (app.timeline) app.timeline.decorarPistas();
        refresh();
    }

    function clipActual() {
        return state.selectedId ? app.store.buscarClip(state.selectedId) : null;
    }

    function habilitar(activo) {
        for (const id of Object.values(porId)) {
            if (id && 'disabled' in id) id.disabled = !activo;
        }
    }

    function refresh() {
        const clip = clipActual();
        const panel = $('mezcladorInspector');
        if (!panel) return;

        const nombre = $('mezcladorInspectorNombre');
        if (!clip) {
            if (nombre) nombre.textContent = 'Selecciona un clip en la línea de tiempo';
            habilitar(false);
            return;
        }

        habilitar(true);
        const titulo = app.config.NOMBRE_TITULO[clip.trackId] || clip.trackId;
        if (nombre) nombre.textContent = `${titulo}${clip.nombre ? ' · ' + clip.nombre : ''}`;

        const volumen = $('mixerInspVolumen');
        if (volumen) volumen.value = String(percentDeDb(clip.gainDb));
        const volumenValor = $('mixerInspVolumenValor');
        if (volumenValor) {
            const pct = percentDeDb(clip.gainDb);
            volumenValor.textContent = pct === 0 ? 'Silencio' : `${pct}% · ${clip.gainDb.toFixed(1)} dB`;
        }

        const pan = $('mixerInspPan');
        if (pan) pan.value = String(Math.round(clip.pan * 100));
        const panValor = $('mixerInspPanValor');
        if (panValor) {
            const v = Math.round(clip.pan * 100);
            panValor.textContent = Math.abs(v) < 1 ? 'Centro' : (v < 0 ? `Izq. ${Math.abs(v)}%` : `Der. ${v}%`);
        }

        const fadeIn = $('mixerInspFadeIn');
        if (fadeIn) fadeIn.value = String(Number((clip.fadeIn || 0).toFixed(2)));
        const fadeOut = $('mixerInspFadeOut');
        if (fadeOut) fadeOut.value = String(Number((clip.fadeOut || 0).toFixed(2)));

        const auto = $('mixerInspAuto');
        if (auto) {
            const n = clip.automation.length;
            auto.textContent = n ? `${n} punto(s) de automatización` : 'Sin automatización';
        }

        const info = $('mezcladorInspectorInfo');
        if (info) {
            const dur = app.timeline.duracionFuente(clip);
            info.textContent = `${app.util.tiempo(dur)} · inicio ${app.util.tiempo(clip.start)} · in ${clip.in.toFixed(2)}s · out ${(clip.out || clip.duration || 0).toFixed(2)}s`;
        }
    }

    function init() {
        if (iniciado) return;
        iniciado = true;

        porId = {
            volumen: $('mixerInspVolumen'),
            pan: $('mixerInspPan'),
            fadeIn: $('mixerInspFadeIn'),
            fadeOut: $('mixerInspFadeOut'),
            auto: $('mixerInspAuto'),
            limpiarAuto: $('mixerInspLimpiarAuto'),
            agregarAuto: $('mixerInspAgregarAuto')
        };

        if (porId.volumen) {
            porId.volumen.addEventListener('input', () => {
                const clip = clipActual();
                if (clip) app.timeline.aplicarVolumen(clip.id, Number(porId.volumen.value));
            });
        }

        if (porId.pan) {
            porId.pan.addEventListener('input', () => {
                const clip = clipActual();
                if (clip) app.timeline.aplicarPan(clip.id, Number(porId.pan.value) / 100);
            });
        }

        if (porId.fadeIn) {
            porId.fadeIn.addEventListener('change', () => {
                const clip = clipActual();
                if (clip) app.timeline.aplicarFade(clip.id, 'in', Number(porId.fadeIn.value));
            });
        }

        if (porId.fadeOut) {
            porId.fadeOut.addEventListener('change', () => {
                const clip = clipActual();
                if (clip) app.timeline.aplicarFade(clip.id, 'out', Number(porId.fadeOut.value));
            });
        }

        const agregar = $('mixerInspAgregarAuto');
        if (agregar) {
            agregar.addEventListener('click', () => {
                const clip = clipActual();
                if (clip) app.timeline.agregarPunto(clip.id);
            });
        }

        const limpiar = $('mixerInspLimpiarAuto');
        if (limpiar) {
            limpiar.addEventListener('click', () => {
                const clip = clipActual();
                if (clip) app.timeline.limpiarAutomatizacion(clip.id);
            });
        }

        refresh();
    }

    app.inspector = { init, seleccionar, refresh };
})(window);
