// services/dictionaryService.js
const fs = require('fs');
const path = require('path');

class DictionaryService {
    // ✅ RECIBE la ruta de dbFolder como parámetro
    constructor(dbFolder) {
        this.dbFolder = dbFolder;
        this.paths = {
            perfil: path.join(dbFolder, 'perfil_usuario.json'),
            jergas: path.join(dbFolder, 'diccionario_jergas.json'),
            sinonimos: path.join(dbFolder, 'diccionario_sinonimos.json'),
            loquendo: path.join(dbFolder, 'diccionario_loquendo.json'),
            fonetica: path.join(dbFolder, 'diccionario_fonetica.json') // ✅ Agregado
        };
        
        // Crear carpeta si no existe
        if (!fs.existsSync(this.dbFolder)) {
            fs.mkdirSync(this.dbFolder, { recursive: true });
        }

        // ✅ Asegurar que todos los archivos JSON existan al iniciar
        Object.values(this.paths).forEach(filePath => {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '{}');
            }
        });
    }

    elegirReemplazo(valor) {
        if (Array.isArray(valor)) {
            return valor[Math.floor(Math.random() * valor.length)];
        }
        return valor;
    }

    aplicar(textoOriginal) {
        let texto = textoOriginal;
        try {
            // ✅ ORDEN CRÍTICO: Fonética primero, luego jergas, sinónimos y perfil.
            // Esto evita que una regla de jerga rompa una corrección fonética.
            const archivos = ['fonetica', 'jergas', 'sinonimos', 'perfil'];
            
            for (const tipo of archivos) {
                const ruta = this.paths[tipo];
                if (fs.existsSync(ruta)) {
                    const data = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');
                    for (const [original, reemplazo] of Object.entries(data)) {
                        // Escapar caracteres especiales por seguridad en el Regex
                        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`\\b${escapedOriginal}\\b`, 'gi');
                        texto = texto.replace(regex, this.elegirReemplazo(reemplazo));
                    }
                }
            }
        } catch (err) {
            console.error("❌ Error al aplicar diccionarios:", err);
        }
        return texto;
    }

    aprender(antes, despues) {
        if (!antes || !despues) return false;
        
        // 1. Extraer solo las palabras (ignora signos de puntuación)
        const palabrasAntes = antes.toLowerCase().match(/\b\w+\b/g) || [];
        const palabrasDespues = despues.toLowerCase().match(/\b\w+\b/g) || [];
        
        // 2. SEGURIDAD CRÍTICA: Solo aprender si tiene la EXACTA misma cantidad de palabras.
        if (palabrasAntes.length !== palabrasDespues.length) {
            console.log("⚠️ Aprendizaje omitido: La cantidad de palabras cambió (inserción/eliminación).");
            return false;
        }

        let perfil = {};
        if (fs.existsSync(this.paths.perfil)) {
            try { perfil = JSON.parse(fs.readFileSync(this.paths.perfil, 'utf8') || '{}'); } catch (e) { perfil = {}; }
        }

        let aprendioAlgo = false;

        for (let i = 0; i < palabrasAntes.length; i++) {
            const palabraOriginal = palabrasAntes[i];
            const palabraNueva = palabrasDespues[i];

            // 3. Reglas estrictas para aprender
            if (palabraOriginal !== palabraNueva && 
                palabraOriginal.length > 2 && 
                palabraNueva.length > 2 && 
                isNaN(palabraOriginal)) {
                
                perfil[palabraOriginal] = palabraNueva;
                aprendioAlgo = true;
            }
        }

        if (aprendioAlgo) {
            fs.writeFileSync(this.paths.perfil, JSON.stringify(perfil, null, 4));
            console.log(`🧠 Perfil actualizado con seguridad. Nuevas reglas:`, perfil);
        }
        return aprendioAlgo;
    }

    limpiarTodo() {
        // ✅ Agregado 'fonetica' a la limpieza
        ['perfil', 'jergas', 'sinonimos', 'loquendo', 'fonetica'].forEach(tipo => {
            fs.writeFileSync(this.paths[tipo], JSON.stringify({}, null, 4));
        });
    }

    getDiccionario(tipo) {
        const ruta = this.paths[tipo];
        if (!fs.existsSync(ruta)) fs.writeFileSync(ruta, '{}');
        return JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');
    }

    guardarDiccionario(tipo, original, reemplazo) {
        const ruta = this.paths[tipo];
        let data = fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}') : {};
        
        if (Array.isArray(reemplazo)) {
            data[original.toLowerCase().trim()] = reemplazo.map(r => String(r).toLowerCase().trim());
        } else {
            data[original.toLowerCase().trim()] = String(reemplazo).toLowerCase().trim();
        }
        fs.writeFileSync(ruta, JSON.stringify(data, null, 4));
    }

    eliminarEntrada(tipo, palabra) {
        const ruta = this.paths[tipo];
        if (fs.existsSync(ruta)) {
            const data = JSON.parse(fs.readFileSync(ruta, 'utf8') || '{}');
            delete data[palabra];
            fs.writeFileSync(ruta, JSON.stringify(data, null, 4));
        }
    }
}

module.exports = DictionaryService;