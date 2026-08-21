// services/videoService.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class VideoService {
    constructor(ffmpegPath, audioFolder, pngtuberFolder) {
        this.ffmpegPath = ffmpegPath;
        this.audioFolder = audioFolder;        // Ya resuelto por server.js
        this.pngtuberFolder = pngtuberFolder;  // Ya resuelto por server.js
    }

    normalizarRutaImagen(rutaImagen) {
        if (!rutaImagen) return null;

        // ✅ CORRECCIÓN: Limpiar la ruta relativa
        const limpia = String(rutaImagen)
            .replace(/^\/+/, '')
            .replace(/^public\//i, '')
            .replace(/^pngtuber\//i, '');

        // 1. Buscar en pngtuberFolder (la carpeta real de uploads, fuera del ASAR)
        const rutaEnPngtuber = path.join(this.pngtuberFolder, path.basename(limpia));
        if (fs.existsSync(rutaEnPngtuber)) return rutaEnPngtuber;

        // 2. Buscar con la ruta limpia completa dentro de pngtuberFolder
        const rutaCompleta = path.join(this.pngtuberFolder, limpia);
        if (fs.existsSync(rutaCompleta)) return rutaCompleta;

        return null;
    }

    async generarPNGTuber(audioPathAbsoluto, opciones = {}) {
        return new Promise((resolve, reject) => {
            // ✅ CORRECCIÓN: Usar this.pngtuberFolder en lugar de __dirname
            const idleFile = this.normalizarRutaImagen(opciones.idleImagePath) 
                || path.join(this.pngtuberFolder, 'idle.png');
            const talkingFile = this.normalizarRutaImagen(opciones.talkingImagePath) 
                || idleFile;

            const idleImage = idleFile;
            const talkingImage = talkingFile;

            if (!fs.existsSync(idleImage)) {
                return reject(new Error('Falta la imagen PNGTuber idle. Sube una imagen o usa el valor por defecto.'));
            }

            // ✅ CORRECCIÓN: audioPathAbsoluto ya es absoluto y validado por server.js
            const audioCompleto = audioPathAbsoluto;

            if (!fs.existsSync(audioCompleto)) {
                return reject(new Error(`El archivo de audio no existe: ${audioCompleto}`));
            }

            const nombreVideo = `pngtuber-${Date.now()}.mp4`;
            const rutaVideo = path.join(this.audioFolder, nombreVideo);

            console.log('🎬 Generando video PNGTuber con FONDO VERDE...');
            console.log(`  idle: ${idleImage} | Existe: ${fs.existsSync(idleImage)}`);
            console.log(`  talking: ${talkingImage} | Existe: ${fs.existsSync(talkingImage)}`);
            console.log(`  audio: ${audioCompleto} | Existe: ${fs.existsSync(audioCompleto)}`);

            const usarTalking = fs.existsSync(talkingImage) && talkingImage !== idleImage;
            const imagenBase = usarTalking ? talkingImage : idleImage;

            const ffmpegArgs = [
                '-i', audioCompleto,
                '-loop', '1',
                '-i', imagenBase,
                '-filter_complex', 
                // 1. Crear fondo verde sólido
                `color=c=#00FF00:s=1280x720:d=1000[green];` +
                // 2. Escalar la imagen PNGTuber
                `[1:v]scale=1280:720:force_original_aspect_ratio=decrease[png];` +
                // 3. Superponer PNG sobre fondo verde
                `[green][png]overlay=(W-w)/2:(H-h)/2[video]`,
                '-map', '[video]',
                '-map', '0:a',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-y',
                rutaVideo
            ];

            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, { 
                windowsHide: true, 
                shell: false 
            });

            let stderr = '';
            ffmpegProcess.stderr.on('data', (data) => { stderr += data.toString(); });

            ffmpegProcess.on('close', (code) => {
                if (code === 0 && fs.existsSync(rutaVideo)) {
                    console.log(`✅ Video PNGTuber con fondo verde generado: ${nombreVideo}`);
                    resolve({ video: `/audios/${nombreVideo}` });
                } else {
                    console.error('❌ Error al generar video. Código:', code);
                    console.error('FFmpeg stderr:', stderr);
                    reject(new Error(`No se pudo generar el video. Detalles: ${stderr.substring(0, 1000)}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error(`Error de FFmpeg: ${err.message}`));
            });
        });
    }
}

module.exports = VideoService;