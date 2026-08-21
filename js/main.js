// js/main.js - Loquendo Studio (Controlador Principal Definitivo)
const API_BASE = window.location.port ? `http://localhost:${window.location.port}` : '';

let textoBaseParaAprender = "";
let musicaFondoPath = null;
let voiceAudioRealPath = null;
let voiceAudioOriginalPath = null;
let pngtuberIdlePath = null;
let pngtuberTalkingPath = null;

function asegurarEditable(elemento) {
    if (!elemento) return;
    try {
        elemento.readOnly = false;
        elemento.disabled = false;
        elemento.removeAttribute('readonly');
        elemento.removeAttribute('disabled');
        elemento.style.pointerEvents = 'auto';
        elemento.style.opacity = '1';
    } catch (e) { console.warn('No se pudo reactivar:', e); }
}

function optimizar() {
    const entradaInput = document.getElementById("textoEntrada");
    const modoSelect = document.getElementById("modo");
    const salida = document.getElementById("resultado");
    
    if (!entradaInput || !entradaInput.value.trim()) {
        alert("Escribe algo en el cuadro de texto primero.");
        return;
    }

    let texto = entradaInput.value.trim();
    const modo = modoSelect?.value || "normal";

    if (window.dictionaryEditor) {
        const opciones = {
            fonetica: document.getElementById("chkLoquendo")?.checked || false,
            jergas: document.getElementById("chkNeutro")?.checked || false,
            sinonimos: document.getElementById("chkSinonimos")?.checked || false
        };
        texto = window.dictionaryEditor.applyToText(texto, opciones);
    }

    if (window.NarrationModes) {
        texto = window.NarrationModes.aplicar(texto, modo);
    }

    const chkComas = document.getElementById("chkComas");
    if (chkComas?.checked) {
        texto = texto.replace(/\s+([,.!?])/g, "$1");
        texto = texto.replace(/^(Hola|Bueno|Pues|Entonces|Así que|Oye)\b/gi, "$1,");
        
        const conectores = ["pero", "aunque", "sin embargo", "además", "entonces", 
                           "no obstante", "mientras", "donde", "porque", "ya que"];
        conectores.forEach(conector => {
            const regex = new RegExp(`([^,.\\n])\\s+\\b(${conector})\\b`, "gi");
            texto = texto.replace(regex, "$1, $2");
        });

        const finales = ["he dicho", "obviamente", "por supuesto", "claro", "en fin", "obvio"];
        finales.forEach(final => {
            const regex = new RegExp(`\\s+(${final})\\b([.!?])?`, "gi");
            texto = texto.replace(regex, ", $1$2");
        });

        texto = texto.replace(/\b(he|de|la|el|un|una|se|me|te|lo|le|y|o|a|en|por)\s*,\s*/gi, "$1 ");
        texto = texto.replace(/,+/g, ",");
        texto = texto.replace(/,([^\s])/g, ", $1");
    }

    const chkPuntos = document.getElementById("chkPuntos");
    if (chkPuntos?.checked) {
        texto = texto.replace(/\.([^\s])/g, ". $1");
        if (!/[.!?…]$/.test(texto)) texto += ".";
    }

    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    textoBaseParaAprender = textoFinal;

    if (salida) {
        salida.value = textoFinal;
        asegurarEditable(salida);
    }
    console.log(`✅ Texto optimizado. Modo: ${modo}`);
}

