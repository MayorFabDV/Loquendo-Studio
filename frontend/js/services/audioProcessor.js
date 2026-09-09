// frontend/js/services/audioProcessor.js
// ==========================================
// Audio Processor - Motor de edición de audio
// Basado en WaveSurfer.js con historial (Undo/Redo)
// ==========================================

class AudioProcessor {
    constructor() {
        // ==========================================
        // 1. ESTADO PRIVADO
        // ==========================================
        this.wavesurfer = null;
        this.regionsPlugin = null;
        this.audioContext = null;
        this.audioBuffer = null;
        this.currentWavBlobUrl = null;
        this._currentUrl = null;
        this.isReady = false;

        // Historial (Undo/Redo)
        this.historyStack = [];
        this.historyIndex = -1;
        this.MAX_HISTORY = 20;

        // Música de fondo
        this.wavesurferMusica = null;
        this.musicaCargada = false;
        this.musicaVolume = 0.5;
        this.musicaMuteada = false;
        this.musicaVolumeAnterior = 0.5;

        // Callbacks
        this.onReady = null;
        this.onPlay = null;
        this.onPause = null;
        this.onFinish = null;
        this.onInteraction = null;
        this.onAudioUpdated = null; // Nuevo callback para notificar cambios
    }

    // ==========================================
    // 2. INICIALIZACIÓN
    // ==========================================

    inicializar(containerId = '#waveform') {
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
            this.wavesurfer = null;
        }

