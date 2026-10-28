// services/audio/ffmpegProcess.js - Ejecución de FFmpeg/FFprobe sin duplicar lógica
'use strict';

const { spawn } = require('child_process');

const TIMEOUT_POR_DEFECTO = 10 * 60 * 1000;

function ejecutar(binario, args, opciones = {}) {
    const timeoutMs = Number(opciones.timeoutMs) > 0 ? Number(opciones.timeoutMs) : TIMEOUT_POR_DEFECTO;
    const maxBuffer = Number(opciones.maxBuffer) > 0 ? Number(opciones.maxBuffer) : 64 * 1024 * 1024;

    return new Promise((resolve, reject) => {
        const proceso = spawn(binario, args, { windowsHide: true, shell: false });
        const trozosSalida = [];
        const trozosError = [];
        let bytesSalida = 0;
        let bytesError = 0;
        let terminado = false;

        const finalizar = (fn, valor) => {
            if (terminado) return;
            terminado = true;
            clearTimeout(timer);
            fn(valor);
        };

        const timer = setTimeout(() => {
            try { proceso.kill(); } catch (e) { /* noop */ }
            finalizar(reject, new Error('FFmpeg excedió el tiempo máximo de ejecución'));
        }, timeoutMs);

        proceso.stdout.on('data', (d) => {
            if (bytesSalida < maxBuffer) {
                trozosSalida.push(d);
                bytesSalida += d.length;
            }
            if (typeof opciones.onStdout === 'function') opciones.onStdout(d);
        });

        proceso.stderr.on('data', (d) => {
            if (bytesError < maxBuffer) {
                trozosError.push(d);
                bytesError += d.length;
            }
            if (typeof opciones.onStderr === 'function') opciones.onStderr(d);
        });

        proceso.on('error', (err) => finalizar(reject, err));

        proceso.on('close', (code, signal) => {
            finalizar(resolve, {
                code,
                signal,
                stdout: Buffer.concat(trozosSalida).toString(),
                stderr: Buffer.concat(trozosError).toString()
            });
        });
    });
}

function duracion(ffprobePath, archivo) {
    return new Promise((resolve) => {
        const proceso = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            archivo
        ], { windowsHide: true, shell: false });

        let salida = '';
        proceso.stdout.on('data', (d) => { salida += d.toString(); });
        proceso.on('error', () => resolve(0));
        proceso.on('close', () => {
            const valor = parseFloat(String(salida).trim());
            resolve(Number.isFinite(valor) && valor > 0 ? valor : 0);
        });
    });
}

module.exports = { ejecutar, duracion, TIMEOUT_POR_DEFECTO };
