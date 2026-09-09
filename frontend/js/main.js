// js/main.js - Loquendo Studio (Controlador Principal Definitivo y Blindado)

// Inicialización segura de API_BASE (evita redeclaraciones con const/let)
if (typeof API_BASE === 'undefined') {
    var API_BASE = (function() {
        if (window.CONFIG && window.CONFIG.API_BASE) return window.CONFIG.API_BASE;
        if (window.location && window.location.port) return `http://localhost:${window.location.port}`;
        return 'http://localhost:3000';
    })();
    window.API_BASE = API_BASE;
}

let textoBaseParaAprender = "";
let musicaFondoPath = null;
let voiceAudioRealPath = null;
let voiceAudioOriginalPath = null;
let pngtuberIdlePath = null;
let pngtuberTalkingPath = null;

// Función auxiliar para mostrar notificaciones de forma segura
function notificar(tipo, mensaje, duracion) {
    if (window.notifications && typeof window.notifications[tipo] === 'function') {
        window.notifications[tipo](mensaje, duracion);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
}

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

// ==========================================
// 1. FUNCIONES DE UI Y TEMA
// ==========================================
function cambiarTema() {
    const h = document.documentElement;
    h.setAttribute("data-theme", h.getAttribute("data-theme") === "light" ? "dark" : "light");
    notificar('info', 'Tema cambiado');
}

function cambiarDiseno() {
    document.querySelector('.contenedor-flexible')?.classList.toggle('modo-columnas');
    notificar('info', ' Vista cambiada');
}

function abrirEnlaceExterno(url) {
    if (typeof require !== 'undefined') {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('abrir-enlace-externo', url);
        } catch (e) {
            window.open(url, '_blank');
        }
    } else {
        window.open(url, '_blank');
    }
}

