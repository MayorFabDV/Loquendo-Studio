// services/videoService.js - VERSIÓN FINAL CON COMAS ESCAPADAS
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BOB_AMPLITUDE = 8;    // px de balanceo vertical (respiración)
const BOB_PERIOD = 3.0;     // segundos por ciclo
const BLINK_DURATION = 0.13; // duración de cada parpadeo
const ESCALA_MIN = 0.25;
const ESCALA_MAX = 3;
const RESOLUCIONES = {
    '720p': { ancho: 1280, alto: 720 },
    '1080p': { ancho: 1920, alto: 1080 }
};

class VideoService {
    constructor(ffmpegPath, audioFolder, pngtuberFolder, ffprobePath) {
        this.ffmpegPath = ffmpegPath;
        this.audioFolder = audioFolder;
        this.pngtuberFolder = pngtuberFolder;
        this.ffprobePath = ffprobePath || path.join(path.dirname(ffmpegPath), 'ffprobe.exe');
    }

    _colorDeFondo(fondo) {
        const mapa = { green: '#00FF00', black: '#000000' };
        if (fondo === 'transparent') return null;
        return mapa[fondo] || mapa.green;
    }

    _filtroEscala(ancho, alto) {
        return `scale=${ancho}:${alto}:flags=lanczos,setsar=1`;
    }

    _overlayFiltro(optOverlay, enableExpr, amplitud = BOB_AMPLITUDE) {
        const yExp = `(H-h)/2+${amplitud}*sin(2*PI*t/${BOB_PERIOD})`;
        let s = `overlay=x=(W-w)/2:y=${yExp}${optOverlay}`;
        if (enableExpr) s += `:enable='${enableExpr}'`;
        return s;
    }

    _fechasParpadeo(duracion) {
        const tiempos = [];
        let t = 1.5 + Math.random() * 2;
        while (t < duracion - 0.6) {
            tiempos.push(t);
            t += 2.5 + Math.random() * 3.5;
        }
        return tiempos;
    }

