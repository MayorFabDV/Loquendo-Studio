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
        this.targetSeleccion = 'voz';
        this.audioContext = null;
        this.audioBuffer = null;
        this.currentWavBlobUrl = null;
        this._currentUrl = null;
        this.isReady = false;
        this.engine = null;
        this._engineBound = false;
        this._engineFallback = false;
        this._syncingVisual = false;
        this._seleccionProcesando = false;
        this._skipEdicionUrl = null;
        this._regionPendiente = null;
        this._selectionPlaybackTimer = null;
        this._clipboard = null;

        // Sesion no destructiva: fuente original, derivado y borrador persistente
        this._fuenteOriginal = '';
        this._baseServidor = '';
        this._dirty = false;
        this._sesionEditada = false;
        this._guardadoSesionTimer = null;
        this._restaurando = false;

        // Historial (Undo/Redo)
        this.historyStack = [];
        this.historyIndex = -1;
        this.MAX_HISTORY = 20;

        // Música de fondo
        this.wavesurferMusica = null;
        this.regionsPluginMusica = null;
        this._regionPendienteMusica = null;
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
        this.onMeter = null;
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
                    this.targetSeleccion = 'voz';
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = false;
                    this._actualizarBotonesSeleccion();
                });

                this.regionsPlugin.on('region-updated', () => {
                    this._actualizarBotonesSeleccion();
                });

                this.regionsPlugin.on('region-removed', () => {
                    const regions = this.regionsPlugin.getRegions();
                    const btnEliminar = document.getElementById('btnEliminar');
                    if (btnEliminar) btnEliminar.disabled = regions.length === 0;
                    this._actualizarBotonesSeleccion();
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
                if (this._currentUrl && this._currentUrl !== this._skipEdicionUrl) {
                    this._cargarAudioParaEdicion(this._currentUrl);
                }
                this._skipEdicionUrl = null;

                if (this._regionPendiente && this.regionsPlugin) {
                    const pendiente = this._regionPendiente;
                    this._regionPendiente = null;
                    try {
                        this.regionsPlugin.clearRegions();
                        this.regionsPlugin.addRegion({
                            start: pendiente.start,
                            end: pendiente.end,
                            color: 'rgba(255, 0, 55, 0.3)'
                        });
                    } catch (error) {
                        console.warn('No se pudo restaurar la región de selección:', error);
                    }
                }

                this._actualizarBotonesHistorial();
                this._actualizarBotonesSeleccion();
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

            this.wavesurfer.on('interaction', (newTime) => {
                if (!this._syncingVisual && this._engineActive() && this.wavesurfer) {
                    this.engine.seek(newTime);
                }
                const duration = this.wavesurfer ? this.wavesurfer.getDuration() : 0;
                this._sincronizarMusica('seek', duration > 0 ? newTime / duration : 0);
            });

            this.wavesurfer.on('timeupdate', (currentTime) => {
                if (!this._engineActive() && this.onInteraction) this.onInteraction(currentTime);
            });

            this._inicializarEngine();
            if (window.audioMarkers) window.audioMarkers.attach(this);
            return true;
        } catch (error) {
            console.error('❌ Error al inicializar WaveSurfer:', error);
            return false;
        }
    }

    _inicializarEngine() {
        if (this._engineBound) return;
        if (!window.audioEngine) {
            console.warn('Motor de audio Tone.js no disponible; usando WaveSurfer.');
            return;
        }
        this._engineBound = true;
        this.engine = window.audioEngine;

        this.engine.onPlay = () => {
            this._silenciarWaveSurfer(true);
            if (this.onPlay) this.onPlay();
            this._sincronizarMusica('play');
        };
        this.engine.onPause = () => {
            if (this.onPause) this.onPause();
            this._sincronizarMusica('pause');
        };
        this.engine.onEnded = () => {
            if (this.onFinish) this.onFinish();
            this._sincronizarMusica('finish');
        };
        this.engine.onTime = (time) => {
            this._sincronizarVisual(time);
            if (this.onInteraction) this.onInteraction(time);
            this._sincronizarMusica('time', time);
        };
        this.engine.onMeter = (meter) => {
            if (this.onMeter) this.onMeter(meter);
        };

        this.engine.init().then((ok) => {
            if (!ok) {
                this._engineFallback = true;
                this._silenciarWaveSurfer(false);
                return;
            }
            this._silenciarWaveSurfer(true);
            if (this._currentUrl) {
                this._cargarEngine(this._currentUrl);
            }
        });
    }

    _motor() {
        if (!this.engine && window.audioEngine) this._inicializarEngine();
        return this.engine || window.audioEngine || null;
    }

    _engineActive() {
        return !!(this.engine && this.engine.available && this.engine.loaded && !this._engineFallback);
    }

    _silenciarWaveSurfer(silenciar) {
        if (!this.wavesurfer) return;
        try {
            this.wavesurfer.setVolume(silenciar ? 0 : 1);
        } catch (error) { /* noop */ }
    }

    _sincronizarVisual(time) {
        if (!this.wavesurfer || !this.wavesurfer.getDuration()) return;
        this._syncingVisual = true;
        try {
            this.wavesurfer.setTime(time);
        } catch (error) { /* noop */ }
        this._syncingVisual = false;
    }

    async _cargarEngine(url) {
        if (!this.engine) this._inicializarEngine();
        if (!this.engine) return false;
        const okInit = await this.engine.init();
        if (!okInit) {
            this._engineFallback = true;
            this._silenciarWaveSurfer(false);
            return false;
        }
        const ok = await this.engine.load(url);
        this._engineFallback = !ok;
        this._silenciarWaveSurfer(ok);
        return ok;
    }

    setLoopEnabled(enabled, start, end) {
        const motor = this._motor();
        if (!motor) return false;
        return motor.setLoop(!!enabled, start, end);
    }

    setRate(rate) {
        const motor = this._motor();
        if (motor) motor.setRate(rate);
        if (this.wavesurfer && this.wavesurfer.setPlaybackRate) {
            try { this.wavesurfer.setPlaybackRate(rate); } catch (error) { /* noop */ }
        }
        if (this.wavesurferMusica && this.wavesurferMusica.setPlaybackRate) {
            try { this.wavesurferMusica.setPlaybackRate(rate); } catch (error) { /* noop */ }
        }
    }

    setPitch(semitones) {
        const motor = this._motor();
        if (motor) motor.setPitch(semitones);
    }

    setFX(fx) {
        const motor = this._motor();
        if (motor) motor.setFX(fx);
    }

    toggleBypass() {
        const motor = this._motor();
        if (!motor) return false;
        return motor.toggleBypass();
    }

    resetFX() {
        const motor = this._motor();
        if (!motor) return null;
        return motor.resetFX();
    }

    applyPreset(name) {
        const motor = this._motor();
        if (!motor) return null;
        return motor.applyPreset(name);
    }

    getFXState() {
        const motor = this._motor();
        return motor ? motor.getFX() : null;
    }

    getEngineState() {
        const motor = this._motor();
        return motor ? motor.getState() : null;
    }

    getSeleccion() {
        const esMusica = this._esTargetMusica();
        const plugin = esMusica ? this.regionsPluginMusica : this.regionsPlugin;
        if (!plugin) return null;
        const regiones = plugin.getRegions();
        if (!regiones.length) return null;

        const region = regiones[regiones.length - 1];
        const duracion = esMusica
            ? (this.wavesurferMusica ? this.wavesurferMusica.getDuration() : 0)
            : (this.getDuration() || (this.audioBuffer ? this.audioBuffer.duration : 0));
        let inicio = Number(region.start);
        let fin = Number(region.end);
        if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return null;

        const limite = duracion > 0 ? duracion : fin;
        inicio = Math.max(0, Math.min(limite, inicio));
        fin = Math.max(inicio, Math.min(limite, fin));
        if (fin - inicio < 0.05) return null;

        return { start: inicio, end: fin, duration: fin - inicio };
    }

    _formatearTiempo(segundos) {
        const total = Math.max(0, Number(segundos) || 0);
        const minutos = Math.floor(total / 60);
        const resto = total - minutos * 60;
        return `${minutos}:${resto.toFixed(2).padStart(5, '0')}`;
    }

    _esTargetMusica() {
        return this.targetSeleccion === 'musica';
    }

    _actualizarBotonesSeleccion() {
        const esMusica = this._esTargetMusica();
        const sel = this.getSeleccion();
        const destinoListo = esMusica ? !!this._rutaAudioServidorMusica() : !!this.audioBuffer;
        const habilitado = !!sel && !this._seleccionProcesando && destinoListo;
        const idsServidor = [
            'btnEscucharSeleccion',
            'btnAplicarFxSeleccion',
            'btnSelNormalizar',
            'btnSelSilenciar',
            'btnSelFadeIn',
            'btnSelFadeOut',
            'btnSelLimpiar',
            'btnSelDeesser'
        ];

        for (const id of idsServidor) {
            const boton = document.getElementById(id);
            if (boton) boton.disabled = !habilitado;
        }

        const idsBuffer = ['btnSelCopiar', 'btnSelDuplicar'];
        for (const id of idsBuffer) {
            const boton = document.getElementById(id);
            if (boton) boton.disabled = esMusica ? true : !habilitado;
        }

        const btnPegar = document.getElementById('btnSelPegar');
        if (btnPegar) btnPegar.disabled = esMusica || !(this.audioBuffer && this._clipboard && !this._seleccionProcesando);

        const btnCrossfade = document.getElementById('btnSelCrossfade');
        if (btnCrossfade) {
            btnCrossfade.disabled = esMusica || !(habilitado && this._clipboard);
        }

        const btnEliminar = document.getElementById('btnEliminar');
        if (btnEliminar && esMusica) btnEliminar.disabled = true;

        const etiqueta = document.getElementById('audioSelectionRange');
        if (etiqueta) {
            etiqueta.textContent = sel
                ? (esMusica
                    ? `Música seleccionada: ${this._formatearTiempo(sel.start)} – ${this._formatearTiempo(sel.end)} (${sel.duration.toFixed(2)} s)`
                    : `Selección: ${this._formatearTiempo(sel.start)} – ${this._formatearTiempo(sel.end)} (${sel.duration.toFixed(2)} s)`)
                : 'Arrastra sobre la onda para seleccionar';
        }

        const btnAplicar = document.getElementById('btnAplicarFxSeleccion');
        if (btnAplicar) {
            btnAplicar.title = sel
                ? (esMusica ? 'Aplicar la cadena FX actual a la selección de música' : 'Aplicar la cadena FX actual a la selección')
                : 'Selecciona un tramo primero';
        }
    }

    _setSeleccionBusy(ocupado) {
        this._seleccionProcesando = !!ocupado;
        this._actualizarBotonesSeleccion();

        const status = document.getElementById('audioSelectionStatus');
        if (status) {
            status.textContent = ocupado ? 'Procesando…' : 'Listo';
            status.classList.toggle('audio-engine-status-fallback', !!ocupado);
        }
    }

    _detenerTimerSeleccion() {
        if (this._selectionPlaybackTimer) {
            clearTimeout(this._selectionPlaybackTimer);
            this._selectionPlaybackTimer = null;
        }
    }

    puedeDeshacer() {
        return this.historyIndex > 0;
    }

    puedeRehacer() {
        return this.historyIndex < this.historyStack.length - 1;
    }

    puedeRestaurarOriginal() {
        return !!(this._fuenteOriginal && (this._sesionEditada || this.historyIndex > 0));
    }

    _actualizarBotonesHistorial() {
        const deshacer = document.getElementById('btnDeshacer');
        const rehacer = document.getElementById('btnRehacer');
        const restaurar = document.getElementById('btnRestaurarOriginal');
        if (deshacer) deshacer.disabled = !this.puedeDeshacer();
        if (rehacer) rehacer.disabled = !this.puedeRehacer();
        if (restaurar) restaurar.disabled = !this.puedeRestaurarOriginal();
    }

    _normalizarFuente(url) {
        if (window.audioSessionStore && typeof window.audioSessionStore.normalizar === 'function') {
            return window.audioSessionStore.normalizar(url);
        }
        if (!url) return '';
        try {
            if (/^https?:/i.test(url)) return new URL(url).pathname;
            return String(url).split('?')[0].split('#')[0];
        } catch (error) {
            return String(url).split('?')[0];
        }
    }

    _actualizarRutaGlobal(url) {
        const limpia = this._normalizarFuente(url);
        if (!limpia) return;
        window.voiceAudioRealPath = limpia;
        if (window.appState && window.appState.audio) {
            window.appState.audio.current = limpia;
            window.appState.audio.isDucked = false;
        }
    }

    _programarGuardadoSesion(blob) {
        if (!this._fuenteOriginal || !this.audioBuffer || !this._sesionEditada) return;
        if (!window.audioSessionStore) return;
        if (this._guardadoSesionTimer) clearTimeout(this._guardadoSesionTimer);
        this._guardadoSesionTimer = setTimeout(() => {
            const datos = blob || this._bufferToWav(this.audioBuffer);
            window.audioSessionStore.guardar(this._fuenteOriginal, {
                blob: datos,
                serverUrl: this._baseServidor,
                dirty: this._dirty,
                markers: window.audioMarkers ? window.audioMarkers.getMarkers() : []
            }).catch((error) => {
                console.warn('Audio: no se pudo guardar la sesion de edicion', error);
            });
        }, 250);
    }

    _mostrarBotonMP3() {
        const boton = document.getElementById('btnExportarMP3');
        if (boton) {
            boton.style.display = 'inline-flex';
            boton.disabled = false;
        }
    }

    _rutaAudioServidor() {
        let ruta = this._baseServidor || window.voiceAudioRealPath || '';
        if (!ruta || /^(blob:|data:)/i.test(ruta)) return '';
        return this._normalizarFuente(ruta);
    }

    _rutaAudioServidorMusica() {
        let ruta = window.musicaFondoPath || '';
        if (!ruta || /^(blob:|data:)/i.test(ruta)) return '';
        if (/^https?:/i.test(ruta)) {
            try {
                ruta = new URL(ruta).pathname;
            } catch (error) {
                return '';
            }
        }
        return ruta.split('?')[0];
    }

    async asegurarAudioPersistido() {
        if (!this.audioBuffer) return this._rutaAudioServidor();

        if (!this._dirty && this._baseServidor) {
            return this._normalizarFuente(this._baseServidor);
        }
        if (!this.currentWavBlobUrl) return this._rutaAudioServidor();

        const persistida = await this.persistirAudioEditado();
        return persistida || this._rutaAudioServidor();
    }

    async _asegurarRutaServidor() {
        return this.asegurarAudioPersistido();
    }

    _recetaLimpia() {
        return {
            bypass: false,
            segments: [],
            fades: { in: 0, out: 0, curve: 'tri' },
            gainDb: 0,
            pitch: 0,
            rate: 1,
            filter: { highpass: 0, lowpass: 0 },
            eq: { low: 0, mid: 0, high: 0 },
            comp: { enabled: false },
            gate: { enabled: false },
            limiter: { ceiling: 0 },
            denoise: { enabled: false },
            deesser: { enabled: false }
        };
    }

    _recetaSeleccionActual() {
        let receta;

        if (window.audioRenderUI && typeof window.audioRenderUI.construirReceta === 'function') {
            receta = window.audioRenderUI.construirReceta({ denoise: false, deesser: false });
        } else {
            receta = this._recetaLimpia();
            const estado = this.getEngineState();
            const fx = estado && estado.fx ? estado.fx : null;
            if (fx) {
                const volumen = Number(fx.volume);
                receta.gainDb = Number.isFinite(volumen) && volumen !== 100
                    ? Math.max(-24, Math.min(24, 20 * Math.log10(Math.max(0.0001, volumen / 100))))
                    : 0;
                receta.filter = { highpass: fx.highpass, lowpass: fx.lowpass };
                receta.eq = { low: fx.eqLow, mid: fx.eqMid, high: fx.eqHigh };
                receta.comp = { threshold: fx.compThreshold, ratio: fx.compRatio, attack: 10, release: 200, makeup: 0 };
                receta.gate = { threshold: fx.gateThreshold };
                receta.limiter = { ceiling: fx.limiterThreshold };
            }
        }

        receta = Object.assign({}, receta);
        delete receta.segments;
        delete receta.loudness;
        receta.bypass = false;
        receta.fades = { in: 0, out: 0, curve: 'tri' };
        receta.pitch = 0;
        receta.rate = 1;
        return receta;
    }

    async _aplicarResultadoSeleccion(url, sel) {
        const base = window.CONFIG && window.CONFIG.API_BASE ? window.CONFIG.API_BASE : '';
        const completa = /^https?:/i.test(url) ? url : `${base}${url}`;

        if (this._esTargetMusica()) {
            window.musicaFondoPath = url;
            this._regionPendienteMusica = sel ? { start: sel.start, end: sel.end } : null;
            this.cargarMusica(completa);
            return;
        }

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const respuesta = await fetch(`${completa}${completa.includes('?') ? '&' : '?'}t=${Date.now()}`);
        if (!respuesta.ok) throw new Error('No se pudo descargar el audio procesado');

        const arrayBuffer = await respuesta.arrayBuffer();
        const nuevoBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        this.audioBuffer = nuevoBuffer;
        this._baseServidor = this._normalizarFuente(url);
        this._dirty = false;
        this._sesionEditada = true;
        this._guardarEstado();
        this._regionPendiente = sel ? { start: sel.start, end: sel.end } : null;
        this._cargarUrlEnUI(url);
        this._programarGuardadoSesion();
    }

    _cargarUrlEnUI(url) {
        const base = window.CONFIG && window.CONFIG.API_BASE ? window.CONFIG.API_BASE : '';
        const completa = /^https?:/i.test(url) ? url : `${base}${url}`;

        this._currentUrl = completa;

        if (this.currentWavBlobUrl && this.currentWavBlobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.currentWavBlobUrl);
        }
        this.currentWavBlobUrl = null;
        this._skipEdicionUrl = completa;

        if (this.wavesurfer) this.wavesurfer.load(completa);
        this._cargarEngine(completa);

        const btnDescargar = document.getElementById('btnDescargar');
        if (btnDescargar) {
            btnDescargar.href = `${completa}${completa.includes('?') ? '&' : '?'}t=${Date.now()}`;
            btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
            btnDescargar.style.display = 'inline-flex';
        }

        const audioNative = document.getElementById('audioReproductor');
        if (audioNative) {
            audioNative.src = completa;
            audioNative.load();
        }

        window.voiceAudioRealPath = url;
        if (window.appState && window.appState.audio) {
            window.appState.audio.current = url;
            window.appState.audio.isDucked = false;
        }

        this._mostrarBotonMP3();
        this._actualizarBotonesHistorial();
        if (this.onAudioUpdated) this.onAudioUpdated(url);
    }

    async _procesarSeleccion(receta, opciones = {}) {
        const sel = this.getSeleccion();
        if (!sel) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return null;
        }
        if (this._seleccionProcesando) return null;

        let rutaFinal;
        if (this._esTargetMusica()) {
            rutaFinal = this._rutaAudioServidorMusica();
            if (!rutaFinal) {
                if (window.notifications) {
                    window.notifications.error('Sube una música de fondo para procesarla');
                }
                return null;
            }
        } else {
            rutaFinal = await this._asegurarRutaServidor();
            if (!rutaFinal) {
                if (window.notifications) {
                    window.notifications.error('No se pudo guardar el audio actual para procesarlo');
                }
                return null;
            }
        }

        this._setSeleccionBusy(true);
        try {
            const datos = await window.apiClient.procesarSeleccion(
                rutaFinal,
                sel.start,
                sel.end,
                receta,
                opciones.normalize
            );
            await this._aplicarResultadoSeleccion(datos.url, sel);
            if (window.notifications) {
                window.notifications.success(opciones.mensaje || 'Efecto aplicado a la selección');
            }
            return datos;
        } catch (error) {
            console.error('❌ Error al procesar la selección:', error);
            if (window.notifications) {
                window.notifications.error(error.message || 'Error al procesar la selección');
            }
            return null;
        } finally {
            this._setSeleccionBusy(false);
        }
    }

    aplicarFXSeleccion() {
        return this._procesarSeleccion(this._recetaSeleccionActual(), {
            mensaje: 'Efectos aplicados a la selección'
        });
    }

    normalizarSeleccion(targetDb = -1) {
        return this._procesarSeleccion(this._recetaLimpia(), {
            normalize: { enabled: true, targetDb },
            mensaje: `Selección normalizada a ${targetDb} dB`
        });
    }

    silenciarSeleccion() {
        const receta = this._recetaLimpia();
        receta.silence = true;
        return this._procesarSeleccion(receta, { mensaje: 'Selección silenciada' });
    }

    aplicarFadeSeleccion(tipo, duracion = 1) {
        const sel = this.getSeleccion();
        if (!sel) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return null;
        }

        const dur = Math.min(Math.max(0.05, Number(duracion) || 1), sel.duration);
        const receta = this._recetaLimpia();
        receta.fades = { in: tipo === 'in' ? dur : 0, out: tipo === 'out' ? dur : 0, curve: 'tri' };
        return this._procesarSeleccion(receta, {
            mensaje: `Fade ${tipo === 'in' ? 'in' : 'out'} de ${dur.toFixed(2)} s aplicado`
        });
    }

    limpiarRuidoSeleccion() {
        const receta = this._recetaLimpia();
        receta.denoise = { enabled: true, amount: 12 };
        return this._procesarSeleccion(receta, { mensaje: 'Ruido reducido en la selección' });
    }

    reducirSibilanciasSeleccion() {
        const receta = this._recetaLimpia();
        receta.deesser = { enabled: true, intensity: 0.5 };
        return this._procesarSeleccion(receta, { mensaje: 'Sibilancias reducidas en la selección' });
    }

    escucharSeleccion() {
        const sel = this.getSeleccion();
        if (!sel) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return;
        }

        this._detenerTimerSeleccion();

        if (this._esTargetMusica()) {
            if (!this.wavesurferMusica || !this.musicaCargada) return;
            try { this.pause(); } catch (error) { /* noop */ }
            try { this.wavesurferMusica.setTime(sel.start); } catch (error) { /* noop */ }
            this.wavesurferMusica.play();

            const ms = Math.max(120, (sel.end - sel.start) * 1000);
            this._selectionPlaybackTimer = setTimeout(() => {
                this._selectionPlaybackTimer = null;
                this.wavesurferMusica.pause();
            }, ms);
            return;
        }

        this.seekTo(sel.start);
        this.play();

        const estado = this.getEngineState();
        const rate = estado && estado.fx ? Number(estado.fx.rate) || 1 : 1;
        const ms = Math.max(120, ((sel.end - sel.start) / rate) * 1000);
        this._selectionPlaybackTimer = setTimeout(() => {
            this._selectionPlaybackTimer = null;
            this.pause();
        }, ms);
    }

    seekTo(seconds) {
        this._detenerTimerSeleccion();
        if (this._engineActive()) this.engine.seek(seconds);
        if (this.wavesurfer && this.wavesurfer.getDuration()) {
            this._syncingVisual = true;
            try { this.wavesurfer.setTime(seconds); } catch (error) { /* noop */ }
            this._syncingVisual = false;
        }
        const duracion = this.wavesurfer ? this.wavesurfer.getDuration() : 0;
        this._sincronizarMusica('seek', duracion ? seconds / duracion : 0);
    }

    // ==========================================
    // 3. MÚSICA DE FONDO
    // ==========================================

    inicializarMusica(containerId = '#waveform-musica-inner') {
        if (this.wavesurferMusica) {
            this.wavesurferMusica.destroy();
            this.wavesurferMusica = null;
        }
        this.regionsPluginMusica = null;

        try {
            this.wavesurferMusica = WaveSurfer.create({
                container: containerId,
                waveColor: '#8e44ad',
                progressColor: '#9b59b6',
                cursorColor: '#ffffff',
                height: 80,
                normalize: true,
                interact: true,
                cursorWidth: 1,
                minPxPerSec: 50,
                fillParent: true,
            });

            if (WaveSurfer.Regions) {
                this.regionsPluginMusica = this.wavesurferMusica.registerPlugin(
                    WaveSurfer.Regions.create()
                );
                this.regionsPluginMusica.enableDragSelection({
                    color: 'rgba(142, 68, 173, 0.3)',
                });

                this.regionsPluginMusica.on('region-created', () => {
                    this.targetSeleccion = 'musica';
                    this._actualizarBotonesSeleccion();
                });

                this.regionsPluginMusica.on('region-updated', () => {
                    this._actualizarBotonesSeleccion();
                });

                this.regionsPluginMusica.on('region-removed', () => {
                    this._actualizarBotonesSeleccion();
                });
            }

            this.wavesurferMusica.on('ready', () => {
                if (this._regionPendienteMusica && this.regionsPluginMusica) {
                    const pendiente = this._regionPendienteMusica;
                    this._regionPendienteMusica = null;
                    try {
                        this.regionsPluginMusica.clearRegions();
                        this.regionsPluginMusica.addRegion({
                            start: pendiente.start,
                            end: pendiente.end,
                            color: 'rgba(142, 68, 173, 0.3)'
                        });
                    } catch (error) {
                        console.warn('No se pudo restaurar la selección de música:', error);
                    }
                }
                this._actualizarBotonesSeleccion();
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
            this.musicaCargada = false;
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
            case 'time':
                if (this.wavesurferMusica.isPlaying()) {
                    const drift = Math.abs(this.wavesurferMusica.getCurrentTime() - data);
                    if (drift > 0.4) this.wavesurferMusica.setTime(data);
                }
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
        return this._rutaAudioServidor() || null;
    }

    try {
        const response = await fetch(this.currentWavBlobUrl);
        const blob = await response.blob();

        const formData = new FormData();
        formData.append('audio', blob, `edited-${Date.now()}.wav`);

        const res = await fetch(`${window.CONFIG.API_BASE}/api/upload-audio-editado`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const data = await res.json();
        if (!data || !data.url) throw new Error('El servidor no devolvio la ruta del audio editado');

        const ruta = this._normalizarFuente(data.url);
        this._baseServidor = ruta;
        this._dirty = false;
        this._sesionEditada = true;
        this._actualizarRutaGlobal(ruta);

        const btnDescargar = document.getElementById('btnDescargar');
        if (btnDescargar) {
            btnDescargar.href = `${window.CONFIG.API_BASE}${data.url}`;
            btnDescargar.setAttribute('download', data.url.split('/').pop());
        }

        if (this.onAudioUpdated) this.onAudioUpdated(ruta);
        this._programarGuardadoSesion();
        console.log('Audio editado persistido:', ruta);
        return ruta;
    } catch (error) {
        console.error('Error persistiendo audio:', error);
        if (window.notifications) {
            window.notifications.error('Error al guardar el audio editado');
        }
        return null;
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
            this._cargarEngine(url);
            console.log('🎵 Audio cargado en editor');
        }
    }

    async _cargarAudioParaEdicion(url) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const fuente = this._normalizarFuente(url);
            const originalGlobal = this._normalizarFuente(window.voiceAudioOriginalPath || '');
            const esBlob = /^(blob:|data:)/i.test(url);

            if (fuente && !esBlob && (!this._fuenteOriginal || (originalGlobal && fuente === originalGlobal))) {
                this._fuenteOriginal = fuente;
                this._baseServidor = fuente;
                this._dirty = false;
                this._sesionEditada = false;
                this._actualizarRutaGlobal(fuente);
            }

            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('✅ Audio cargado en AudioContext para edición');

            let sesion = null;
            if (this._fuenteOriginal && window.audioSessionStore) {
                try {
                    sesion = await window.audioSessionStore.obtener(this._fuenteOriginal);
                } catch (errorSesion) {
                    console.warn('Audio: no se pudo leer la sesion persistente', errorSesion);
                }
            }

            if (sesion && sesion.blob) {
                try {
                    const datosSesion = await sesion.blob.arrayBuffer();
                    const bufferSesion = await this.audioContext.decodeAudioData(datosSesion);
                    this.audioBuffer = bufferSesion;
                    this._baseServidor = this._normalizarFuente(sesion.serverUrl) || this._baseServidor;
                    this._dirty = !!sesion.dirty || !sesion.serverUrl;
                    this._sesionEditada = true;
                    this._actualizarRutaGlobal(this._baseServidor || this._fuenteOriginal);

                    if (window.audioMarkers && Array.isArray(sesion.markers)) {
                        window.audioMarkers.setMarkers(sesion.markers, {
                            historial: false,
                            activarPrimero: false
                        });
                    }

                    this.historyStack = [];
                    this.historyIndex = -1;
                    this._guardarEstado();
                    await this._actualizarWaveSurfer({ marcarDirty: false, guardarSesion: false });
                    console.log('Audio: sesion de edicion restaurada');
                    return;
                } catch (errorSesion) {
                    console.warn('Audio: la sesion guardada no se pudo decodificar', errorSesion);
                }
            }

            this.historyStack = [];
            this.historyIndex = -1;
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
        if (this._engineActive()) {
            this.engine.play().then((ok) => {
                if (!ok) this._playWaveSurfer();
            });
            return;
        }
        this._playWaveSurfer();
    }

    _playWaveSurfer() {
        this._silenciarWaveSurfer(false);
        if (this.wavesurfer) this.wavesurfer.play();
    }

    pause() {
        this._detenerTimerSeleccion();
        if (this.engine && this.engine.isPlaying()) {
            this.engine.pause();
            return;
        }
        if (this.wavesurfer) this.wavesurfer.pause();
    }

    playPause() {
        if (this.engine && this.engine.isPlaying()) {
            this._detenerTimerSeleccion();
            this.engine.pause();
            return;
        }
        if (this._engineActive()) {
            this.play();
            return;
        }
        if (this.wavesurfer) this.wavesurfer.playPause();
    }

    stop() {
        this._detenerTimerSeleccion();
        if (this.engine) this.engine.stop();
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
        if (this._engineActive()) return this.engine.getPosition();
        return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
    }

    getDuration() {
        if (this._engineActive()) return this.engine.getDuration();
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

    _snapshotActual() {
        return {
            buffer: this._clonarBuffer(this.audioBuffer),
            markers: window.audioMarkers ? window.audioMarkers.getMarkers() : []
        };
    }

    _guardarEstado() {
        if (!this.audioBuffer) return;

        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }

        this.historyStack.push(this._snapshotActual());

        if (this.historyStack.length > this.MAX_HISTORY) {
            this.historyStack.shift();
            this.historyIndex = this.historyStack.length - 1;
        } else {
            this.historyIndex++;
        }
        console.log(`💾 Estado guardado. Historial: ${this.historyIndex + 1}/${this.historyStack.length}`);
        this._programarGuardadoSesion();
        this._actualizarBotonesHistorial();
    }

    sincronizarMarcadoresActuales() {
        if (this.historyIndex < 0 || !this.historyStack[this.historyIndex]) return;
        this.historyStack[this.historyIndex].markers = window.audioMarkers
            ? window.audioMarkers.getMarkers()
            : [];
    }

    registrarCambioMarcadores() {
        if (this.audioBuffer) this._guardarEstado();
    }

    _restaurarEstado(estado) {
        if (!estado) return;
        this.audioBuffer = this._clonarBuffer(estado.buffer);
        if (window.audioMarkers && Array.isArray(estado.markers)) {
            window.audioMarkers.setMarkers(estado.markers, {
                historial: false,
                activarPrimero: false,
                sincronizar: false
            });
        }
        this._actualizarWaveSurfer();
    }

    deshacer() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this._restaurarEstado(this.historyStack[this.historyIndex]);
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
        this._actualizarBotonesHistorial();
    }

    rehacer() {
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyIndex++;
            this._restaurarEstado(this.historyStack[this.historyIndex]);
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
        this._actualizarBotonesHistorial();
    }

    async restaurarOriginal() {
        if (this._restaurando) return null;
        if (!this._fuenteOriginal) {
            if (window.notifications) {
                window.notifications.warning('No hay un audio original registrado');
            }
            return null;
        }

        this._restaurando = true;
        try {
            const base = window.CONFIG && window.CONFIG.API_BASE ? window.CONFIG.API_BASE : '';
            const url = /^https?:/i.test(this._fuenteOriginal)
                ? this._fuenteOriginal
                : `${base}${this._fuenteOriginal}`;
            const respuesta = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`);
            if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

            const arrayBuffer = await respuesta.arrayBuffer();
            const buffer = await this.audioContext.decodeAudioData(arrayBuffer);

            if (this._guardadoSesionTimer) {
                clearTimeout(this._guardadoSesionTimer);
                this._guardadoSesionTimer = null;
            }

            this.audioBuffer = buffer;
            this._baseServidor = this._fuenteOriginal;
            this._dirty = false;
            this._sesionEditada = false;
            this._clipboard = null;
            this.historyStack = [];
            this.historyIndex = -1;
            if (this.regionsPlugin) this.regionsPlugin.clearRegions();

            if (window.audioSessionStore) {
                try {
                    await window.audioSessionStore.eliminar(this._fuenteOriginal);
                } catch (errorSesion) {
                    console.warn('Audio: no se pudo borrar la sesion guardada', errorSesion);
                }
            }

            this._actualizarRutaGlobal(this._fuenteOriginal);
            this._guardarEstado();
            await this._actualizarWaveSurfer({ marcarDirty: false, guardarSesion: false });

            if (window.notifications) {
                window.notifications.success('Audio original restaurado');
            }
            return this._fuenteOriginal;
        } catch (error) {
            console.error('Error al restaurar el audio original:', error);
            if (window.notifications) {
                window.notifications.error('No se pudo restaurar el audio original');
            }
            return null;
        } finally {
            this._restaurando = false;
            this._actualizarBotonesHistorial();
        }
    }

    // ==========================================
    // 8. EDICIÓN DE AUDIO
    // ==========================================

    async eliminarSeleccion() {
        if (this._esTargetMusica()) {
            if (window.notifications) {
                window.notifications.warning('El corte local solo está disponible en la pista de voz');
            }
            return null;
        }
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

        // El estado previo ya está en el historial; se apila el resultado al final
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
            if (window.audioMarkers) {
                window.audioMarkers.aplicarEdicionAudio(
                    { tipo: 'delete', start: startTime, end: endTime },
                    { sincronizar: false }
                );
            }
            await this._actualizarWaveSurfer();
            this._guardarEstado();

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
            this._guardarEstado();
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
            this._guardarEstado();
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
            this._guardarEstado();
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
            if (window.audioMarkers) {
                for (let i = silenceRegions.length - 1; i >= 0; i--) {
                    const region = silenceRegions[i];
                    window.audioMarkers.aplicarEdicionAudio(
                        { tipo: 'delete', start: region.start, end: region.end },
                        { sincronizar: false }
                    );
                }
            }
            await this._actualizarWaveSurfer();
            this._guardarEstado();
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
    // 9. COPIAR / PEGAR / DUPLICAR / CROSSFADE
    // ==========================================

    copiarSeleccion() {
        if (this._esTargetMusica()) {
            if (window.notifications) window.notifications.warning('Copiar local solo está disponible en la pista de voz');
            return null;
        }
        const sel = this.getSeleccion();
        if (!sel || !this.audioBuffer) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return null;
        }

        const sampleRate = this.audioBuffer.sampleRate;
        const inicio = Math.max(0, Math.floor(sel.start * sampleRate));
        const fin = Math.min(this.audioBuffer.length, Math.floor(sel.end * sampleRate));
        if (fin <= inicio) return null;

        const canales = [];
        for (let canal = 0; canal < this.audioBuffer.numberOfChannels; canal++) {
            const datos = new Float32Array(fin - inicio);
            datos.set(this.audioBuffer.getChannelData(canal).subarray(inicio, fin));
            canales.push(datos);
        }

        this._clipboard = {
            sampleRate,
            numberOfChannels: canales.length,
            channels: canales,
            duration: (fin - inicio) / sampleRate
        };
        this._actualizarBotonesSeleccion();
        if (window.notifications) {
            window.notifications.success(`Copiado: ${this._clipboard.duration.toFixed(2)} s`);
        }
        return this._clipboard;
    }

    _canalClipboard(canal, totalCanales) {
        if (!this._clipboard || !this._clipboard.channels.length) return null;
        const indice = Math.min(canal, this._clipboard.channels.length - 1);
        return this._clipboard.channels[indice];
    }

    _muestraClipboard(canal, indice, longitud) {
        const datos = this._canalClipboard(canal);
        if (!datos || !datos.length) return 0;
        if (longitud <= 1 || datos.length === 1) return datos[0];
        const posicion = indice * (datos.length - 1) / (longitud - 1);
        const base = Math.floor(posicion);
        const siguiente = Math.min(datos.length - 1, base + 1);
        const mezcla = posicion - base;
        return datos[base] * (1 - mezcla) + datos[siguiente] * mezcla;
    }

    async pegarSeleccion() {
        if (this._esTargetMusica()) {
            if (window.notifications) window.notifications.warning('Pegar local solo está disponible en la pista de voz');
            return null;
        }
        if (!this.audioBuffer) {
            if (window.notifications) window.notifications.error('No hay audio cargado');
            return null;
        }
        if (!this._clipboard) {
            if (window.notifications) window.notifications.warning('Copia un tramo antes de pegar');
            return null;
        }

        const sel = this.getSeleccion();
        const sampleRate = this.audioBuffer.sampleRate;
        const total = this.audioBuffer.length;
        const reemplaza = !!sel;
        const inicio = sel ? sel.start : Math.max(0, Math.min(this.getCurrentTime(), this.getDuration()));
        const fin = sel ? sel.end : inicio;
        const inicioMuestra = Math.max(0, Math.floor(inicio * sampleRate));
        const finMuestra = Math.min(total, Math.floor(fin * sampleRate));
        const longitudClip = this._clipboard.channels[0] ? this._clipboard.channels[0].length : 0;
        if (!longitudClip) return null;

        const nuevaLongitud = total - (finMuestra - inicioMuestra) + longitudClip;
        const numCanales = this.audioBuffer.numberOfChannels;
        const nuevoBuffer = this.audioContext.createBuffer(numCanales, nuevaLongitud, sampleRate);

        for (let canal = 0; canal < numCanales; canal++) {
            const origen = this.audioBuffer.getChannelData(canal);
            const destino = nuevoBuffer.getChannelData(canal);
            const clip = this._canalClipboard(canal);
            let pos = 0;

            destino.set(origen.subarray(0, inicioMuestra), pos);
            pos += inicioMuestra;
            if (clip) destino.set(clip, pos);
            pos += longitudClip;
            destino.set(origen.subarray(finMuestra), pos);
        }

        this.audioBuffer = nuevoBuffer;
        if (window.audioMarkers) {
            if (reemplaza) {
                window.audioMarkers.aplicarEdicionAudio(
                    { tipo: 'delete', start: inicio, end: fin },
                    { sincronizar: false }
                );
            }
            window.audioMarkers.aplicarEdicionAudio(
                { tipo: 'insert', at: inicio, duration: this._clipboard.duration },
                { sincronizar: false }
            );
        }

        const finSeleccion = Math.min(this._clipboard.duration, nuevoBuffer.duration);
        this._regionPendiente = { start: inicio, end: inicio + finSeleccion };
        await this._actualizarWaveSurfer();
        this._guardarEstado();

        if (window.notifications) {
            window.notifications.success(reemplaza ? 'Selección reemplazada' : 'Audio pegado');
        }
        return true;
    }

    async duplicarSeleccion() {
        if (this._esTargetMusica()) {
            if (window.notifications) window.notifications.warning('Duplicar local solo está disponible en la pista de voz');
            return null;
        }
        const sel = this.getSeleccion();
        if (!sel || !this.audioBuffer) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return null;
        }

        const sampleRate = this.audioBuffer.sampleRate;
        const inicio = Math.max(0, Math.floor(sel.start * sampleRate));
        const fin = Math.min(this.audioBuffer.length, Math.floor(sel.end * sampleRate));
        const longitud = fin - inicio;
        if (longitud <= 0) return null;

        const numCanales = this.audioBuffer.numberOfChannels;
        const nuevoBuffer = this.audioContext.createBuffer(
            numCanales,
            this.audioBuffer.length + longitud,
            sampleRate
        );

        for (let canal = 0; canal < numCanales; canal++) {
            const origen = this.audioBuffer.getChannelData(canal);
            const destino = nuevoBuffer.getChannelData(canal);
            destino.set(origen.subarray(0, fin), 0);
            destino.set(origen.subarray(inicio, fin), fin);
            destino.set(origen.subarray(fin), fin + longitud);
        }

        this.audioBuffer = nuevoBuffer;
        if (window.audioMarkers) {
            window.audioMarkers.aplicarEdicionAudio(
                { tipo: 'insert', at: sel.end, duration: longitud / sampleRate },
                { sincronizar: false }
            );
        }

        this._regionPendiente = { start: sel.end, end: sel.end + (longitud / sampleRate) };
        await this._actualizarWaveSurfer();
        this._guardarEstado();

        if (window.notifications) {
            window.notifications.success('Selección duplicada');
        }
        return true;
    }

    async crossfadeSeleccion() {
        if (this._esTargetMusica()) {
            if (window.notifications) window.notifications.warning('Crossfade local solo está disponible en la pista de voz');
            return null;
        }
        const sel = this.getSeleccion();
        if (!sel || !this.audioBuffer) {
            if (window.notifications) window.notifications.warning('Selecciona un tramo de la onda primero');
            return null;
        }
        if (!this._clipboard) {
            if (window.notifications) window.notifications.warning('Copia un tramo antes de aplicar el crossfade');
            return null;
        }

        const sampleRate = this.audioBuffer.sampleRate;
        const inicio = Math.max(0, Math.floor(sel.start * sampleRate));
        const fin = Math.min(this.audioBuffer.length, Math.floor(sel.end * sampleRate));
        const longitud = fin - inicio;
        if (longitud <= 0) return null;

        const numCanales = this.audioBuffer.numberOfChannels;
        const nuevoBuffer = this.audioContext.createBuffer(numCanales, this.audioBuffer.length, sampleRate);
        const xf = Math.max(1, Math.min(Math.floor(sampleRate * 0.25), Math.floor(longitud / 2)));

        for (let canal = 0; canal < numCanales; canal++) {
            const origen = this.audioBuffer.getChannelData(canal);
            const destino = nuevoBuffer.getChannelData(canal);
            destino.set(origen, 0);

            for (let i = 0; i < longitud; i++) {
                const original = origen[inicio + i];
                const clip = this._muestraClipboard(canal, i, longitud);
                let ganancia;
                if (i < xf) {
                    ganancia = i / xf;
                } else if (i >= longitud - xf) {
                    ganancia = (longitud - 1 - i) / xf;
                } else {
                    ganancia = 1;
                }
                destino[inicio + i] = original * (1 - ganancia) + clip * ganancia;
            }
        }

        this.audioBuffer = nuevoBuffer;
        this._regionPendiente = { start: sel.start, end: sel.end };
        await this._actualizarWaveSurfer();
        this._guardarEstado();

        if (window.notifications) {
            window.notifications.success('Crossfade aplicado a la selección');
        }
        return true;
    }

    // ==========================================
    // 10. EXPORTACIÓN Y ACTUALIZACIÓN DE WAVEFORM
    // ==========================================

async _actualizarWaveSurfer(opciones = {}) {
    if (!this.audioBuffer) return;

    const wavBlob = this._bufferToWav(this.audioBuffer);

    if (this.currentWavBlobUrl && this.currentWavBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentWavBlobUrl);
    }

    this.currentWavBlobUrl = URL.createObjectURL(wavBlob);
    this._currentUrl = this.currentWavBlobUrl;
    this._skipEdicionUrl = this.currentWavBlobUrl;

    if (opciones.marcarDirty !== false) {
        this._dirty = true;
        this._sesionEditada = true;
    }

    if (this.wavesurfer) {
        this.wavesurfer.load(this.currentWavBlobUrl);
    }
    this._cargarEngine(this.currentWavBlobUrl);

    const btnDescargar = document.getElementById('btnDescargar');
    if (btnDescargar) {
        btnDescargar.href = this.currentWavBlobUrl;
        btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
    }

    const audioNative = document.getElementById('audioReproductor');
    if (audioNative) {
        audioNative.src = this.currentWavBlobUrl;
        audioNative.load();
    }

    this._mostrarBotonMP3();
    this._actualizarBotonesHistorial();
    if (opciones.guardarSesion !== false) this._programarGuardadoSesion(wavBlob);
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
        this._detenerTimerSeleccion();
        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
            this._engineBound = false;
        }
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