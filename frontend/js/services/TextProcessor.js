// js/services/textProcessor.js
class TextProcessor {
    constructor() {
        this.conectores = [
            'pero', 'aunque', 'sin embargo', 'además', 'entonces',
            'no obstante', 'mientras', 'donde', 'porque', 'ya que',
            'mas', 'sino', 'puesto que', 'pues', 'cuando'
        ];

        this.enfasis = [
            'he dicho', 'obviamente', 'por supuesto', 'claro', 'en fin', 'obvio'
        ];

        this.excepcionesComa = [
            'he', 'de', 'la', 'el', 'un', 'una', 'se', 'me', 'te', 'lo', 'le',
            'y', 'o', 'a', 'en', 'por'
        ];

        this.conectoresDespues = [
            'Sin embargo', 'No obstante', 'Además', 'También', 'Asimismo',
            'Por lo tanto', 'Por consiguiente', 'En conclusión', 'Finalmente',
            'Es decir', 'O sea', 'Mejor dicho', 'Por ejemplo', 'En resumen',
            'Primero', 'Segundo', 'Tercero', 'Por último'
        ];

        // Conectores ideales para cortar oraciones largas en puntos de pausa
        this.conectoresCorte = [
            'pero', 'y', 'porque', 'aunque', 'sino', 'mientras', 'ya que',
            'entonces', 'además', 'o', 'que'
        ];

        // Umbrales de "pausa larga"
        this.UMBRAL_PALABRAS = 30;
        this.UMBRAL_CARACTERES = 170;
        this.MAX_CORTES = 2;
    }

    procesar(texto, opciones = {}, modo = 'normal', diccionarios = {}) {
        if (!texto || texto.trim() === '') return texto;

        let resultado = texto;

        if (diccionarios && typeof diccionarios === 'object') {
            resultado = this._aplicarDiccionarios(resultado, diccionarios, opciones);
        }

        if (window.NarrationModes && modo) {
            resultado = window.NarrationModes.aplicar(resultado, modo);
        }

        return this.puntuar(resultado, opciones, modo);
    }

    // Aplica SOLO comas y puntos (diccionarios/narración no se tocan).
    puntuar(texto, opciones = {}, modo = 'normal') {
        if (!texto || texto.trim() === '') return texto;

        let resultado = texto;

        if (opciones.comas) {
            resultado = this._ponerComas(resultado, modo);
        }

        if (opciones.puntos) {
            resultado = this._ponerPuntos(resultado, modo);
        }

        return resultado;
    }

    _aplicarDiccionarios(texto, diccionarios, opciones) {
        let resultado = texto;

        if (opciones.fonetica && diccionarios.fonetica) {
            for (const [original, reemplazo] of Object.entries(diccionarios.fonetica)) {
                const regex = new RegExp(`\\b${this._escapeRegex(original)}\\b`, 'gi');
                resultado = resultado.replace(regex, reemplazo);
            }
        }

        if (opciones.jergas && diccionarios.jergas) {
            for (const [original, reemplazo] of Object.entries(diccionarios.jergas)) {
                const regex = new RegExp(`\\b${this._escapeRegex(original)}\\b`, 'gi');
                resultado = resultado.replace(regex, this._elegirReemplazo(reemplazo));
            }
        }

        if (opciones.sinonimos && diccionarios.sinonimos) {
            for (const [original, reemplazo] of Object.entries(diccionarios.sinonimos)) {
                const regex = new RegExp(`\\b${this._escapeRegex(original)}\\b`, 'gi');
                resultado = resultado.replace(regex, this._elegirReemplazo(reemplazo));
            }
        }

        return resultado;
    }

    _ponerComas(texto, modo = 'normal') {
        let resultado = texto;

        // 1. Sin espacios antes de signos
        resultado = resultado.replace(/\s+([,.!?])/g, "$1");

        // 2. Coma tras saludos / muletillas de arranque
        resultado = resultado.replace(/^(Hola|Bueno|Pues|Entonces|Así que|Oye|Escucha|Hey)\b/gi, "$1,");

        // 3. Coma ANTES de conectores de contraste, causa o enumeración
        this.conectores.forEach(conector => {
            const regex = new RegExp(`([^,.\\n])\\s+\\b(${conector})\\b`, 'gi');
            resultado = resultado.replace(regex, "$1, $2");
        });

        // 4. Coma DESPUÉS de conectores que inician una idea nueva
        this.conectoresDespues.forEach(conector => {
            const regex = new RegExp(`\\b(${conector})\\b(?![,])`, 'gi');
            resultado = resultado.replace(regex, "$1,");
        });

        // 5. Énfasis (retoque del sistema fluido perdido en la refactorización)
        this.enfasis.forEach(e => {
            const regex = new RegExp(`\\s+(${e})\\b([.!?])?`, 'gi');
            resultado = resultado.replace(regex, ", $1$2");
        });

        // 6. Excepciones: quitar comas antinaturales tras palabras cortas (retoque fluido)
        resultado = resultado.replace(/\b(he|de|la|el|un|una|se|me|te|lo|le|y|o|a|en|por)\s*,\s*/gi, "$1 ");

        // 7. Limpieza final de puntuación
        resultado = resultado.replace(/,+/g, ",");
        resultado = resultado.replace(/,\s*([.!?])/g, "$1");
        if (modo !== 'creepy' && modo !== 'creepypasta') {
            resultado = resultado.replace(/,([^\s])/g, ", $1");
        }
        resultado = resultado.replace(/\s+/g, ' ').trim();

        return resultado;
    }

