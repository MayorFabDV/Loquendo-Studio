// services/mixer/config.js - Constantes y utilidades compartidas del mezclador
(function (global) {
    'use strict';

    const app = global.MixerApp = global.MixerApp || {};

    app.config = {
        STORAGE_KEY: 'loquendo.mezcla.v2',
        STORAGE_KEY_LEGACY: 'loquendo.mezcla.v1',
        VERSION: 2,
        COLORES: {
            voz: { wave: '#e41a1a', progress: '#ff0037', chip: 'rgba(228, 26, 26, 0.85)' },
            musica: { wave: '#8e44ad', progress: '#9b59b6', chip: 'rgba(142, 68, 173, 0.85)' },
            sfx: { wave: '#0e9594', progress: '#22b573', chip: 'rgba(14, 149, 148, 0.85)' }
        },
        ALTURAS: { voz: 76, musica: 64, sfx: 58 },
        NOMBRE_TITULO: { voz: 'Voz', musica: 'Música', sfx: 'SFX' },
        ORDEN_PISTAS: { voz: 0, musica: 1, sfx: 2 },
        ZOOM_INICIAL: 80,
        ZOOM_MIN: 10,
        ZOOM_MAX: 480,
        PEAKS_POINTS: 2200,
        CURVAS_FADE: ['tri', 'qsin', 'hsin', 'esin', 'log', 'ipar', 'qua', 'cub', 'squ', 'cbr', 'par', 'exp', 'iqsin', 'ihsin', 'dese', 'desi', 'losi', 'sinc', 'isinc', 'linear']
    };

    const util = app.util = {};

    util.baseAPI = function () {
        try {
            return (global.CONFIG && global.CONFIG.API_BASE) || '';
        } catch (e) {
            return '';
        }
    };

    util.rutaServidorDe = function (ruta) {
        let r = String(ruta || '');
        if (!r || /^(blob:|data:)/i.test(r)) return '';
        if (/^https?:/i.test(r)) {
            try { r = new URL(r).pathname; } catch (error) { return ''; }
        }
        return r.split('?')[0].split('#')[0].replace(/\\/g, '/');
    };

    util.urlCompleta = function (srcRelativa) {
        const r = String(srcRelativa || '');
        return /^https?:/i.test(r) ? r : `${util.baseAPI()}${r}`;
    };

    util.notificar = function (tipo, mensaje) {
        if (global.notifications && typeof global.notifications[tipo] === 'function') {
            global.notifications[tipo](mensaje);
        } else {
            console.log('[Mixer]', tipo, mensaje);
        }
    };

    util.clamp = function (valor, min, max) {
        return Math.min(max, Math.max(min, Number(valor) || 0));
    };

    util.numero = function (valor, def) {
        const n = Number(valor);
        return Number.isFinite(n) ? n : def;
    };

    util.dbALineal = function (db) {
        return Math.pow(10, util.clamp(db, -60, 24) / 20);
    };

    util.linealADb = function (valor) {
        const v = util.clamp(valor, 0, 1);
        if (v <= 0.000001) return -60;
        return util.clamp(20 * Math.log10(v), -60, 24);
    };

    util.percentDeDb = function (db) {
        return Math.round(util.dbALineal(db) * 100);
    };

    util.dbDePercent = function (percent) {
        return util.linealADb(util.clamp(percent, 0, 100) / 100);
    };

    util.uid = function (prefijo) {
        return `${prefijo || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    };

    util.tiempo = function (segundos) {
        const total = Math.max(0, Number(segundos) || 0);
        const min = Math.floor(total / 60);
        const seg = Math.floor(total - min * 60);
        return `${min}:${String(seg).padStart(2, '0')}`;
    };

    util.extension = function (nombre) {
        const idx = String(nombre || '').lastIndexOf('.');
        return idx > -1 ? String(nombre).slice(idx + 1).toLowerCase() : '';
    };

    util.head = async function (src) {
        try {
            const url = util.urlCompleta(src);
            const respuesta = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { method: 'HEAD' });
            return respuesta.ok;
        } catch (e) {
            return false;
        }
    };
})(window);
