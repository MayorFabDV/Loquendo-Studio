// js/audioPlayer.js - Versión con SVGs profesionales (sin emojis)
// Inicialización segura de API_BASE
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.CONFIG && window.CONFIG.API_BASE) || (window.location && window.location.port ? `http://localhost:${window.location.port}` : '');
    window.API_BASE = API_BASE;
}

// ==========================================
// 🎨 ICONOS SVG (Feather-style, limpios y escalables)
// ==========================================
const ICONOS = {
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    stop: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
    restart: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
    cut: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>`,
    zoomIn: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`,
    zoomOut: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`,
    zoomReset: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path></svg>`,
    download: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    music: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
    fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    film: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`
};

// ==========================================
// 🎛️ REFERENCIAS DOM
// ==========================================
const audio = document.getElementById('audioReproductor');
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const timeDisplay = document.getElementById('currentTime');
const btnDescargar = document.getElementById('btnDescargar');
const btnDescargaSRT = document.getElementById('btnDescargaSRT');
const btnDescargaASS = document.getElementById('btnDescargaASS');
const subtitlesPlayBtn = document.getElementById('subtitlesPlayBtn');
const subtitlesWaveTime = document.getElementById('subtitlesWaveTime');
const subtitlesWaveformSection = document.getElementById('subtitlesWaveformSection');

let editorInicializado = false;
let autoplayPendiente = false;
let secuenciaCargaAudio = 0;

function leerAjuste(clave, defecto) {
    try {
        if (window.settings && typeof window.settings.get === 'function') {
            const valor = window.settings.get(clave);
            return valor === undefined || valor === null ? defecto : valor;
        }
    } catch (e) { /* noop */ }
    return defecto;
}

function formatearTiempoUI(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos}:${resto < 10 ? '0' : ''}${resto}`;
}

function actualizarIconosPlay(reproduciendo) {
    const icono = reproduciendo ? ICONOS.pause : ICONOS.play;
    if (playBtn) playBtn.innerHTML = icono;
    if (subtitlesPlayBtn) subtitlesPlayBtn.innerHTML = icono;
}

function actualizarTiempoSubtitulos(actual, total) {
    if (!subtitlesWaveTime) return;
    subtitlesWaveTime.innerText = `${formatearTiempoUI(actual)} / ${formatearTiempoUI(total)}`;
}

function mostrarOndaSubtitulos() {
    if (subtitlesWaveformSection) subtitlesWaveformSection.classList.remove('is-empty');
    if (window.audioEditorUI && typeof window.audioEditorUI.refrescarOnda === 'function') {
        window.audioEditorUI.refrescarOnda();
    }
}

// ==========================================
// 🎯 INICIALIZACIÓN DEL EDITOR
// ==========================================
function asegurarEditorInicializado() {
    if (!editorInicializado && window.audioEditor) {
        editorInicializado = window.audioEditor.inicializar('#waveform');

        window.audioEditor.onReady = () => {
            console.log('Editor listo');
            const zoom = Number(leerAjuste('zoomInicial', 50)) || 50;
            if (window.audioEditor.wavesurfer) {
                try { window.audioEditor.wavesurfer.zoom(zoom); } catch (e) { /* noop */ }
            }
            actualizarTiempoSubtitulos(0, window.audioEditor.getDuration());
            mostrarOndaSubtitulos();
            if (autoplayPendiente) {
                autoplayPendiente = false;
                if (leerAjuste('autoplay', false)) {
                    setTimeout(() => {
                        try { window.audioEditor.play(); } catch (e) { /* noop */ }
                    }, 120);
                }
            }
        };
        
        // ✅ Ahora usamos innerHTML con SVG en lugar de innerText con emojis
        window.audioEditor.onPlay = () => { 
            actualizarIconosPlay(true);
        };
        window.audioEditor.onPause = () => { 
            actualizarIconosPlay(false);
        };
        window.audioEditor.onFinish = () => {
            actualizarIconosPlay(false);
            if (timeDisplay) timeDisplay.innerText = '00:00';
            if (progressBar) progressBar.style.width = '0%';
            actualizarTiempoSubtitulos(0, window.audioEditor.getDuration());
        };
        window.audioEditor.onInteraction = (currentTime) => {
            const duration = window.audioEditor.getDuration();
            if (duration) {
                const percent = (currentTime / duration) * 100;
                if (progressBar) progressBar.style.width = `${percent}%`;
            }
            let m = Math.floor(currentTime / 60);
            let s = Math.floor(currentTime % 60);
            if (timeDisplay) timeDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            actualizarTiempoSubtitulos(currentTime, duration);
        };
    }
}