function abrirAyuda() {
    const modal = document.getElementById('modalAyuda');
    if (modal) {
        // Actualizar contenido del modal con el texto personalizado
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <pre style="
                    font-family: 'Inter', system-ui, sans-serif;
                    font-size: 14px;
                    line-height: 1.8;
                    color: var(--text-color);
                    background: rgba(0, 0, 0, 0.3);
                    padding: 16px;
                    border-radius: 8px;
                    white-space: pre-wrap;
                    margin: 0;
                ">${mensajeAyuda}</pre>
            `;
        }
        modal.style.display = 'flex';
    }
}

// ✅ Variable con el mensaje de ayuda
const mensajeAyuda = " Ayuda Rápida:\n\n" +
           "1. Escribe o pega tu texto\n" +
           "2. Selecciona el modo y opciones\n" +
           "3. Haz clic en 'Generar Audio'\n" +
           "4. Usa el editor para cortar/normalizar\n" +
           "5. Genera el video PNGTuber\n" +
           "6. Desliza para escuchar y ajustar la música\n" +
             "7. Descarga subtítulos SRT/ASS si quieres\n\n" +
             "¡Listo! Disfruta de tu audio y video.";

// ✅ NUEVA FUNCIÓN: Cerrar modal de ayuda
function cerrarAyuda() {
    const modal = document.getElementById('modalAyuda');
    if (modal) {
        modal.style.display = 'none';
    }
}

function abrirEnlaceExterno(url) {
    if (typeof require !== 'undefined') {
        try {
            const { shell } = require('electron');
            shell.openExternal(url);
            console.log('✅ Enlace abierto en navegador externo:', url);
        } catch (e) {
            console.error('❌ Error al abrir enlace:', e);
            window.open(url, '_blank');
        }
    } else {
        window.open(url, '_blank');
    }
}

// ==========================================
// 2. PROCESAMIENTO DE TEXTO
// ==========================================
function optimizar() {
    const entradaInput = document.getElementById("textoEntrada");
    const modoSelect = document.getElementById("modo");
    const salida = document.getElementById("resultado");
    
    if (!entradaInput || !entradaInput.value.trim()) {
        notificar('warning', 'Escribe algo en el cuadro de texto primero.');
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
        const conectores = ["pero", "aunque", "sin embargo", "además", "entonces", "no obstante", "mientras", "donde", "porque", "ya que"];
        conectores.forEach(conector => {
            const regex = new RegExp(`([^,.\\n])\\s+\\b(${conector})\\b`, "gi");
            texto = texto.replace(regex, "$1, $2");
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
    notificar('success', ' Texto optimizado correctamente');
}
// ==========================================
// INSERTAR ETIQUETAS EN EL TEXTO
// ==========================================
function insertarEtiqueta() {
    const selector = document.getElementById('tagSelector');
    const textarea = document.getElementById('textoEntrada');
    
    if (!selector || !textarea) return;
    
    const etiqueta = selector.value;
    if (!etiqueta) return;
    
    // Obtener la posición actual del cursor
    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const textoSeleccionado = textarea.value.substring(inicio, fin);
    
    let textoInsertar = '';
    
    switch (etiqueta) {
        case 'pause':
            textoInsertar = '[pause]';
            break;
        case 'pause:1000':
            textoInsertar = '[pause:1000]';
            break;
        case 'slow':
            textoInsertar = textoSeleccionado ? `[slow]${textoSeleccionado}[/slow]` : '[slow]texto lento[/slow]';
            break;
        case 'fast':
            textoInsertar = textoSeleccionado ? `[fast]${textoSeleccionado}[/fast]` : '[fast]texto rápido[/fast]';
            break;
        case 'soft':
            textoInsertar = textoSeleccionado ? `[soft]${textoSeleccionado}[/soft]` : '[soft]texto suave[/soft]';
            break;
        case 'loud':
            textoInsertar = textoSeleccionado ? `[loud]${textoSeleccionado}[/loud]` : '[loud]texto fuerte[/loud]';
            break;
        case 'emphasis':
            textoInsertar = textoSeleccionado ? `[emphasis]${textoSeleccionado}[/emphasis]` : '[emphasis]¡Importante![/emphasis]';
            break;
        case 'spell':
            textoInsertar = textoSeleccionado ? `[spell]${textoSeleccionado}[/spell]` : '[spell]HOLA[/spell]';
            break;
        case 'voz':
            textoInsertar = textoSeleccionado ? `[voz:Loquendo Carlos]${textoSeleccionado}[/voz]` : '[voz:Loquendo Carlos]texto[/voz]';
            break;
    }
    
    // Insertar el texto en la posición del cursor
    textarea.value = textarea.value.substring(0, inicio) + textoInsertar + textarea.value.substring(fin);
    
    // Colocar el cursor después del texto insertado
    const nuevaPosicion = inicio + textoInsertar.length;
    textarea.focus();
    textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);
    
    // Resetear el selector
    selector.value = '';
    
    // Mostrar notificación
    notificar('info', `✅ Etiqueta [${etiqueta}] insertada`);
}
// ==========================================
// 3. GENERACIÓN DE AUDIO
// ==========================================
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
        notificar('warning', ' Primero debes automatizar un texto.');
        return;
    }

    if (btn) { btn.innerText = "Procesando Pipeline... "; btn.disabled = true; }

    try {
        // ✅ Obtener el estado de las opciones
        const opciones = {
            jergas: document.getElementById("chkNeutro")?.checked || false,
            fonetica: document.getElementById("chkLoquendo")?.checked || false,
            sinonimos: document.getElementById("chkSinonimos")?.checked || false
        };

        notificar('info', ' Generando audio...');

        const respuesta = await fetch(`${API_BASE}/api/generar-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texto: textoFinal,
                voz: vozSelect?.value || 'Loquendo Jorge',
                usarIA: chkSRT?.checked || false,
                modo: modoSelect?.value || 'normal',
                opciones: opciones  // ✅ Enviar opciones al backend
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
            notificar('success', 'Audio generado correctamente');
        } else {
            const errorData = await respuesta.json();
            notificar('error', ' Error: ' + (errorData.error || 'El servidor falló'));
        }
    } catch (error) {
        console.error("Error fatal en red:", error);
        notificar('error', ' No hay conexión con la API. ¿Prendiste el servidor?');
    } finally {
        if (btn) { btn.innerText = "Generar Audio Loquendo"; btn.disabled = false; }
        asegurarEditable(resultado);
        asegurarEditable(textoEntrada);
        if (resultado) resultado.focus();
    }
}

