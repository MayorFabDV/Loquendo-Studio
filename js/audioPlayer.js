// js/audioPlayer.js - Versión global (sin imports)

const audio = document.getElementById('audioReproductor');
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const timeDisplay = document.getElementById('currentTime');
const btnDescargar = document.getElementById('btnDescargar');
const btnDescargaSRT = document.getElementById('btnDescargaSRT');
const btnDescargaASS = document.getElementById('btnDescargaASS');  // ← NUEVO

let editorInicializado = false;

function asegurarEditorInicializado() {
  if (!editorInicializado && window.audioEditor) {
    editorInicializado = window.audioEditor.inicializar('#waveform');

    window.audioEditor.onReady = () => { console.log('Editor listo'); };
    window.audioEditor.onPlay = () => { playBtn.innerText = '⏸️'; };
    window.audioEditor.onPause = () => { playBtn.innerText = '▶️'; };
    window.audioEditor.onFinish = () => {
      playBtn.innerText = '▶️';
      if (timeDisplay) timeDisplay.innerText = '00:00';
      if (progressBar) progressBar.style.width = '0%';
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
    };
  }
}

// ✅ NUEVO: Recibe urlASS como 3er parámetro
async function cargarYReproducir(urlAudio, urlSRT, urlASS) {
    if (!urlAudio) return;
    try {
        audio.pause();
        audio.currentTime = 0;
        const nuevaUrl = `http://localhost:3000${urlAudio}?t=${Date.now()}`;
        audio.src = nuevaUrl;

        if (btnDescargar) {
            btnDescargar.href = nuevaUrl;
            btnDescargar.setAttribute('download', `audio_loquendo_${Date.now()}.wav`);
        }

        if (btnDescargaSRT) {
            if (urlSRT) {
                const srtUrl = `http://localhost:3000${urlSRT}?t=${Date.now()}`;
                btnDescargaSRT.href = srtUrl;
                btnDescargaSRT.setAttribute('download', `subtitulos_${Date.now()}.srt`);
                btnDescargaSRT.style.display = "inline-flex";
                console.log("📝 SRT listo");
            } else {
                btnDescargaSRT.style.display = "none";
            }
        }

        // ✅ NUEVO: Botón ASS
        if (btnDescargaASS) {
            if (urlASS) {
                const assUrl = `http://localhost:3000${urlASS}?t=${Date.now()}`;
                btnDescargaASS.href = assUrl;
                btnDescargaASS.setAttribute('download', `subtitulos_efectos_${Date.now()}.ass`);
                btnDescargaASS.style.display = "inline-flex";
                console.log("🎨 ASS listo");
            } else {
                btnDescargaASS.style.display = "none";
            }
        }

        document.getElementById("contenedorReproductor").style.display = "block";
        asegurarEditorInicializado();

        setTimeout(() => {
            if (window.audioEditor) {
                window.audioEditor.cargarAudio(nuevaUrl);
            }
        }, 300);
    } catch (error) {
        console.error("Error al cargar el audio:", error);
    }
}

function togglePlay() {
    if (window.audioEditor && window.audioEditor.wavesurfer && window.audioEditor.isReady) {
        window.audioEditor.playPause();
    } else if (!audio.src || audio.src === window.location.href) {
        console.warn("No hay un audio válido cargado.");
        return;
    } else {
        if (audio.paused) {
            audio.play();
            playBtn.innerText = "⏸️";
        } else {
            audio.pause();
            playBtn.innerText = "▶️";
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
    playBtn.innerText = "▶️";
    if (progressBar) progressBar.style.width = "0%";
    if (timeDisplay) timeDisplay.innerText = "0:00";
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
    playBtn.innerText = "⏸️";
}

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
            btnDescargar.href = nuevaUrl;
            btnDescargar.setAttribute('download', `audio_editado_${Date.now()}.wav`);
        }
        alert('✅ ¡Audio cortado exitosamente!');
    }
}

function cortarSeleccion() {
    eliminarSeleccion();
}

function editorZoomOut() {
    if (window.audioEditor) window.audioEditor.zoomOut();
}

function editorZoomIn() {
    if (window.audioEditor) window.audioEditor.zoomIn();
}

function editorResetZoom() {
    if (window.audioEditor) window.audioEditor.resetZoom();
}

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
        playBtn.innerText = "▶️";
        if (progressBar) progressBar.style.width = "0%";
        if (timeDisplay) timeDisplay.innerText = "0:00";
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

console.log('✅ audioPlayer.js cargado correctamente');