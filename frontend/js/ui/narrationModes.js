// js/narrationModes.js - Motor de Texto Inteligente (Fase 6)
const NarrationModes = {
    estandar(texto) {
        return texto.replace(/\s+/g, ' ').trim();
    },

    creepypasta(texto) {
        let resultado = texto;

        // Pausas dramáticas sutiles (no agresivas)
        const palabrasTerror = ['miedo', 'oscuro', 'sombra', 'sangre', 'muerte', 'fantasma', 
                                'espíritu', 'demonio', 'maldito', 'terror', 'pesadilla'];

        palabrasTerror.forEach(palabra => {
            const regex = new RegExp(`\b(${palabra})\b`, 'gi');
            // Solo 30% de probabilidad de agregar pausa, no siempre
            if (Math.random() > 0.7) {
                resultado = resultado.replace(regex, '... $1');
            }
        });

        // Exclamaciones → máximo 2 puntos suspensivos
        resultado = resultado.replace(/!/g, '..');
        resultado = resultado.replace(/\?/g, '...?');

        // Limpiar pausas múltiples
        resultado = resultado.replace(/\.{3,}/g, '...');
        resultado = resultado.replace(/\s+\.\.\./g, '...');

        return resultado;
    },

    tutorial(texto) {
        let resultado = texto;

        // Énfasis suave en palabras clave
        const palabrasClave = ['importante', 'atención', 'recuerda', 'primero', 'segundo', 
                               'finalmente', 'siempre', 'nunca'];

        palabrasClave.forEach(palabra => {
            const regex = new RegExp(`\b(${palabra})\b`, 'gi');
            resultado = resultado.replace(regex, '$1,');
        });

        resultado = resultado.replace(/\?/g, '? ...');
        resultado = resultado.replace(/\.{3,}/g, '...');

        return resultado;
    },

    gameplay(texto) {
        let resultado = texto;

        // Exclamaciones moderadas (máximo !!)
        resultado = resultado.replace(/!/g, '!!');
        resultado = resultado.replace(/\?/g, '??');

        // Palabras de acción → MAYÚSCULAS (solo algunas)
        const palabrasAccion = ['boom', 'bang', 'ataque', 'golpe', 'victoria', 'derrota', 
                                'crítico', 'épico', 'increíble', 'brutal'];

        palabrasAccion.forEach(palabra => {
            const regex = new RegExp(`\b(${palabra})\b`, 'gi');
            resultado = resultado.replace(regex, (match) => match.toUpperCase());
        });

        // Limpiar signos excesivos
        resultado = resultado.replace(/!{3,}/g, '!!');
        resultado = resultado.replace(/\?{3,}/g, '??');

        return resultado;
    },

    aplicar(texto, modo) {
        if (!texto || texto.trim() === '') return texto;

        const modos = {
            'normal': this.estandar,
            'estandar': this.estandar,
            'creepy': this.creepypasta,
            'creepypasta': this.creepypasta,
            'tutorial': this.tutorial,
            'gameplay': this.gameplay
        };

        const funcionModo = modos[modo] || this.estandar;
        const resultado = funcionModo(texto);

        console.log(`🎭 Modo aplicado: ${modo}`);
        return resultado;
    }
};

window.NarrationModes = NarrationModes;
console.log('✅ narrationModes.js cargado');