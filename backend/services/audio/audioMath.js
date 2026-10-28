// services/audio/audioMath.js - Utilidades numéricas compartidas por los servicios de audio
'use strict';

function numero(valor, def, rango) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return def;
    if (!rango) return n;
    return Math.min(rango[1], Math.max(rango[0], n));
}

function dbALineal(db) {
    return Math.pow(10, db / 20);
}

function linealADb(valor) {
    return 20 * Math.log10(Math.max(1e-9, Number(valor) || 0));
}

function limitar(valor, min, max) {
    return Math.min(max, Math.max(min, valor));
}

function formatearNumero(valor, decimales = 6) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return '0';
    return Number(n.toFixed(decimales)).toString();
}

module.exports = { numero, dbALineal, linealADb, limitar, formatearNumero };
