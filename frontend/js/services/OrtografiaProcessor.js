// ==========================================
// ORTOGRAFÍA PROCESSOR
// Reglas de ortografía, gramática y puntuación
// ==========================================
class OrtografiaProcessor {
    constructor() {
        // ==========================================
        // 1. CORRECCIONES ORTOGRÁFICAS COMUNES
        // ==========================================
        this.correcciones = {
            // Acentos
            'mas': 'más',           // Solo cuando significa "más"
            'solo': 'solo',         // RAE: sin tilde
            'aun': 'aun',           // Depende del contexto
            'este': 'este',         // Sin tilde
            'esta': 'esta',
            'estos': 'estos',
            'estas': 'estas',
            'aquel': 'aquel',
            'aquella': 'aquella',
            'aquellos': 'aquellos',
            'aquellas': 'aquellas',
            
            // Errores comunes
            'haber': 'haber',       // "a ver" vs "haber"
            'hay': 'hay',
            'alli': 'allí',
            'aqui': 'aquí',
            'asi': 'así',
            'tambien': 'también',
            'ademas': 'además',
            'despues': 'después',
            'quizas': 'quizás',
            'jamas': 'jamás',
            'facil': 'fácil',
            'dificil': 'difícil',
            'rapido': 'rápido',
            'lento': 'lento',
            'despacio': 'despacio',
            'muchisimo': 'muchísimo',
            'poquisimo': 'poquísimo',
            'buenisimo': 'buenísimo',
            'malisimo': 'malísimo',
            'grandisimo': 'grandísimo',
            'chiquisimo': 'chiquísimo',
            
            // Palabras con H
            'ola': 'ola',           // "ola" (mar) vs "hola" (saludo)
            'hola': 'hola',
            'echo': 'echo',         // "echo" (verbo) vs "hecho" (participio)
            'hecho': 'hecho',
            'habia': 'había',
            'habian': 'habían',
            'habre': 'habré',
            'habra': 'habrá',
            
            // Palabras con B/V
            'iva': 'iba',
            'ivan': 'iban',
            'vamos': 'vamos',
            'bamos': 'vamos',
            'bien': 'bien',
            'vien': 'bien',
            
            // Palabras con C/S/Z
            'casa': 'casa',
            'caza': 'caza',
            'cocer': 'cocer',
            'coser': 'coser',
            'cima': 'cima',
            'sima': 'sima',
            
            // Palabras con G/J
            'gente': 'gente',
            'jente': 'gente',
            'girar': 'girar',
            'jirar': 'girar',
            'gefe': 'jefe',
            'jefe': 'jefe',
            
            // Palabras con LL/Y
            'llave': 'llave',
            'yave': 'llave',
            'llegar': 'llegar',
            'yegar': 'llegar',
            'llevar': 'llevar',
            'yevar': 'llevar',
            
            // Palabras con X
            'excelente': 'excelente',
            'escclente': 'excelente',
            'extrano': 'extraño',
            'estrano': 'extraño',
            
            // Errores comunes
            'aver': 'a ver',
            'haber': 'haber',
            'haver': 'haber',
            'halla': 'halla',
            'haya': 'haya',
            'aya': 'haya',
            'alla': 'allá',
            'allá': 'allá',
            'aya': 'haya',
            
            // Plurales
            'cuales': 'cuáles',
            'quienes': 'quiénes',
            'donde': 'dónde',
            'cuando': 'cuándo',
            'como': 'cómo',
            'que': 'qué',
            'cual': 'cuál',
            'quien': 'quién',
            'cuanto': 'cuánto',
            'cuanta': 'cuánta',
            'cuantos': 'cuántos',
            'cuantas': 'cuántas'
        };
        
        // ==========================================
        // 2. REGLAS DE PUNTUACIÓN
        // ==========================================
        this.reglasPuntuacion = {
            // Signos de apertura
            'aperturaInterrogacion': /(\s|^)([^¿\n]*\?)/g,
            'aperturaExclamacion': /(\s|^)([^¡\n]*!)/g,
            
            // Signos de cierre
            'cierreInterrogacion': /([^¿\s][^?\n]*)\?/g,
            'cierreExclamacion': /([^¡\s][^!\n]*)!/g
        };
        
        // ==========================================
        // 3. REGLAS GRAMATICALES
        // ==========================================
        this.reglasGramaticales = {
            // "a" + infinitivo (futuro)
            'aInfinitivo': /\b(a)\s+(ver|ser|estar|hacer|ir|venir|tener|poder|decir)\b/gi,
            
            // "de" + sustantivo
            'deSustantivo': /\b(de)\s+([a-záéíóúñ]+)\b/gi,
            
            // "que" + subjuntivo
            'queSubjuntivo': /\b(que)\s+([a-záéíóúñ]+(?:e|es|a|as))\b/gi
        };
    }
    
