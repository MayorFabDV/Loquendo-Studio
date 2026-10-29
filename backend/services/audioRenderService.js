// services/audioRenderService.js - Render final con FFmpeg (Fase 2, PLAN 10)
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { ejecutar, duracion: duracionArchivo } = require('./audio/ffmpegProcess');
const { numero, dbALineal } = require('./audio/audioMath');

const FORMATOS = {
    wav: { ext: 'wav', codec: 'pcm_s16le' },
    mp3: { ext: 'mp3', codec: 'libmp3lame', bitrate: '320k' },
    flac: { ext: 'flac', codec: 'flac' },
    opus: { ext: 'opus', codec: 'libopus', bitrate: '160k' }
};

const LIMITES = {
    highpass: [0, 1000],
    lowpass: [1000, 22050],
    eq: [-24, 24],
    compThreshold: [-60, 0],
    compRatio: [1, 20],
    gateThreshold: [-100, 0],
    limiter: [-24, 0],
    gainDb: [-24, 24],
    pitch: [-24, 24],
    rate: [0.25, 4],
    loudness: [-40, -5],
    truePeak: [-6, 0],
    lra: [1, 50],
    fade: [0, 120],
    denoise: [0, 97],
    deesser: [0, 1]
};

class AudioRenderService {
    constructor(ffmpegPath, ffprobePath, audioFolder) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
        this.audioFolder = audioFolder;

        if (!fs.existsSync(this.audioFolder)) {
            fs.mkdirSync(this.audioFolder, { recursive: true });
        }