// ==========================================
// 🎵 CARGAR Y REPRODUCIR AUDIO
// ==========================================
async function cargarYReproducir(urlAudio, urlSRT, urlASS, opciones) {
    if (!urlAudio) return;
    const secuencia = ++secuenciaCargaAudio;
    const conservarMarcadores = !!(opciones && opciones.conservarMarcadores);
    try {
        audio.pause();
        audio.currentTime = 0;
        
        // ✅ FIX: Usar API_BASE en lugar de localhost hardcodeado
        const absoluta = /^(https?:|blob:|data:)/i.test(urlAudio) ? urlAudio : `${API_BASE}${urlAudio}`;
        const nuevaUrl = /^(blob:|data:)/i.test(absoluta) ? absoluta : `${absoluta}${absoluta.includes('?') ? '&' : '?'}t=${Date.now()}`;
        audio.src = nuevaUrl;
        
        if (btnDescargar) {
            const extension = /\.(wav|mp3|flac|opus|ogg|m4a)(?:[?#]|$)/i.exec(urlAudio)?.[1]?.toLowerCase() || 'wav';
            btnDescargar.innerHTML = `${ICONOS.download} Descargar ${extension.toUpperCase()}`;
            btnDescargar.href = nuevaUrl;
            btnDescargar.setAttribute('download', `audio_loquendo_${Date.now()}.${extension}`);
            btnDescargar.style.display = 'inline-flex';
        }

        const btnMP3 = document.getElementById('btnExportarMP3');
        if (btnMP3) {
            btnMP3.style.display = 'inline-flex';
            btnMP3.disabled = false;
        }

        if (btnDescargaSRT) {
            if (urlSRT) {
                const srtUrl = `${API_BASE}${urlSRT}?t=${Date.now()}`;
                btnDescargaSRT.innerHTML = `${ICONOS.fileText} Descargar SRT`;
                btnDescargaSRT.href = srtUrl;
                btnDescargaSRT.setAttribute('download', `subtitulos_${Date.now()}.srt`);
                btnDescargaSRT.style.display = "inline-flex";
                console.log("📝 SRT listo");
            } else {
                btnDescargaSRT.style.display = "none";
            }
        }

        if (btnDescargaASS) {
            if (urlASS) {
                const assUrl = `${API_BASE}${urlASS}?t=${Date.now()}`;
                btnDescargaASS.innerHTML = `${ICONOS.film} Descargar ASS`;
                btnDescargaASS.href = assUrl;
                btnDescargaASS.setAttribute('download', `subtitulos_efectos_${Date.now()}.ass`);
                btnDescargaASS.style.display = "inline-flex";
                console.log("🎨 ASS listo");
            } else {
                btnDescargaASS.style.display = "none";
            }
        }

        if (window.appState && window.appState.subtitles) {
            if (urlSRT) window.appState.subtitles.srtUrl = urlSRT;
            else if (!conservarMarcadores) window.appState.subtitles.srtUrl = null;
            if (urlASS) window.appState.subtitles.assUrl = urlASS;
            else if (!conservarMarcadores) window.appState.subtitles.assUrl = null;
        }
        if (window.audioMarkers) {
            if (!conservarMarcadores) {
                window.audioMarkers.setMarkers([], { historial: false, activarPrimero: false, sincronizar: false });
            }
        }

        const contenedorReproductor = document.getElementById("contenedorReproductor");
        if (contenedorReproductor) contenedorReproductor.style.display = "block";
        asegurarEditorInicializado();
        mostrarOndaSubtitulos();
        if (window.tabs && typeof window.tabs.irA === 'function') {
            window.tabs.irA('audio');
        }

        if (window.audioEditor) {
            autoplayPendiente = true;
            const cargada = await window.audioEditor.cargarAudio(nuevaUrl, { conservarOriginal: conservarMarcadores });
            if (!cargada || secuencia !== secuenciaCargaAudio) {
                if (secuencia === secuenciaCargaAudio) autoplayPendiente = false;
                return false;
            }
            if (urlSRT && window.audioMarkers) {
                await window.audioMarkers.cargarDesdeApp({ silencioso: true, forzar: true });
            }
        }
        return true;
    } catch (error) {
        console.error("Error al cargar el audio:", error);
    }
}

async function recuperarSesionAudio() {
    if (!window.audioSessionStore || !window.audioEditor) return false;
    const secuencia = secuenciaCargaAudio;
    try {
        const sesion = await window.audioSessionStore.obtenerActiva();
        if (!sesion || secuencia !== secuenciaCargaAudio || window.audioEditor.audioBuffer) return false;
        const contenedor = document.getElementById('contenedorReproductor');
        if (contenedor) contenedor.style.display = 'block';
        if (window.tabs) window.tabs.irA('audio');
        asegurarEditorInicializado();
        return await window.audioEditor.recuperarSesion(sesion);
    } catch (error) {
        console.warn('No se pudo leer la sesión de audio:', error);
        window.notifications?.warning('No se pudo leer la sesión guardada. Puedes seguir trabajando y descargar el audio.');
        return false;
    }
}

window.recuperarSesionAudio = recuperarSesionAudio;
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { recuperarSesionAudio(); }, 0);
});

