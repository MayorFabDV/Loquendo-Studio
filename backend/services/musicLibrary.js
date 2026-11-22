'use strict';
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { validarAudio } = require('./audioFileValidation');
const EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.opus', '.aac'];

class MusicLibrary {
    constructor(dataDir, ffprobe, ffmpeg) {
        this.file = path.join(dataDir, 'music-library.json');
        this.ffprobe = ffprobe; this.ffmpeg = ffmpeg; this.queue = Promise.resolve();
    }
    async leer() {
        let raw;
        try { raw = await fs.readFile(this.file, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return { version: 1, items: [] }; throw error; }
        try {
            const data = JSON.parse(raw), ids = new Set();
            if (data.version !== 1 || !Array.isArray(data.items)) throw Error();
            for (const row of data.items) {
                if (!row || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/.test(row.id) || ids.has(row.id)
                    || typeof row.path !== 'string' || !path.isAbsolute(row.path) || typeof row.name !== 'string'
                    || typeof row.saved !== 'boolean' || !Number.isFinite(row.lastUsed) || !(row.duration > 0)) throw Error();
                ids.add(row.id);
            }
            return data;
        } catch { throw new Error('La biblioteca no se puede leer. Se conserva el archivo existente sin sobrescribirlo'); }
    }
    modificar(fn) {
        const job = this.queue.catch(() => {}).then(async () => {
            const data = await this.leer(), result = await fn(data);
            // Recientes acotados; una canción guardada nunca se descarta por antigüedad.
            const recientes = data.items.filter(r => !r.saved).sort((a,b) => b.lastUsed-a.lastUsed).slice(0,30);
            data.items = data.items.filter(r => r.saved || recientes.includes(r));
            await fs.mkdir(path.dirname(this.file), { recursive: true });
            const temp = `${this.file}.${randomUUID()}.tmp`;
            try {
                await fs.writeFile(temp, JSON.stringify(data, null, 2), { flag: 'wx' });
                await fs.rename(temp, this.file);
            } finally { await fs.unlink(temp).catch(() => {}); }
            return result;
        });
        this.queue = job; return job;
    }
    igual(a, b) { return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
    async registrar(file, id = null) {
        const original = await fs.realpath(file);
        const info = await validarAudio(original, this.ffprobe, this.ffmpeg, EXTENSIONS);
        return this.modificar(data => {
            const existente = data.items.find(r => this.igual(r.path, original));
            let row = id ? data.items.find(r => r.id === id) : existente;
            if (id && !row) throw new Error('La entrada ya no existe');
            if (id && existente && existente.id !== id) throw new Error('Ese archivo ya tiene otra entrada en Recientes o Mi biblioteca');
            if (!row) { row = { id: randomUUID(), saved: false }; data.items.push(row); }
            Object.assign(row, { path: original, name: path.basename(original), duration: info.duration, lastUsed: Date.now() });
            return { ...row, missing: false };
        });
    }
    async obtener(id) {
        await this.queue.catch(() => {});
        const row = (await this.leer()).items.find(r => r.id === id);
        if (!row) throw new Error('La canción ya no está en el historial');
        return row;
    }
    async resolver(id) {
        const row = await this.obtener(id);
        try { if (!(await fs.stat(row.path)).isFile()) throw Error(); }
        catch { throw new Error('No se encuentra el archivo. Usa Localizar archivo para seleccionarlo nuevamente'); }
        return row.path;
    }
    async seleccionar(id) {
        const file = await this.resolver(id);
        return this.registrar(file, id);
    }
    async listar() {
        await this.queue.catch(() => {});
        const data = await this.leer();
        return Promise.all(data.items.sort((a,b) => b.lastUsed-a.lastUsed).map(async row => {
            let missing = false;
            try { missing = !(await fs.stat(row.path)).isFile(); } catch { missing = true; }
            return { ...row, missing };
        }));
    }
    guardar(id, saved) {
        return this.modificar(data => {
            const row = data.items.find(r => r.id === id);
            if (!row) throw new Error('La entrada ya no existe');
            row.saved = saved; return { ...row };
        });
    }
    // Solo elimina metadatos; nunca toca row.path ni el archivo musical.
    eliminar(id) { return this.modificar(data => { data.items = data.items.filter(r => r.id !== id); }); }
}
module.exports = { MusicLibrary, EXTENSIONS };
