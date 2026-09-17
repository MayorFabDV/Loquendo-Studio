// js/services/textProcessor.js
class TextProcessor {
    constructor() {
        this.conectores = [
            'pero', 'aunque', 'sin embargo', 'además', 'entonces',
            'no obstante', 'mientras', 'donde', 'porque', 'ya que'
        ];
        
        this.enfasis = [
            'he dicho', 'obviamente', 'por supuesto', 'claro', 'en fin', 'obvio'
        ];
        
        this.excepcionesComa = [
            'he', 'de', 'la', 'el', 'un', 'una', 'se', 'me', 'te', 'lo', 'le',
            'y', 'o', 'a', 'en', 'por'
        ];
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

        if (opciones.comas) {
            resultado = this._ponerComas(resultado);
        }
        
        if (opciones.puntos) {
            resultado = this._ponerPuntos(resultado);
        }

        resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);

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

    _ponerComas(texto) {
        let resultado = texto;

        resultado = resultado.replace(/\s+([,.!?])/g, "$1");
        resultado = resultado.replace(/^(Hola|Bueno|Pues|Entonces|Así que|Oye)\b/gi, "$1,");

        for (const conector of this.conectores) {
            const regex = new RegExp(`([^,.\\n])\\s+\\b(${conector})\\b`, 'gi');
            resultado = resultado.replace(regex, "$1, $2");
        }

        for (const enfasis of this.enfasis) {
            const regex = new RegExp(`\\s+(${enfasis})\\b([.!?])?`, 'gi');
            resultado = resultado.replace(regex, ", $1$2");
        }

        for (const excepcion of this.excepcionesComa) {
            const regex = new RegExp(`\\b(${excepcion})\\s*,\\s*`, 'gi');
            resultado = resultado.replace(regex, "$1 ");
        }

        resultado = resultado.replace(/,+/g, ",");
        resultado = resultado.replace(/,([^\s])/g, ", $1");

        return resultado;
    }

    _ponerPuntos(texto) {
        let resultado = texto;

        resultado = resultado.replace(/\.([^\s])/g, ". $1");

        if (!/[.!?…]$/.test(resultado.trim())) {
            resultado += ".";
        }

        return resultado;
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