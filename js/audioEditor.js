// js/audioEditor.js - Versión Final: Fase 3 + Waveform Música + Historial (Undo/Redo)

let wavesurfer = null;
let regionsPlugin = null;
let audioContext = null;
let audioBuffer = null;
let currentWavBlobUrl = null;

// ==========================================
// VARIABLES PARA EL HISTORIAL (UNDO/REDO)
// ==========================================
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 30; // Límite para no saturar la memoria RAM

// Crear objeto global
window.audioEditor = {
    wavesurfer: null,
    isReady: false,
    onReady: null,
    onPlay: null,
    onPause: null,
    onFinish: null,
    onInteraction: null,
    _currentUrl: null,
    
    // 🎵 Variables para música de fondo
    wavesurferMusica: null,
    musicaCargada: false,
    musicaVolume: 0.5,
    musicaMuteada: false,
    musicaVolumeAnterior: 0.5,

    // ==========================================
    // 1. INICIALIZACIÓN
    // ==========================================
    inicializar(containerId = '#waveform') {
        if (wavesurfer) {
            wavesurfer.destroy();
        }

        try {
            if (typeof WaveSurfer === 'undefined') {
                console.error('❌ WaveSurfer no está cargado. Verifica el CDN en el HTML.');
                return false;
            }

            wavesurfer = WaveSurfer.create({
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

            this.wavesurfer = wavesurfer;

            if (WaveSurfer.Regions) {
                regionsPlugin = wavesurfer.registerPlugin(WaveSurfer.Regions.create());
                regionsPlugin.enableDragSelection({
                    color: 'rgba(255, 0, 55, 0.3)',
                });

                regionsPlugin.on('region-created', () => {
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = false;
                });

                regionsPlugin.on('region-removed', () => {
                    const regions = regionsPlugin.getRegions();
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = regions.length === 0;
                });
            }

            if (WaveSurfer.Timeline) {
                wavesurfer.registerPlugin(WaveSurfer.Timeline.create({
                    container: '#timeline',
                    primaryColor: '#e41a1a',
                    secondaryColor: '#ff0037',
                    fontSize: 11,
                }));
            }

            wavesurfer.on('ready', () => {
                this.isReady = true;
                console.log('✅ WaveSurfer listo');
                if (this._currentUrl) this._cargarAudioParaEdicion(this._currentUrl);
                if (this.onReady) this.onReady();
            });

            // 🎵 Sincronización con música de fondo
            wavesurfer.on('play', () => { 
                if (this.onPlay) this.onPlay();
                if (this.wavesurferMusica) {
                    // Si la música llegó al final, reiniciarla antes de reproducir
                    if (this.wavesurferMusica.getCurrentTime() >= this.wavesurferMusica.getDuration() - 0.1) {
                        this.wavesurferMusica.seekTo(0);
                    }
                    this.wavesurferMusica.play();
                }
            });
            
            wavesurfer.on('pause', () => { 
                if (this.onPause) this.onPause();
                if (this.wavesurferMusica) {
                    this.wavesurferMusica.pause();
                }
            });

            wavesurfer.on('finish', () => { 
                if (this.onFinish) this.onFinish();
                // 🎵 Cuando termina la voz, la música también se detiene y vuelve al inicio
                if (this.wavesurferMusica) {
                    this.wavesurferMusica.pause();
                    this.wavesurferMusica.seekTo(0);
                }
            });
            
            wavesurfer.on('seek', (progress) => {
                if (this.wavesurferMusica) {
                    this.wavesurferMusica.seekTo(progress);
                }
            });

            wavesurfer.on('timeupdate', (currentTime) => { 
                if (this.onInteraction) this.onInteraction(currentTime); 
            });

            return true;
        } catch (error) {
            console.error('❌ Error al inicializar WaveSurfer:', error);
            return false;
        }
    },

    // 🎵 Inicializar waveform de música
    inicializarMusica(containerId = '#waveform-musica-inner') {
        if (this.wavesurferMusica) {
            this.wavesurferMusica.destroy();
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
    },

    // 🎵 Cargar música de fondo
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
    },

    // ==========================================
    // 2. CONTROL DE VOLUMEN DE MÚSICA
    // ==========================================
    setVolumenMusica(valor) {
        this.musicaVolume = valor / 100;
        this.musicaMuteada = false;
        
        if (this.wavesurferMusica) {
            this.wavesurferMusica.setVolume(this.musicaVolume);
        }
        
        const display = document.getElementById('musicaVolumeDisplay');
        if (display) display.innerText = `Volumen: ${Math.round(valor)}%`;
        
        const btnMute = document.getElementById('btnMuteMusica');
        if (btnMute) {
            btnMute.innerText = this.musicaVolume === 0 ? '🔇' : (this.musicaVolume < 0.5 ? '🔉' : '🔊');
        }
    },

    subirVolumen(cantidad = 10) {
        const nuevoVolumen = Math.min(100, (this.musicaVolume * 100) + cantidad);
        this.setVolumenMusica(nuevoVolumen);
        const slider = document.getElementById('musicaVolumeSlider');
        if (slider) slider.value = nuevoVolumen;
    },

    bajarVolumen(cantidad = 10) {
        const nuevoVolumen = Math.max(0, (this.musicaVolume * 100) - cantidad);
        this.setVolumenMusica(nuevoVolumen);
        const slider = document.getElementById('musicaVolumeSlider');
        if (slider) slider.value = nuevoVolumen;
    },

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
        if (slider) slider.value = this.musicaMuteada ? 0 : this.musicaVolume * 100;
    },

    cambiarVolumenDesdeSlider(valor) {
        this.setVolumenMusica(parseFloat(valor));
        this.musicaMuteada = false;
    },
        async persistirAudioEditado() {
        if (!currentWavBlobUrl || !currentWavBlobUrl.startsWith('blob:')) return;
        
        try {
            const response = await fetch(currentWavBlobUrl);
            const blob = await response.blob();
            
            const formData = new FormData();
            formData.append('audio', blob, `edited-${Date.now()}.wav`);
            
            const res = await fetch('http://localhost:3000/api/guardar-audio-blob', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            if (data.url) {
                window.voiceAudioRealPath = data.url;
                const btnDescargar = document.getElementById('btnDescargar');
                if (btnDescargar) {
                    btnDescargar.href = `http://localhost:3000${data.url}`;
                    btnDescargar.setAttribute('download', data.url.split('/').pop());
                }
                console.log('💾 Audio editado persistido:', data.url);
            }
        } catch (e) {
            console.error('Error persistiendo audio:', e);
        }
    },

    // ==========================================
    // 3. CARGA Y REPRODUCCIÓN
    // ==========================================
    cargarAudio(url) {
        if (!wavesurfer) {
            this.inicializar('#waveform');
        }
        if (wavesurfer) {
            this._currentUrl = url;
            wavesurfer.load(url);
            console.log('🎵 Audio cargado en editor');
        }
    },


    async _cargarAudioParaEdicion(url) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log('✅ Audio cargado en AudioContext para edición');
            
            // 💾 Guardar el estado inicial recién cargado
            this._guardarEstado();
        } catch (error) {
            console.error('❌ Error al cargar audio para edición:', error);
        }
    },

    play() { if (wavesurfer) wavesurfer.play(); },
    pause() { if (wavesurfer) wavesurfer.pause(); },
    playPause() { if (wavesurfer) wavesurfer.playPause(); },
    
    stop() { 
        if (wavesurfer) {
            wavesurfer.stop();
            wavesurfer.seekTo(0);
        }
        // 🎵 Detener y reiniciar también la música
        if (this.wavesurferMusica) {
            this.wavesurferMusica.pause();
            this.wavesurferMusica.seekTo(0);
        }
    },
    
    getCurrentTime() { return wavesurfer ? wavesurfer.getCurrentTime() : 0; },
    getDuration() { return wavesurfer ? wavesurfer.getDuration() : 0; },

    zoomIn() {
        if (wavesurfer) {
            const currentZoom = wavesurfer.options.minPxPerSec || 50;
            wavesurfer.zoom(currentZoom * 1.5);
        }
    },

    zoomOut() {
        if (wavesurfer) {
            const currentZoom = wavesurfer.options.minPxPerSec || 50;
            wavesurfer.zoom(currentZoom / 1.5);
        }
    },

    resetZoom() {
        if (wavesurfer) wavesurfer.zoom(50);
    },

    // ==========================================
    // 4. HISTORIAL (UNDO / REDO)
    // ==========================================
    _clonarBuffer(buffer) {
        if (!buffer) return null;
        const nuevoBuffer = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            nuevoBuffer.copyToChannel(buffer.getChannelData(i), i);
        }
        return nuevoBuffer;
    },

    _guardarEstado() {
        if (!audioBuffer) return;
        
        // Si el usuario deshizo cambios y ahora hace uno nuevo, borramos el "futuro"
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }

        historyStack.push(this._clonarBuffer(audioBuffer));
        
        if (historyStack.length > MAX_HISTORY) {
            historyStack.shift();
        } else {
            historyIndex++;
        }
        console.log(`💾 Estado guardado. Historial: ${historyIndex + 1}/${historyStack.length}`);
    },

    deshacer() {
        if (historyIndex > 0) {
            historyIndex--;
            audioBuffer = this._clonarBuffer(historyStack[historyIndex]);
            this._actualizarWaveSurfer();
            console.log('↩️ Deshacer aplicado');
        } else {
            console.log('⚠️ No hay más estados para deshacer');
        }
    },

    rehacer() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            audioBuffer = this._clonarBuffer(historyStack[historyIndex]);
            this._actualizarWaveSurfer();
            console.log('↪️ Rehacer aplicado');
        } else {
            console.log('⚠️ No hay más estados para rehacer');
        }
    },

    // ==========================================
    // 5. EDICIÓN DE AUDIO (FASE 3)
    // ==========================================
    async eliminarSeleccion() {
        if (!regionsPlugin) {
            alert('El plugin de regiones no está disponible');
            return null;
        }
        
        const regions = regionsPlugin.getRegions();
        if (regions.length === 0) {
            alert('Selecciona una región del audio primero (haz clic y arrastra sobre la forma de onda)');
            return null;
        }

        const region = regions[regions.length - 1];
        const startTime = region.start;
        const endTime = region.end;
        
        if (!audioBuffer) {
            alert('El audio no está cargado para edición. Espera un momento.');
            return null;
        }

        // 💾 GUARDAR ESTADO ANTES DE MODIFICAR
        this._guardarEstado();

        try {
            const sampleRate = audioBuffer.sampleRate;
            const numChannels = audioBuffer.numberOfChannels;
            const originalLength = audioBuffer.length;
            
            const startSample = Math.floor(startTime * sampleRate);
            const endSample = Math.floor(endTime * sampleRate);
            const newLength = originalLength - (endSample - startSample);
            
            const newBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);
            
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                
                for (let i = 0; i < startSample; i++) newData[i] = oldData[i];
                for (let i = endSample; i < originalLength; i++) {
                    newData[i - (endSample - startSample)] = oldData[i];
                }
            }
            
            audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            
            regionsPlugin.clearRegions();
            const btnEliminar = document.getElementById('btnEliminar');
            if (btnEliminar) btnEliminar.disabled = true;
            
            console.log('✅ Audio cortado exitosamente');
            return currentWavBlobUrl;
            
        } catch (error) {
            console.error('❌ Error al cortar audio:', error);
            alert('Error al cortar el audio: ' + error.message);
            return null;
        }
    },

    async aplicarFadeIn(duration = 2) {
        if (!audioBuffer) { alert('No hay audio cargado para editar'); return null; }
        
        // 💾 GUARDAR ESTADO ANTES DE MODIFICAR
        this._guardarEstado();

        try {
            const sampleRate = audioBuffer.sampleRate;
            const numChannels = audioBuffer.numberOfChannels;
            const fadeSamples = Math.floor(duration * sampleRate);
            if (fadeSamples >= audioBuffer.length) { alert('El audio es muy corto para aplicar fade in'); return null; }

            const newBuffer = audioContext.createBuffer(numChannels, audioBuffer.length, sampleRate);
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < audioBuffer.length; i++) {
                    newData[i] = i < fadeSamples ? oldData[i] * (i / fadeSamples) : oldData[i];
                }
            }
            audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Fade In aplicado');
            return true;
        } catch (error) {
            console.error('❌ Error en Fade In:', error);
            alert('Error al aplicar Fade In');
            return false;
        }
    },

    async aplicarFadeOut(duration = 2) {
        if (!audioBuffer) { alert('No hay audio cargado para editar'); return null; }
        
        // 💾 GUARDAR ESTADO ANTES DE MODIFICAR
        this._guardarEstado();

        try {
            const sampleRate = audioBuffer.sampleRate;
            const numChannels = audioBuffer.numberOfChannels;
            const fadeSamples = Math.floor(duration * sampleRate);
            if (fadeSamples >= audioBuffer.length) { alert('El audio es muy corto para aplicar fade out'); return null; }

            const newBuffer = audioContext.createBuffer(numChannels, audioBuffer.length, sampleRate);
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < audioBuffer.length; i++) {
                    newData[i] = i >= audioBuffer.length - fadeSamples 
                        ? oldData[i] * ((audioBuffer.length - i) / fadeSamples) 
                        : oldData[i];
                }
            }
            audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Fade Out aplicado');
            return true;
        } catch (error) {
            console.error('❌ Error en Fade Out:', error);
            alert('Error al aplicar Fade Out');
            return false;
        }
    },

    async normalizarVolume(targetPeak = 0.95) {
        if (!audioBuffer) { alert('No hay audio cargado para editar'); return null; }
        
        // 💾 GUARDAR ESTADO ANTES DE MODIFICAR
        this._guardarEstado();

        try {
            let maxPeak = 0;
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const data = audioBuffer.getChannelData(channel);
                for (let i = 0; i < data.length; i++) {
                    const abs = Math.abs(data[i]);
                    if (abs > maxPeak) maxPeak = abs;
                }
            }
            if (maxPeak === 0) { alert('El audio está en silencio'); return null; }

            const gain = targetPeak / maxPeak;
            console.log(`📊 Normalizando: pico actual=${maxPeak.toFixed(3)}, ganancia=${gain.toFixed(2)}x`);

            const sampleRate = audioBuffer.sampleRate;
            const numChannels = audioBuffer.numberOfChannels;
            const newBuffer = audioContext.createBuffer(numChannels, audioBuffer.length, sampleRate);
            
            for (let channel = 0; channel < numChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                for (let i = 0; i < oldData.length; i++) {
                    newData[i] = oldData[i] * gain;
                }
            }
            audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Audio normalizado');
            return true;
        } catch (error) {
            console.error('❌ Error en normalización:', error);
            alert('Error al normalizar el volumen');
            return false;
        }
    },

    async eliminarSilencios(threshold = 0.05, minSilenceDuration = 0.5) {
        if (!audioBuffer) { alert('No hay audio cargado para editar'); return null; }
        
        // 💾 GUARDAR ESTADO ANTES DE MODIFICAR
        this._guardarEstado();

        try {
            const sampleRate = audioBuffer.sampleRate;
            const numChannels = audioBuffer.numberOfChannels;
            const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            const silenceRegions = [];
            let silenceStart = null;
            
            for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) < threshold) {
                    if (silenceStart === null) silenceStart = i;
                } else {
                    if (silenceStart !== null) {
                        if (i - silenceStart >= minSilenceSamples) {
                            silenceRegions.push({ start: silenceStart / sampleRate, end: i / sampleRate });
                        }
                        silenceStart = null;
                    }
                }
            }
            
            if (silenceRegions.length === 0) { alert('No se encontraron silencios para eliminar'); return null; }
            console.log(`🔇 Silencios encontrados: ${silenceRegions.length}`);
            
            let newBuffer = audioBuffer;
            for (let i = silenceRegions.length - 1; i >= 0; i--) {
                const region = silenceRegions[i];
                const startSample = Math.floor(region.start * sampleRate);
                const endSample = Math.floor(region.end * sampleRate);
                const newLength = newBuffer.length - (endSample - startSample);
                const tempBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);
                
                for (let channel = 0; channel < numChannels; channel++) {
                    const oldData = newBuffer.getChannelData(channel);
                    const newData = tempBuffer.getChannelData(channel);
                    for (let j = 0; j < startSample; j++) newData[j] = oldData[j];
                    for (let j = endSample; j < oldData.length; j++) newData[j - (endSample - startSample)] = oldData[j];
                }
                newBuffer = tempBuffer;
            }
            audioBuffer = newBuffer;
            await this._actualizarWaveSurfer();
            console.log('✅ Silencios eliminados');
            return true;
        } catch (error) {
            console.error('❌ Error al eliminar silencios:', error);
            alert('Error al eliminar silencios');
            return false;
        }
    },

    // ==========================================
    // 6. UTILIDADES DE EXPORTACIÓN
    // ==========================================
    async _actualizarWaveSurfer() {
        const wavBlob = this._bufferToWav(audioBuffer);
        if (currentWavBlobUrl && currentWavBlobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(currentWavBlobUrl);
        }
        currentWavBlobUrl = URL.createObjectURL(wavBlob);
        this._currentUrl = currentWavBlobUrl;
        
        if (wavesurfer) wavesurfer.load(currentWavBlobUrl);
        
        const btnDescargar = document.getElementById('btnDescargar');
        if (btnDescargar) {
            btnDescargar.href = currentWavBlobUrl;
            btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
        }
                // Persistir en servidor para que ducking y video usen la versión editada
        this.persistirAudioEditado();
        const audioNative = document.getElementById('audioReproductor');
        if (audioNative) {
            audioNative.src = currentWavBlobUrl;
            audioNative.load();
        }
    },

    _bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        
        let result = (numChannels === 2) 
            ? this._interleave(buffer.getChannelData(0), buffer.getChannelData(1))
            : buffer.getChannelData(0);
        
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
    },

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
    },

    _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
};

console.log('📝 audioEditor.js cargado correctamente con Fase 3 + Música + Historial');