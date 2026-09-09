// services/videoService.js - VERSIÓN FINAL CON COMAS ESCAPADAS
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
        const limpia = String(rutaImagen)
            .replace(/^[\/\\]+/, '')
            .replace(/^public[\/\\]/i, '')
            .replace(/^pngtuber[\/\\]/i, '');
        const basename = path.basename(limpia);
        if (!basename) return null;
        const rutaEnPngtuber = path.join(this.pngtuberFolder, basename);
        if (fs.existsSync(rutaEnPngtuber)) return rutaEnPngtuber;
        return null;
    }

    async detectarSegmentosVoz(rutaAudio) {
        return new Promise((resolve, reject) => {
            const args = ['-i', rutaAudio, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-'];
            const proceso = spawn(this.ffmpegPath, args, { windowsHide: true, shell: false });
            let stderr = '';
            proceso.stderr.on('data', (data) => { stderr += data.toString(); });
            proceso.on('close', (code) => {
                const silenceStarts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
                const silenceEnds = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
                const duracionMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                let duracionTotal = 0;
                if (duracionMatch) {
                    duracionTotal = parseInt(duracionMatch[1]) * 3600 + parseInt(duracionMatch[2]) * 60 + parseFloat(duracionMatch[3]);
                }
                if (duracionTotal <= 0) duracionTotal = 60;
                
                const segmentosVoz = [];
                let tiempoActual = 0;
                for (let i = 0; i < silenceStarts.length; i++) {
                    const silStart = silenceStarts[i];
                    const silEnd = silenceEnds[i] || duracionTotal;
                    if (silStart > tiempoActual) {
                        segmentosVoz.push({ start: Math.max(0, tiempoActual), end: Math.min(silStart, duracionTotal) });
                    }
                    tiempoActual = silEnd;
                }
                if (tiempoActual < duracionTotal) segmentosVoz.push({ start: tiempoActual, end: duracionTotal });
                if (segmentosVoz.length === 0 && duracionTotal > 0) segmentosVoz.push({ start: 0, end: duracionTotal });
                
                console.log(`[PNGTuber] Segmentos de voz detectados: ${segmentosVoz.length}`);
                segmentosVoz.forEach((s, i) => {
                    console.log(`  [${i}] Voz: ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s`);
                });
                
                resolve({ segmentosVoz, duracionTotal });
            });
            proceso.on('error', (err) => reject(err));
        });
    }

    _construirEnableExpression(segmentosVoz) {
        if (!segmentosVoz || segmentosVoz.length === 0) return '0';
        // ✅ FIX CRÍTICO: Escapar las comas con \, para que FFmpeg no las interprete como separadores
        return segmentosVoz.map(s => `between(t\\,${s.start.toFixed(3)}\\,${s.end.toFixed(3)})`).join('+');
    }

    async generarPNGTuber(audioPathAbsoluto, opciones = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const idleFile = this.normalizarRutaImagen(opciones.idleImagePath);
                const talkingFile = this.normalizarRutaImagen(opciones.talkingImagePath);
                
                const idleDefault = path.join(this.pngtuberFolder, 'idle.png');
                const idleImage = idleFile || (fs.existsSync(idleDefault) ? idleDefault : null);
                const talkingImage = talkingFile || idleImage;

                if (!idleImage || !fs.existsSync(idleImage)) {
                    return reject(new Error('Falta la imagen PNGTuber idle. Sube una imagen primero.'));
                }
                if (!fs.existsSync(audioPathAbsoluto)) {
                    return reject(new Error(`El archivo de audio no existe: ${audioPathAbsoluto}`));
                }

                const nombreVideo = `pngtuber-${Date.now()}.mp4`;
                const rutaVideo = path.join(this.audioFolder, nombreVideo);
                const usarTalking = talkingImage && fs.existsSync(talkingImage) && talkingImage !== idleImage;

                let filterScript = '';
                let ffmpegArgs = [];

                if (usarTalking) {
                    const { segmentosVoz, duracionTotal } = await this.detectarSegmentosVoz(audioPathAbsoluto);
                    const enableExpr = this._construirEnableExpression(segmentosVoz);

                    filterScript = path.join(this.audioFolder, `filter-${Date.now()}.txt`);
                    
                    // ✅ FIX: Comas escapadas con \, en la expresión enable
                    const filterContent =
                        `color=c=#00FF00:s=1280x720:d=${duracionTotal}[green];\n` +
                        `[1:v]scale=1280:720:force_original_aspect_ratio=increase,setsar=1,crop=1280:720:(in_w-1280)/2:(in_h-720)/2[idle];\n` +
                        `[2:v]scale=1280:720:force_original_aspect_ratio=increase,setsar=1,crop=1280:720:(in_w-1280)/2:(in_h-720)/2[talking];\n` +
                        `[green][idle]overlay=(W-w)/2:(H-h)/2:format=auto[base];\n` +
                        `[base][talking]overlay=(W-w)/2:(H-h)/2:format=auto:enable='${enableExpr}'[video]`;
                    
                    fs.writeFileSync(filterScript, filterContent, 'utf8');
                    console.log(`[PNGTuber] Filter script escrito en: ${filterScript}`);
                    console.log(`[PNGTuber] Enable expression: ${enableExpr}`);

                    ffmpegArgs = [
                        '-i', audioPathAbsoluto,
                        '-loop', '1', '-i', idleImage,
                        '-loop', '1', '-i', talkingImage,
                        '-filter_complex_script', filterScript,
                        '-map', '[video]',
                        '-map', '0:a',
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-pix_fmt', 'yuv420p',
                        '-shortest',
                        '-y',
                        rutaVideo
                    ];
                } else {
                    filterScript = path.join(this.audioFolder, `filter-${Date.now()}.txt`);
                    const filterContent =
                        `color=c=#00FF00:s=1280x720:d=1000[green];\n` +
                        `[1:v]scale=1280:720:force_original_aspect_ratio=increase,setsar=1,crop=1280:720:(in_w-1280)/2:(in_h-720)/2[idle];\n` +
                        `[green][idle]overlay=(W-w)/2:(H-h)/2:format=auto[video]`;
                    
                    fs.writeFileSync(filterScript, filterContent, 'utf8');

                    ffmpegArgs = [
                        '-i', audioPathAbsoluto,
                        '-loop', '1', '-i', idleImage,
                        '-filter_complex_script', filterScript,
                        '-map', '[video]',
                        '-map', '0:a',
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-pix_fmt', 'yuv420p',
                        '-shortest',
                        '-y',
                        rutaVideo
                    ];
                }

                console.log('[FFmpeg] Iniciando renderizado...');
                const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, { windowsHide: true, shell: false });
                let stderr = '';
                
                ffmpegProcess.stderr.on('data', (data) => { 
                    stderr += data.toString();
                    if (data.toString().includes('frame=') || data.toString().includes('size=')) {
                        process.stdout.write('\r[FFmpeg] ' + data.toString().trim().substring(0, 70));
                    }
                });

                ffmpegProcess.on('close', (code) => {
                    process.stdout.write('\n');
                    if (filterScript && fs.existsSync(filterScript)) {
                        try { fs.unlinkSync(filterScript); } catch (e) { /* ignore */ }
                    }
                    
                    if (code === 0 && fs.existsSync(rutaVideo)) {
                        const stats = fs.statSync(rutaVideo);
                        console.log(`✅ Video PNGTuber generado: ${nombreVideo} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
                        resolve({ video: `/audios/${nombreVideo}` });
                    } else {
                        console.error('❌ Error al generar video. Codigo:', code);
                        console.error('FFmpeg stderr:', stderr.substring(stderr.length - 1500));
                        reject(new Error(`No se pudo generar el video. Codigo FFmpeg: ${code}`));
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    if (filterScript && fs.existsSync(filterScript)) {
                        try { fs.unlinkSync(filterScript); } catch (e) { /* ignore */ }
                    }
                    reject(new Error(`Error de FFmpeg: ${err.message}`));
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = VideoService;