    _blinkEnable(tiempos) {
        if (!tiempos || tiempos.length === 0) return null;
        return tiempos.map(x => `between(t\\,${x.toFixed(3)}\\,${(x + BLINK_DURATION).toFixed(3)})`).join('+');
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

    _normalizarResolucion(valor) {
        return Object.prototype.hasOwnProperty.call(RESOLUCIONES, valor) ? valor : 'original';
    }

    _normalizarEscala(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 1;
        return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, numero));
    }

    _par(valor) {
        return Math.max(2, Math.floor(valor / 2) * 2);
    }

    async _dimensionesImagen(rutaImagen) {
        return new Promise((resolve, reject) => {
            const proceso = spawn(this.ffprobePath, [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'csv=s=x:p=0',
                rutaImagen
            ], { windowsHide: true, shell: false });
            let salida = '';
            let error = '';
            proceso.stdout.on('data', (data) => { salida += data.toString(); });
            proceso.stderr.on('data', (data) => { error += data.toString(); });
            proceso.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`No se pudieron leer las dimensiones de ${path.basename(rutaImagen)}: ${error.trim() || 'ffprobe falló'}`));
                    return;
                }
                const match = salida.trim().match(/(\d+)x(\d+)/);
                if (!match) {
                    reject(new Error(`No se pudieron leer las dimensiones de ${path.basename(rutaImagen)}.`));
                    return;
                }
                resolve({ ancho: parseInt(match[1], 10), alto: parseInt(match[2], 10) });
            });
            proceso.on('error', reject);
        });
    }

    _dimensionesCanvas(resolucion, imagen) {
        if (RESOLUCIONES[resolucion]) return { ...RESOLUCIONES[resolucion] };
        return { ancho: this._par(imagen.ancho), alto: this._par(imagen.alto) };
    }

    _amplitudBalanceo(altoCanvas) {
        return Math.max(1, Math.min(BOB_AMPLITUDE, Math.floor(altoCanvas * 0.01)));
    }

    _dimensionesEscaladas(canvas, imagen, escala, amplitud) {
        const margen = amplitud * 2;
        const disponibleAncho = Math.max(2, canvas.ancho);
        const disponibleAlto = Math.max(2, canvas.alto - margen);
        const ajuste = Math.min(disponibleAncho / imagen.ancho, disponibleAlto / imagen.alto);
        const factor = ajuste * escala;
        return {
            ancho: this._par(Math.round(imagen.ancho * factor)),
            alto: this._par(Math.round(imagen.alto * factor))
        };
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

    _ejecutarFFmpeg(args, filterScript, rutaSalida, nombreSalida) {
        return new Promise((resolve, reject) => {
            console.log('[FFmpeg] Iniciando renderizado...');
            const ffmpegProcess = spawn(this.ffmpegPath, args, { windowsHide: true, shell: false });
            let stderr = '';

            const limpiarScript = () => {
                if (filterScript && fs.existsSync(filterScript)) {
                    try { fs.unlinkSync(filterScript); } catch (e) { /* ignore */ }
                }
            };

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                if (data.toString().includes('frame=') || data.toString().includes('size=')) {
                    process.stdout.write('\r[FFmpeg] ' + data.toString().trim().substring(0, 70));
                }
            });

            ffmpegProcess.on('close', (code) => {
                process.stdout.write('\n');
                limpiarScript();
                if (code === 0 && fs.existsSync(rutaSalida)) {
                    const stats = fs.statSync(rutaSalida);
                    console.log(`✅ Video generado: ${nombreSalida} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                    resolve(nombreSalida);
                } else {
                    console.error('❌ Error al generar video. Codigo:', code);
                    console.error('FFmpeg stderr:', stderr.substring(stderr.length - 1500));
                    reject(new Error(`No se pudo generar el video. Codigo FFmpeg: ${code}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                limpiarScript();
                reject(new Error(`Error de FFmpeg: ${err.message}`));
            });
        });
    }

    _argsVideo(transparente, audio) {
        const args = [];
        if (transparente) {
            // WebM/VP9 con canal alfa (mp4/h264 no admite transparencia)
            args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
                '-b:v', '2M', '-deadline', 'good', '-cpu-used', '4');
            if (audio) args.push('-c:a', 'libopus', '-b:a', '128k');
        } else {
            args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p');
            if (audio) args.push('-c:a', 'aac', '-b:a', '192k');
        }
        return args;
    }

    async generarPNGTuber(audioPathAbsoluto, opciones = {}) {
        const idleFile = this.normalizarRutaImagen(opciones.idleImagePath);
        const talkingFile = this.normalizarRutaImagen(opciones.talkingImagePath);
        const blinkFile = this.normalizarRutaImagen(opciones.blinkImagePath);

        const idleDefault = path.join(this.pngtuberFolder, 'idle.png');
        const idleImage = idleFile || (fs.existsSync(idleDefault) ? idleDefault : null);
        const talkingImage = talkingFile || idleImage;
        const blinkImage = blinkFile;

        if (!idleImage || !fs.existsSync(idleImage)) {
            throw new Error('Falta la imagen PNGTuber idle. Sube una imagen primero.');
        }
        if (!fs.existsSync(audioPathAbsoluto)) {
            throw new Error(`El archivo de audio no existe: ${audioPathAbsoluto}`);
        }

        const fondoColor = this._colorDeFondo(opciones.fondo);
        const transparente = fondoColor === null;
        const ext = transparente ? 'webm' : 'mp4';
        const nombreVideo = `pngtuber-${Date.now()}.${ext}`;
        const rutaVideo = path.join(this.audioFolder, nombreVideo);
        const usarTalking = talkingImage && fs.existsSync(talkingImage) && talkingImage !== idleImage;
        const optOverlay = ':format=auto';

        // Dimensiones: el lienzo puede ser el original de la imagen o un 16:9 estándar.
        const usarBlinkImg = blinkImage && fs.existsSync(blinkImage);
        const [dimIdle, dimTalking, dimBlink] = await Promise.all([
            this._dimensionesImagen(idleImage),
            usarTalking ? this._dimensionesImagen(talkingImage) : null,
            usarBlinkImg ? this._dimensionesImagen(blinkImage) : null
        ]);
        const resolucion = this._normalizarResolucion(opciones.resolucion);
        const escalaUsuario = this._normalizarEscala(opciones.escala);
        const canvas = this._dimensionesCanvas(resolucion, dimIdle);
        const amplitud = this._amplitudBalanceo(canvas.alto);
        const dimsIdle = this._dimensionesEscaladas(canvas, dimIdle, escalaUsuario, amplitud);
        const dimsTalking = dimTalking ? this._dimensionesEscaladas(canvas, dimTalking, escalaUsuario, amplitud) : null;
        const dimsBlink = dimBlink ? this._dimensionesEscaladas(canvas, dimBlink, escalaUsuario, amplitud) : null;
        const escalaIdle = this._filtroEscala(dimsIdle.ancho, dimsIdle.alto);
        const escalaTalking = dimsTalking ? this._filtroEscala(dimsTalking.ancho, dimsTalking.alto) : null;
        const escalaBlink = dimsBlink ? this._filtroEscala(dimsBlink.ancho, dimsBlink.alto) : null;

        // Duración y expresión de habla
        let duracionTotal = 0;
        let enableExprTalking = null;
        if (usarTalking || usarBlinkImg) {
            const info = await this.detectarSegmentosVoz(audioPathAbsoluto);
            duracionTotal = info.duracionTotal;
            if (usarTalking) enableExprTalking = this._construirEnableExpression(info.segmentosVoz);
        }
        const duracionBase = duracionTotal > 0 ? duracionTotal : 1000;

        const tiemposParpadeo = usarBlinkImg ? this._fechasParpadeo(duracionBase) : [];
        const enableExprBlink = this._blinkEnable(tiemposParpadeo);
        const usarBlink = usarBlinkImg && !!enableExprBlink;

        const fondoLinea = transparente
            ? `color=c=black@0.0:s=${canvas.ancho}x${canvas.alto}:d=${duracionBase},format=rgba[bg];`
            : `color=c=${fondoColor}:s=${canvas.ancho}x${canvas.alto}:d=${duracionBase}[bg];`;

        // Índices de entrada: 0=audio, 1=idle, 2=talking (si), siguiente=blink (si)
        const idxTalking = usarTalking ? 2 : null;
        const idxBlink = usarBlink ? (usarTalking ? 3 : 2) : null;

        const partes = [fondoLinea];
        partes.push(`[1:v]${escalaIdle}[idle];`);
        if (usarTalking) partes.push(`[2:v]${escalaTalking}[talking];`);
        if (usarBlink) partes.push(`[${idxBlink}:v]${escalaBlink}[blink];`);

        let prev = 'bg';
        partes.push(`[${prev}][idle]${this._overlayFiltro(optOverlay, null, amplitud)}[s1];`);
        prev = 's1';
        if (usarTalking) {
            partes.push(`[${prev}][talking]${this._overlayFiltro(optOverlay, enableExprTalking, amplitud)}[s2];`);
            prev = 's2';
        }
        if (usarBlink) {
            partes.push(`[${prev}][blink]${this._overlayFiltro(optOverlay, enableExprBlink, amplitud)}[s3];`);
            prev = 's3';
        }
        partes.push(`[${prev}]null[video]`);

        const filterScript = path.join(this.audioFolder, `filter-${Date.now()}.txt`);
        fs.writeFileSync(filterScript, partes.join('\n'), 'utf8');
        console.log(`[PNGTuber] Fondo: ${transparente ? 'transparente' : fondoColor} | lienzo: ${canvas.ancho}x${canvas.alto} | escala: ${Math.round(escalaUsuario * 100)}% | habla: ${usarTalking} | parpadeo: ${usarBlink ? tiemposParpadeo.length + ' veces' : 'no'}`);

        const ffmpegArgs = ['-i', audioPathAbsoluto, '-loop', '1', '-i', idleImage];
        if (usarTalking) ffmpegArgs.push('-loop', '1', '-i', talkingImage);
        if (usarBlink) ffmpegArgs.push('-loop', '1', '-i', blinkImage);
        ffmpegArgs.push(
            '-/filter_complex', filterScript,
            '-map', '[video]',
            '-map', '0:a',
            ...this._argsVideo(transparente, true),
            '-shortest',
            '-y',
            rutaVideo
        );

        await this._ejecutarFFmpeg(ffmpegArgs, filterScript, rutaVideo, nombreVideo);
        return { video: `/audios/${nombreVideo}` };
    }

    async generarPreviewPNGTuber(opciones = {}) {
        const idleFile = this.normalizarRutaImagen(opciones.idleImagePath);
        const talkingFile = this.normalizarRutaImagen(opciones.talkingImagePath);
        const blinkFile = this.normalizarRutaImagen(opciones.blinkImagePath);

        const idleDefault = path.join(this.pngtuberFolder, 'idle.png');
        const idleImage = idleFile || (fs.existsSync(idleDefault) ? idleDefault : null);
        const talkingImage = talkingFile || null;
        const blinkImage = blinkFile || null;

        if (!idleImage || !fs.existsSync(idleImage)) {
            throw new Error('Sube una imagen en reposo para ver la vista previa.');
        }

        const fondoColor = this._colorDeFondo(opciones.fondo);
        const transparente = fondoColor === null;
        const duracion = 4;
        const usarTalking = talkingImage && fs.existsSync(talkingImage) && talkingImage !== idleImage;
        const usarBlink = blinkImage && fs.existsSync(blinkImage);

        const ext = transparente ? 'webm' : 'mp4';
        const rutaVideo = path.join(this.pngtuberFolder, `preview.${ext}`);
        const rutaOpuesta = path.join(this.pngtuberFolder, `preview.${transparente ? 'mp4' : 'webm'}`);
        if (fs.existsSync(rutaOpuesta)) {
            try { fs.unlinkSync(rutaOpuesta); } catch (e) { /* ignore */ }
        }

        const [dimIdle, dimTalking, dimBlink] = await Promise.all([
            this._dimensionesImagen(idleImage),
            usarTalking ? this._dimensionesImagen(talkingImage) : null,
            usarBlink ? this._dimensionesImagen(blinkImage) : null
        ]);
        const resolucion = this._normalizarResolucion(opciones.resolucion);
        const escalaUsuario = this._normalizarEscala(opciones.escala);
        const canvas = this._dimensionesCanvas(resolucion, dimIdle);
        const amplitud = this._amplitudBalanceo(canvas.alto);
        const dimsIdle = this._dimensionesEscaladas(canvas, dimIdle, escalaUsuario, amplitud);
        const dimsTalking = dimTalking ? this._dimensionesEscaladas(canvas, dimTalking, escalaUsuario, amplitud) : null;
        const dimsBlink = dimBlink ? this._dimensionesEscaladas(canvas, dimBlink, escalaUsuario, amplitud) : null;
        const escalaIdle = this._filtroEscala(dimsIdle.ancho, dimsIdle.alto);
        const escalaTalking = dimsTalking ? this._filtroEscala(dimsTalking.ancho, dimsTalking.alto) : null;
        const escalaBlink = dimsBlink ? this._filtroEscala(dimsBlink.ancho, dimsBlink.alto) : null;

        const optOverlay = ':format=auto';
        const fondoLinea = transparente
            ? `color=c=black@0.0:s=${canvas.ancho}x${canvas.alto}:d=${duracion},format=rgba[bg];`
            : `color=c=${fondoColor}:s=${canvas.ancho}x${canvas.alto}:d=${duracion}[bg];`;

        const idxTalking = usarTalking ? 1 : null;
        const idxBlink = usarBlink ? (usarTalking ? 2 : 1) : null;
        const enableExprTalking = usarTalking ? 'between(t\\,1\\,2)+between(t\\,3\\,4)' : null;
        const enableExprBlink = usarBlink ? 'between(t\\,2.6\\,2.73)' : null;

        const partes = [fondoLinea];
        partes.push(`[0:v]${escalaIdle}[idle];`);
        if (usarTalking) partes.push(`[${idxTalking}:v]${escalaTalking}[talking];`);
        if (usarBlink) partes.push(`[${idxBlink}:v]${escalaBlink}[blink];`);

        let prev = 'bg';
        partes.push(`[${prev}][idle]${this._overlayFiltro(optOverlay, null, amplitud)}[s1];`);
        prev = 's1';
        if (usarTalking) {
            partes.push(`[${prev}][talking]${this._overlayFiltro(optOverlay, enableExprTalking, amplitud)}[s2];`);
            prev = 's2';
        }
        if (usarBlink) {
            partes.push(`[${prev}][blink]${this._overlayFiltro(optOverlay, enableExprBlink, amplitud)}[s3];`);
            prev = 's3';
        }
        partes.push(`[${prev}]null[video]`);

        const filterScript = path.join(this.audioFolder, `preview-filter-${Date.now()}.txt`);
        fs.writeFileSync(filterScript, partes.join('\n'), 'utf8');
        console.log(`[Preview] Generando vista previa (${transparente ? 'transparente' : fondoColor}) | lienzo: ${canvas.ancho}x${canvas.alto} | escala: ${Math.round(escalaUsuario * 100)}%`);

        const ffmpegArgs = ['-loop', '1', '-i', idleImage];
        if (usarTalking) ffmpegArgs.push('-loop', '1', '-i', talkingImage);
        if (usarBlink) ffmpegArgs.push('-loop', '1', '-i', blinkImage);
        ffmpegArgs.push(
            '-/filter_complex', filterScript,
            '-map', '[video]',
            '-t', String(duracion),
            ...this._argsVideo(transparente, false),
            '-an',
            '-y',
            rutaVideo
        );

        await this._ejecutarFFmpeg(ffmpegArgs, filterScript, rutaVideo, `preview.${ext}`);
        return { url: `/pngtuber/preview.${ext}` };
    }
}

module.exports = VideoService;
