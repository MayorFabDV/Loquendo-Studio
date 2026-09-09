class ApiClient {
    constructor() {
        this.baseURL = window.CONFIG?.API_BASE_URL || 'http://localhost:3000';
    }

    async generarAudio(textoOrOptions, voz = 'Loquendo Jorge', usarIA = false, modo = 'normal') {
        let texto = textoOrOptions;
        let vozVal = voz;
        let usarIAVal = usarIA;
        let modoVal = modo;

        if (typeof textoOrOptions === 'object' && textoOrOptions !== null) {
            texto = textoOrOptions.texto || textoOrOptions.text || '';
            vozVal = textoOrOptions.voz || textoOrOptions.voice || voz;
            usarIAVal = typeof textoOrOptions.usarIA !== 'undefined' ? textoOrOptions.usarIA : usarIA;
            modoVal = textoOrOptions.modo || textoOrOptions.mode || modo;
        }

        const response = await fetch(`${this.baseURL}/api/generar-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto, voz: vozVal, usarIA: usarIAVal, modo: modoVal })
        });
        if (!response.ok) throw new Error('Error al generar audio');
        return response.json();
    }

    async aplicarDucking(voiceAudioPath, musicPath, options) {
        const response = await fetch(`${this.baseURL}/api/audio/apply-ducking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceAudioPath, musicPath, options })
        });
        if (!response.ok) throw new Error('Error al aplicar ducking');
        return response.json();
    }

    async guardarAudioEditado(formData) {
        const response = await fetch(`${this.baseURL}/api/guardar-audio-blob`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Error al guardar audio editado');
        return response.json();
    }

    async convertirAMp3(wavPath, originalWavPath = null) {
        const response = await fetch(`${this.baseURL}/api/audio/convertir-mp3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wavPath, originalWavPath })
        });
        if (!response.ok) throw new Error('Error al convertir a MP3');
        return response.json();
    }

    async subirMusica(archivo) {
        const formData = new FormData();
        formData.append('music', archivo);
        const response = await fetch(`${this.baseURL}/api/upload-music`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Error al subir música');
        return response.json();
    }

    async subirPNGTuber(archivo, tipo = 'idle') {
        const formData = new FormData();
        formData.append(tipo, archivo);
        const response = await fetch(`${this.baseURL}/api/upload-pngtuber`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Error al subir imagen PNGTuber');
        return response.json();
    }

    async generarPNGTuber(audioPath, idleImagePath = null, talkingImagePath = null) {
        const response = await fetch(`${this.baseURL}/api/generar-video-pngtuber`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath, idleImagePath, talkingImagePath })
        });
        if (!response.ok) throw new Error('Error al generar PNGTuber');
        return response.json();
    }

    async uploadMusic(archivo) { return this.subirMusica(archivo); }
    async applyDucking(voiceAudioPath, musicPath, options) { return this.aplicarDucking(voiceAudioPath, musicPath, options); }
    async exportMP3(wavPath, originalWavPath = null) { return this.convertirAMp3(wavPath, originalWavPath); }

    async getJergas() {
        const response = await fetch(`${this.baseURL}/api/jergas`);
        if (!response.ok) throw new Error('Error al obtener jergas');
        return response.json();
    }

    async getSinonimos() {
        const response = await fetch(`${this.baseURL}/api/sinonimos`);
        if (!response.ok) throw new Error('Error al obtener sinónimos');
        return response.json();
    }

    async guardarJerga(original, reemplazo) {
        const response = await fetch(`${this.baseURL}/api/jergas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original, reemplazo })
        });
        if (!response.ok) throw new Error('Error al guardar jerga');
        return response.json();
    }

    async guardarSinonimo(original, reemplazo) {
        const response = await fetch(`${this.baseURL}/api/sinonimos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original, reemplazo })
        });
        if (!response.ok) throw new Error('Error al guardar sinónimo');
        return response.json();
    }

    async eliminarJerga(palabra) {
        const response = await fetch(`${this.baseURL}/api/jergas/${encodeURIComponent(palabra)}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al eliminar jerga');
        return response.json();
    }

    async eliminarSinonimo(palabra) {
        const response = await fetch(`${this.baseURL}/api/sinonimos/${encodeURIComponent(palabra)}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al eliminar sinónimo');
        return response.json();
    }

    async limpiarDiccionarios() {
        const response = await fetch(`${this.baseURL}/api/diccionario`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al limpiar diccionarios');
        return response.json();
    }
}

window.apiClient = new ApiClient();
console.log('✅ apiClient.js inicializado');