// backend/services/databaseService.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Fuentes JSON: intenta primero el nombre real del legacy (diccionario_*) y
// luego una variante sin prefijo por compatibilidad con otros setups.
const FUENTES_JSON = {
    jergas: ['diccionario_jergas.json', 'jergas.json'],
    sinonimos: ['diccionario_sinonimos.json', 'sinonimos.json'],
    ortografia: ['diccionario_ortografia.json', 'ortografia.json'],
    gramatica: ['diccionario_gramatica.json', 'gramatica.json'],
    loquendo: ['diccionario_loquendo.json', 'loquendo.json'],
    fonetica: ['diccionario_fonetica.json', 'fonetica.json'],
    perfil: ['perfil_usuario.json', 'perfil.json']
};

class DatabaseService {
    constructor(dbFolder) {
        this.dbPath = path.join(dbFolder, 'loquendo.db');
        this.db = null;
        this.isInitialized = false;

        if (!fs.existsSync(dbFolder)) {
            fs.mkdirSync(dbFolder, { recursive: true });
        }

        this.readyPromise = this.init();
    }

    async init() {
        try {
            const SQL = await initSqlJs();

            // Cargar base de datos existente o crear una nueva en memoria
            let fileBuffer = undefined;
            if (fs.existsSync(this.dbPath)) {
                fileBuffer = fs.readFileSync(this.dbPath);
            }

            this.db = new SQL.Database(fileBuffer);
            this.isInitialized = true;

            this._initTables();
            await this._migrateFromJSON(path.dirname(this.dbPath));
            this._save(); // Guardar estado inicial

            console.log('[DB] ✅ Base de datos SQLite inicializada (sql.js - sin compilación C++)');
        } catch (error) {
            console.error('[DB] ❌ Error inicializando base de datos:', error);
            this.isInitialized = false;
        }
    }

    // Para que server.js pueda esperar a que la DB esté lista antes de servir rutas
    whenReady() {
        return this.readyPromise;
    }

