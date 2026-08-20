// services/videoService.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class VideoService {
    constructor(ffmpegPath, audioFolder, pngtuberFolder) {
        this.ffmpegPath = ffmpegPath;
        this.audioFolder = audioFolder;
        this.pngtuberFolder = pngtuberFolder;
    }

    normalizarRutaImagen(rutaImagen) {
        if (!rutaImagen) return null;

        const limpia = String(rutaImagen).replace(/^\/+/, '').replace(/^public\//i, '');
        const rutaCompleta = path.join(__dirname, '..', 'public', limpia);

        if (fs.existsSync(rutaCompleta)) return rutaCompleta;

        const fallback = path.join(this.pngtuberFolder, path.basename(limpia));
        if (fs.existsSync(fallback)) return fallback;

        return null;
    }

    async generarPNGTuber(audioPathRelativo, opciones = {}) {
        return new Promise((resolve, reject) => {
            const idleFile = this.normalizarRutaImagen(opciones.idleImagePath || '/pngtuber/idle.png') || path.join(this.pngtuberFolder, 'idle.png');
            const talkingFile = this.normalizarRutaImagen(opciones.talkingImagePath || '/pngtuber/talking.png') || idleFile;
            const idleImage = idleFile;
            const talkingImage = talkingFile;

            if (!fs.existsSync(idleImage)) {
                return reject(new Error('Falta la imagen PNGTuber idle. Sube una imagen o usa el valor por defecto.'));
            }

            const audioCompleto = path.join(__dirname, '..', 'public', String(audioPathRelativo || '').replace(/^\/+/, '').replace(/^public\//i, ''));
            
            if (!fs.existsSync(audioCompleto)) {
                return reject(new Error(`El archivo de audio no existe: ${audioCompleto}`));
            }

            const nombreVideo = `pngtuber-${Date.now()}.mp4`;
            const rutaVideo = path.join(this.audioFolder, nombreVideo);

            console.log('🎬 Generando video PNGTuber con FONDO VERDE...');
            console.log(`  idle: ${idleImage}`);
            console.log(`  talking: ${talkingImage}`);

            const usarTalking = fs.existsSync(talkingImage) && talkingImage !== idleImage;
            const imagenBase = usarTalking ? talkingImage : idleImage;
//ffmpeg comandos de video
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
                    reject(new Error(`No se pudo generar el video. Detalles: ${stderr}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error(`Error de FFmpeg: ${err.message}`));
            });
        });
    }
}

// ✅ ESTO ES LO QUE FALTA - AGREGA ESTA LÍNEA AL FINAL
module.exports = VideoService;