'use strict';
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const ejecutar = promisify(execFile);

// Lee y decodifica, sin escribir ni normalizar el archivo original.
async function validarAudio(file, ffprobe, ffmpeg, extensiones = ['.wav', '.mp3']) {
    if (!extensiones.includes(path.extname(file).toLowerCase())) throw new Error('Formato de audio no compatible');
    const stat = await fs.stat(file);
    if (!stat.isFile() || !stat.size || stat.size > 1024 ** 3) throw new Error('El audio debe ser un archivo de hasta 1 GB');
    const opciones = { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 };
    try {
        const { stdout } = await ejecutar(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', file], opciones);
        const info = JSON.parse(stdout), stream = info.streams?.find(s => s.codec_type === 'audio');
        const duration = Number(stream?.duration || info.format?.duration);
        if (!stream || !Number.isFinite(duration) || duration <= 0) throw new Error('Sin audio o duración válida');
        await ejecutar(ffmpeg, ['-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', file, '-map', '0:a:0', '-f', 'null', '-'], opciones);
        return { duration, size: stat.size };
    } catch (error) {
        throw new Error('El archivo no contiene audio válido o no se pudo decodificar');
    }
}
module.exports = { validarAudio };
