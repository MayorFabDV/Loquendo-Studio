// services/audio/projectRenderService.js - Render no destructivo de un proyecto multipista
'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { ejecutar, duracion: duracionArchivo } = require('./ffmpegProcess');
const { numero, dbALineal, limitar, formatearNumero } = require('./audioMath');

const FORMATOS = {
    wav: { ext: 'wav', codec: ['-c:a', 'pcm_s24le'] },
    mp3: { ext: 'mp3', codec: ['-c:a', 'libmp3lame', '-b:a', '320k'] },
    flac: { ext: 'flac', codec: ['-c:a', 'flac'] },
    opus: { ext: 'opus', codec: ['-c:a', 'libopus', '-b:a', '160k'] }
};

const CURVAS_FADE = new Set(['tri', 'qsin', 'hsin', 'esin', 'log', 'ipar', 'qua', 'cub', 'squ', 'cbr', 'par', 'exp', 'iqsin', 'ihsin', 'dese', 'desi', 'losi', 'sinc', 'isinc', 'linear']);

class ProjectRenderService {
    constructor(ffmpegPath, ffprobePath, assetStore, opciones = {}) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
        this.assetStore = assetStore;
        this.audioRenderService = opciones.audioRenderService || null;
        this.resolverFuente = opciones.resolverFuente || null;
        this.duraciones = new Map();
    }

    async _duracion(archivo) {
        if (this.duraciones.has(archivo)) return this.duraciones.get(archivo);
        const valor = await duracionArchivo(this.ffprobePath, archivo);
        this.duraciones.set(archivo, valor);
        return valor;
    }

    _resolverClip(projectId, clip) {
        if (clip.asset) {
            return this.assetStore.resolverAsset(projectId, clip.asset);
        }
        if (clip.src && typeof this.resolverFuente === 'function') {
            const abs = this.resolverFuente(clip.src);
            if (abs) return abs;
        }
        throw new Error(`No se pudo resolver el audio del clip ${clip.id || '(sin id)'}`);
    }

    _normalizarProyecto(project) {
        const datos = project && typeof project === 'object' ? project : {};
        const clips = Array.isArray(datos.clips) ? datos.clips : [];
        const tracks = Array.isArray(datos.tracks) ? datos.tracks : [];

        const pistas = new Map();
        for (const t of tracks) {
            if (!t || !t.id) continue;
            pistas.set(String(t.id), {
                id: String(t.id),
                nombre: String(t.nombre || t.id),
                gainDb: numero(t.gainDb, 0, [-60, 24]),
                pan: numero(t.pan, 0, [-1, 1]),
                mute: !!t.mute,
                effects: t.effects && typeof t.effects === 'object' ? t.effects : {}
            });
        }

        const normalizados = [];
        const ids = new Set();
        for (let i = 0; i < clips.length && normalizados.length < 500; i++) {
            const c = clips[i] || {};
            let id = typeof c.id === 'string' && c.id ? c.id : `clip-${i}`;
            if (ids.has(id)) id = `${id}-${i}`;
            ids.add(id);

            const trackId = String(c.trackId || c.pista || 'voz');
            if (!pistas.has(trackId)) {
                pistas.set(trackId, {
                    id: trackId,
                    nombre: trackId,
                    gainDb: 0,
                    pan: 0,
                    mute: false,
                    effects: {}
                });
            }

            const start = Math.max(0, numero(c.start != null ? c.start : c.startPosition, 0));
            const entrada = Math.max(0, numero(c.in, 0));
            let salida = numero(c.out, 0);
            if (!(salida > entrada)) salida = 0;

            normalizados.push({
                ...c,
                id,
                trackId,
                start,
                in: entrada,
                out: salida,
                gainDb: numero(c.gainDb, 0, [-60, 24]),
                pan: numero(c.pan, 0, [-1, 1]),
                fadeIn: numero(c.fadeIn, 0, [0, 120]),
                fadeOut: numero(c.fadeOut, 0, [0, 120]),
                fadeCurve: c.fadeCurve || 'tri',
                automation: Array.isArray(c.automation) ? c.automation : [],
                effects: c.effects && typeof c.effects === 'object' ? c.effects : {}
            });
        }

        return {
            id: datos.id,
            clips: normalizados,
            tracks: [...pistas.values()],
            master: datos.master && typeof datos.master === 'object' ? datos.master : {}
        };
    }

    _efectosEstaticos(effects, duracion) {
        if (!this.audioRenderService || !effects || !Object.keys(effects).length) return [];
        const receta = {
            ...effects,
            pitch: 0,
            rate: 1,
            fades: { in: 0, out: 0 },
            gainDb: 0,
            limiter: { ceiling: 0 },
            loudness: { enabled: false }
        };
        try {
            return this.audioRenderService._cadena(receta, duracion);
        } catch (error) {
            return [];
        }
    }

    _expresionAutomatizacion(automation, duracion, gananciaBase) {
        if (!Array.isArray(automation) || !automation.length) return null;

        let puntos = automation
            .map((p) => {
                const t = numero(p && p.t, 0);
                if (p && p.gain != null) {
                    const ganancia = numero(p.gain, 1, [0, 1]);
                    const db = ganancia <= 0.000001 ? -60 : Math.max(-60, Math.min(24, 20 * Math.log10(ganancia)));
                    return { t, db };
                }
                return { t, db: numero(p && p.gainDb, 0, [-60, 24]) };
            })
            .filter((p) => Number.isFinite(p.t))
            .sort((a, b) => a.t - b.t);

        if (!puntos.length) return null;

        const compactos = [];
        for (const p of puntos) {
            if (compactos.length && Math.abs(compactos[compactos.length - 1].t - p.t) < 0.005) {
                compactos[compactos.length - 1] = p;
            } else {
                compactos.push(p);
            }
        }
        puntos = compactos;

        // Interpolar antes de recortar: clamping de puntos exteriores altera rampas
        // cuando el clip tiene offset o se divide en varios clips de la misma fuente.
        const dbEn = (t) => {
            if (t <= puntos[0].t) return puntos[0].db;
            for (let i = 1; i < puntos.length; i++) {
                if (t <= puntos[i].t) {
                    const a = puntos[i - 1], b = puntos[i];
                    const ratio = (t - a.t) / (b.t - a.t);
                    const gain = dbALineal(a.db) + (dbALineal(b.db) - dbALineal(a.db)) * ratio;
                    return 20 * Math.log10(Math.max(0.000001, gain));
                }
            }
            return puntos[puntos.length - 1].db;
        };
        const entrada = dbEn(0), salida = dbEn(duracion);
        puntos = [{ t: 0, db: entrada }, ...puntos.filter(p => p.t > 0 && p.t < duracion), { t: duracion, db: salida }];

        if (puntos.length > 240) {
            const paso = (puntos.length - 1) / 239;
            const reducidos = [];
            for (let i = 0; i < 240; i++) reducidos.push(puntos[Math.round(i * paso)]);
            puntos = reducidos;
        }

        if (puntos.length === 1) {
            return formatearNumero(gananciaBase * dbALineal(puntos[0].db));
        }

        const g = puntos.map((p) => gananciaBase * dbALineal(p.db));
        let expresion = formatearNumero(g[g.length - 1]);
        for (let i = puntos.length - 2; i >= 0; i--) {
            const t0 = puntos[i].t;
            const t1 = puntos[i + 1].t;
            const dt = Math.max(0.0001, t1 - t0);
            const g0 = formatearNumero(g[i]);
            const g1 = formatearNumero(g[i + 1]);
            const pendiente = formatearNumero((g[i + 1] - g[i]) / dt);
            const rampa = `(${g0}+(${pendiente})*(t-${formatearNumero(t0)}))`;
            expresion = `if(lt(t,${formatearNumero(t0)}),${g0},if(lt(t,${formatearNumero(t1)}),${rampa},${expresion}))`;
        }
        return expresion;
    }

    _filtroPan(pan) {
        if (!pan) return null;
        const izquierda = formatearNumero(pan < 0 ? 1 : 1 - pan);
        const derecha = formatearNumero(pan > 0 ? 1 : 1 + pan);
        return `pan=stereo|c0=${izquierda}*c0|c1=${derecha}*c1`;
    }

    async render(project, opciones = {}) {
        if (Array.isArray(project?.clips) && project.clips.length > 500) throw new Error('El render admite hasta 500 clips; no se descartó ninguno');
        const datos = this._normalizarProyecto(project);
        if (!datos.clips.length) throw new Error('El proyecto no tiene clips');
        const projectId = String(opciones.projectId || project.id || '');
        if (!this.assetStore.idValido(projectId)) throw new Error('Proyecto inválido para renderizar');
        const integridad = await this.assetStore.comprobarIntegridad(projectId, { clips: datos.clips.filter(c => c.asset) });
        if (!integridad.ok) throw new Error('El proyecto contiene medios persistentes faltantes o dañados; recupera sus fuentes antes de renderizar');

        const formato = FORMATOS[opciones.formato] ? opciones.formato : 'wav';
        const cfgFormato = FORMATOS[formato];

        const cacheDur = new Map();
        const usados = [];
        for (const clip of datos.clips) {
            const abs = this._resolverClip(projectId, clip);
            if (!fs.existsSync(abs)) throw new Error(`Falta el asset del clip ${clip.id}: ${clip.asset || clip.src}`);
            let durAsset = cacheDur.get(abs);
            if (durAsset === undefined) {
                durAsset = await this._duracion(abs);
                cacheDur.set(abs, durAsset);
                usados.push(abs);
            }
            if (!(clip.out > clip.in)) {
                clip.out = durAsset > 0 ? durAsset : clip.in;
            }
            clip.out = Math.min(clip.out, durAsset > 0 ? durAsset : clip.out);
            if (!(clip.out > clip.in)) {
                throw new Error(`El clip ${clip.id} no tiene una duración válida`);
            }
            clip._dur = clip.out - clip.in;
            clip._abs = abs;
        }

        const pistas = new Map(datos.tracks.map((t) => [t.id, t]));
        const activos = datos.clips.filter((c) => {
            const pista = pistas.get(c.trackId);
            return !(pista && pista.mute);
        });
        if (!activos.length) throw new Error('No hay clips audibles (todas las pistas están silenciadas)');

        const entradas = [];
        const indicePorArchivo = new Map();
        for (const clip of activos) {
            if (!indicePorArchivo.has(clip._abs)) {
                indicePorArchivo.set(clip._abs, entradas.length);
                entradas.push(clip._abs);
            }
        }

        const clipsPorEntrada = new Map();
        for (const clip of activos) {
            const indice = indicePorArchivo.get(clip._abs);
            if (!clipsPorEntrada.has(indice)) clipsPorEntrada.set(indice, 0);
            clipsPorEntrada.set(indice, clipsPorEntrada.get(indice) + 1);
        }

        const lineas = [];
        const etiquetaEntrada = new Map();
        for (const [archivo, indice] of indicePorArchivo.entries()) {
            const cuantos = clipsPorEntrada.get(indice) || 1;
            if (cuantos > 1) {
                const salidas = Array.from({ length: cuantos }, (_, k) => `[e${indice}_${k}]`).join('');
                lineas.push(`[${indice}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=${cuantos}${salidas}`);
                etiquetaEntrada.set(indice, Array.from({ length: cuantos }, (_, k) => `[e${indice}_${k}]`));
            } else {
                lineas.push(`[${indice}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[e${indice}_0]`);
                etiquetaEntrada.set(indice, [`[e${indice}_0]`]);
            }
        }

        const contadorPorEntrada = new Map();
        const salidasClips = [];

        activos.forEach((clip, orden) => {
            const indice = indicePorArchivo.get(clip._abs);
            const k = contadorPorEntrada.get(indice) || 0;
            contadorPorEntrada.set(indice, k + 1);
            const entrada = (etiquetaEntrada.get(indice) || [])[k] || `[e${indice}_0]`;

            const pista = pistas.get(clip.trackId) || { gainDb: 0, pan: 0 };
            const filtros = [
                `atrim=start=${formatearNumero(clip.in)}:end=${formatearNumero(clip.out)}`,
                'asetpts=PTS-STARTPTS'
            ];

            filtros.push(...this._efectosEstaticos(clip.effects, clip._dur));

            const gainPista = numero(pista.gainDb, 0, [-60, 24]);
            const gainClip = numero(clip.gainDb, 0, [-60, 24]);
            const tieneAutomatizacion = Array.isArray(clip.automation) && clip.automation.length > 0;
            // La automatización del mezclador ya incluye la ganancia del clip (es absoluta).
            const base = dbALineal(gainPista + (tieneAutomatizacion ? 0 : gainClip));
            const automatizacion = tieneAutomatizacion
                ? this._expresionAutomatizacion(
                    clip.automation.map((p) => ({ ...p, t: numero(p.t, 0) - clip.in })),
                    clip._dur,
                    base
                )
                : null;
            if (automatizacion) {
                // La ganancia se evalúa por frame: bloques pequeños evitan saltos
                // audibles y diferencias grandes al dividir una misma rampa.
                filtros.push('asetnsamples=n=128:p=0');
                filtros.push(`volume='${automatizacion}':eval=frame`);
            } else if (Math.abs(base - 1) > 0.0001) {
                filtros.push(`volume=${formatearNumero(base, 8)}`);
            }

            const curva = clip.fadeCurve === 'linear' ? 'tri' : (CURVAS_FADE.has(clip.fadeCurve) ? clip.fadeCurve : 'tri');
            if (clip.fadeIn > 0) {
                filtros.push(`afade=t=in:st=0:d=${formatearNumero(clip.fadeIn)}:curve=${curva}`);
            }
            if (clip.fadeOut > 0) {
                const inicio = Math.max(0, clip._dur - clip.fadeOut);
                filtros.push(`afade=t=out:st=${formatearNumero(inicio)}:d=${formatearNumero(clip.fadeOut)}:curve=${curva}`);
            }

            const pan = numero(pista.pan, 0, [-1, 1]) + numero(clip.pan, 0, [-1, 1]);
            const filtroPan = this._filtroPan(limitar(pan, -1, 1));
            if (filtroPan) filtros.push(filtroPan);

            const retardoMs = Math.round(clip.start * 1000);
            if (retardoMs > 0) filtros.push(`adelay=${retardoMs}:all=1`);

            const salida = `[c${orden}]`;
            lineas.push(`${entrada}${filtros.join(',')}${salida}`);
            salidasClips.push(salida);
        });

        let salidaFinal = salidasClips[0];
        if (salidasClips.length > 1) {
            lineas.push(`${salidasClips.join('')}amix=inputs=${salidasClips.length}:normalize=0:dropout_transition=0[mix]`);
            salidaFinal = '[mix]';
        }

        const master = datos.master || {};
        const masterGain = numero(master.gainDb, 0, [-60, 24]);
        const filtrosMaster = [];
        if (Math.abs(masterGain) > 0.0001) filtrosMaster.push(`volume=${formatearNumero(dbALineal(masterGain), 8)}`);

        const loudness = master.loudness || {};
        if (loudness.enabled && loudness.target !== 'off') {
            const target = numero(loudness.target, -16, [-40, -5]);
            const truePeak = numero(loudness.truePeak, -1.5, [-6, 0]);
            const lra = numero(loudness.lra, 11, [1, 50]);
            filtrosMaster.push(`loudnorm=I=${target}:TP=${truePeak}:LRA=${lra}`);
        } else if (master.limiter !== false) {
            filtrosMaster.push('alimiter=limit=0.95:attack=5:release=50:level=0');
        }

        if (filtrosMaster.length) {
            lineas.push(`${salidaFinal}${filtrosMaster.join(',')}[out]`);
            salidaFinal = '[out]';
        }

        const duracion = Math.max(...activos.map((c) => c.start + c._dur));
        const marca = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        const nombre = `proyecto-${marca}-${randomUUID()}.${cfgFormato.ext}`;
        const rutaSalida = path.join(this.assetStore.directorioRenders(projectId), nombre);
        const rutaFiltros = path.join(os.tmpdir(), `loquendo-filtros-${process.pid}-${Date.now()}.txt`);
        await fsp.writeFile(rutaFiltros, lineas.join(';\n'), 'utf8');

        const args = ['-hide_banner', '-nostdin', '-y'];
        for (const archivo of entradas) args.push('-i', archivo);
        args.push(
            '-/filter_complex', rutaFiltros,
            '-map', salidaFinal,
            '-map_metadata', '-1',
            '-vn',
            '-ar', '48000',
            ...cfgFormato.codec,
            rutaSalida
        );

        try {
            const resultado = await ejecutar(this.ffmpegPath, args, { timeoutMs: 45 * 60 * 1000 });
            if (resultado.code !== 0 || !fs.existsSync(rutaSalida)) {
                await fsp.unlink(rutaSalida).catch(() => {});
                throw new Error('FFmpeg falló renderizando el proyecto: ' + String(resultado.stderr).slice(-1200));
            }
        } finally {
            await fsp.unlink(rutaFiltros).catch(() => {});
        }

        const stats = await fsp.stat(rutaSalida);
        if (stats.size < 1000) {
            await fsp.unlink(rutaSalida).catch(() => {});
            throw new Error('El render del proyecto generó un archivo vacío');
        }

        this._limpiarRenders(projectId);

        return {
            archivo: nombre,
            url: this.assetStore.urlAsset(projectId, `renders/${nombre}`),
            duration: duracion,
            size: stats.size,
            format: formato,
            sampleRate: 48000,
            filters: lineas.length
        };
    }

    _limpiarRenders(projectId) {
        try {
            const dir = this.assetStore.directorioRenders(projectId);
            const archivos = fs.readdirSync(dir)
                .map((nombre) => ({ nombre, ruta: path.join(dir, nombre) }))
                .map((x) => {
                    try { return { ...x, mtime: fs.statSync(x.ruta).mtimeMs }; } catch (e) { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => b.mtime - a.mtime);

            for (const archivo of archivos.slice(10)) {
                fs.promises.unlink(archivo.ruta).catch(() => {});
            }
        } catch (error) {
            /* noop */
        }
    }
}

module.exports = { ProjectRenderService, FORMATOS };