async function automatizarTodo() {
    notificar('info', ' Iniciando proceso maestro...');
    optimizar();
    await new Promise(resolve => setTimeout(resolve, 100));
    await generarAudio();
}

// ==========================================
// 4. GENERACIÓN DE SUBTÍTULOS BAJO DEMANDA
// ==========================================
async function generarYDescargarSRT() {
    const audioPath = window.voiceAudioRealPath || voiceAudioRealPath;
    const textoOriginal = document.getElementById('resultado')?.value || '';
    if (!audioPath) { 
        notificar('warning', 'Genera un audio primero.');
        return; 
    }

    const btn = document.getElementById('btnGenerarSRT');
    if (btn) { btn.innerText = " Generando SRT..."; btn.disabled = true; }

    try {
        notificar('info', ' Generando SRT...');
        const res = await fetch(`${API_BASE}/api/generar-srt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath, textoOriginal })
        });
        const data = await res.json();
        if (res.ok) {
            const link = document.getElementById('btnDescargaSRT');
            if (link) {
                link.href = `${API_BASE}${data.srtUrl}?t=${Date.now()}`;
                link.setAttribute('download', `subtitulos_${Date.now()}.srt`);
                link.style.display = 'inline-flex';
                link.click();
            }
            notificar('success', ' SRT generado y descargado');
        } else {
            notificar('error', '❌ Error: ' + data.error);
        }
    } catch (error) {
        notificar('error', '❌ Error de conexión al generar SRT');
    } finally {
        if (btn) { btn.innerText = " Generar y Descargar SRT"; btn.disabled = false; }
    }
}

async function generarYDescargarASS() {
    const audioPath = window.voiceAudioRealPath || voiceAudioRealPath;
    const textoOriginal = document.getElementById('resultado')?.value || '';
    const modo = document.getElementById('modo')?.value || 'normal';
    const linkSRT = document.getElementById('btnDescargaSRT');
    const srtPath = (linkSRT && linkSRT.href && !linkSRT.href.startsWith('blob:')) 
                    ? linkSRT.href.replace(API_BASE, '').split('?')[0] : null;

    if (!audioPath) { 
        notificar('warning', ' Genera un audio primero.');
        return; 
    }

    const btn = document.getElementById('btnGenerarASS');
    if (btn) { btn.innerText = "Generando ASS..."; btn.disabled = true; }

    try {
        notificar('info', ' Generando ASS...');
        const res = await fetch(`${API_BASE}/api/generar-ass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath, textoOriginal, modo, srtPath })
        });
        const data = await res.json();
        if (res.ok) {
            const link = document.getElementById('btnDescargaASS');
            if (link) {
                link.href = `${API_BASE}${data.assUrl}?t=${Date.now()}`;
                link.setAttribute('download', `subtitulos_efectos_${Date.now()}.ass`);
                link.style.display = 'inline-flex';
                link.click();
            }
            notificar('success', ' ASS generado y descargado');
        } else {
            notificar('error', ' Error: ' + data.error);
        }
    } catch (error) {
        notificar('error', ' Error de conexión al generar ASS');
    } finally {
        if (btn) { btn.innerText = " Generar y Descargar ASS"; btn.disabled = false; }
    }
}