        try {
            if (typeof WaveSurfer === 'undefined') {
                console.error('❌ WaveSurfer no está cargado. Verifica el CDN.');
                return false;
            }

            this.wavesurfer = WaveSurfer.create({
                container: containerId,
                waveColor: '#e41a1a',
                progressColor: '#ff0037',
                cursorColor: '#ffffff',
                height: 120,
                normalize: true,
                interact: true,
                cursorWidth: 2,
                minPxPerSec: 50,
                fillParent: true,
                barWidth: 2,
                barRadius: 2,
                backend: 'MediaElement',
            });

            // Plugin de regiones (selección)
            if (WaveSurfer.Regions) {
                this.regionsPlugin = this.wavesurfer.registerPlugin(
                    WaveSurfer.Regions.create()
                );
                this.regionsPlugin.enableDragSelection({
                    color: 'rgba(255, 0, 55, 0.3)',
                });

                this.regionsPlugin.on('region-created', () => {
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = false;
                });

                this.regionsPlugin.on('region-removed', () => {
                    const regions = this.regionsPlugin.getRegions();
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = regions.length === 0;
                });
            }

            // Timeline
            if (WaveSurfer.Timeline) {
                this.wavesurfer.registerPlugin(
                    WaveSurfer.Timeline.create({
                        container: '#timeline',
                        primaryColor: '#e41a1a',
                        secondaryColor: '#ff0037',
                        fontSize: 11,
                    })
                );
            }

            // Eventos de WaveSurfer
            this.wavesurfer.on('ready', () => {
                this.isReady = true;
                console.log('✅ WaveSurfer listo');
                if (this._currentUrl) {
                    this._cargarAudioParaEdicion(this._currentUrl);
                }
                if (this.onReady) this.onReady();
            });

            this.wavesurfer.on('play', () => {
                if (this.onPlay) this.onPlay();
                this._sincronizarMusica('play');
            });

            this.wavesurfer.on('pause', () => {
                if (this.onPause) this.onPause();
                this._sincronizarMusica('pause');
            });

            this.wavesurfer.on('finish', () => {
                if (this.onFinish) this.onFinish();
                this._sincronizarMusica('finish');
            });

            this.wavesurfer.on('seek', (progress) => {
                this._sincronizarMusica('seek', progress);
            });

            this.wavesurfer.on('timeupdate', (currentTime) => {
                if (this.onInteraction) this.onInteraction(currentTime);
            });

            return true;
        } catch (error) {
            console.error('❌ Error al inicializar WaveSurfer:', error);
            return false;
        }
    }

    // ==========================================
    // 3. MÚSICA DE FONDO
    // ==========================================

    inicializarMusica(containerId = '#waveform-musica-inner') {
        if (this.wavesurferMusica) {
            this.wavesurferMusica.destroy();
            this.wavesurferMusica = null;
        }

        try {
            this.wavesurferMusica = WaveSurfer.create({
                container: containerId,
                waveColor: '#8e44ad',
                progressColor: '#9b59b6',
                cursorColor: '#ffffff',
                height: 80,
                normalize: true,
                interact: false,
                cursorWidth: 0,
                minPxPerSec: 50,
                fillParent: true,
            });
            console.log('✅ Waveform de música inicializado');
            return true;
        } catch (error) {
            console.error('❌ Error al inicializar waveform de música:', error);
            return false;
        }
    }

    cargarMusica(url) {
        if (!this.wavesurferMusica) {
            this.inicializarMusica();
        }

        if (this.wavesurferMusica) {
            this.wavesurferMusica.load(url);
            this.musicaCargada = true;

            const container = document.getElementById('waveform-musica');
            if (container) container.style.display = 'block';

            console.log('🎵 Música de fondo cargada en waveform');
        }
    }

    _sincronizarMusica(accion, data) {
        if (!this.wavesurferMusica || !this.musicaCargada) return;

        switch (accion) {
            case 'play':
                if (this.wavesurferMusica.getCurrentTime() >= 
                    this.wavesurferMusica.getDuration() - 0.1) {
                    this.wavesurferMusica.seekTo(0);
                }
                this.wavesurferMusica.play();
                break;
            case 'pause':
                this.wavesurferMusica.pause();
                break;
            case 'finish':
                this.wavesurferMusica.pause();
                this.wavesurferMusica.seekTo(0);
                break;
            case 'seek':
                this.wavesurferMusica.seekTo(data);
                break;
        }
    }

    // ==========================================
    // 4. CONTROL DE VOLUMEN DE MÚSICA
    // ==========================================

    setVolumenMusica(valor) {
        this.musicaVolume = Math.max(0, Math.min(1, valor / 100));
        this.musicaMuteada = false;

        if (this.wavesurferMusica) {
            this.wavesurferMusica.setVolume(this.musicaVolume);
        }

        const display = document.getElementById('musicaVolumeDisplay');
        if (display) {
            display.innerText = `Volumen: ${Math.round(valor)}%`;
        }

        const btnMute = document.getElementById('btnMuteMusica');
        if (btnMute) {
            btnMute.innerText = this.musicaVolume === 0 ? '🔇' :
                (this.musicaVolume < 0.5 ? '🔉' : '🔊');
        }
    }

    subirVolumen(cantidad = 10) {
        const nuevo = Math.min(100, (this.musicaVolume * 100) + cantidad);
        this.setVolumenMusica(nuevo);
        const slider = document.getElementById('musicaVolumeSlider');
        if (slider) slider.value = nuevo;
    }

    bajarVolumen(cantidad = 10) {
        const nuevo = Math.max(0, (this.musicaVolume * 100) - cantidad);
        this.setVolumenMusica(nuevo);
        const slider = document.getElementById('musicaVolumeSlider');
        if (slider) slider.value = nuevo;
    }

    mutear() {
        if (this.musicaMuteada) {
            this.setVolumenMusica(this.musicaVolumeAnterior * 100);
            this.musicaMuteada = false;
        } else {
            this.musicaVolumeAnterior = this.musicaVolume;
            this.setVolumenMusica(0);
            this.musicaMuteada = true;
        }
        const slider = document.getElementById('musicaVolumeSlider');
        if (slider) {
            slider.value = this.musicaMuteada ? 0 : this.musicaVolume * 100;
        }
    }

    cambiarVolumenDesdeSlider(valor) {
        this.setVolumenMusica(parseFloat(valor));
        this.musicaMuteada = false;
    }

    // ==========================================
    // 5. PERSISTENCIA DE AUDIO EDITADO
    // ==========================================

    // frontend/js/services/audioProcessor.js (corregido)