    // ==========================================
    // APLICAR CORRECCIONES ORTOGRÁFICAS
    // ==========================================
    aplicarOrtografia(texto) {
        let resultado = texto;
        
        // 1. Acentos en palabras interrogativas/exclamativas
        const palabrasInterrogativas = [
            'que', 'cual', 'quien', 'quienes', 'cuales',
            'cuando', 'donde', 'como', 'cuanto', 'cuanta',
            'cuantos', 'cuantas'
        ];
        
        palabrasInterrogativas.forEach(palabra => {
            // Si está entre ¿? o ¡!
            const regexInterrogacion = new RegExp(`(¿[^?]*)\\b(${palabra})\\b([^?]*\\?)`, 'gi');
            resultado = resultado.replace(regexInterrogacion, (match, antes, palabra, despues) => {
                return antes + this.acentuar(palabra) + despues;
            });
            
            const regexExclamacion = new RegExp(`(¡[^!]*)\\b(${palabra})\\b([^!]*!)`, 'gi');
            resultado = resultado.replace(regexExclamacion, (match, antes, palabra, despues) => {
                return antes + this.acentuar(palabra) + despues;
            });
        });
        
        // 2. "más" con tilde cuando significa cantidad
        resultado = resultado.replace(/\bmas\b(?!\s+(?:sin embargo|bien|tarde|nunca|allá))/gi, 'más');
        
        // 3. Corregir "a ver" vs "haber"
        resultado = resultado.replace(/\ba ver\b/gi, 'a ver');
        resultado = resultado.replace(/\bhaber\b/gi, 'haber');
        
        // 4. Corregir "hecho" vs "echo"
        resultado = resultado.replace(/\becho\b(?=\s+(?:de|que|por|para))/gi, 'hecho');
        
        // 5. Corregir "halla/haya/aya/allá"
        resultado = resultado.replace(/\baya\b/gi, 'haya');
        resultado = resultado.replace(/\balla\b/gi, 'allá');
        
        // 6. Corregir "iva/iban"
        resultado = resultado.replace(/\biva\b/gi, 'iba');
        resultado = resultado.replace(/\bivan\b/gi, 'iban');
        
        // 7. Corregir "vamos/bamos"
        resultado = resultado.replace(/\bbamos\b/gi, 'vamos');
        
        // 8. Corregir "jente/gente"
        resultado = resultado.replace(/\bjente\b/gi, 'gente');
        
        // 9. Corregir "yave/llave"
        resultado = resultado.replace(/\byave\b/gi, 'llave');
        resultado = resultado.replace(/\byegar\b/gi, 'llegar');
        resultado = resultado.replace(/\byevar\b/gi, 'llevar');
        
        // 10. Corregir "extrano/extraño"
        resultado = resultado.replace(/\bestrano\b/gi, 'extraño');
        resultado = resultado.replace(/\bextrano\b/gi, 'extraño');
        
        // 11. Corregir palabras sin tilde
        const conTilde = {
            'tambien': 'también',
            'ademas': 'además',
            'despues': 'después',
            'quizas': 'quizás',
            'jamas': 'jamás',
            'facil': 'fácil',
            'dificil': 'difícil',
            'rapido': 'rápido',
            'alli': 'allí',
            'aqui': 'aquí',
            'asi': 'así',
            'habia': 'había',
            'habian': 'habían',
            'habre': 'habré',
            'habra': 'habrá'
        };
        
        Object.entries(conTilde).forEach(([sin, con]) => {
            const regex = new RegExp(`\\b${sin}\\b`, 'gi');
            resultado = resultado.replace(regex, con);
        });
        
        return resultado;
    }
    
    // ==========================================
    // APLICAR REGLAS GRAMATICALES
    // ==========================================
    aplicarGramatica(texto) {
        let resultado = texto;
        
        // 1. Sujeto + verbo: "yo es" → "yo soy"
        const conjugaciones = {
            'yo es': 'yo soy',
            'yo esta': 'yo estoy',
            'tu es': 'tú eres',
            'tu esta': 'tú estás',
            'el es': 'él es',
            'ella es': 'ella es',
            'nosotros es': 'nosotros somos',
            'ustedes es': 'ustedes son',
            'ellos es': 'ellos son'
        };
        
        Object.entries(conjugaciones).forEach(([error, correcto]) => {
            const regex = new RegExp(`\\b${error}\\b`, 'gi');
            resultado = resultado.replace(regex, correcto);
        });
        
        // 2. "haber" + participio
        resultado = resultado.replace(/\bhe\s+ido\b/gi, 'he ido');
        resultado = resultado.replace(/\bha\s+ido\b/gi, 'ha ido');
        resultado = resultado.replace(/\bhan\s+ido\b/gi, 'han ido');
        
        // 3. Concordancia de género
        resultado = resultado.replace(/\bel\s+agua\b/gi, 'el agua');
        resultado = resultado.replace(/\bun\s+agua\b/gi, 'un agua');
        
        // 4. "a" + infinitivo
        resultado = resultado.replace(/\bva\s+a\s+ser\b/gi, 'va a ser');
        resultado = resultado.replace(/\bva\s+a\s+estar\b/gi, 'va a estar');
        resultado = resultado.replace(/\bva\s+a\s+hacer\b/gi, 'va a hacer');
        
        return resultado;
    }
    