async function generarAudio(event) {
    if (event) event.preventDefault();
    const btn = document.querySelector(".btn-audio");
    const resultado = document.getElementById("resultado");
    const textoEntrada = document.getElementById("textoEntrada");
    const vozSelect = document.getElementById('vozSeleccionada');
    const chkSRT = document.getElementById('chkSRT_IA');
    const modoSelect = document.getElementById('modo');
    const textoFinal = resultado ? resultado.value : "";
    
    if (!textoFinal || textoFinal === "El texto aparecerá aquí...") {
        alert("¡Asu! Primero debes automatizar un texto.");
        return;
    }

    if (btn) { btn.innerText = "Procesando Pipeline... ⏳"; btn.disabled = true; }

    try {
        const respuesta = await fetch(`${API_BASE}/api/generar-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texto: textoFinal,
                voz: vozSelect?.value || 'Loquendo Jorge',
                usarIA: chkSRT?.checked || false,
                modo: modoSelect?.value || 'normal'
            })
        });

        if (respuesta.ok) {
            const data = await respuesta.json();
            voiceAudioRealPath = data.url;
            voiceAudioOriginalPath = data.url;
            window.voiceAudioRealPath = data.url;

            if (typeof window.cargarYReproducir === 'function') {
                window.cargarYReproducir(data.url, data.srt, data.ass);
            }
        } else {
            const errorData = await respuesta.json();
            alert("¡Asu! Error: " + (errorData.error || "El servidor falló"));
        }
    } catch (error) {
        console.error("Error fatal en red:", error);
        alert("¿Prendiste el servidor? No hay conexión con la API.");
    } finally {
        if (btn) { btn.innerText = "🎙️ Generar Audio Loquendo"; btn.disabled = false; }
        asegurarEditable(resultado);
        asegurarEditable(textoEntrada);
        if (resultado) resultado.focus();
    }
}

function cambiarTema() {
    const h = document.documentElement;
    h.setAttribute("data-theme", h.getAttribute("data-theme") === "light" ? "dark" : "light");
}

function cambiarDiseno() {
    document.querySelector('.contenedor-flexible')?.classList.toggle('modo-columnas');
}

async function automatizarTodo() {
    optimizar();
    await new Promise(resolve => setTimeout(resolve, 100));
    await generarAudio();
}

// ✅ SUBIR IMAGEN PNGTUBER CON FIX DE TEXTAREA
async function subirImagenPNGTuber(tipo = 'idle') {
    const inputId = tipo === 'talking' ? 'pngtuberTalkingInput' : 'pngtuberIdleInput';
    const input = document.getElementById(inputId);
    
    if (!input || !input.files || input.files.length === 0) {
        alert(`Selecciona una imagen ${tipo} antes de subirla.`);
        return;
    }

    const formData = new FormData();
    formData.append(tipo, input.files[0]);

    try {
        const res = await fetch(`${API_BASE}/api/upload-pngtuber`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir');
        
        if (tipo === 'talking') pngtuberTalkingPath = data.url;
        else pngtuberIdlePath = data.url;
        
        alert(`✅ Imagen ${tipo} cargada correctamente.`);
    } catch (error) {
        console.error(error);
        alert('❌ Error al subir la imagen PNGTuber');
    } finally {
        ['resultado', 'textoEntrada'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.readOnly = false;
                el.disabled = false;
                el.removeAttribute('readonly');
                el.removeAttribute('disabled');
                el.style.pointerEvents = 'auto';
                el.focus();
            }
        });
        if (input) input.value = '';
    }
}

// ✅ GENERAR VIDEO PNGTUBER CON AUDIO EDITADO
async function generarVideoPNGTuber() {
    let audioPath = window.voiceAudioRealPath || voiceAudioRealPath;
    
    if (!audioPath || audioPath.startsWith('blob:')) {
        alert('⚠️ Primero genera un audio válido (no ediciones temporales).');
        return;
    }

    // ✅ LIMPIEZA CRÍTICA DE RUTA
    let rutaLimpia = String(audioPath)
        .replace(API_BASE, '')
        .replace(/^\/+/, '')
        .split('?')[0];

    const btnVideo = document.querySelector('.btn-video');
    const textoOriginalBtn = btnVideo ? btnVideo.innerText : 'Generar Video PNGTuber';
    if (btnVideo) {
        btnVideo.innerText = '⏳ Procesando video...';
        btnVideo.disabled = true;
    }

    try {
        const res = await fetch(`${API_BASE}/api/generar-video-pngtuber`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioPath: rutaLimpia,
                idleImagePath: pngtuberIdlePath || null,
                talkingImagePath: pngtuberTalkingPath || null
            })
        });
        const data = await res.json();
        if (res.ok) {
            alert('✅ ¡Video PNGTuber generado con éxito!');
            const link = document.createElement('a');
            link.href = `${API_BASE}${data.video}`;
            link.download = 'video_pngtuber.mp4';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert('❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error generando video:', error);
        alert('Error de conexión al generar video.');
    } finally {
        if (btnVideo) {
            btnVideo.innerText = textoOriginalBtn;
            btnVideo.disabled = false;
        }
    }
}

// ✅ SUBIR MÚSICA DE FONDO (COMPLETA)
function subirMusicaFondo() {
    const input = document.getElementById('backgroundMusicInput');
    if (!input || !input.files || input.files.length === 0) {
        alert('Selecciona un archivo de audio primero.');
        return;
    }

    const formData = new FormData();
    formData.append('music', input.files[0]);

    fetch(`${API_BASE}/api/upload-music`, { method: 'POST', body: formData })
    .then(response => response.json())
    .then((data) => {
        if (data.url) {
            musicaFondoPath = data.url;
            if (window.audioEditor && typeof window.audioEditor.cargarMusica === 'function') {
                window.audioEditor.cargarMusica(`${API_BASE}${data.url}`);
            }
            alert('✅ Música de fondo subida');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error al subir música');
    });
}

// ✅ APLICAR DUCKING (VERSIÓN ÚNICA CORREGIDA)
function aplicarDucking() {
    const btnDescargar = document.getElementById('btnDescargar');
    let voiceAudioPath = window.voiceAudioRealPath || voiceAudioRealPath;
    
    if (!voiceAudioPath || voiceAudioPath.startsWith('blob:')) {
        alert('⚠️ Genera un audio nuevo primero (el actual es temporal o editado).');
        return;
    }
    
    if (!musicaFondoPath) {
        alert('Primero sube una música de fondo.');
        return;
    }

    // ✅ LIMPIEZA CRÍTICA DE RUTAS
    const cleanVoicePath = String(voiceAudioPath)
        .replace(API_BASE, '')
        .replace(/^\/+/, '')
        .split('?')[0];
    
    const cleanMusicPath = String(musicaFondoPath)
        .replace(API_BASE, '')
        .replace(/^\/+/, '')
        .split('?')[0];

    const chkLoop = document.getElementById('chkLoopMusica');
    const fadeInInput = document.getElementById('fadeInMusicaDuration');
    const fadeOutInput = document.getElementById('fadeOutMusicaDuration');
    const thresholdInput = document.getElementById('duckingThreshold');
    const ratioInput = document.getElementById('duckingRatio');
    const musicaSlider = document.getElementById('musicaVolumeSlider');
    
    const sliderValue = musicaSlider ? parseFloat(musicaSlider.value || '50') : 50;
    const musicVolume = Math.min(0.8, Math.max(0.15, sliderValue / 100));
    
    const options = {
        musicVolume,
        threshold: parseFloat(thresholdInput?.value || '0.1') || 0.1,
        ratio: parseFloat(ratioInput?.value || '4') || 4,
        attack: 50,
        release: 300,
        loopMusic: chkLoop?.checked || false,
        fadeInMusic: parseFloat(fadeInInput?.value || '2') || 2,
        fadeOutMusic: parseFloat(fadeOutInput?.value || '3') || 3
    };

    fetch(`${API_BASE}/api/audio/apply-ducking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voiceAudioPath: cleanVoicePath,
            musicPath: cleanMusicPath,
            options
        })
    })
    .then(response => response.json())
    .then((data) => {
        if (data.url) {
            voiceAudioRealPath = data.url;
            window.voiceAudioRealPath = data.url;
            
            if (btnDescargar) {
                btnDescargar.href = `${API_BASE}${data.url}`;
                btnDescargar.setAttribute('download', `audio_con_ducking_${Date.now()}.wav`);
            }
            
            const btnSRT = document.getElementById('btnDescargaSRT');
            if (btnSRT) btnSRT.style.display = 'inline-flex';
            
            const btnMP3 = document.getElementById('btnExportarMP3');
            if (btnMP3) btnMP3.style.display = 'inline-block';

            if (typeof window.cargarYReproducir === 'function') {
                window.cargarYReproducir(data.url);
            }
            alert('✅ Ducking aplicado.');
        } else {
            alert('❌ Error: ' + (data.error || 'Desconocido'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error de conexión al aplicar ducking');
    });
}

function subirVolumenMusica() { if (window.audioEditor) window.audioEditor.subirVolumen(10); }
function bajarVolumenMusica() { if (window.audioEditor) window.audioEditor.bajarVolumen(10); }
function mutearMusica() { if (window.audioEditor) window.audioEditor.mutear(); }
function cambiarVolumenMusica(valor) { if (window.audioEditor) window.audioEditor.cambiarVolumenDesdeSlider(valor); }

async function exportarAMp3() {
    const btnDescargar = document.getElementById('btnDescargar');
    const voiceAudioPath = (btnDescargar ? btnDescargar.href : '') || voiceAudioRealPath || '';

    if (!voiceAudioPath || voiceAudioPath === window.location.href) {
        alert('Primero genera un audio válido.');
        return;
    }

    if (voiceAudioPath.startsWith('blob:')) {
        alert('⚠️ El audio actual es temporal. Genera uno nuevo primero.');
        return;
    }

    const btnMP3 = document.getElementById('btnExportarMP3');
    const textoOriginal = btnMP3 ? btnMP3.innerText : ' Exportar a MP3';
    
    if (btnMP3) { btnMP3.innerText = '⏳ Convirtiendo...'; btnMP3.disabled = true; }

    try {
        const rutaLimpia = voiceAudioPath.replace(API_BASE, '').split('?')[0];
        const originalLimpia = voiceAudioOriginalPath ? voiceAudioOriginalPath.replace(API_BASE, '').split('?')[0] : null;

        const respuesta = await fetch(`${API_BASE}/api/audio/convertir-mp3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wavPath: rutaLimpia, originalWavPath: originalLimpia })
        });

        const data = await respuesta.json();

        if (respuesta.ok) {
            const urls = data.urls || (data.url ? [data.url] : []);
            if (urls.length === 0) {
                alert('❌ Error: ' + (data.error || 'Desconocido'));
            } else {
                urls.forEach(item => {
                    const u = typeof item === 'string' ? item : item.url;
                    const tipo = typeof item === 'object' && item.type ? item.type : 'mp3';
                    const link = document.createElement('a');
                    link.href = `${API_BASE}${u}`;
                    link.download = `audio_loquendo_${tipo}_${Date.now()}.mp3`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                alert('✅ Exportado a MP3' + (urls.length > 1 ? ' (ambas versiones)' : ''));
            }
        } else {
            alert('❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión al exportar');
    } finally {
        if (btnMP3) { btnMP3.innerText = textoOriginal; btnMP3.disabled = false; }
    }
}

document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (window.audioEditor && window.audioEditor.wavesurfer) window.audioEditor.playPause();
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (window.audioEditor) window.audioEditor.eliminarSeleccion();
    }
    if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (window.audioEditor) window.audioEditor.deshacer();
    }
    if (e.ctrlKey && e.code === 'KeyY') {
        e.preventDefault();
        if (window.audioEditor) window.audioEditor.rehacer();
    }
    if (e.code === 'KeyM') {
        if (window.audioEditor) window.audioEditor.mutear();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.dictionaryEditor) window.dictionaryEditor.loadAll();

    const resultado = document.getElementById("resultado");
    asegurarEditable(resultado);

    const btnGenerar = document.querySelector('.btn-audio');
    if (btnGenerar) {
        btnGenerar.removeAttribute('onclick');
        btnGenerar.setAttribute('type', 'button');
        btnGenerar.addEventListener('click', (e) => generarAudio(e));
    }

    if (resultado) {
        ['focus', 'click', 'input'].forEach(evt => {
            resultado.addEventListener(evt, () => asegurarEditable(resultado));
        });
    }

    console.log('✅ Loquendo Studio cargado y listo');
});