// services/audio/peaksService.js - Picos de onda bajo demanda con caché en disco
'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RATE = 8000;
const PUNTOS_MIN = 100;
const PUNTOS_MAX = 20000;
const BYTES_MAX = 256 * 1024 * 1024;

function limitar(valor, min, max) {
    return Math.min(max, Math.max(min, valor));
}

function claveCache(archivo, stats, opciones) {
    const base = [
        path.resolve(archivo),
        stats.size,
        Math.round(stats.mtimeMs),
        opciones.inSec,
        opciones.outSec,
        opciones.points,
        RATE,
        'v1'
    ].join('|');
    return crypto.createHash('sha256').update(base).digest('hex');
}

class PeaksService {
    constructor(ffmpegPath, cacheDir) {
        this.ffmpegPath = ffmpegPath;
        this.cacheDir = path.join(cacheDir, 'peaks');
        fs.mkdirSync(this.cacheDir, { recursive: true });
        this.memoria = new Map();
    }

    _leerCache(ruta) {
        try {
            return JSON.parse(fs.readFileSync(ruta, 'utf8'));
        } catch (error) {
            return null;
        }
    }

    _guardarCache(ruta, datos) {
        const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
        fs.promises.writeFile(temporal, JSON.stringify(datos), 'utf8')
            .then(() => fs.promises.rename(temporal, ruta))
            .catch(() => { fs.promises.unlink(temporal).catch(() => {}); });
    }

    _limpiarCacheAntigua() {
        try {
            const archivos = fs.readdirSync(this.cacheDir)
                .map((nombre) => {
                    const ruta = path.join(this.cacheDir, nombre);
                    try { return { ruta, mtime: fs.statSync(ruta).mtimeMs }; } catch (e) { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => b.mtime - a.mtime);

            for (const archivo of archivos.slice(400)) {
                fs.promises.unlink(archivo.ruta).catch(() => {});
            }
        } catch (error) {
            /* noop */
        }
    }

    _decodificar(archivo, opciones) {
        return new Promise((resolve, reject) => {
            const args = ['-v', 'error', '-nostdin'];
            if (opciones.inSec > 0) args.push('-ss', String(opciones.inSec));
            if (opciones.outSec !== null) {
                const duracion = Math.max(0, opciones.outSec - opciones.inSec);
                if (duracion > 0) args.push('-t', String(duracion));
            }
            args.push(
                '-i', archivo,
                '-map', '0:a:0',
                '-ac', '1',
                '-ar', String(RATE),
                '-f', 's16le',
                'pipe:1'
            );

            const proceso = spawn(this.ffmpegPath, args, { windowsHide: true, shell: false });
            const trozos = [];
            let bytes = 0;
            let stderr = '';
            let terminado = false;

            const timer = setTimeout(() => {
                if (terminado) return;
                terminado = true;
                try { proceso.kill(); } catch (e) { /* noop */ }
                reject(new Error('FFmpeg excedió el tiempo máximo calculando picos'));
            }, 2 * 60 * 1000);

            proceso.stdout.on('data', (d) => {
                bytes += d.length;
                if (bytes > BYTES_MAX) {
                    try { proceso.kill(); } catch (e) { /* noop */ }
                    if (!terminado) {
                        terminado = true;
                        clearTimeout(timer);
                        reject(new Error('El audio es demasiado largo para calcular picos'));
                    }
                    return;
                }
                trozos.push(d);
            });

            proceso.stderr.on('data', (d) => {
                if (stderr.length < 8000) stderr += d.toString();
            });

            proceso.on('error', (error) => {
                if (terminado) return;
                terminado = true;
                clearTimeout(timer);
                reject(error);
            });

            proceso.on('close', (code) => {
                if (terminado) return;
                terminado = true;
                clearTimeout(timer);
                if (code !== 0) {
                    reject(new Error('FFmpeg falló calculando picos: ' + stderr.slice(-600)));
                    return;
                }
                resolve(Buffer.concat(trozos, bytes));
            });
        });
    }

    _calcularPicos(buffer, points) {
        const muestras = Math.floor(buffer.length / 2);
        if (muestras <= 0) return { peaks: [], duration: 0 };

        const ventana = Math.max(1, Math.floor(muestras / points));
        const peaks = [];
        for (let inicio = 0; inicio < muestras; inicio += ventana) {
            const fin = Math.min(muestras, inicio + ventana);
            let maximo = 0;
            for (let i = inicio; i < fin; i++) {
                const valor = Math.abs(buffer.readInt16LE(i * 2));
                if (valor > maximo) maximo = valor;
            }
            peaks.push(maximo / 32768);
        }

        return { peaks, duration: muestras / RATE };
    }

    async obtener(archivo, opciones = {}) {
        const stats = fs.statSync(archivo);
        if (!stats.isFile()) throw new Error('El audio no existe');
        if (stats.size === 0) throw new Error('El audio está vacío');

        const points = Math.round(limitar(Number(opciones.points) || 4000, PUNTOS_MIN, PUNTOS_MAX));
        const inSec = Math.max(0, Number(opciones.inSec) || 0);
        const outRaw = Number(opciones.outSec);
        const outSec = Number.isFinite(outRaw) && outRaw > inSec ? outRaw : null;

        const clave = claveCache(archivo, stats, { points, inSec, outSec });
        const enMemoria = this.memoria.get(clave);
        if (enMemoria) return enMemoria;

        const rutaCache = path.join(this.cacheDir, clave + '.json');
        const cacheado = this._leerCache(rutaCache);
        if (cacheado && Array.isArray(cacheado.peaks) && cacheado.peaks.length) {
            this.memoria.set(clave, cacheado);
            if (this.memoria.size > 80) this.memoria.delete(this.memoria.keys().next().value);
            return cacheado;
        }

        const buffer = await this._decodificar(archivo, { inSec, outSec });
        const { peaks, duration } = this._calcularPicos(buffer, points);
        if (!peaks.length) throw new Error('No se pudieron calcular picos (¿el archivo tiene audio?)');

        const resultado = {
            peaks,
            duration,
            points: peaks.length,
            sampleRate: RATE,
            inSec,
            outSec: outSec === null ? inSec + duration : outSec,
            version: 1
        };

        this.memoria.set(clave, resultado);
        if (this.memoria.size > 80) this.memoria.delete(this.memoria.keys().next().value);
        this._guardarCache(rutaCache, resultado);
        this._limpiarCacheAntigua();
        return resultado;
    }
}

module.exports = { PeaksService };
