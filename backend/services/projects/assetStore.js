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
        const abs = path.resolve(archivo);
        return this.raicesPermitidas.some((raiz) => dentroDe(raiz, abs));
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
        const nombreArchivo = sha256 + ext;
        const relativo = path.posix.join('assets', nombreArchivo);
        const destino = path.join(this.directorioAssets(projectId), nombreArchivo);

        if (!fs.existsSync(destino)) {
            const temporal = `${destino}.tmp-${process.pid}-${Date.now()}`;
            try {
                await fsp.copyFile(abs, temporal);
                await fsp.rename(temporal, destino);
            } catch (error) {
                await fsp.unlink(temporal).catch(() => {});
                throw error;
            }
        }

        return {
            asset: relativo,
            sha256,
            size: stats.size,
            ext,
            nombre: limpiarNombre(opciones.nombre || path.basename(abs)),
            url: this.urlAsset(projectId, relativo)
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

    async guardarProyecto(id, datos) {
        const projectId = id || this.nuevoId();
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
        const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
        await fsp.writeFile(temporal, JSON.stringify(documento, null, 2), 'utf8');
        await fsp.rename(temporal, ruta);
        return documento;
    }

    leerProyecto(id, opciones = {}) {
        try {
            const ruta = this.rutaProyecto(id);
            if (!fs.existsSync(ruta)) return null;
            return JSON.parse(fs.readFileSync(ruta, 'utf8'));
        } catch (error) {
            if (opciones.silencioso) return null;
            throw error;
        }
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
            const datos = this.leerProyecto(entrada.name, { silencioso: true });
            if (!datos) continue;
            proyectos.push({
                id: entrada.name,
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
