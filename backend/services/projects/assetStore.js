// services/projects/assetStore.js - Proyectos y assets persistentes (no temporales)
'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const EXT_AUDIO = new Set(['.wav', '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.aiff', '.aif', '.wma', '.webm']);
const EXT_IMAGEN = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const ID_VALIDO = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function asegurarDirectorio(ruta) {
    fs.mkdirSync(ruta, { recursive: true });
    return ruta;
}

function dentroDe(base, candidato) {
    const rel = path.relative(path.resolve(base), path.resolve(candidato));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function hashArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(archivo);
        stream.on('data', (trozo) => hash.update(trozo));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

function limpiarNombre(nombre) {
    return String(nombre || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

class AssetStore {
    constructor(dataDir, opciones = {}) {
        this.dataDir = path.resolve(dataDir);
        this.projectsDir = asegurarDirectorio(path.join(this.dataDir, 'projects'));
        this.cacheDir = asegurarDirectorio(path.join(this.dataDir, 'cache'));
        this.raicesPermitidas = (opciones.raicesPermitidas || []).map((r) => path.resolve(r));
        this.maxBytes = Number(opciones.maxBytes) > 0 ? Number(opciones.maxBytes) : 4 * 1024 * 1024 * 1024;
        this.escrituras = new Map();
    }

    idValido(id) {
        return typeof id === 'string' && ID_VALIDO.test(id) && !id.includes('..');
    }

    nuevoId() {
        const marca = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        return `p-${marca}-${crypto.randomBytes(3).toString('hex')}`;
    }

    directorioProyecto(id) {
        if (!this.idValido(id)) throw new Error('Identificador de proyecto inválido');
        return path.join(this.projectsDir, id);
    }

    directorioAssets(id) {
        return asegurarDirectorio(path.join(this.directorioProyecto(id), 'assets'));
    }

    directorioRenders(id) {
        return asegurarDirectorio(path.join(this.directorioProyecto(id), 'renders'));
    }

    rutaProyecto(id) {
        return path.join(this.directorioProyecto(id), 'project.json');
    }

    asegurarProyecto(id) {
        const dir = this.directorioProyecto(id);
        asegurarDirectorio(dir);
        asegurarDirectorio(path.join(dir, 'assets'));
        asegurarDirectorio(path.join(dir, 'renders'));
        return dir;
    }

    fuentePermitida(archivo) {
        const abs = fs.realpathSync(archivo);
        return this.raicesPermitidas.some((raiz) => fs.existsSync(raiz) && dentroDe(fs.realpathSync(raiz), abs));
    }

    async importarAsset(projectId, origen, opciones = {}) {
        const abs = path.resolve(String(origen || ''));
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            throw new Error('El archivo de origen no existe');
        }
        if (!this.fuentePermitida(abs)) {
            throw new Error('El archivo de origen está fuera de las carpetas permitidas');
        }

        const ext = path.extname(abs).toLowerCase();
        if (!EXT_AUDIO.has(ext) && !EXT_IMAGEN.has(ext)) {
            throw new Error(`Extensión no permitida: ${ext || '(sin extensión)'}`);
        }

        const stats = fs.statSync(abs);
        if (stats.size > this.maxBytes) throw new Error('El archivo supera el tamaño máximo permitido');
        if (stats.size === 0) throw new Error('El archivo está vacío');

        const sha256 = await hashArchivo(abs);
        let nombreArchivo = sha256 + ext;
        let destino = path.join(this.directorioAssets(projectId), nombreArchivo);
        if (fs.existsSync(destino) && await hashArchivo(destino) !== sha256) {
            // No sobrescribir un archivo dañado: conservarlo y crear una copia válida independiente.
            nombreArchivo = `${sha256}-${crypto.randomBytes(6).toString('hex')}${ext}`;
            destino = path.join(this.directorioAssets(projectId), nombreArchivo);
        }

        if (!fs.existsSync(destino)) {
            const temporal = `${destino}.tmp-${crypto.randomUUID()}`;
            try {
                await fsp.copyFile(abs, temporal);
                if (await hashArchivo(temporal) !== sha256) throw new Error('El audio cambió durante la copia; vuelve a intentarlo');
                try { await fsp.copyFile(temporal, destino, fs.constants.COPYFILE_EXCL); }
                catch (error) {
                    if (error.code !== 'EEXIST' || await hashArchivo(destino) !== sha256) throw error;
                }
            } catch (error) {
                throw error;
            } finally {
                await fsp.unlink(temporal).catch(() => {});
            }
        }

        return {
            asset: path.posix.join('assets', nombreArchivo),
            sha256,
            size: stats.size,
            ext,
            nombre: limpiarNombre(opciones.nombre || path.basename(abs)),
            url: this.urlAsset(projectId, path.posix.join('assets', nombreArchivo))
        };
    }

    resolverAsset(projectId, relativo) {
        const limpio = String(relativo || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (limpio.includes('..')) throw new Error('Ruta de asset inválida');
        const abs = path.resolve(path.join(this.directorioProyecto(projectId), limpio));
        if (!dentroDe(this.directorioProyecto(projectId), abs)) {
            throw new Error('Ruta de asset fuera del proyecto');
        }
        return abs;
    }

    urlAsset(projectId, relativo) {
        const partes = String(relativo || '')
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean)
            .map((p) => encodeURIComponent(p));
        return `/media/projects/${encodeURIComponent(projectId)}/${partes.join('/')}`;
    }

    guardarProyecto(id, datos) {
        const projectId = id || this.nuevoId();
        if (!this.idValido(projectId)) return Promise.reject(new Error('Identificador de proyecto inválido'));
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)
            || (datos.clips !== undefined && !Array.isArray(datos.clips))) {
            return Promise.reject(new Error('Documento de proyecto inválido'));
        }
        // Capturar el documento ahora, no después de otras escrituras pendientes.
        let snapshot;
        try { snapshot = JSON.parse(JSON.stringify(datos)); }
        catch (error) { return Promise.reject(error); }
        const anterior = this.escrituras.get(projectId) || Promise.resolve();
        const trabajo = anterior.catch(() => {}).then(() => this._guardarProyecto(projectId, snapshot));
        this.escrituras.set(projectId, trabajo);
        trabajo.finally(() => {
            if (this.escrituras.get(projectId) === trabajo) this.escrituras.delete(projectId);
        }).catch(() => {});
        return trabajo;
    }

    async _guardarProyecto(projectId, datos) {
        this.asegurarProyecto(projectId);
        const ahora = new Date().toISOString();
        const previo = this.leerProyecto(projectId, { silencioso: true });
        const documento = {
            ...datos,
            id: projectId,
            createdAt: (previo && previo.createdAt) || ahora,
            updatedAt: ahora
        };
        const ruta = this.rutaProyecto(projectId);
        const temporal = `${ruta}.tmp-${crypto.randomUUID()}`;
        try {
            await fsp.writeFile(temporal, JSON.stringify(documento, null, 2), 'utf8');
            if (fs.existsSync(ruta)) {
                let valida = false;
                try { this._leerDocumento(ruta); valida = true; } catch (e) { /* conservar el archivo corrupto */ }
                const copia = valida ? path.join(path.dirname(ruta), 'project.previous.json')
                    : path.join(path.dirname(ruta), `project.corrupt-${crypto.randomUUID()}.json`);
                const copiaTemp = `${copia}.tmp-${crypto.randomUUID()}`;
                try { await fsp.copyFile(ruta, copiaTemp); await fsp.rename(copiaTemp, copia); }
                finally { await fsp.unlink(copiaTemp).catch(() => {}); }
            }
            await fsp.rename(temporal, ruta);
        } finally { await fsp.unlink(temporal).catch(() => {}); }
        return documento;
    }

    _leerDocumento(ruta) {
        const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)
            || (datos.clips !== undefined && !Array.isArray(datos.clips))) throw new Error('Proyecto dañado');
        return datos;
    }

    leerConRespaldo(id) {
        const ruta = this.rutaProyecto(id);
        try { return { proyecto: this._leerDocumento(ruta), recuperado: false }; }
        catch (error) {
            const copia = path.join(this.directorioProyecto(id), 'project.previous.json');
            if (fs.existsSync(copia)) return { proyecto: this._leerDocumento(copia), recuperado: true };
            if (error.code === 'ENOENT') return { proyecto: null, recuperado: false };
            throw error;
        }
    }

    leerProyecto(id, opciones = {}) {
        try {
            return this.leerConRespaldo(id).proyecto;
        } catch (error) {
            if (opciones.silencioso) return null;
            throw error;
        }
    }

    async comprobarIntegridad(id, proyecto = this.leerProyecto(id)) {
        if (!proyecto) throw new Error('Proyecto no encontrado');
        const faltantes = [], danados = [], comprobados = new Map();
        for (const clip of proyecto.clips || []) {
            const ref = String(clip.asset || '');
            if (!ref) { faltantes.push({ id: clip.id, asset: ref, src: clip.src || '' }); continue; }
            let estado = comprobados.get(ref);
            if (!estado) {
                try {
                    const archivo = this.resolverAsset(id, ref);
                    if (!dentroDe(fs.realpathSync(this.directorioProyecto(id)), fs.realpathSync(archivo))) throw new Error('Asset fuera del proyecto');
                    const stats = await fsp.stat(archivo);
                    if (!stats.isFile() || !stats.size) throw new Error('Asset vacío');
                    const esperado = /^([a-f0-9]{64})(?:-|\.)/.exec(path.basename(ref));
                    estado = esperado && await hashArchivo(archivo) !== esperado[1] ? 'danado' : 'ok';
                } catch (error) { estado = error.code === 'ENOENT' ? 'faltante' : 'danado'; }
                comprobados.set(ref, estado);
            }
            if (estado === 'faltante') faltantes.push({ id: clip.id, asset: ref });
            if (estado === 'danado') danados.push({ id: clip.id, asset: ref });
        }
        return { ok: !faltantes.length && !danados.length, faltantes, danados, assets: comprobados.size };
    }

    listarProyectos() {
        let entradas = [];
        try {
            entradas = fs.readdirSync(this.projectsDir, { withFileTypes: true });
        } catch (error) {
            return [];
        }

        const proyectos = [];
        for (const entrada of entradas) {
            if (!entrada.isDirectory() || !this.idValido(entrada.name)) continue;
            let lectura;
            try { lectura = this.leerConRespaldo(entrada.name); }
            catch (error) {
                proyectos.push({ id: entrada.name, nombre: 'Proyecto ilegible (archivos conservados)', corrupto: true });
                continue;
            }
            const datos = lectura.proyecto;
            if (!datos) continue;
            proyectos.push({
                id: entrada.name,
                recuperado: lectura.recuperado,
                nombre: datos.nombre || 'Proyecto sin nombre',
                createdAt: datos.createdAt || null,
                updatedAt: datos.updatedAt || null,
                duration: Number(datos.duration) || 0,
                clipCount: Array.isArray(datos.clips) ? datos.clips.length : 0,
                trackCount: Array.isArray(datos.tracks) ? datos.tracks.length : 0
            });
        }

        proyectos.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return proyectos;
    }

    async eliminarProyecto(id) {
        const dir = this.directorioProyecto(id);
        if (!fs.existsSync(dir)) return false;
        await fsp.rm(dir, { recursive: true, force: true });
        return true;
    }

    listarAssets(id) {
        const dir = this.directorioAssets(id);
        try {
            return fs.readdirSync(dir, { withFileTypes: true })
                .filter((e) => e.isFile())
                .map((e) => ({ nombre: e.name, url: this.urlAsset(id, `assets/${e.name}`) }));
        } catch (error) {
            return [];
        }
    }
}

module.exports = { AssetStore, EXT_AUDIO, EXT_IMAGEN, hashArchivo, limpiarNombre };
