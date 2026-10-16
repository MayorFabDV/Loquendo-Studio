// frontend/js/services/audioProcessor.js
// ==========================================
// Audio Processor - Motor de edición de audio
// ==========================================

class AudioProcessor {
    constructor() {
        this.wavesurfer = null;
        this.regionsPlugin = null;
        this.audioContext = null;
        this.audioBuffer = null;
        this.currentWavBlobUrl = null;
        this._currentUrl = null;
        this.isReady = false;
        this.historyStack = [];
        this.historyIndex = -1;
        this.MAX_HISTORY = 20;
        this.wavesurferMusica = null;
        this.musicaCargada = false;
        this.musicaVolume = 0.5;
        this.musicaMuteada = false;
        this.musicaVolumeAnterior = 0.5;
        this.onReady = null;
        this.onPlay = null;
        this.onPause = null;
        this.onFinish = null;
        this.onInteraction = null;
        this.onAudioUpdated = null;
    }

    getApiBase() {
        if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
        if (window.API_BASE) return window.API_BASE;
        return window.location && window.location.origin ? window.location.origin : '';
    }

    async persistirAudioEditado() {
        if (!this.currentWavBlobUrl || !this.currentWavBlobUrl.startsWith('blob:')) {
            return;
        }

        try {
            const response = await fetch(this.currentWavBlobUrl);
            const blob = await response.blob();
            const formData = new FormData();
            formData.append('audio', blob, `edited-${Date.now()}.wav`);

            const apiBase = this.getApiBase();
            const res = await fetch(`${apiBase}/api/upload-audio-editado`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data.url) {
                if (window.appState) {
                    window.appState.audio.current = data.url;
                    window.appState.audio.isDucked = false;
                }
                window.voiceAudioRealPath = data.url;

                const btnDescargar = document.getElementById('btnDescargar');
                if (btnDescargar) {
                    btnDescargar.href = `${apiBase}${data.url}`;
                    btnDescargar.setAttribute('download', data.url.split('/').pop());
                }

                if (this.onAudioUpdated) {
                    this.onAudioUpdated(data.url);
                }

                console.log('💾 Audio editado persistido:', data.url);
            }
        } catch (error) {
            console.error('❌ Error persistiendo audio:', error);
            if (window.notifications) {
                window.notifications.error('Error al guardar el audio editado');
            }
        }
    }
}

const audioProcessor = new AudioProcessor();
window.audioProcessor = audioProcessor;
window.audioEditor = audioProcessor;
console.log('📝 audioProcessor.js cargado correctamente');

