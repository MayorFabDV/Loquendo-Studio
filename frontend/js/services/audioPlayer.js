// js/audioPlayer.js - versión robusta y segura
(function () {
    const getBaseApi = () => {
        if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
        if (window.API_BASE) return window.API_BASE;
        if (window.location && window.location.origin) return window.location.origin;
        return '';
    };

    if (!window.CONFIG) window.CONFIG = {};
    window.CONFIG.API_BASE = getBaseApi();
    window.API_BASE = window.CONFIG.API_BASE;

    const ICONOS = {
        play: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
        download: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="M8 20l4 4 4-4"/><path d="M4 20h16"/></svg>',
        fileText: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 18h6"/></svg>',
        film: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6V4m8 2V4M3 10h18"/><path d="m10 14 5 3v-6l-5 3z"/></svg>'
    };

    const getEl = (id) => document.getElementById(id) || null;
    const audio = getEl('audioReproductor');
    const playBtn = getEl('playBtn');
    const progressBar = getEl('progressBar');
    const progressContainer = getEl('progressContainer');
    const timeDisplay = getEl('currentTime');
    const btnDescargar = getEl('btnDescargar');
    const btnDescargaSRT = getEl('btnDescargaSRT');
    const btnDescargaASS = getEl('btnDescargaASS');

    let editorInicializado = false;

    function asegurarEditorInicializado() {
        if (!editorInicializado && window.audioEditor) {
            editorInicializado = !!window.audioEditor.inicializar('#waveform');
            window.audioEditor.onReady = () => console.log('Editor listo');
            window.audioEditor.onPlay = () => { if (playBtn) playBtn.innerHTML = ICONOS.pause; };
            window.audioEditor.onPause = () => { if (playBtn) playBtn.innerHTML = ICONOS.play; };
            window.audioEditor.onFinish = () => {
                if (playBtn) playBtn.innerHTML = ICONOS.play;
                if (timeDisplay) timeDisplay.innerText = '00:00';
                if (progressBar) progressBar.style.width = '0%';
            };
            window.audioEditor.onInteraction = (currentTime) => {
                const duration = window.audioEditor.getDuration();
                if (duration && progressBar) {
                    const percent = (currentTime / duration) * 100;
                    progressBar.style.width = `${percent}%`;
                }
                if (timeDisplay) {
                    const m = Math.floor(currentTime / 60);
                    const s = Math.floor(currentTime % 60);
                    timeDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
                }
            };
        }
    }

    async function cargarYReproducir(urlAudio, urlSRT, urlASS) {
        if (!urlAudio) return;
        try {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }

            const nuevaUrl = `${window.CONFIG.API_BASE}${urlAudio}?t=${Date.now()}`;
            if (audio) audio.src = nuevaUrl;

            if (btnDescargar) {
                btnDescargar.innerHTML = `${ICONOS.download} Descargar WAV`;
                btnDescargar.href = nuevaUrl;
                btnDescargar.setAttribute('download', `audio_loquendo_${Date.now()}.wav`);
                btnDescargar.style.display = 'inline-flex';
            }

            if (btnDescargaSRT) {
                if (urlSRT) {
                    const srtUrl = `${window.CONFIG.API_BASE}${urlSRT}?t=${Date.now()}`;
                    btnDescargaSRT.innerHTML = `${ICONOS.fileText} Descargar SRT`;
                    btnDescargaSRT.href = srtUrl;
                    btnDescargaSRT.setAttribute('download', `subtitulos_${Date.now()}.srt`);
                    btnDescargaSRT.style.display = 'inline-flex';
                } else {
                    btnDescargaSRT.style.display = 'none';
                }
            }

            if (btnDescargaASS) {
                if (urlASS) {
                    const assUrl = `${window.CONFIG.API_BASE}${urlASS}?t=${Date.now()}`;
                    btnDescargaASS.innerHTML = `${ICONOS.film} Descargar ASS`;
                    btnDescargaASS.href = assUrl;
                    btnDescargaASS.setAttribute('download', `subtitulos_efectos_${Date.now()}.ass`);
                    btnDescargaASS.style.display = 'inline-flex';
                } else {
                    btnDescargaASS.style.display = 'none';
                }
            }

            const contenedor = getEl('contenedorReproductor');
            if (contenedor) contenedor.style.display = 'block';
            asegurarEditorInicializado();

            setTimeout(() => {
                if (window.audioEditor) {
                    window.audioEditor.cargarAudio(nuevaUrl);
                }
            }, 300);
        } catch (error) {
            console.error('Error al cargar el audio:', error);
        }
    }

    function togglePlay() {
        if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
            window.audioEditor.playPause();
        } else if (!audio || !audio.src || audio.src === window.location.href) {
            console.warn('No hay un audio válido cargado.');
            return;
        } else {
            if (audio.paused) {
                audio.play();
                if (playBtn) playBtn.innerHTML = ICONOS.pause;
            } else {
                audio.pause();
                if (playBtn) playBtn.innerHTML = ICONOS.play;
            }
        }
    }

    function stopAudio() {
        if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
            window.audioEditor.stop();
        } else if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        if (playBtn) playBtn.innerHTML = ICONOS.play;
        if (progressBar) progressBar.style.width = '0%';
        if (timeDisplay) timeDisplay.innerText = '0:00';
    }

    function restartAudio() {
        if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
            window.audioEditor.stop();
            setTimeout(() => window.audioEditor.play(), 100);
        } else if (!audio || !audio.src || audio.src === window.location.href) {
            return;
        } else {
            audio.currentTime = 0;
            audio.play();
        }
        if (playBtn) playBtn.innerHTML = ICONOS.pause;
    }

    async function eliminarSeleccion() {
        if (!window.audioEditor) {
            alert('El editor no está cargado');
            return;
        }

        const nuevaUrl = await window.audioEditor.eliminarSeleccion();
        if (nuevaUrl) {
            if (audio) {
                audio.src = nuevaUrl;
                audio.load();
            }
            if (btnDescargar) {
                btnDescargar.innerHTML = `${ICONOS.download} Descargar Editado`;
                btnDescargar.href = nuevaUrl;
                btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
            }
            alert('✅ ¡Audio cortado exitosamente!');
        }
    }

    function cortarSeleccion() {
        eliminarSeleccion();
    }

    function editorZoomOut() { if (window.audioEditor) window.audioEditor.zoomOut(); }
    function editorZoomIn() { if (window.audioEditor) window.audioEditor.zoomIn(); }
    function editorResetZoom() { if (window.audioEditor) window.audioEditor.resetZoom(); }

    if (audio && progressBar && progressContainer) {
        audio.addEventListener('timeupdate', () => {
            if (!audio.duration || Number.isNaN(audio.duration)) return;
            const percent = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${percent}%`;
            if (timeDisplay) {
                const m = Math.floor(audio.currentTime / 60);
                const s = Math.floor(audio.currentTime % 60);
                timeDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            }
        });

        progressContainer.addEventListener('click', (event) => {
            if (!audio.duration) return;
            const width = progressContainer.clientWidth;
            const clickX = event.offsetX;
            audio.currentTime = (clickX / width) * audio.duration;
        });
    }

    if (audio) {
        audio.addEventListener('ended', () => {
            if (playBtn) playBtn.innerHTML = ICONOS.play;
            if (progressBar) progressBar.style.width = '0%';
            if (timeDisplay) timeDisplay.innerText = '0:00';
        });
    }

    window.cargarYReproducir = cargarYReproducir;
    window.togglePlay = togglePlay;
    window.stopAudio = stopAudio;
    window.restartAudio = restartAudio;
    window.eliminarSeleccion = eliminarSeleccion;
    window.cortarSeleccion = cortarSeleccion;
    window.editorZoomOut = editorZoomOut;
    window.editorZoomIn = editorZoomIn;
    window.editorResetZoom = editorResetZoom;
    window.ICONOS = ICONOS;

    console.log('✅ audioPlayer.js cargado correctamente (versión segura)');
})();