        console.log('\n[AudioRenderService] Rutas inicializadas:');
        console.log('   ffmpeg:', this.ffmpegPath, '| Existe:', fs.existsSync(this.ffmpegPath));
        console.log('   ffprobe:', this.ffprobePath, '| Existe:', fs.existsSync(this.ffprobePath));
        console.log('   audioFolder:', this.audioFolder);
    }

    _run(args, timeoutMs = 10 * 60 * 1000, opciones = {}) {
        return ejecutar(this.ffmpegPath, args, { ...opciones, timeoutMs });
    }

    _duracion(rutaAudio) {
        return duracionArchivo(this.ffprobePath, rutaAudio);
    }

    _segmentos(recipe) {
        if (!Array.isArray(recipe.segments) || recipe.segments.length === 0) return null;
        const segmentos = [];
        for (const seg of recipe.segments) {
            const inicio = Math.max(0, Number(seg.start) || 0);
            const fin = Number(seg.end);
            if (!Number.isFinite(fin) || fin <= inicio) continue;
            segmentos.push({ inicio, fin });
        }
        return segmentos.length ? segmentos : null;
    }

    _cadena(recipe, duracionEntrada) {
        const filtros = [];
        const fx = recipe || {};

        if (!fx.bypass) {
            const hpRaw = Number(fx.filter?.highpass);
            const lpRaw = Number(fx.filter?.lowpass);
            const hp = Number.isFinite(hpRaw) && hpRaw > 0 ? Math.min(LIMITES.highpass[1], hpRaw) : 0;
            const lp = Number.isFinite(lpRaw) && lpRaw > 0 ? Math.min(LIMITES.lowpass[1], Math.max(LIMITES.lowpass[0], lpRaw)) : 0;
            if (hp > 0) filtros.push(`highpass=f=${hp}`);
            if (lp > 0) filtros.push(`lowpass=f=${lp}`);

            const eq = fx.eq || {};
            const eqLow = numero(eq.low, 0, LIMITES.eq);
            const eqMid = numero(eq.mid, 0, LIMITES.eq);
            const eqHigh = numero(eq.high, 0, LIMITES.eq);
            if (eqLow !== 0) filtros.push(`bass=g=${eqLow}:f=100`);
            if (eqMid !== 0) filtros.push(`equalizer=f=1000:width_type=o:width=2:g=${eqMid}`);
            if (eqHigh !== 0) filtros.push(`treble=g=${eqHigh}:f=8000`);

            const comp = fx.comp || {};
            if (comp.enabled !== false) {
                const threshold = numero(comp.threshold, 0, LIMITES.compThreshold);
                const ratio = numero(comp.ratio, 1, LIMITES.compRatio);
                if (threshold < 0 && ratio > 1) {
                    const attack = numero(comp.attack, 10, [0.01, 2000]);
                    const release = numero(comp.release, 200, [0.01, 9000]);
                    const makeup = numero(comp.makeup, 0, [0, 24]);
                    const makeupLineal = dbALineal(makeup);
                    filtros.push(`acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=${attack}:release=${release}:makeup=${makeupLineal}:knee=6`);
                }
            }

            const gate = fx.gate || {};
            if (gate.enabled !== false) {
                const umbralDb = numero(gate.threshold, -80, LIMITES.gateThreshold);
                if (umbralDb > -99) {
                    const umbral = Math.max(0.0001, dbALineal(umbralDb));
                    filtros.push(`agate=threshold=${umbral}:range=0.05:ratio=2:attack=20:release=250:makeup=1`);
                }
            }

            if (fx.denoise && fx.denoise.enabled) {
                const nr = numero(fx.denoise.amount, 12, LIMITES.denoise);
                filtros.push(`afftdn=nr=${nr}:nf=-25`);
            }

            if (fx.deesser && fx.deesser.enabled) {
                const intensidad = numero(fx.deesser.intensity, 0.5, LIMITES.deesser);
                filtros.push(`deesser=i=${intensidad}:m=0.5`);
            }

            const pitch = numero(fx.pitch, 0, LIMITES.pitch);
            const rate = numero(fx.rate, 1, LIMITES.rate);
            if (pitch !== 0 || rate !== 1) {
                const factorPitch = Math.pow(2, pitch / 12);
                filtros.push(`rubberband=pitch=${factorPitch}:tempo=${rate}`);
            }

            const limiter = fx.limiter || {};
            const techoDb = numero(limiter.ceiling, -1, LIMITES.limiter);
            if (techoDb < 0) {
                const techo = dbALineal(techoDb);
                filtros.push(`alimiter=limit=${techo}:attack=5:release=50:level=0`);
            }
        }

        const fades = fx.fades || {};
        const fadeIn = numero(fades.in, 0, LIMITES.fade);
        const fadeOut = numero(fades.out, 0, LIMITES.fade);
        const duracionProcesada = duracionEntrada > 0 ? duracionEntrada / numero(fx.rate, 1, LIMITES.rate) : 0;
        if (fadeIn > 0) {
            filtros.push(`afade=t=in:st=0:d=${fadeIn}:curve=tri`);
        }
        if (fadeOut > 0 && duracionProcesada > 0) {
            const inicio = Math.max(0, duracionProcesada - fadeOut);
            filtros.push(`afade=t=out:st=${inicio}:d=${fadeOut}:curve=tri`);
        }

        const gainDb = numero(fx.gainDb, 0, LIMITES.gainDb);
        if (gainDb !== 0) filtros.push(`volume=${gainDb}dB`);

        return filtros;
    }

    _prefijo(recipe) {
        const segmentos = this._segmentos(recipe);
        if (!segmentos) return { prefijo: '[0:a]', duracion: 0 };

        const partes = [];
        let duracion = 0;
        segmentos.forEach((seg, indice) => {
            partes.push(`[0:a]atrim=start=${seg.inicio}:end=${seg.fin},asetpts=PTS-STARTPTS[s${indice}]`);
            duracion += seg.fin - seg.inicio;
        });
        const entradas = segmentos.map((_, indice) => `[s${indice}]`).join('');
        partes.push(`${entradas}concat=n=${segmentos.length}:v=0:a=1[segmentos]`);
        return { prefijo: '[segmentos]', duracion, partes };
    }

    _loudness(recipe) {
        const cfg = recipe.loudness || {};
        if (cfg.enabled === false || cfg.target === 'off') return null;
        const target = numero(cfg.target, -16, LIMITES.loudness);
        const truePeak = numero(cfg.truePeak, -1.5, LIMITES.truePeak);
        const lra = numero(cfg.lra, 11, LIMITES.lra);
        return {
            target,
            truePeak,
            lra,
            precise: cfg.precise !== false,
            filtro: `loudnorm=I=${target}:TP=${truePeak}:LRA=${lra}`
        };
    }

    _parseLoudnorm(stderr) {
        const coincidencia = String(stderr).match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
        if (!coincidencia) return null;
        try {
            const datos = JSON.parse(coincidencia[0]);
            return {
                input_i: parseFloat(datos.input_i),
                input_tp: parseFloat(datos.input_tp),
                input_lra: parseFloat(datos.input_lra),
                input_thresh: parseFloat(datos.input_thresh),
                target_offset: parseFloat(datos.target_offset)
            };
        } catch (error) {
            return null;
        }
    }

    async _medirPico(rutaAudio, inicio, fin) {
        const resultado = await this._run([
            '-hide_banner',
            '-i', rutaAudio,
            '-af', `atrim=start=${inicio}:end=${fin},volumedetect`,
            '-f', 'null',
            '-'
        ], 2 * 60 * 1000);

        if (resultado.code !== 0) {
            throw new Error('FFmpeg (medición de pico) falló: ' + String(resultado.stderr).slice(-500));
        }

        const coincidencia = String(resultado.stderr).match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/i);
        if (!coincidencia) return null;

        const valor = parseFloat(coincidencia[1]);
        return Number.isFinite(valor) ? valor : null;
    }

    async procesarSeleccion(rutaAudio, inicio, fin, recipe = {}, opciones = {}) {
        if (!fs.existsSync(rutaAudio)) throw new Error('Audio no encontrado');

        const duracionTotal = await this._duracion(rutaAudio);
        if (duracionTotal <= 0) throw new Error('No se pudo leer la duración del audio');

        let desde = Number(inicio);
        let hasta = Number(fin);
        if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
            throw new Error('Rango de selección inválido');
        }

        desde = Math.max(0, Math.min(duracionTotal, desde));
        hasta = Math.max(0, Math.min(duracionTotal, hasta));
        if (hasta <= desde) throw new Error('El final de la selección debe ser mayor que el inicio');
        if (hasta - desde < 0.05) throw new Error('La selección es demasiado corta (mínimo 0.05 s)');

        const recetaOriginal = recipe || {};
        const receta = Object.assign({}, recetaOriginal);
        delete receta.segments;
        delete receta.loudness;
        delete receta.silence;
        receta.bypass = false;

        const duracionSeleccion = hasta - desde;
        const normalizar = opciones.normalize || {};
        const silenciar = !!(opciones.silence || recetaOriginal.silence);
        let filtros = [];

        if (silenciar) {
            filtros = ['volume=0'];
        } else if (normalizar.enabled) {
            const pico = await this._medirPico(rutaAudio, desde, hasta);
            if (pico === null) {
                throw new Error('No se pudo medir el pico de la selección (¿está en silencio?)');
            }
            const objetivo = numero(normalizar.targetDb, -1, [-24, 0]);
            const ganancia = Math.max(-60, Math.min(60, objetivo - pico));
            filtros = [`volume=${ganancia.toFixed(2)}dB`];
        } else {
            filtros = this._cadena(receta, duracionSeleccion);
        }

        if (filtros.length === 0) throw new Error('No hay efectos que aplicar a la selección');

        const partes = [];
        const etiquetas = [];

        if (desde > 0.001) {
            partes.push(`[0:a]atrim=start=0:end=${desde},asetpts=PTS-STARTPTS[pre]`);
            etiquetas.push('[pre]');
        }

        const cadenaMedia = [
            `atrim=start=${desde}:end=${hasta}`,
            'asetpts=PTS-STARTPTS',
            ...filtros
        ].join(',');
        partes.push(`[0:a]${cadenaMedia}[mid]`);
        etiquetas.push('[mid]');

        if (hasta < duracionTotal - 0.001) {
            partes.push(`[0:a]atrim=start=${hasta},asetpts=PTS-STARTPTS[post]`);
            etiquetas.push('[post]');
        }

        let salida = '[mid]';
        if (etiquetas.length > 1) {
            partes.push(`${etiquetas.join('')}concat=n=${etiquetas.length}:v=0:a=1[out]`);
            salida = '[out]';
        }

        const nombreSalida = `sel-${Date.now()}-${randomUUID()}.wav`;
        const rutaSalida = path.join(this.audioFolder, nombreSalida);

        const args = [
            '-hide_banner',
            '-i', rutaAudio,
            '-filter_complex', partes.join(';'),
            '-map', salida,
            '-map_metadata', '-1',
            '-vn',
            '-ar', '48000',
            '-c:a', 'pcm_s24le',
            '-y', rutaSalida
        ];

        const resultado = await this._run(args, 5 * 60 * 1000);
        if (resultado.code !== 0 || !fs.existsSync(rutaSalida)) {
            try { fs.unlinkSync(rutaSalida); } catch (e) { /* noop */ }
            throw new Error('FFmpeg falló al procesar la selección: ' + String(resultado.stderr).slice(-600));
        }

        const stats = fs.statSync(rutaSalida);
        if (stats.size < 1000) {
            try { fs.unlinkSync(rutaSalida); } catch (e) { /* noop */ }
            throw new Error('El procesado de la selección generó un archivo vacío');
        }

        const duracionSalida = await this._duracion(rutaSalida);
        console.log(`[AudioRenderService] Selección procesada: ${nombreSalida} (${(stats.size / 1024).toFixed(1)} KB, ${duracionSalida.toFixed(2)}s)`);

        return {
            url: '/audios/' + nombreSalida,
            duration: duracionSalida,
            size: stats.size,
            start: desde,
            end: hasta
        };
    }

    async analizar(rutaAudio) {
        if (!fs.existsSync(rutaAudio)) throw new Error('Audio no encontrado');

        const loudness = this._loudness({ loudness: { target: -16, truePeak: -1.5, lra: 11 } });
        const resultado = await this._run([
            '-hide_banner',
            '-i', rutaAudio,
            '-af', `${loudness.filtro}:print_format=json`,
            '-f', 'null',
            '-'
        ], 3 * 60 * 1000);

        const medicion = this._parseLoudnorm(resultado.stderr);
        if (!medicion) {
            throw new Error('No se pudo medir la sonoridad (loudnorm)');
        }

        return {
            lufs: medicion.input_i,
            truePeak: medicion.input_tp,
            lra: medicion.input_lra,
            thresh: medicion.input_thresh,
            targetOffset: medicion.target_offset
        };
    }

    async renderizar(rutaAudio, recipe = {}, opciones = {}) {
        if (!fs.existsSync(rutaAudio)) throw new Error('Audio no encontrado');

        const formato = String(opciones.format || 'wav').toLowerCase();
        if (!FORMATOS[formato]) throw new Error('Formato no soportado: ' + formato);

        const bitDepth = Number(opciones.bitDepth) === 24 ? 24 : 16;
        const loudness = this._loudness(recipe);
        const duracionEntrada = await this._duracion(rutaAudio);
        if (duracionEntrada <= 0) throw new Error('No se pudo leer la duración del audio');

        const { prefijo, duracion: duracionSegmentos, partes } = this._prefijo(recipe);
        const duracionBase = duracionSegmentos > 0 ? duracionSegmentos : duracionEntrada;
        const filtros = this._cadena(recipe, duracionBase);
        const cadenaBase = filtros.join(',');

        const nombreSalida = `render-${Date.now()}-${randomUUID()}.${FORMATOS[formato].ext}`;
        const rutaSalida = path.join(this.audioFolder, nombreSalida);
        let medicion = null;

        if (loudness && loudness.precise) {
            const cadenaMedicion = [
                prefijo,
                cadenaBase ? cadenaBase + ',' : '',
                `${loudness.filtro}:print_format=json[medicion]`
            ].join('');
            const argsMedicion = ['-hide_banner', '-i', rutaAudio];
            if (partes) argsMedicion.push('-filter_complex', partes.join(';') + ';' + cadenaMedicion);
            else argsMedicion.push('-filter_complex', cadenaMedicion);
            argsMedicion.push('-map', '[medicion]', '-f', 'null', '-');

            const pasada = await this._run(argsMedicion, 5 * 60 * 1000);
            if (pasada.code !== 0) {
                throw new Error('FFmpeg (análisis de sonoridad) falló: ' + pasada.stderr.slice(-500));
            }
            medicion = this._parseLoudnorm(pasada.stderr);
            if (!medicion) throw new Error('No se pudo medir la sonoridad para la normalización precisa');
        }

        let cadenaLoudness = '';
        if (loudness) {
            if (medicion) {
                cadenaLoudness = `${loudness.filtro}:measured_I=${medicion.input_i}:measured_TP=${medicion.input_tp}:measured_LRA=${medicion.input_lra}:measured_thresh=${medicion.input_thresh}:offset=${medicion.target_offset}:linear=true:print_format=summary`;
            } else {
                cadenaLoudness = loudness.filtro;
            }
        }

        const cadenaFinal = [
            prefijo,
            cadenaBase ? cadenaBase + ',' : '',
            cadenaLoudness ? cadenaLoudness + ',' : '',
            'aresample=48000[out]'
        ].join('');

        const args = ['-hide_banner', '-i', rutaAudio];
        if (partes) args.push('-filter_complex', partes.join(';') + ';' + cadenaFinal);
        else args.push('-filter_complex', cadenaFinal);

        args.push(
            '-map', '[out]',
            '-map_metadata', '-1',
            '-vn',
            '-ar', '48000',
            '-c:a', FORMATOS[formato].codec
        );

        if (formato === 'wav') {
            args.push('-c:a', bitDepth === 24 ? 'pcm_s24le' : 'pcm_s16le');
        } else if (FORMATOS[formato].bitrate) {
            args.push('-b:a', FORMATOS[formato].bitrate);
        }
        if (formato === 'flac') args.push('-compression_level', '8');

        args.push('-y', rutaSalida);

        const resultado = await this._run(args);
        if (resultado.code !== 0 || !fs.existsSync(rutaSalida)) {
            try { fs.unlinkSync(rutaSalida); } catch (e) { /* noop */ }
            throw new Error('FFmpeg falló: ' + String(resultado.stderr).slice(-600));
        }

        const stats = fs.statSync(rutaSalida);
        if (stats.size < 1000) {
            try { fs.unlinkSync(rutaSalida); } catch (e) { /* noop */ }
            throw new Error('El render generó un archivo vacío');
        }

        const duracionSalida = await this._duracion(rutaSalida);
        let medicionSalida = null;
        if (loudness) {
            try {
                medicionSalida = await this.analizar(rutaSalida);
            } catch (error) {
                console.warn('[AudioRenderService] No se pudo medir el render:', error.message);
            }
        }

        console.log(`[AudioRenderService] Render listo: ${nombreSalida} (${(stats.size / 1024).toFixed(1)} KB, ${duracionSalida.toFixed(2)}s)`);

        return {
            url: '/audios/' + nombreSalida,
            duration: duracionSalida,
            size: stats.size,
            format: formato,
            bitDepth: formato === 'wav' ? bitDepth : null,
            lufs: medicionSalida ? medicionSalida.lufs : null,
            truePeak: medicionSalida ? medicionSalida.truePeak : null,
            lra: medicionSalida ? medicionSalida.lra : null
        };
    }
}

module.exports = AudioRenderService;
