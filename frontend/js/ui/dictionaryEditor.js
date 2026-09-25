// js/dictionaryEditor.js - Editor completo de diccionarios
class DictionaryEditor {
    constructor() {
        this.dictionaries = {
            jergas: {},
            sinonimos: {},
            fonetica: {},
            ortografia: {},
            gramatica: {}
        };
        this.currentTab = 'jergas';
        this.searchTerm = '';
    }

    // ✅ FIX #17: base unificada (usa CONFIG derivado del origen real, no hardcodea 3000)
    get apiBase() {
        if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
        if (window.API_BASE) return window.API_BASE;
        if (window.location && window.location.port) return `http://localhost:${window.location.port}`;
        return 'http://localhost:3000';
    }

    // ✅ FIX #13: escapa metacaracteres de regex
    _escapeRegExp(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ✅ FIX #14: escapa HTML para evitar inyección al renderizar
    _escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async loadAll() {
        try {
          const apiBase = this.apiBase;
const [resJer, resSin, resOrt, resGram] = await Promise.all([
    fetch(`${apiBase}/api/jergas`),
    fetch(`${apiBase}/api/sinonimos`),
    fetch(`${apiBase}/api/ortografia`),
    fetch(`${apiBase}/api/gramatica`)
]);

            if (resJer.ok) this.dictionaries.jergas = await resJer.json();
            if (resSin.ok) this.dictionaries.sinonimos = await resSin.json();
            if (resOrt.ok) this.dictionaries.ortografia = await resOrt.json();
            if (resGram.ok) this.dictionaries.gramatica = await resGram.json();

            const foneticaLocal = localStorage.getItem('diccionarioFonetica');
            if (foneticaLocal) {
                this.dictionaries.fonetica = JSON.parse(foneticaLocal);
            } else {
                this.dictionaries.fonetica = {
                    'sql': 'ese-cu-ele',
                    'xq': 'porque',
                    'tb': 'también',
                    'afaik': 'a lo que yo sé',
                    'imo': 'en mi opinión'
                };
                this.saveFonetica();
            }

            this.render();
            console.log('✅ Diccionarios cargados');
        } catch (error) {
            console.error('❌ Error cargando diccionarios:', error);
        }
    }

    render() {
        const container = document.getElementById('dictionaryEditor');
        if (!container) return;

        container.innerHTML = `
            <div class="dictionary-tabs">
                <button class="tab-btn ${this.currentTab === 'jergas' ? 'active' : ''}" 
                        onclick="window.dictionaryEditor.switchTab('jergas')">Jergas</button>
                <button class="tab-btn ${this.currentTab === 'sinonimos' ? 'active' : ''}" 
                        onclick="window.dictionaryEditor.switchTab('sinonimos')">Sinónimos</button>
                <button class="tab-btn ${this.currentTab === 'fonetica' ? 'active' : ''}" 
                        onclick="window.dictionaryEditor.switchTab('fonetica')"> Fonética</button>
            </div>
            <div class="dictionary-content">
                <div class="dictionary-header">
                    <h4>${this.getTabTitle()}</h4>
                    <input type="text" id="searchDictionary" placeholder="Buscar..." 
                           value="${this._escapeHtml(this.searchTerm)}"
                           oninput="window.dictionaryEditor.handleSearch(this.value)">
                </div>
                <div class="dictionary-add-form">
                    <input type="text" id="newWord" placeholder="Palabra original">
                    <input type="text" id="newReplacement" placeholder="${this.getPlaceholder()}">
                    <button onclick="window.dictionaryEditor.addEntry()"> Agregar</button>
                </div>
                <div class="dictionary-list" id="dictionaryList">
                    ${this.renderEntries()}
                </div>
            </div>
        `;
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.searchTerm = '';
        this.render();
    }

    getTabTitle() {
        const titles = {
            jergas: ' Jergas y Regionalismos',
            sinonimos: ' Sinónimos (variaciones aleatorias)',
            fonetica: ' Fonética Loquendo'
        };
        return titles[this.currentTab];
    }

    getPlaceholder() {
        const placeholders = {
            jergas: 'Reemplazo (ej: amigo)',
            sinonimos: 'Sinónimos separados por coma',
            fonetica: 'Cómo debe sonar (ej: ese-cu-ele)'
        };
        return placeholders[this.currentTab];
    }

    handleSearch(term) {
        this.searchTerm = term.toLowerCase();
        document.getElementById('dictionaryList').innerHTML = this.renderEntries();
    }

    renderEntries() {
        const dict = this.dictionaries[this.currentTab];
        const entries = Object.entries(dict).filter(([key]) => 
            key.toLowerCase().includes(this.searchTerm)
        );

        if (entries.length === 0) {
            return '<p class="empty-message">No hay entradas</p>';
        }

        return entries.map(([original, replacement]) => `
            <div class="dictionary-entry">
                <span class="entry-word">${this._escapeHtml(original)}</span>
                <span class="entry-arrow">→</span>
                <span class="entry-replacement">${this._escapeHtml(Array.isArray(replacement) ? replacement.join(', ') : replacement)}</span>
                <button class="btn-delete" data-word="${encodeURIComponent(original)}" onclick="window.dictionaryEditor.deleteEntry(this.dataset.word)">🗑️</button>
            </div>
        `).join('');
    }

    async addEntry() {
        const original = document.getElementById('newWord').value.trim().toLowerCase();
        const replacement = document.getElementById('newReplacement').value.trim().toLowerCase();

        if (!original || !replacement) {
            alert('Completa ambos campos');
            return;
        }

        if (this.currentTab === 'sinonimos') {
            const valores = replacement.split(',').map(s => s.trim()).filter(s => s);
            this.dictionaries.sinonimos[original] = valores.length > 1 ? valores : replacement;
        } else {
            this.dictionaries[this.currentTab][original] = replacement;
        }

        if (this.currentTab === 'fonetica') {
            this.saveFonetica();
        } else {
            await this.saveToServer(this.currentTab, original, this.dictionaries[this.currentTab][original]);
        }

        this.render();
    }

    async deleteEntry(word) {
        word = decodeURIComponent(word);
        if (!confirm(`¿Eliminar "${word}"?`)) return;
        delete this.dictionaries[this.currentTab][word];

        if (this.currentTab === 'fonetica') {
            this.saveFonetica();
        } else {
       await fetch(`${this.apiBase}/api/${this.currentTab}/${encodeURIComponent(word)}`, {
    method: 'DELETE'
});
        }
        this.render();
    }

    async saveToServer(tipo, original, reemplazo) {
        try {
await fetch(`${this.apiBase}/api/${tipo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original, reemplazo })
});
        } catch (error) {
            console.error('Error guardando:', error);
        }
    }

    saveFonetica() {
        localStorage.setItem('diccionarioFonetica', JSON.stringify(this.dictionaries.fonetica));
    }

    // ==========================================
    // ✅ FIX: applyToText ahora respeta los checkboxes
    // ==========================================
    applyToText(texto, opciones = {}) {
        let resultado = texto;

        // opciones = { fonetica: true, jergas: true, sinonimos: true }
        // Si no se pasa nada, no aplica nada (seguro por defecto)
    if (opciones.ortografia) {
        for (let [original, reemplazo] of Object.entries(this.dictionaries.ortografia || {})) {
            resultado = resultado.replace(new RegExp(`\\b${this._escapeRegExp(original)}\\b`, 'gi'), reemplazo);
        }
    }

    if (opciones.gramatica) {
        for (let [original, reemplazo] of Object.entries(this.dictionaries.gramatica || {})) {
            resultado = resultado.replace(new RegExp(`\\b${this._escapeRegExp(original)}\\b`, 'gi'), reemplazo);
        }
    }
        if (opciones.fonetica) {
            for (let [original, reemplazo] of Object.entries(this.dictionaries.fonetica)) {
                resultado = resultado.replace(new RegExp(`\\b${this._escapeRegExp(original)}\\b`, 'gi'), reemplazo);
            }
        }

        if (opciones.jergas) {
            for (let [original, reemplazo] of Object.entries(this.dictionaries.jergas)) {
                resultado = resultado.replace(new RegExp(`\\b${this._escapeRegExp(original)}\\b`, 'gi'), reemplazo);
            }
        }

       if (opciones.sinonimos) {
    for (let [original, reemplazo] of Object.entries(this.dictionaries.sinonimos)) {
        const valores = Array.isArray(reemplazo) ? reemplazo : [reemplazo];
        
        // ✅ FIX: Usar función callback para elegir sinónimo DIFERENTE en cada ocurrencia
        resultado = resultado.replace(new RegExp(`\\b${this._escapeRegExp(original)}\\b`, 'gi'), () => {
            return valores[Math.floor(Math.random() * valores.length)];
        });
    }
}

        return resultado;
    }
}

window.dictionaryEditor = new DictionaryEditor();
console.log('✅ dictionaryEditor.js cargado');