// js/dictionaryEditor.js - Editor completo de diccionarios
class DictionaryEditor {
    constructor() {
        this.dictionaries = {
            jergas: {},
            sinonimos: {},
            fonetica: {}
        };
        this.currentTab = 'jergas';
        this.searchTerm = '';
    }

    async loadAll() {
        try {
            const [resJer, resSin] = await Promise.all([
                fetch('http://localhost:3000/api/jergas'),
                fetch('http://localhost:3000/api/sinonimos')
            ]);

            if (resJer.ok) this.dictionaries.jergas = await resJer.json();
            if (resSin.ok) this.dictionaries.sinonimos = await resSin.json();

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
                        onclick="window.dictionaryEditor.switchTab('jergas')">🌎 Jergas</button>
                <button class="tab-btn ${this.currentTab === 'sinonimos' ? 'active' : ''}" 
                        onclick="window.dictionaryEditor.switchTab('sinonimos')">🧠 Sinónimos</button>
                <button class="tab-btn ${this.currentTab === 'fonetica' ? 'active' : ''}" 
                        onclick="window.dictionaryEditor.switchTab('fonetica')">🗣️ Fonética</button>
            </div>
            <div class="dictionary-content">
                <div class="dictionary-header">
                    <h4>${this.getTabTitle()}</h4>
                    <input type="text" id="searchDictionary" placeholder="Buscar..." 
                           value="${this.searchTerm}"
                           oninput="window.dictionaryEditor.handleSearch(this.value)">
                </div>
                <div class="dictionary-add-form">
                    <input type="text" id="newWord" placeholder="Palabra original">
                    <input type="text" id="newReplacement" placeholder="${this.getPlaceholder()}">
                    <button onclick="window.dictionaryEditor.addEntry()">➕ Agregar</button>
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
            jergas: '🌎 Jergas y Regionalismos',
            sinonimos: '🧠 Sinónimos (variaciones aleatorias)',
            fonetica: '🗣️ Fonética Loquendo'
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
                <span class="entry-word">${original}</span>
                <span class="entry-arrow">→</span>
                <span class="entry-replacement">${Array.isArray(replacement) ? replacement.join(', ') : replacement}</span>
                <button class="btn-delete" onclick="window.dictionaryEditor.deleteEntry('${original}')">🗑️</button>
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
        if (!confirm(`¿Eliminar "${word}"?`)) return;
        delete this.dictionaries[this.currentTab][word];

        if (this.currentTab === 'fonetica') {
            this.saveFonetica();
        } else {
            await fetch(`http://localhost:3000/api/${this.currentTab}/${encodeURIComponent(word)}`, {
                method: 'DELETE'
            });
        }
        this.render();
    }

    async saveToServer(tipo, original, reemplazo) {
        try {
            await fetch(`http://localhost:3000/api/${tipo}`, {
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

        if (opciones.fonetica) {
            for (let [original, reemplazo] of Object.entries(this.dictionaries.fonetica)) {
                resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), reemplazo);
            }
        }

        if (opciones.jergas) {
            for (let [original, reemplazo] of Object.entries(this.dictionaries.jergas)) {
                resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), reemplazo);
            }
        }

        if (opciones.sinonimos) {
            for (let [original, reemplazo] of Object.entries(this.dictionaries.sinonimos)) {
                const valores = Array.isArray(reemplazo) ? reemplazo : [reemplazo];
                const elegido = valores[Math.floor(Math.random() * valores.length)];
                resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), elegido);
            }
        }

        return resultado;
    }
}

window.dictionaryEditor = new DictionaryEditor();
console.log('✅ dictionaryEditor.js cargado');