    _ponerPuntos(texto, modo = 'normal') {
        let resultado = texto;

        // 1. Normalizar espacios tras puntos existentes (preservando "..." en creepy)
        if (modo !== 'creepy' && modo !== 'creepypasta') {
            resultado = resultado.replace(/\.([^\s.])/g, ". $1");
        } else {
            resultado = resultado.replace(/(?<!\.)\.([^\s.])/g, ". $1");
        }

        // 2. Insertar puntos en oraciones largas (corte en comas + conectores)
        resultado = this._insertarPuntosPausa(resultado);

        // 3. Asegurar punto final fuerte
        if (!/[.!?…]$/.test(resultado.trim())) {
            resultado = resultado.trim() + ".";
        }

        // 4. Capitalizar al inicio y tras cada punto de corte
        resultado = resultado.replace(
            /(^|[.!?…]\s+)([a-záéíóúñü])/g,
            (m, pre, letra) => pre + letra.toUpperCase()
        );

        return resultado;
    }

    _insertarPuntosPausa(texto) {
        const UMBRAL_PALABRAS = this.UMBRAL_PALABRAS;
        const UMBRAL_CARACTERES = this.UMBRAL_CARACTERES;
        const MAX_CORTES = this.MAX_CORTES;
        const MIN_SEP = 12;

        // Dividir en oraciones conservando el delimitador final (sin trocear elipsis "...")
        const oraciones = texto.split(/(?<=[.!?…])(?![.!?…])/).filter(o => o.trim().length > 0);

        let salida = '';

        for (const oracionOriginal of oraciones) {
            const oracion = oracionOriginal.trim();
            const palabras = oracion.split(/\s+/).length;
            const esLarga = palabras > UMBRAL_PALABRAS || oracion.length > UMBRAL_CARACTERES;

            if (!esLarga) {
                salida += oracion + ' ';
                continue;
            }

            // Localizar comas candidatas a corte y puntuarlas
            const candidatas = [];
            for (let i = 0; i < oracion.length; i++) {
                if (oracion[i] !== ',') continue;
                const despues = oracion.slice(i + 1).replace(/^\s+/, '');
                const palabraSig = (despues.match(/^[^\s,.;:!?…]+/) || [''])[0].toLowerCase();
                let score = 1;
                if (this.conectoresCorte.includes(palabraSig)) score += 3;
                // Preferir cortos en el tramo central, no en los extremos
                if (i > oracion.length * 0.2 && i < oracion.length * 0.8) score += 1;
                candidatas.push({ pos: i, score });
            }

            if (candidatas.length === 0) {
                salida += oracion + ' ';
                continue;
            }

            // Elegir hasta MAX_CORTES, descartando los demasiado cercanos
            candidatas.sort((a, b) => b.score - a.score);
            const elegidas = [];
            for (const c of candidatas) {
                if (elegidas.length >= MAX_CORTES) break;
                if (elegidas.some(e => Math.abs(e.pos - c.pos) < MIN_SEP)) continue;
                elegidas.push(c);
            }
            elegidas.sort((a, b) => a.pos - b.pos);

            // Cortar en las comas elegidas
            const fragmentos = [];
            let prev = 0;
            for (const c of elegidas) {
                const frag = oracion.slice(prev, c.pos).replace(/\s*,\s*$/, '').trim();
                if (frag) fragmentos.push(frag);
                prev = c.pos + 1;
            }
            const ultimo = oracion.slice(prev).trim();
            if (ultimo) fragmentos.push(ultimo);

            salida += fragmentos.join('. ') + ' ';
        }

        return salida.replace(/\s+/g, ' ').trim();
    }

    _escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    _elegirReemplazo(valor) {
        if (Array.isArray(valor)) {
            return valor[Math.floor(Math.random() * valor.length)];
        }
        return valor;
    }
}

const textProcessor = new TextProcessor();
window.textProcessor = textProcessor;
console.log('textProcessor.js cargado correctamente');