async persistirAudioEditado() {
    if (!this.currentWavBlobUrl || !this.currentWavBlobUrl.startsWith('blob:')) {
        return;
    }

    try {
        const response = await fetch(this.currentWavBlobUrl);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('audio', blob, `edited-${Date.now()}.wav`);

        // ✅ CORREGIDO: Usar API_BASE
        const res = await fetch(`${window.API_BASE}/api/upload-audio-editado`, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();

        if (data.url) {
            // Actualizar estado global
            if (window.appState) {
                window.appState.audio.current = data.url;
                window.appState.audio.isDucked = false;
            }

            // Actualizar variable global (para compatibilidad)
            window.voiceAudioRealPath = data.url;

            // ✅ CORREGIDO: Actualizar botón de descarga con API_BASE
            const btnDescargar = document.getElementById('btnDescargar');
            if (btnDescargar) {
                btnDescargar.href = `${window.API_BASE}${data.url}`;
                btnDescargar.setAttribute('download', data.url.split('/').pop());
            }

            // Notificar al orquestador
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
    // ==========================================
    // 6. CARGA Y REPRODUCCIÓN
    // ==========================================

    cargarAudio(url) {
        if (!this.wavesurfer) {
            this.inicializar('#waveform');
        }
        if (this.wavesurfer) {
            this._currentUrl = url;
            this.wavesurfer.load(url);
            console.log('🎵 Audio cargado en editor');
        }
    }

    async _cargarAudioParaEdicion(url) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('✅ Audio cargado en AudioContext para edición');

            // Guardar estado inicial
            this._guardarEstado();
        } catch (error) {
            console.error('❌ Error al cargar audio para edición:', error);
            if (window.notifications) {
                window.notifications.error('Error al cargar el audio para edición');
            }
        }
    }

    // Controles
    play() {
        if (this.wavesurfer) this.wavesurfer.play();
    }

    pause() {
        if (this.wavesurfer) this.wavesurfer.pause();
    }

    playPause() {
        if (this.wavesurfer) this.wavesurfer.playPause();
    }

    stop() {
        if (this.wavesurfer) {
            this.wavesurfer.stop();
            this.wavesurfer.seekTo(0);
        }
        if (this.wavesurferMusica) {
            this.wavesurferMusica.pause();
            this.wavesurferMusica.seekTo(0);
        }
    }

    getCurrentTime() {
        return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
    }

    getDuration() {
        return this.wavesurfer ? this.wavesurfer.getDuration() : 0;
    }

    // Zoom
    zoomIn() {
        if (this.wavesurfer) {
            const current = this.wavesurfer.options.minPxPerSec || 50;
            this.wavesurfer.zoom(current * 1.5);
        }
    }

    zoomOut() {
        if (this.wavesurfer) {
            const current = this.wavesurfer.options.minPxPerSec || 50;
            this.wavesurfer.zoom(current / 1.5);
        }
    }

    resetZoom() {
        if (this.wavesurfer) this.wavesurfer.zoom(50);
    }

    // ==========================================
    // 7. HISTORIAL (UNDO / REDO)
    // ==========================================

    _clonarBuffer(buffer) {
        if (!buffer) return null;
        const nuevo = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            nuevo.copyToChannel(buffer.getChannelData(i), i);
        }
        return nuevo;
    }

    _guardarEstado() {
        if (!this.audioBuffer) return;

        // Si el usuario deshizo y hace un cambio nuevo, borrar el "futuro"
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }

        this.historyStack.push(this._clonarBuffer(this.audioBuffer));

        if (this.historyStack.length > this.MAX_HISTORY) {
            this.historyStack.shift();
        } else {
            this.historyIndex++;
        }
        console.log(`💾 Estado guardado. Historial: ${this.historyIndex + 1}/${this.historyStack.length}`);
    }

    deshacer() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.audioBuffer = this._clonarBuffer(this.historyStack[this.historyIndex]);
            this._actualizarWaveSurfer();
            console.log('↩️ Deshacer aplicado');
            if (window.notifications) {
                window.notifications.info('Deshacer aplicado');
            }
        } else {
            console.log('⚠️ No hay más estados para deshacer');
            if (window.notifications) {
                window.notifications.warning('No hay más acciones para deshacer');
            }
        }
    }

    rehacer() {
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyIndex++;
            this.audioBuffer = this._clonarBuffer(this.historyStack[this.historyIndex]);
            this._actualizarWaveSurfer();
            console.log('↪️ Rehacer aplicado');
            if (window.notifications) {
                window.notifications.info('Rehacer aplicado');
            }
        } else {
            console.log('⚠️ No hay más estados para rehacer');
            if (window.notifications) {
                window.notifications.warning('No hay más acciones para rehacer');
            }
        }
    }

    // ==========================================
    // 8. EDICIÓN DE AUDIO
    // ==========================================

    async eliminarSeleccion() {
        if (!this.regionsPlugin) {
            if (window.notifications) {
                window.notifications.error('El plugin de regiones no está disponible');
            }
            return null;
        }

        const regions = this.regionsPlugin.getRegions();
        if (regions.length === 0) {
            if (window.notifications) {
                window.notifications.warning('Selecciona una región del audio primero');
            }
            return null;
        }

        const region = regions[regions.length - 1];
        const startTime = region.start;
        const endTime = region.end;

        if (!this.audioBuffer) {
            if (window.notifications) {
                window.notifications.error('El audio no está cargado para edición');
            }
            return null;
        }

        // Guardar estado antes de modificar
        this._guardarEstado();

        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const numChannels = this.audioBuffer.numberOfChannels;
            const originalLength = this.audioBuffer.length;

            const startSample = Math.floor(startTime * sampleRate);
            const endSample = Math.floor(endTime * sampleRate);
            const newLength = originalLength - (endSample - startSample);

            const newBuffer = this.audioContext.createBuffer(numChannels, newLength, sampleRate);

            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = this.audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);

                for (let i = 0; i < startSample; i++) newData[i] = oldData[i];
                for (let i = endSample; i < originalLength; i++) {
                    newData[i - (endSample - startSample)] = oldData[i];
                }
            }

            this.audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();

            this.regionsPlugin.clearRegions();
            const btnEliminar = document.getElementById('btnEliminar');
            if (btnEliminar) btnEliminar.disabled = true;

            console.log('✅ Audio cortado exitosamente');
            if (window.notifications) {
                window.notifications.success('✅ Corte aplicado correctamente');
            }
            return this.currentWavBlobUrl;

        } catch (error) {
            console.error('❌ Error al cortar audio:', error);
            if (window.notifications) {
                window.notifications.error('Error al cortar el audio');
            }
            return null;
        }
    }

    async aplicarFadeIn(duration = 2) {
        if (!this.audioBuffer) {
            if (window.notifications) window.notifications.error('No hay audio cargado');
            return null;
        }

        this._guardarEstado();

        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const numChannels = this.audioBuffer.numberOfChannels;
            const fadeSamples = Math.floor(duration * sampleRate);

            if (fadeSamples >= this.audioBuffer.length) {
                if (window.notifications) {
                    window.notifications.warning('El audio es muy corto para aplicar fade in');
                }
                return null;
            }

            const newBuffer = this.audioContext.createBuffer(numChannels, this.audioBuffer.length, sampleRate);
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = this.audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < this.audioBuffer.length; i++) {
                    newData[i] = i < fadeSamples ?
                        oldData[i] * (i / fadeSamples) :
                        oldData[i];
                }
            }
            this.audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Fade In aplicado');
            if (window.notifications) {
                window.notifications.success(`✅ Fade In de ${duration}s aplicado`);
            }
            return true;
        } catch (error) {
            console.error('❌ Error en Fade In:', error);
            if (window.notifications) {
                window.notifications.error('Error al aplicar Fade In');
            }
            return false;
        }
    }

    async aplicarFadeOut(duration = 2) {
        if (!this.audioBuffer) {
            if (window.notifications) window.notifications.error('No hay audio cargado');
            return null;
        }

        this._guardarEstado();

        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const numChannels = this.audioBuffer.numberOfChannels;
            const fadeSamples = Math.floor(duration * sampleRate);

            if (fadeSamples >= this.audioBuffer.length) {
                if (window.notifications) {
                    window.notifications.warning('El audio es muy corto para aplicar fade out');
                }
                return null;
            }

            const newBuffer = this.audioContext.createBuffer(numChannels, this.audioBuffer.length, sampleRate);
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = this.audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < this.audioBuffer.length; i++) {
                    newData[i] = i >= this.audioBuffer.length - fadeSamples ?
                        oldData[i] * ((this.audioBuffer.length - i) / fadeSamples) :
                        oldData[i];
                }
            }
            this.audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Fade Out aplicado');
            if (window.notifications) {
                window.notifications.success(`✅ Fade Out de ${duration}s aplicado`);
            }
            return true;
        } catch (error) {
            console.error('❌ Error en Fade Out:', error);
            if (window.notifications) {
                window.notifications.error('Error al aplicar Fade Out');
            }
            return false;
        }
    }

    async normalizarVolume(targetPeak = 0.95) {
        if (!this.audioBuffer) {
            if (window.notifications) window.notifications.error('No hay audio cargado');
            return null;
        }

        this._guardarEstado();

        try {
            let maxPeak = 0;
            for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
                const data = this.audioBuffer.getChannelData(channel);
                for (let i = 0; i < data.length; i++) {
                    const abs = Math.abs(data[i]);
                    if (abs > maxPeak) maxPeak = abs;
                }
            }

            if (maxPeak === 0) {
                if (window.notifications) window.notifications.warning('El audio está en silencio');
                return null;
            }

            const gain = targetPeak / maxPeak;
            console.log(`📊 Normalizando: pico actual=${maxPeak.toFixed(3)}, ganancia=${gain.toFixed(2)}x`);

            const sampleRate = this.audioBuffer.sampleRate;
            const numChannels = this.audioBuffer.numberOfChannels;
            const newBuffer = this.audioContext.createBuffer(numChannels, this.audioBuffer.length, sampleRate);

            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = this.audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < oldData.length; i++) {
                    newData[i] = oldData[i] * gain;
                }
            }
            this.audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Audio normalizado');
            if (window.notifications) {
                window.notifications.success('✅ Audio normalizado correctamente');
            }
            return true;
        } catch (error) {
            console.error('❌ Error en normalización:', error);
            if (window.notifications) {
                window.notifications.error('Error al normalizar el volumen');
            }
            return false;
        }
    }

    async eliminarSilencios(threshold = 0.05, minSilenceDuration = 0.5) {
        if (!this.audioBuffer) {
            if (window.notifications) window.notifications.error('No hay audio cargado');
            return null;
        }

        this._guardarEstado();

        try {
            const sampleRate = this.audioBuffer.sampleRate;
            const numChannels = this.audioBuffer.numberOfChannels;
            const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
            const channelData = this.audioBuffer.getChannelData(0);
            const silenceRegions = [];
            let silenceStart = null;

            for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) < threshold) {
                    if (silenceStart === null) silenceStart = i;
                } else {
                    if (silenceStart !== null) {
                        if (i - silenceStart >= minSilenceSamples) {
                            silenceRegions.push({
                                start: silenceStart / sampleRate,
                                end: i / sampleRate
                            });
                        }
                        silenceStart = null;
                    }
                }
            }

            if (silenceRegions.length === 0) {
                if (window.notifications) {
                    window.notifications.info('No se encontraron silencios para eliminar');
                }
                return null;
            }

            console.log(`🔇 Silencios encontrados: ${silenceRegions.length}`);
            if (window.notifications) {
                window.notifications.info(`🔇 Eliminando ${silenceRegions.length} silencios...`);
            }

            let newBuffer = this.audioBuffer;
            for (let i = silenceRegions.length - 1; i >= 0; i--) {
                const region = silenceRegions[i];
                const startSample = Math.floor(region.start * sampleRate);
                const endSample = Math.floor(region.end * sampleRate);
                const newLength = newBuffer.length - (endSample - startSample);
                const tempBuffer = this.audioContext.createBuffer(numChannels, newLength, sampleRate);

                for (let channel = 0; channel < numChannels; channel++) {
                    const oldData = newBuffer.getChannelData(channel);
                    const newData = tempBuffer.getChannelData(channel);
                    for (let j = 0; j < startSample; j++) newData[j] = oldData[j];
                    for (let j = endSample; j < oldData.length; j++) {
                        newData[j - (endSample - startSample)] = oldData[j];
                    }
                }
                newBuffer = tempBuffer;
            }

            this.audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Silencios eliminados');
            if (window.notifications) {
                window.notifications.success(`✅ ${silenceRegions.length} silencios eliminados`);
            }
            return true;
        } catch (error) {
            console.error('❌ Error al eliminar silencios:', error);
            if (window.notifications) {
                window.notifications.error('Error al eliminar silencios');
            }
            return false;
        }
    }

    // ==========================================
    // 9. EXPORTACIÓN Y ACTUALIZACIÓN DE WAVEFORM
    // ==========================================