// ==========================================
// 5. VIDEO PNGTUBER
// ==========================================
async function subirImagenPNGTuber(tipo = 'idle') {
    const inputId = tipo === 'talking' ? 'pngtuberTalkingInput' : 'pngtuberIdleInput';
    const input = document.getElementById(inputId);
    
    if (!input || !input.files || input.files.length === 0) {
        notificar('warning', ` Selecciona una imagen ${tipo} antes de subirla.`);
        return;
    }
    
    const formData = new FormData();
    formData.append(tipo, input.files[0]);
    
    try {
        notificar('info', ` Subiendo imagen ${tipo}...`);
        const res = await fetch(`${API_BASE}/api/upload-pngtuber`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir');
        
        if (tipo === 'talking') pngtuberTalkingPath = data.url;
        else pngtuberIdlePath = data.url;
        
        notificar('success', `Imagen ${tipo} cargada correctamente.`);
    } catch (error) {
        console.error(error);
        notificar('error', 'Error al subir la imagen PNGTuber');
    } finally {
        ['resultado', 'textoEntrada'].forEach(id => {
            const el = document.getElementById(id);
            if (el) asegurarEditable(el);
        });
        if (input) input.value = '';
    }
}

async function generarVideoPNGTuber() {
    let audioPath = window.voiceAudioRealPath || voiceAudioRealPath;
    if (!audioPath || audioPath.startsWith('blob:')) {
        notificar('warning', '⚠️ Primero genera un audio válido (no ediciones temporales).');
        return;
    }
    
    let rutaLimpia = String(audioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
    const btnVideo = document.querySelector('.btn-video');
    const textoOriginalBtn = btnVideo ? btnVideo.innerText : 'Generar Video PNGTuber';
    
    if (btnVideo) {
        btnVideo.innerText = '⏳ Procesando video...';
        btnVideo.disabled = true;
    }
    
    try {
        notificar('info', '⏳ Procesando video...');
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
            notificar('success', '✅ ¡Video PNGTuber generado con éxito!');
            const link = document.createElement('a');
            link.href = `${API_BASE}${data.video}`;
            link.download = 'video_pngtuber.mp4';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            notificar('error', '❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error generando video:', error);
        notificar('error', '❌ Error de conexión al generar video.');
    } finally {
        if (btnVideo) {
            btnVideo.innerText = textoOriginalBtn;
            btnVideo.disabled = false;
        }
    }
}
// ==========================================
// 6. AUDIO AVANZADO (MÚSICA, DUCKING, MP3)
// ==========================================
function subirMusicaFondo() {
    const input = document.getElementById('backgroundMusicInput');
    if (!input || !input.files || input.files.length === 0) {
        notificar('warning', '⚠️ Selecciona un archivo de audio primero.');
        return;
    }
    
    const formData = new FormData();
    formData.append('music', input.files[0]);
    
    notificar('info', '⏳ Subiendo música...');
    
    fetch(`${API_BASE}/api/upload-music`, { method: 'POST', body: formData })
    .then(response => response.json())
    .then((data) => {
        if (data.url) {
            musicaFondoPath = data.url;
            if (window.audioEditor && typeof window.audioEditor.cargarMusica === 'function') {
                window.audioEditor.cargarMusica(`${API_BASE}${data.url}`);
            }
            notificar('success', '✅ Música de fondo subida');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        notificar('error', '❌ Error al subir música');
    });
}

// Función para recargar el audio si se queda en blanco
function recargarAudio() {
    if (window.audioEditor && window.audioEditor._currentUrl) {
        window.audioEditor.cargarAudio(window.audioEditor._currentUrl);
        console.log('Audio recargado');
        notificar('success', ' Audio recargado');
    }
}

function aplicarDucking() {
    const btnDescargar = document.getElementById('btnDescargar');
    const voiceAudioPath = window.voiceAudioRealPath || voiceAudioRealPath || (btnDescargar ? btnDescargar.href : '') || '';
    
    if (!voiceAudioPath || voiceAudioPath === window.location.href) {
        notificar('warning', '⚠️ Primero genera un audio de voz.');
        return;
    }
    if (voiceAudioPath.startsWith('blob:')) {
        notificar('warning', '⚠️ El audio actual es una versión editada temporal. Genera uno nuevo primero.');
        return;
    }
    if (!musicaFondoPath) {
        notificar('warning', '⚠️ Primero sube una música de fondo.');
        return;
    }
    
    const cleanVoicePath = String(voiceAudioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
    const cleanMusicPath = String(musicaFondoPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
    
    const chkLoop = document.getElementById('chkLoopMusica');
    const thresholdInput = document.getElementById('duckingThreshold');
    const ratioInput = document.getElementById('duckingRatio');
    const musicaSlider = document.getElementById('musicaVolumeSlider');
    const fadeInInput = document.getElementById('fadeInMusicaDuration');
    const fadeOutInput = document.getElementById('fadeOutMusicaDuration');
    
    const sliderValue = musicaSlider ? parseFloat(musicaSlider.value || '50') : 50;
    const musicVolume = Math.min(0.8, Math.max(0.15, sliderValue / 100));
    
    const options = {
        musicVolume,
        duckAmount: 0.15,
        threshold: parseFloat(thresholdInput?.value || '0.1') || 0.1,
        ratio: parseFloat(ratioInput?.value || '4') || 4,
        attack: 50,
        release: 300,
        loopMusic: chkLoop?.checked || false,
        fadeInMusic: parseFloat(fadeInInput?.value || '2') || 2,
        fadeOutMusic: parseFloat(fadeOutInput?.value || '3') || 3
    };
    
    notificar('info', '⏳ Aplicando Ducking...');
    
    fetch(`${API_BASE}/api/audio/apply-ducking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceAudioPath: cleanVoicePath, musicPath: cleanMusicPath, options })
    })
    .then(response => response.json())
    .then((data) => {
        if (data.url) {
            voiceAudioRealPath = data.url;
            window.voiceAudioRealPath = data.url; // ✅ También actualizar la variable global
            
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
            notificar('success', ' Ducking aplicado correctamente.');
        } else {
            notificar('error', ' Error: ' + (data.error || 'Desconocido'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        notificar('error', ' Error de conexión al aplicar ducking');
    });
}
function subirVolumenMusica() { if (window.audioEditor) window.audioEditor.subirVolumen(10); }
function bajarVolumenMusica() { if (window.audioEditor) window.audioEditor.bajarVolumen(10); }
function mutearMusica() { if (window.audioEditor) window.audioEditor.mutear(); }
function cambiarVolumenMusica(valor) { if (window.audioEditor) window.audioEditor.cambiarVolumenDesdeSlider(valor); }

async function exportarAMp3() {
    // ✅ CORREGIDO: Usar voiceAudioRealPath directamente
    const voiceAudioPath = window.voiceAudioRealPath || voiceAudioRealPath || '';
    
    if (!voiceAudioPath || voiceAudioPath === window.location.href) {
        notificar('warning', '⚠️ Primero genera un audio válido.');
        return;
    }
    if (voiceAudioPath.startsWith('blob:')) {
        notificar('warning', '⚠️ El audio actual es temporal. Genera uno nuevo primero.');
        return;
    }
    
    const btnMP3 = document.getElementById('btnExportarMP3');
    const textoOriginal = btnMP3 ? btnMP3.innerText : ' Exportar a MP3';
    if (btnMP3) { btnMP3.innerText = '⏳ Convirtiendo...'; btnMP3.disabled = true; }
    
    try {
        notificar('info', '⏳ Convirtiendo a MP3...');
        // ✅ CORREGIDO: Limpiar ruta correctamente
        let rutaLimpia = String(voiceAudioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
        let originalLimpia = voiceAudioOriginalPath ? String(voiceAudioOriginalPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0] : null;
        
        const respuesta = await fetch(`${API_BASE}/api/audio/convertir-mp3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wavPath: rutaLimpia, originalWavPath: originalLimpia })
        });
        const data = await respuesta.json();
        
        if (respuesta.ok) {
            const urls = data.urls || (data.url ? [data.url] : []);
            if (urls.length === 0) {
                notificar('error', '❌ Error: ' + (data.error || 'Desconocido'));
            } else {
                urls.forEach(item => {
                    const u = typeof item === 'string' ? item : item.url;
                    const tipo = typeof item === 'object' && item.type ? item.type : 'mp3';
                    const link = document.createElement('a');
                    // ✅ CORREGIDO: Usar API_BASE en la URL
                    link.href = `${API_BASE}${u}`;
                    link.download = `audio_loquendo_${tipo}_${Date.now()}.mp3`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                notificar('success', '✅ Exportado a MP3 correctamente');
            }
        } else {
            notificar('error', '❌ Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error:', error);
        notificar('error', '❌ Error de conexión al exportar');
    } finally {
        if (btnMP3) { btnMP3.innerText = textoOriginal; btnMP3.disabled = false; }
    }
}
// ==========================================
// 7. ATAJOS DE TECLADO E INICIALIZACIÓN
// ==========================================
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
    
    // ✅ Cerrar modales con tecla ESC
    if (e.code === 'Escape') {
        cerrarAyuda();
        cerrarVentanaTesters();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // ✅ Verificación segura
    if (window.dictionaryEditor && typeof window.dictionaryEditor.loadAll === 'function') {
        window.dictionaryEditor.loadAll();
    } else {
        console.warn('⚠️ dictionaryEditor no está disponible');
    }
    
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
    console.log(' Loquendo Studio cargado y listo');
    notificar('success', ' Loquendo Studio listo para usar');
});

// ==========================================
// 8. MODALES Y VENTANA DE TESTERS
// ==========================================

// Abrir modal de testers
function abrirVentanaTesters() {
    const modal = document.getElementById('modalTesters');
    if (modal) modal.style.display = 'flex';
}

// Cerrar modal de testers
function cerrarVentanaTesters() {
    const modal = document.getElementById('modalTesters');
    if (modal) modal.style.display = 'none';
}

// Ver reporte de un tester
function verReporteTester(id) {
    notificar('info', `📋 Mostrando reporte del Tester ${id}...`);
    // Aquí puedes cargar los reportes desde tu backend
    // fetch(`${API_BASE}/api/testers/${id}/reportes`)
    //     .then(res => res.json())
    //     .then(data => {
    //         console.log('Reporte del tester:', data);
    //     });
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', (e) => {
    const modalAyuda = document.getElementById('modalAyuda');
    const modalTesters = document.getElementById('modalTesters');
    
    if (modalAyuda && e.target === modalAyuda) cerrarAyuda();
    if (modalTesters && e.target === modalTesters) cerrarVentanaTesters();
});

// ==========================================
// 9. ✅ EXPOSICIÓN GLOBAL DE FUNCIONES (CRÍTICO PARA EL HTML)
// =========================================
window.cambiarTema = cambiarTema;
window.cambiarDiseno = cambiarDiseno;
window.abrirAyuda = abrirAyuda;
window.cerrarAyuda = cerrarAyuda;
window.abrirEnlaceExterno = abrirEnlaceExterno;
window.optimizar = optimizar;
window.generarAudio = generarAudio;
window.automatizarTodo = automatizarTodo;
window.subirImagenPNGTuber = subirImagenPNGTuber;
window.generarVideoPNGTuber = generarVideoPNGTuber;
window.subirMusicaFondo = subirMusicaFondo;
window.aplicarDucking = aplicarDucking;
window.exportarAMp3 = exportarAMp3;
window.recargarAudio = recargarAudio;
window.subirVolumenMusica = subirVolumenMusica;
window.bajarVolumenMusica = bajarVolumenMusica;
window.mutearMusica = mutearMusica;
window.cambiarVolumenMusica = cambiarVolumenMusica;
window.generarYDescargarSRT = generarYDescargarSRT;
window.generarYDescargarASS = generarYDescargarASS;
window.abrirVentanaTesters = abrirVentanaTesters;
window.cerrarVentanaTesters = cerrarVentanaTesters;
window.verReporteTester = verReporteTester;
window.notificar = notificar;
window.insertarEtiqueta = insertarEtiqueta;

console.log('Funciones expuestas globalmente. ¡Listo para usar!');