// ==========================================
// ▶️ CONTROLES DE REPRODUCCIÓN
// ==========================================
function togglePlay() {
    if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
        window.audioEditor.playPause();
    } else if (!audio.src || audio.src === window.location.href) {
        console.warn("No hay un audio válido cargado.");
        return;
    } else {
        if (audio.paused) {
            audio.play();
            actualizarIconosPlay(true);
        } else {
            audio.pause();
            actualizarIconosPlay(false);
        }
    }
}

function stopAudio() {
    if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
        window.audioEditor.stop();
    } else {
        audio.pause(); 
        audio.currentTime = 0; 
    }
    actualizarIconosPlay(false);
    if (progressBar) progressBar.style.width = "0%";
    if (timeDisplay) timeDisplay.innerText = "0:00";
    actualizarTiempoSubtitulos(0, window.audioEditor ? window.audioEditor.getDuration() : 0);
}

function restartAudio() {
    if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
        window.audioEditor.stop();
        setTimeout(() => window.audioEditor.play(), 100);
    } else if (!audio.src || audio.src === window.location.href) {
        return;
    } else {
        audio.currentTime = 0;
        audio.play();
    }
    actualizarIconosPlay(true);
}

// ==========================================
// ✂️ EDICIÓN DE AUDIO
// ==========================================
async function eliminarSeleccion() {
    console.log('✂️ Procesando corte de audio...');
    if (!window.audioEditor) {
        alert('El editor no está cargado');
        return;
    }
    const nuevaUrl = await window.audioEditor.eliminarSeleccion();
    if (nuevaUrl) {
        console.log('✅ Audio cortado. Sincronizando elementos nativos...');
        audio.src = nuevaUrl;
        audio.load();
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

// ==========================================
// 🔍 ZOOM
// ==========================================
function editorZoomOut() {
    if (window.audioEditor) window.audioEditor.zoomOut();
}

function editorZoomIn() {
    if (window.audioEditor) window.audioEditor.zoomIn();
}

function editorResetZoom() {
    if (window.audioEditor) window.audioEditor.resetZoom();
}

// ==========================================
// 📊 BARRA DE PROGRESO NATIVA
// ==========================================
if (audio && progressBar && progressContainer) {
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration || isNaN(audio.duration)) return;
        const percent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${percent}%`;
        if (timeDisplay) {
            let m = Math.floor(audio.currentTime / 60);
            let s = Math.floor(audio.currentTime % 60);
            timeDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
        }
        actualizarTiempoSubtitulos(audio.currentTime, audio.duration);
    });

    progressContainer.addEventListener('click', (e) => {
        if (!audio.duration) return;
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        audio.currentTime = (clickX / width) * audio.duration;
    });
}

if (audio) {
    audio.addEventListener('ended', () => {
        actualizarIconosPlay(false);
        if (progressBar) progressBar.style.width = "0%";
        if (timeDisplay) timeDisplay.innerText = "0:00";
        actualizarTiempoSubtitulos(0, audio.duration || 0);
    });
}

// ==========================================
// 🌐 EXPOSICIÓN GLOBAL
// ==========================================
window.cargarYReproducir = cargarYReproducir;
window.togglePlay = togglePlay;
window.stopAudio = stopAudio;
window.restartAudio = restartAudio;
window.eliminarSeleccion = eliminarSeleccion;
window.cortarSeleccion = cortarSeleccion;
window.editorZoomOut = editorZoomOut;
window.editorZoomIn = editorZoomIn;
window.editorResetZoom = editorResetZoom;
window.ICONOS = ICONOS; // Útil si otros archivos quieren usar los mismos iconos

console.log('✅ audioPlayer.js cargado correctamente (versión SVG)');