    _initTables() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS diccionarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                original TEXT NOT NULL,
                reemplazo TEXT NOT NULL,
                UNIQUE(tipo, original)
            )
        `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS meta (
                clave TEXT PRIMARY KEY,
                valor TEXT
            )
        `);
    }

    // ==========================================
    // MIGRACIÓN DESDE JSON (legacy)
    // ==========================================

    async _migrateFromJSON(dbFolder) {
        const directorioOK = dirname => fs.existsSync(dirname) && fs.statSync(dirname).isDirectory();
        if (!directorioOK(dbFolder)) return;

        for (const tipo of Object.keys(FUENTES_JSON)) {
            for (const nombreArchivo of FUENTES_JSON[tipo]) {
                const jsonPath = path.join(dbFolder, nombreArchivo);
                if (!fs.existsSync(jsonPath)) continue;

                this._migrarArchivo(tipo, jsonPath);
            }
        }
    }

    _migrarArchivo(tipo, jsonPath) {
        try {
            let contenido = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
            const hash = crypto.createHash('md5').update(contenido).digest('hex');

            const claveMeta = `migrado:${tipo}:${path.basename(jsonPath)}`;
            if (this._getMeta(claveMeta) === hash) {
                return; // ya migrado y sin cambios → no tocar
            }

            let data;
            const dataBruto = JSON.parse(contenido);
            if (dataBruto && typeof dataBruto === 'object' && !Array.isArray(dataBruto)) {
                data = dataBruto;
            } else {
                console.warn(`[DB] ⚠️ ${path.basename(jsonPath)} no es un objeto JSON válido, se omite.`);
                return;
            }

            let migradas = 0;
            let omitidas = 0;
            for (const [original, reemplazo] of Object.entries(data)) {
                const originalLimpio = String(original).toLowerCase().trim();
                if (!originalLimpio || reemplazo === null || reemplazo === undefined) {
                    omitidas++;
                    continue;
                }
                this.db.run(
                    "INSERT OR IGNORE INTO diccionarios (tipo, original, reemplazo) VALUES (?, ?, ?)",
                    [tipo, originalLimpio, JSON.stringify(this._normalizarReemplazo(reemplazo))]
                );
                migradas++;
            }

            this._setMeta(claveMeta, hash);
            this._save();
            console.log(`[DB] ✅ Migradas ${migradas} entradas de ${tipo} (${path.basename(jsonPath)})${omitidas ? `, ${omitidas} omitidas` : ''}`);
        } catch (e) {
            console.error(`[DB] ❌ Error migrando ${path.basename(jsonPath)}:`, e.message);
        }
    }

    // Normaliza el valor igual que hacía dictionaryService.js (lowercase + trim).
    _normalizarReemplazo(value) {
        if (Array.isArray(value)) {
            return value.map(v => String(v).toLowerCase().trim()).filter(Boolean);
        }
        return String(value).toLowerCase().trim();
    }

    // ==========================================
    // META (estado de migración / utility)
    // ==========================================

    _getMeta(clave) {
        if (!this.db) return null;
        const stmt = this.db.prepare("SELECT valor FROM meta WHERE clave = ?");
        stmt.bind([clave]);
        let valor = null;
        if (stmt.step()) {
            const row = stmt.getAsObject();
            valor = row.valor;
        }
        stmt.free();
        return valor;
    }

    _setMeta(clave, valor) {
        if (!this.db) return;
        this.db.run(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?, ?)",
            [clave, String(valor)]
        );
    }

    // Guarda la base de datos en memoria de vuelta al archivo .db
    _save() {
        if (this.db && this.isInitialized) {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        }
    }

    // ==========================================
    // MÉTODOS PÚBLICOS (Compatibles con server.js)
    // ==========================================

    getDiccionario(tipo) {
        if (!this.isInitialized || !this.db) return {};

        const stmt = this.db.prepare("SELECT original, reemplazo FROM diccionarios WHERE tipo = ?");
        stmt.bind([tipo]);
        const dict = {};

        while (stmt.step()) {
            const row = stmt.getAsObject();
            try {
                dict[row.original] = JSON.parse(row.reemplazo);
            } catch {
                dict[row.original] = row.reemplazo;
            }
        }
        stmt.free();
        return dict;
    }

    guardarDiccionario(tipo, original, reemplazo) {
        if (!this.isInitialized || !this.db) return;
        const originalLimpio = String(original).toLowerCase().trim();
        if (!originalLimpio) return;
        this.db.run(
            "INSERT OR REPLACE INTO diccionarios (tipo, original, reemplazo) VALUES (?, ?, ?)",
            [tipo, originalLimpio, JSON.stringify(this._normalizarReemplazo(reemplazo))]
        );
        this._save();
    }

    eliminarEntrada(tipo, original) {
        if (!this.isInitialized || !this.db) return;
        this.db.run(
            "DELETE FROM diccionarios WHERE tipo = ? AND original = ?",
            [tipo, String(original).toLowerCase().trim()]
        );
        this._save();
    }

    limpiarTodo() {
        if (!this.isInitialized || !this.db) return;
        // Limpiar SOLO los diccionarios: las marcas de migración en `meta`
        // se conservan para que los JSON no vuelvan a inyectar lo borrado.
        this.db.run("DELETE FROM diccionarios");
        this._save();
    }

    // ==========================================
    // APLICACIÓN DE DICCIONARIOS AL TEXTO
    // (Compatibles con audioService.procesar)
    // ==========================================

    elegirReemplazo(valor) {
        if (Array.isArray(valor)) {
            return valor[Math.floor(Math.random() * valor.length)];
        }
        return valor;
    }

    _aplicarTipo(textoOriginal, tipo) {
        let texto = textoOriginal;
        try {
            if (!this.isInitialized || !this.db) return texto;
            const dict = this.getDiccionario(tipo);
            for (const [original, reemplazo] of Object.entries(dict)) {
                if (!original || typeof original !== 'string') continue;
                const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedOriginal}\\b`, 'gi');
                texto = texto.replace(regex, this.elegirReemplazo(reemplazo));
            }
        } catch (err) {
            console.error(`❌ Error al aplicar ${tipo}:`, err);
        }
        return texto;
    }

    aplicar(textoOriginal) {
        let texto = textoOriginal;
        // ✅ ORDEN CRÍTICO: Fonética primero, luego jergas, sinónimos y perfil.
        for (const tipo of ['fonetica', 'jergas', 'sinonimos', 'perfil']) {
            texto = this._aplicarTipo(texto, tipo);
        }
        return texto;
    }

    aplicarSoloJergas(textoOriginal) { return this._aplicarTipo(textoOriginal, 'jergas'); }
    aplicarSoloFonetica(textoOriginal) { return this._aplicarTipo(textoOriginal, 'fonetica'); }
    aplicarSoloSinonimos(textoOriginal) { return this._aplicarTipo(textoOriginal, 'sinonimos'); }
    aplicarSoloPerfil(textoOriginal) { return this._aplicarTipo(textoOriginal, 'perfil'); }
    aplicarSoloOrtografia(textoOriginal) { return this._aplicarTipo(textoOriginal, 'ortografia'); }
    aplicarSoloGramatica(textoOriginal) { return this._aplicarTipo(textoOriginal, 'gramatica'); }

    aplicarConOpciones(textoOriginal, opciones = {}) {
        let texto = textoOriginal;

        // Aplicar solo lo que esté activado
        if (opciones.jergas) texto = this.aplicarSoloJergas(texto);
        if (opciones.fonetica) texto = this.aplicarSoloFonetica(texto);
        if (opciones.sinonimos) texto = this.aplicarSoloSinonimos(texto);
        if (opciones.perfil) texto = this.aplicarSoloPerfil(texto);
        if (opciones.ortografia) texto = this.aplicarSoloOrtografia(texto);
        if (opciones.gramatica) texto = this.aplicarSoloGramatica(texto);

        // Si ninguna opción está activada, devolver el texto original
        if (!opciones.jergas && !opciones.fonetica && !opciones.sinonimos && !opciones.perfil && !opciones.ortografia && !opciones.gramatica) {
            return textoOriginal;
        }

        return texto;
    }

    aprender(antes, despues) {
        if (!antes || !despues) return false;
        if (!this.isInitialized || !this.db) return false;

        // 1. Extraer solo las palabras (ignora signos de puntuación)
        const palabrasAntes = antes.toLowerCase().match(/\b\w+\b/g) || [];
        const palabrasDespues = despues.toLowerCase().match(/\b\w+\b/g) || [];

        // 2. SEGURIDAD CRÍTICA: Solo aprender si tiene la EXACTA misma cantidad de palabras.
        if (palabrasAntes.length !== palabrasDespues.length) {
            console.log("⚠️ Aprendizaje omitido: La cantidad de palabras cambió (inserción/eliminación).");
            return false;
        }

        let aprendioAlgo = false;
        const perfil = this.getDiccionario('perfil');

        for (let i = 0; i < palabrasAntes.length; i++) {
            const palabraOriginal = palabrasAntes[i];
            const palabraNueva = palabrasDespues[i];

            // 3. Reglas estrictas para aprender
            if (palabraOriginal !== palabraNueva &&
                palabraOriginal.length > 2 &&
                palabraNueva.length > 2 &&
                isNaN(palabraOriginal)) {

                this.guardarDiccionario('perfil', palabraOriginal, palabraNueva);
                aprendioAlgo = true;
            }
        }

        if (aprendioAlgo) {
            console.log(` Perfil actualizado con seguridad. Nuevas reglas en BD.`);
        }
        return aprendioAlgo;
    }
}

module.exports = DatabaseService;