    // ==========================================
    // APLICAR PUNTUACIÓN INTELIGENTE
    // ==========================================
    aplicarPuntuacion(texto) {
        let resultado = texto;
        
        // 1. Signos de apertura para interrogación
        resultado = resultado.replace(/([^¿\n.!?]*)\?/g, (match, contenido) => {
            if (contenido.includes('¿')) return match;
            return '¿' + contenido.trim() + '?';
        });
        
        // 2. Signos de apertura para exclamación
        resultado = resultado.replace(/([^¡\n.!?]*)!/g, (match, contenido) => {
            if (contenido.includes('¡')) return match;
            return '¡' + contenido.trim() + '!';
        });
        
        // 3. Punto después de oraciones largas
        // Conservador: solo cuando la cláusula canónica precedente tiene >= 12 palabras
        // (evita partir oraciones con nombres propios: "voy a España" no se rompe)
        resultado = resultado.replace(/([a-záéíóúñ])\s+([A-ZÁÉÍÓÚÑ])/g, (match, fin, inicio) => {
            const finIndex = resultado.lastIndexOf(fin + ' ');
            let inicioClausula = 0;
            const finClausulaAnterior = Math.max(
                resultado.lastIndexOf('.', finIndex),
                resultado.lastIndexOf('!', finIndex),
                resultado.lastIndexOf('?', finIndex),
                resultado.lastIndexOf('…', finIndex)
            );
            if (finClausulaAnterior > -1) inicioClausula = finClausulaAnterior + 1;
            const palabrasClausula = resultado.slice(inicioClausula, finIndex + 1).trim().split(/\s+/).filter(Boolean);
            if (palabrasClausula.length >= 12) {
                return fin + '. ' + inicio;
            }
            return match;
        });
        
        // 4. Coma antes de conectores
        const conectores = [
            'pero', 'aunque', 'sin embargo', 'no obstante',
            'entonces', 'por lo tanto', 'por consiguiente',
            'además', 'también', 'incluso', 'asimismo',
            'es decir', 'o sea', 'por ejemplo',
            'mientras', 'cuando', 'donde', 'porque', 'ya que'
        ];
        
        conectores.forEach(conector => {
            const regex = new RegExp(`([^,.!?\\n])\\s+\\b(${conector})\\b`, 'gi');
            resultado = resultado.replace(regex, '$1, $2');
        });
        
        // 5. Punto final si no tiene
        if (!/[.!?…]$/.test(resultado.trim())) {
            resultado += '.';
        }
        
        return resultado;
    }
    
    // ==========================================
    // APLICAR TODO
    // ==========================================
    procesar(texto, opciones = {}) {
        let resultado = texto;
        
        // 1. Ortografía
        if (opciones.ortografia !== false) {
            resultado = this.aplicarOrtografia(resultado);
        }
        
        // 2. Gramática
        if (opciones.gramatica !== false) {
            resultado = this.aplicarGramatica(resultado);
        }
        
        // 3. Puntuación
        if (opciones.puntuacion !== false) {
            resultado = this.aplicarPuntuacion(resultado);
        }
        
        return resultado;
    }
    
    // ==========================================
    // UTILIDADES
    // ==========================================
    acentuar(palabra) {
        const acentos = {
            'que': 'qué',
            'cual': 'cuál',
            'quien': 'quién',
            'quienes': 'quiénes',
            'cuales': 'cuáles',
            'cuando': 'cuándo',
            'donde': 'dónde',
            'como': 'cómo',
            'cuanto': 'cuánto',
            'cuanta': 'cuánta',
            'cuantos': 'cuántos',
            'cuantas': 'cuántas'
        };
        return acentos[palabra.toLowerCase()] || palabra;
    }
}

// ==========================================
// INSTANCIA GLOBAL
// ==========================================
const ortografiaProcessor = new OrtografiaProcessor();
window.ortografiaProcessor = ortografiaProcessor;

console.log('📝 OrtografiaProcessor cargado correctamente');