async _actualizarWaveSurfer() {
    if (!this.audioBuffer) return;

    const wavBlob = this._bufferToWav(this.audioBuffer);

    // Limpiar URL anterior
    if (this.currentWavBlobUrl && this.currentWavBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentWavBlobUrl);
    }

    this.currentWavBlobUrl = URL.createObjectURL(wavBlob);
    this._currentUrl = this.currentWavBlobUrl;

    // Cargar en WaveSurfer
    if (this.wavesurfer) {
        this.wavesurfer.load(this.currentWavBlobUrl);
    }

    // Actualizar botón de descarga
    const btnDescargar = document.getElementById('btnDescargar');
    if (btnDescargar) {
        btnDescargar.href = this.currentWavBlobUrl;
        btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
    }

    // Actualizar reproductor nativo
    const audioNative = document.getElementById('audioReproductor');
    if (audioNative) {
        audioNative.src = this.currentWavBlobUrl;
        audioNative.load();
    }

    // ✅ Persistir en servidor (para que ducking y video usen la versión editada)
    await this.persistirAudioEditado();

    // Notificar al orquestador
    if (this.onAudioUpdated && this.currentWavBlobUrl) {
        this.onAudioUpdated(this.currentWavBlobUrl);
    }
}

    _bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;

        let result = (numChannels === 2) ?
            this._interleave(buffer.getChannelData(0), buffer.getChannelData(1)) :
            buffer.getChannelData(0);

        const dataLength = result.length * (bitDepth / 8);
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        this._writeString(view, 8, 'WAVE');
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
        view.setUint16(32, numChannels * (bitDepth / 8), true);
        view.setUint16(34, bitDepth, true);
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let i = 0; i < result.length; i++) {
            const sample = Math.max(-1, Math.min(1, result[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    _interleave(leftChannel, rightChannel) {
        const length = leftChannel.length + rightChannel.length;
        const result = new Float32Array(length);
        let inputIndex = 0;
        for (let i = 0; i < length;) {
            result[i++] = leftChannel[inputIndex];
            result[i++] = rightChannel[inputIndex];
            inputIndex++;
        }
        return result;
    }

    _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // ==========================================
    // 10. DESTRUCCIÓN / LIMPIEZA
    // ==========================================

    destroy() {
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
            this.wavesurfer = null;
        }
        if (this.wavesurferMusica) {
            this.wavesurferMusica.destroy();
            this.wavesurferMusica = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.currentWavBlobUrl && this.currentWavBlobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.currentWavBlobUrl);
            this.currentWavBlobUrl = null;
        }
        this.audioBuffer = null;
        this.isReady = false;
        console.log('🧹 AudioProcessor destruido');
    }
}

// ==========================================
// 11. INSTANCIA GLOBAL
// ==========================================

// Crear instancia única y exponerla globalmente
const audioProcessor = new AudioProcessor();
window.audioProcessor = audioProcessor;
// Compatibilidad: exponer también como `audioEditor` para módulos heredados
window.audioEditor = audioProcessor;

console.log('📝 audioProcessor.js cargado correctamente');