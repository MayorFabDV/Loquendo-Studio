// js/main.js - Loquendo Studio (Controlador Principal Definitivo y Blindado)

// Inicialización segura de API_BASE (fuente de verdad: window.CONFIG, que deriva del origen real)
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.CONFIG && window.CONFIG.API_BASE) || window.API_BASE || (window.location && window.location.port ? `http://localhost:${window.location.port}` : 'http://localhost:3000');
    window.API_BASE = API_BASE;
}


let textoBaseParaAprender = "";
let musicaFondoPath = null;
let voiceAudioRealPath = null;
let voiceAudioOriginalPath = null;
let pngtuberIdlePath = null;
let pngtuberTalkingPath = null;
let pngtuberBlinkPath = null;
let previewEnCurso = false;
let pendingPreview = false;
let revisionPreviewPNGTuber = 0;
let renderPNGTuberEnCurso = false;

// ✅ Función auxiliar para notificaciones
function notificar(tipo, mensaje, duracion) {
    if (window.notifications && typeof window.notifications[tipo] === 'function') {
        window.notifications[tipo](mensaje, duracion);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
}

async function rutaVozPersistida() {
    let ruta = window.voiceAudioRealPath || voiceAudioRealPath || '';
    const inst = window.audioEditor;
    if (inst && typeof inst.asegurarAudioPersistido === 'function') {
        try {
            return await inst.asegurarAudioPersistido();
        } catch (error) {
            console.error('No se pudo preparar el audio de voz:', error);
            return null;
        }
    }
    return ruta;
}

function versionAudioActual() {
    return [window.audioEditor?._loadToken, window.audioEditor?._revisionAudio];
}

function audioSigueActual(version) {
    const actual = versionAudioActual();
    return actual[0] === version[0] && actual[1] === version[1];
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
    notificar('info', 'Vista cambiada');
}

function abrirEnlaceExterno(url) {
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        console.warn('electronAPI no disponible, no se puede abrir el enlace:', url);
    }
}

function abrirAyuda() {
    const modal = document.getElementById('modalAyuda');
    if (modal) {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <pre style="font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.8; color: var(--text-color); background: rgba(0, 0, 0, 0.3); padding: 16px; border-radius: 8px; white-space: pre-wrap; margin: 0;">${mensajeAyuda}</pre>
            `;
        }
        modal.style.display = 'flex';
    }
}

const mensajeAyuda = " Ayuda Rápida:\n\n" +
           "1. Escribe o pega tu texto\n" +
           "2. Selecciona el modo y opciones\n" +
           "3. Haz clic en 'Generar Audio'\n" +
           "4. Usa el editor para cortar/igualar volumen\n" +
           "5. Crea el video del personaje\n" +
           "6. Desliza para escuchar y ajustar la música\n" +
           "7. Descarga subtítulos SRT/ASS si quieres\n\n" +
           "¡Listo! Disfruta de tu audio y video.";

function cerrarAyuda() {
    const modal = document.getElementById('modalAyuda');
    if (modal) modal.style.display = 'none';
}
// ==========================================
// 1.5 CARGAR VOCES DISPONIBLES DINÁMICAMENTE
// ==========================================
async function cargarVoces() {
    const select = document.getElementById('vozSeleccionada');
    if (!select) return;
    
    select.innerHTML = '<option value="">Detectando voces...</option>';
    select.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/api/voces`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        if (!data.voces || data.voces.length === 0) {
            select.innerHTML = '<option value="">No se detectaron voces</option>';
            notificar('warning', 'No se detectaron voces en el sistema');
            return;
        }
        
        select.innerHTML = '';
        
        const vocesLoquendo = [];
        const vocesAcapella = [];
        const vocesMicrosoft = [];
        const vocesOtras = [];
        
        data.voces.forEach(voz => {
            const nombre = voz.nombre;
            if (nombre.includes('Microsoft')) vocesMicrosoft.push(voz);
            else if (nombre.toLowerCase().includes('acapella')) vocesAcapella.push(voz);
            else if (['Jorge', 'Carlos', 'Carmen', 'Diego', 'Ludoviko', 'Esperanza', 'Francisca', 'Leonor', 'Soledad', 'Ximena'].includes(nombre)) vocesLoquendo.push(voz);
            else vocesOtras.push(voz);
        });
        
        if (vocesLoquendo.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = 'Voces Loquendo';
            vocesLoquendo.forEach(voz => {
                const option = document.createElement('option');
                option.value = voz.id;
                option.textContent = voz.nombre;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
        
        if (vocesAcapella.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = 'Voces Acapella';
            vocesAcapella.forEach(voz => {
                const option = document.createElement('option');
                option.value = voz.id;
                option.textContent = voz.nombre;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
        
        if (vocesMicrosoft.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = 'Voces Microsoft';
            vocesMicrosoft.forEach(voz => {
                const option = document.createElement('option');
                option.value = voz.id;
                option.textContent = voz.nombre;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
        
        if (vocesOtras.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = 'Otras Voces';
            vocesOtras.forEach(voz => {
                const option = document.createElement('option');
                option.value = voz.id;
                option.textContent = voz.nombre;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
        
        if (select.options.length > 0) select.selectedIndex = 0;
        select.disabled = false;
        if (window.settings && typeof window.settings.aplicarVozPorDefecto === 'function') {
            window.settings.aplicarVozPorDefecto();
        }
        console.log(`✅ ${data.total} voces cargadas`);
        notificar('success', `${data.total} voces detectadas`);
        
    } catch (error) {
        console.error('Error cargando voces:', error);
        select.innerHTML = '<option value="">Error al detectar voces</option>';
        select.disabled = false;
        notificar('error', 'No se pudieron detectar las voces');
    }
}

// ==========================================
// 1.6 CORREGIR TEXTO CON LANGUAGETOOL
// ==========================================
async function corregirTexto() {
    if (window.appFeatures && window.appFeatures.languageTool === false) {
        notificar('info', window.appFeatures.languageToolMaintenanceMessage || 'LanguageTool está temporalmente desactivado.');
        return;
    }
    const textarea = document.getElementById('resultado');
    const textoOriginal = textarea?.value || '';
    
    if (!textoOriginal.trim()) {
        notificar('warning', 'Primero escribe algo');
        return;
    }
    
    const btn = document.getElementById('btnCorregirTexto');
    const textoBtnOriginal = btn ? btn.innerText : 'Corregir Texto';
    
    if (btn) { btn.innerText = 'Corrigiendo...'; btn.disabled = true; }
    
    try {
        notificar('info', 'Analizando ortografía y gramática...');
        
        const res = await fetch(`${API_BASE}/api/corregir-texto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: textoOriginal })
        });
        
        const data = await res.json();
        
        if (data.error) {
            notificar('error', 'Error: ' + data.error);
            return;
        }
        
        if (textarea) textarea.value = data.textoCorregido;
        
        if (data.totalCorrecciones > 0) {
            notificar('success', `${data.totalCorrecciones} correcciones aplicadas`);
            console.log('Correcciones:', data.correcciones);
        } else {
            notificar('info', 'No se encontraron errores');
        }
        
    } catch (error) {
        console.error('Error corrigiendo:', error);
        notificar('error', 'Error de conexión con LanguageTool');
    } finally {
        if (btn) { btn.innerText = textoBtnOriginal; btn.disabled = false; }
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
    
    console.log('📝 [Optimizar] Texto original:', texto.substring(0, 100));
    console.log('🎭 [Optimizar] Modo:', modo);
    
    // ============================================================
    // 1. DICCIONARIOS
    // ============================================================
    if (window.dictionaryEditor && typeof window.dictionaryEditor.applyToText === 'function') {
        const opciones = {
            ortografia: document.getElementById("chkOrtografia")?.checked || false,
            gramatica: document.getElementById("chkGramatica")?.checked || false,
            fonetica: document.getElementById("chkLoquendo")?.checked || false,
            jergas: document.getElementById("chkNeutro")?.checked || false,
            sinonimos: document.getElementById("chkSinonimos")?.checked || false
        };
        
        console.log('📚 [Optimizar] Opciones diccionarios:', opciones);
        texto = window.dictionaryEditor.applyToText(texto, opciones);
        console.log('📚 [Optimizar] Después de diccionarios:', texto.substring(0, 100));
    }
    
    // ============================================================
    // 2. MODO DE NARRACIÓN
    // ============================================================
    if (window.NarrationModes) {
        texto = window.NarrationModes.aplicar(texto, modo);
        console.log(`🎭 [Optimizar] Después de modo "${modo}":`, texto.substring(0, 100));
    }
    
    // ============================================================
    // 3. ORTOGRAFÍA Y GRAMÁTICA
    // ============================================================
    if (window.ortografiaProcessor) {
        const opcionesOrtografia = {
            ortografia: document.getElementById("chkOrtografia")?.checked || false,
            gramatica: document.getElementById("chkGramatica")?.checked || false,
            puntuacion: document.getElementById("chkPuntuacion")?.checked || false
        };
        texto = window.ortografiaProcessor.procesar(texto, opcionesOrtografia);
        console.log('📝 [Optimizar] Después de ortografía:', texto.substring(0, 100));
    }
    
    // ============================================================
    // 4. PUNTUACIÓN FLUIDA (COMAS + PUNTOS, VÍA TEXT-PROCESSOR)
    // ============================================================
    const chkComas = document.getElementById("chkComas");
    const chkPuntos = document.getElementById("chkPuntos");
    if ((chkComas?.checked || chkPuntos?.checked) && window.textProcessor) {
        texto = window.textProcessor.puntuar(
            texto,
            { comas: chkComas?.checked, puntos: chkPuntos?.checked },
            modo
        );
        console.log('📝 [Optimizar] Después de puntuación fluida:', texto.substring(0, 100));
    }
    
    // ============================================================
    // 6. CAPITALIZAR PRIMERA LETRA DEL TEXTO COMPLETO
    // ============================================================
    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    textoBaseParaAprender = textoFinal;
    
    if (salida) {
        salida.value = textoFinal;
        asegurarEditable(salida);
    }
    
    console.log('✅ [Optimizar] Texto final:', textoFinal.substring(0, 100));
    notificar('success', `Texto optimizado (modo: ${modo})`);
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

    if (!textoFinal || textoFinal === "El texto procesado aparecerá aquí...") {
        notificar('warning', 'Primero debes automatizar un texto.');
        return;
    }

        if (btn) { btn.innerText = "Procesando..."; btn.disabled = true; }

    try {
        const opciones = {
            jergas: document.getElementById("chkNeutro")?.checked || false,
            fonetica: document.getElementById("chkLoquendo")?.checked || false,
            sinonimos: document.getElementById("chkSinonimos")?.checked || false
        };

        const calidadSel = document.getElementById('calidadSeleccionada');
        if (calidadSel && calidadSel.value !== '48k') {
            opciones.calidad = calidadSel.value;
        }

        notificar('info', 'Generando audio...');

        const respuesta = await fetch(`${API_BASE}/api/generar-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texto: textoFinal,
                voz: vozSelect?.value || 'Jorge',
                usarIA: window.appFeatures?.transcription === true && (chkSRT?.checked || false),
                modo: modoSelect?.value || 'normal',
                opciones: opciones
            })
        });

        if (respuesta.ok) {
            const data = await respuesta.json();
            voiceAudioRealPath = data.url;
            voiceAudioOriginalPath = data.url;
            window.voiceAudioRealPath = data.url;
            window.voiceAudioOriginalPath = data.url;
            
            if (typeof window.cargarYReproducir === 'function') {
                await window.cargarYReproducir(data.url, data.srt, data.ass);
            }
            notificar('success', 'Audio generado correctamente');
        } else {
            const errorData = await respuesta.json();
            notificar('error', 'Error: ' + (errorData.error || 'El servidor falló'));
        }
    } catch (error) {
        console.error("Error fatal en red:", error);
        notificar('error', 'No hay conexión con la API. ¿Prendiste el servidor?');
    } finally {
        if (btn) { btn.innerText = "Generar Audio"; btn.disabled = false; }
        asegurarEditable(resultado);
        asegurarEditable(textoEntrada);
        if (resultado) resultado.focus();
    }
}

async function automatizarTodo() {
    notificar('info', 'Iniciando proceso maestro...');
    optimizar();
    await new Promise(resolve => setTimeout(resolve, 100));
    await generarAudio();
}

// ==========================================
// 4. SUBTÍTULOS
// ==========================================
async function generarYDescargarSRT() {
    if (window.appFeatures?.subtitlesUI !== true) {
        notificar('warning', window.appFeatures?.subtitlesMaintenanceMessage || 'Subtítulos está temporalmente en mantenimiento.');
        return;
    }
    const audioPath = await rutaVozPersistida();
    const version = versionAudioActual();
    const textoOriginal = document.getElementById('resultado')?.value || '';
    const maxPalabras = document.getElementById('palabrasSubtitulo')?.value || 7;

    if (!audioPath) { 
        notificar('warning', 'Genera un audio primero.');
        return; 
    }

    const btn = document.getElementById('btnGenerarSRT');
    if (btn) { btn.innerText = "Generando SRT..."; btn.disabled = true; }

    try {
        notificar('info', `Generando SRT con ${maxPalabras} palabras...`);
        const res = await fetch(`${API_BASE}/api/generar-srt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath, textoOriginal, maxPalabras: parseInt(maxPalabras) })
        });
        const data = await res.json();
        if (res.ok) {
            if (!audioSigueActual(version)) return;
            if (window.appState && window.appState.subtitles) {
                window.appState.subtitles.srtUrl = data.srtUrl || null;
            }
            if (window.audioMarkers && data.srtUrl) {
                window.audioMarkers.cargarDesdeUrl(data.srtUrl, { forzar: true, silencioso: true });
            }
            const link = document.getElementById('btnDescargaSRT');
            if (link) {
                link.href = `${API_BASE}${data.srtUrl}?t=${Date.now()}`;
                link.setAttribute('download', `subtitulos_${Date.now()}.srt`);
                link.style.display = 'inline-flex';
                link.click();
            }
            notificar('success', 'SRT generado y descargado');
        } else {
            notificar('error', 'Error: ' + data.error);
        }
    } catch (error) {
        notificar('error', 'Error de conexión al generar SRT');
    } finally {
        if (btn) { btn.innerText = "Generar SRT"; btn.disabled = false; }
    }
}

async function generarYDescargarASS() {
    if (window.appFeatures?.subtitlesUI !== true) {
        notificar('warning', window.appFeatures?.subtitlesMaintenanceMessage || 'Subtítulos está temporalmente en mantenimiento.');
        return;
    }
    const audioPath = await rutaVozPersistida();
    const version = versionAudioActual();
    const textoOriginal = document.getElementById('resultado')?.value || '';
    const modo = document.getElementById('modo')?.value || 'normal';
    const maxPalabras = document.getElementById('palabrasSubtitulo')?.value || 7;
    const linkSRT = document.getElementById('btnDescargaSRT');
    const srtPath = (linkSRT && linkSRT.href && !linkSRT.href.startsWith('blob:')) 
                    ? linkSRT.href.replace(API_BASE, '').split('?')[0] : null;

    if (!audioPath) { 
        notificar('warning', 'Genera un audio primero.');
        return; 
    }

    const btn = document.getElementById('btnGenerarASS');
    if (btn) { btn.innerText = "Generando ASS..."; btn.disabled = true; }

    try {
        notificar('info', `Generando ASS con ${maxPalabras} palabras...`);
        const res = await fetch(`${API_BASE}/api/generar-ass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath, textoOriginal, modo, srtPath, maxPalabras: parseInt(maxPalabras) })
        });
        const data = await res.json();
        if (res.ok) {
            const link = document.getElementById('btnDescargaASS');
            if (!audioSigueActual(version)) return;
            if (link) {
                link.href = `${API_BASE}${data.assUrl}?t=${Date.now()}`;
                link.setAttribute('download', `subtitulos_efectos_${Date.now()}.ass`);
                link.style.display = 'inline-flex';
                link.click();
            }
            notificar('success', 'ASS generado y descargado');
        } else {
            notificar('error', 'Error: ' + data.error);
        }
    } catch (error) {
        notificar('error', 'Error de conexión al generar ASS');
    } finally {
        if (btn) { btn.innerText = "Generar ASS"; btn.disabled = false; }
    }
}

// ==========================================
// 5. VIDEO PNGTUBER
// ==========================================
function actualizarEtiquetaEscalaPNGTuber() {
    const input = document.getElementById('escalaPNGTuber');
    const etiqueta = document.getElementById('escalaPNGTuberValor');
    if (input && etiqueta) etiqueta.textContent = `${input.value}%`;
}

function obtenerOpcionesPNGTuber() {
    const resolucion = document.getElementById('resolucionPNGTuber')?.value || 'original';
    const escala = Number(document.getElementById('escalaPNGTuber')?.value || 100) / 100;
    return {
        resolucion,
        escala: Number.isFinite(escala) ? escala : 1
    };
}

function capturarEstadoPNGTuber({ demo = false } = {}) {
    return {
        fuente: demo ? null : window.videoAudioInput?.version() ?? JSON.stringify(versionAudioActual()),
        opciones: {
            idleImagePath: pngtuberIdlePath || null,
            talkingImagePath: pngtuberTalkingPath || null,
            blinkImagePath: pngtuberBlinkPath || null,
            fondo: document.getElementById('fondoPNGTuber')?.value || 'green',
            ...obtenerOpcionesPNGTuber()
        }
    };
}

function estadoPNGTuberActual(estado) {
    return JSON.stringify(estado) === JSON.stringify(capturarEstadoPNGTuber({ demo: estado.fuente === null }));
}

async function subirImagenPNGTuber(tipo = 'idle') {
    const ids = { idle: 'pngtuberIdleInput', talking: 'pngtuberTalkingInput', blink: 'pngtuberBlinkInput' };
    const inputId = ids[tipo] || 'pngtuberIdleInput';
    const input = document.getElementById(inputId);
    
    if (!input || !input.files || input.files.length === 0) {
        notificar('warning', `Selecciona una imagen ${tipo} antes de subirla.`);
        return;
    }
    
    const formData = new FormData();
    formData.append(tipo, input.files[0]);
    
    try {
        notificar('info', `Subiendo imagen ${tipo}...`);
        const res = await fetch(`${API_BASE}/api/upload-pngtuber`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
            const mensaje = data.error === 'Unexpected field'
                ? 'La app está desactualizada: ciérrala y vuelve a abrirla para aplicar los cambios.'
                : (data.error || 'Error al subir');
            throw new Error(mensaje);
        }
        
        if (tipo === 'talking') pngtuberTalkingPath = data.url;
        else if (tipo === 'blink') pngtuberBlinkPath = data.url;
        else pngtuberIdlePath = data.url;
        window.pngtuberIdlePath = pngtuberIdlePath;
        window.pngtuberTalkingPath = pngtuberTalkingPath;
        window.pngtuberBlinkPath = pngtuberBlinkPath;
        
        notificar('success', `Imagen ${tipo} cargada correctamente.`);
        actualizarPreviewPNGTuber();
    } catch (error) {
        console.error(error);
        notificar('error', error.message || 'Error al subir la imagen PNGTuber');
    } finally {
        ['resultado', 'textoEntrada'].forEach(id => {
            const el = document.getElementById(id);
            if (el) asegurarEditable(el);
        });
        if (input) input.value = '';
    }
}

async function actualizarPreviewPNGTuber() {
    const solicitud = ++revisionPreviewPNGTuber;
    const video = document.getElementById('previewPngtuberVideo');
    const placeholder = document.getElementById('previewPngtuberPlaceholder');
    const btn = document.getElementById('btnActualizarPreview');

    if (!video || !placeholder) return;

    if (!pngtuberIdlePath) {
        video.hidden = true;
        video.removeAttribute('src');
        placeholder.hidden = false;
        placeholder.textContent = 'Sube una imagen en reposo para ver la vista previa.';
        return;
    }

    if (previewEnCurso) { pendingPreview = true; return; }
    previewEnCurso = true;
    const textoBtn = btn ? btn.innerText : '';
    if (btn) { btn.innerText = 'Generando...'; btn.disabled = true; }

    const estado = capturarEstadoPNGTuber({ demo: true });
    const vigente = () => solicitud === revisionPreviewPNGTuber && estadoPNGTuberActual(estado);

    try {
        const res = await fetch(`${API_BASE}/api/pngtuber/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(estado.opciones)
        });
        const data = await res.json();
        if (!vigente()) return;
        if (!res.ok) throw new Error(data.error || 'Error al generar la vista previa');

        video.src = `${API_BASE}${data.url}?t=${Date.now()}`;
        video.loop = true;
        video.muted = true;
        video.autoplay = true;
        video.hidden = false;
        placeholder.hidden = true;
        video.load();
        video.play().catch(() => {});
    } catch (error) {
        if (!vigente()) return;
        console.error('Error generando vista previa:', error);
        notificar('error', error.message || 'Error al generar la vista previa.');
        video.hidden = true;
        placeholder.hidden = false;
    } finally {
        previewEnCurso = false;
        if (btn) { btn.innerText = textoBtn; btn.disabled = false; }
        if (pendingPreview) { pendingPreview = false; actualizarPreviewPNGTuber(); }
    }
}

async function generarVideoPNGTuber() {
    if (renderPNGTuberEnCurso) return false;
    renderPNGTuberEnCurso = true;
    const estado = capturarEstadoPNGTuber();
    const btnVideo = document.querySelector('.btn-video');
    const textoOriginalBtn = btnVideo ? btnVideo.innerText : 'Crear Video del Personaje';
    
    if (btnVideo) {
        btnVideo.innerText = 'Procesando video...';
        btnVideo.disabled = true;
    }
    
    try {
        let audioPath;
        try { audioPath = window.videoAudioInput ? await window.videoAudioInput.ruta() : await rutaVozPersistida(); }
        catch (error) {
            if (estadoPNGTuberActual(estado)) notificar('warning', error.message);
            return false;
        }
        if (!estadoPNGTuberActual(estado)) return false;
        if (!audioPath || audioPath.startsWith('blob:')) {
            notificar('warning', 'Selecciona un audio válido para generar el video.');
            return false;
        }
        const rutaLimpia = String(audioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
        notificar('info', 'Procesando video...');
        const res = await fetch(`${API_BASE}/api/generar-video-pngtuber`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioPath: rutaLimpia,
                ...estado.opciones
            })
        });
        const data = await res.json();
        if (!estadoPNGTuberActual(estado)) return false;
        if (res.ok) {
            notificar('success', '¡Video PNGTuber generado con éxito!');
            const ext = (data.video || '').toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
            const url = `${API_BASE}${data.video}`;
            const player = document.getElementById('videoPngtuberResultado');
            const placeholder = document.getElementById('placeholderVideoPngtuber');
            const btnDescargar = document.getElementById('descargarVideoPngtuber');

            if (player) {
                player.src = `${url}?t=${Date.now()}`;
                player.hidden = false;
                player.load();
            }
            if (placeholder) placeholder.hidden = true;
            if (btnDescargar) {
                btnDescargar.href = url;
                btnDescargar.download = `video_pngtuber.${ext}`;
                btnDescargar.hidden = false;
            }
        } else {
            notificar('error', 'Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        if (!estadoPNGTuberActual(estado)) return false;
        console.error('Error generando video:', error);
        notificar('error', 'Error de conexión al generar video.');
    } finally {
        renderPNGTuberEnCurso = false;
        if (btnVideo) {
            btnVideo.innerText = textoOriginalBtn;
            btnVideo.disabled = false;
        }
    }
}

// ==========================================
// 6. AUDIO AVANZADO
// ==========================================
function subirMusicaFondo() {
    if (window.electronAPI?.selectMusic && window.musicLibrary) return window.musicLibrary.elegir();
    const input = document.getElementById('backgroundMusicInput');
    if (!input || !input.files || input.files.length === 0) {
        notificar('warning', 'Selecciona un archivo de audio primero.');
        return;
    }
    
    const formData = new FormData();
    formData.append('music', input.files[0]);
    
    notificar('info', 'Subiendo música...');
    
    fetch(`${API_BASE}/api/upload-music`, { method: 'POST', body: formData })
    .then(response => response.json())
    .then((data) => {
        if (data.url) {
            musicaFondoPath = data.url;
            window.musicaFondoPath = data.url;
            if (window.audioEditor && typeof window.audioEditor.cargarMusica === 'function') {
                window.audioEditor.cargarMusica(`${API_BASE}${data.url}`);
            }
            notificar('success', 'Música de fondo subida');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        notificar('error', 'Error al subir música');
    });
}

async function recargarAudio() {
    if (window.audioEditor && window.audioEditor._currentUrl) {
        const ok = await window.audioEditor.cargarAudio(window.audioEditor._currentUrl, { conservarOriginal: true });
        if (ok) notificar('success', 'Audio recargado');
    }
}

async function aplicarDucking() {
    const btnDescargar = document.getElementById('btnDescargar');
    let voiceAudioPath = await rutaVozPersistida();
    const version = versionAudioActual();

    if (!voiceAudioPath || voiceAudioPath === window.location.href) {
        notificar('warning', 'Primero genera un audio de voz.');
        return;
    }
    if (voiceAudioPath.startsWith('blob:')) {
        notificar('warning', 'El audio actual es una versión editada temporal.');
        return;
    }
    if (window.musicLibrary && !await window.musicLibrary.prepararDucking()) return;
    if (!audioSigueActual(version)) return;
    const musicaActual = window.musicaFondoPath || musicaFondoPath;
    if (!musicaActual) {
        notificar('warning', 'Primero sube una música de fondo.');
        return;
    }

    const cleanVoicePath = String(voiceAudioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
    const cleanMusicPath = String(musicaActual).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
    
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
    
    notificar('info', 'Mezclando voz y música...');
    
    return fetch(`${API_BASE}/api/audio/apply-ducking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceAudioPath: cleanVoicePath, musicPath: cleanMusicPath, musicReferenceId: window.musicLibrary?.referencia() || undefined, options })
    })
    .then(response => response.json())
    .then(async (data) => {
        if (!audioSigueActual(version)) return;
        if (data.url) {
            voiceAudioRealPath = data.url;
            window.voiceAudioRealPath = data.url;
            if (!window.voiceAudioOriginalPath) window.voiceAudioOriginalPath = data.url;
            
            if (btnDescargar) {
                btnDescargar.href = `${API_BASE}${data.url}`;
                btnDescargar.setAttribute('download', `audio_con_musica_${Date.now()}.wav`);
            }
            const btnSRT = document.getElementById('btnDescargaSRT');
            if (btnSRT) btnSRT.style.display = 'inline-flex';
            const btnMP3 = document.getElementById('btnExportarMP3');
            if (btnMP3) btnMP3.style.display = 'inline-block';
            
            if (typeof window.cargarYReproducir === 'function') {
                await window.cargarYReproducir(data.url, null, null, { conservarMarcadores: true });
            }
            notificar('success', 'Mezcla aplicada correctamente.');
        } else {
            notificar('error', 'Error: ' + (data.error || 'Desconocido'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        notificar('error', 'Error de conexión al aplicar la mezcla');
    });
}

function subirVolumenMusica() { if (window.audioEditor) window.audioEditor.subirVolumen(10); }
function bajarVolumenMusica() { if (window.audioEditor) window.audioEditor.bajarVolumen(10); }
function mutearMusica() { if (window.audioEditor) window.audioEditor.mutear(); }
function cambiarVolumenMusica(valor) { if (window.audioEditor) window.audioEditor.cambiarVolumenDesdeSlider(valor); }

async function exportarAMp3() {
    let voiceAudioPath = await rutaVozPersistida();
    const version = versionAudioActual();
    
    if (!voiceAudioPath || voiceAudioPath === window.location.href) {
        notificar('warning', 'Primero genera un audio válido.');
        return;
    }
    if (voiceAudioPath.startsWith('blob:')) {
        notificar('warning', 'El audio actual es temporal. Genera uno nuevo primero.');
        return;
    }
    
    const btnMP3 = document.getElementById('btnExportarMP3');
    const htmlOriginal = btnMP3 ? btnMP3.innerHTML : '';
    if (btnMP3) { btnMP3.textContent = 'Convirtiendo...'; btnMP3.disabled = true; }
    
    try {
        notificar('info', 'Convirtiendo a MP3...');
        let rutaLimpia = String(voiceAudioPath).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0];
        const original = window.audioEditor?.asegurarOriginalPersistido
            ? await window.audioEditor.asegurarOriginalPersistido()
            : (window.voiceAudioOriginalPath || voiceAudioOriginalPath);
        let originalLimpia = original ? String(original).replace(API_BASE, '').replace(/^\/+/, '').split('?')[0] : null;
        if (!audioSigueActual(version)) return;
        
        const respuesta = await fetch(`${API_BASE}/api/audio/convertir-mp3`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wavPath: rutaLimpia, originalWavPath: originalLimpia })
        });
        const data = await respuesta.json();
        
        if (respuesta.ok) {
            const urls = data.urls || (data.url ? [data.url] : []);
            if (urls.length === 0) {
                notificar('error', 'Error: ' + (data.error || 'Desconocido'));
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
                notificar('success', 'Exportado a MP3 correctamente');
            }
        } else {
            notificar('error', 'Error: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error:', error);
        notificar('error', 'Error de conexión al exportar');
    } finally {
        if (btnMP3) {
            btnMP3.innerHTML = htmlOriginal || 'Descargar MP3';
            btnMP3.disabled = false;
        }
    }
}

// ==========================================
// 7. INSERTAR ETIQUETAS
// ==========================================
function insertarEtiqueta() {
    const selector = document.getElementById('tagSelector');
    const textarea = document.getElementById('textoEntrada');
    if (!selector || !textarea) return;
    
    const etiqueta = selector.value;
    if (!etiqueta) return;
    
    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const textoSeleccionado = textarea.value.substring(inicio, fin);
    
    let textoInsertar = '';
    let etiquetaPadre = etiqueta.includes(':') ? etiqueta.split(':')[0] : etiqueta;
    
    switch (etiquetaPadre) {
        case 'pause': textoInsertar = etiqueta === 'pause' ? '[pause]' : `[${etiqueta}]`; break;
        case 'slow': textoInsertar = textoSeleccionado ? `[${etiqueta}]${textoSeleccionado}[/slow]` : `[${etiqueta}]texto lento[/slow]`; break;
        case 'fast': textoInsertar = textoSeleccionado ? `[${etiqueta}]${textoSeleccionado}[/fast]` : `[${etiqueta}]texto rápido[/fast]`; break;
        case 'rate': textoInsertar = textoSeleccionado ? `[rate:+5]${textoSeleccionado}[/rate]` : '[rate:+5]texto[/rate]'; break;
        case 'pitch': textoInsertar = textoSeleccionado ? `[${etiqueta}]${textoSeleccionado}[/pitch]` : `[${etiqueta}]texto[/pitch]`; break;
        case 'soft': textoInsertar = textoSeleccionado ? `[soft]${textoSeleccionado}[/soft]` : '[soft]texto suave[/soft]'; break;
        case 'loud': textoInsertar = textoSeleccionado ? `[loud]${textoSeleccionado}[/loud]` : '[loud]texto fuerte[/loud]'; break;
        case 'vol': textoInsertar = textoSeleccionado ? `[${etiqueta}]${textoSeleccionado}[/vol]` : `[${etiqueta}]texto[/vol]`; break;
        case 'emphasis': textoInsertar = textoSeleccionado ? `[emphasis]${textoSeleccionado}[/emphasis]` : '[emphasis]¡Importante![/emphasis]'; break;
        case 'spell': textoInsertar = textoSeleccionado ? `[spell]${textoSeleccionado}[/spell]` : '[spell]HOLA[/spell]'; break;
        case 'laugh': case 'sigh': case 'scream': case 'cry': case 'whisper':
        case 'angry': case 'happy': case 'sad': case 'surprise': case 'fear':
            textoInsertar = textoSeleccionado ? `[${etiquetaPadre}]${textoSeleccionado}[/${etiquetaPadre}]` : `[${etiquetaPadre}]texto[/${etiquetaPadre}]`; break;
        case 'voz': textoInsertar = textoSeleccionado ? `[voz:Jorge]${textoSeleccionado}[/voz]` : '[voz:Jorge]texto[/voz]'; break;
        default: textoInsertar = etiqueta;
    }
    
    textarea.value = textarea.value.substring(0, inicio) + textoInsertar + textarea.value.substring(fin);
    const nuevaPosicion = inicio + textoInsertar.length;
    textarea.focus();
    textarea.setSelectionRange(nuevaPosicion, nuevaPosicion);
    
    selector.value = '';
    notificar('info', `Etiqueta [${etiqueta}] insertada`);
}

// ==========================================
// 8. INSERTAR EXPRESIONES RÁPIDAS
// ==========================================
function insertarExpresionRapida() {
    const selector = document.getElementById('expresionRapidaSelector');
    const textarea = document.getElementById('textoEntrada');
    if (!selector || !textarea) return;
    
    const expresion = selector.value;
    if (!expresion) return;
    
    const expresionesMap = {
        'hola': '¡Hola!', 'hey': '¡Hey!', 'buenos-dias': '¡Buenos días!',
        'buenas-tardes': '¡Buenas tardes!', 'buenas-noches': '¡Buenas noches!',
        'que-tal': '¿Qué tal?', 'como-estas': '¿Cómo estás?',
        'que': '¿Qué?', 'como': '¿Cómo?', 'por-que': '¿Por qué?',
        'cuando': '¿Cuándo?', 'donde': '¿Dónde?', 'quien': '¿Quién?',
        'eh': 'Eh...', 'este': 'Este...', 'bueno': 'Bueno...',
        'pues': 'Pues...', 'entonces': 'Entonces...', 'o sea': 'O sea...',
        'mira': 'Mira...', 'oye': 'Oye...',
        'wow': '¡Wow!', 'genial': '¡Genial!', 'increible': '¡Increíble!',
        'no-way': '¡No way!', 'que-loco': '¡Qué loco!', 'en-serio': '¿En serio?'
    };

    // Emociones: se insertan como etiqueta con apertura y cierre, envolviendo
    // el texto seleccionado (o una palabra de ejemplo) para que el motor de voz
    // SAPI las aplique. Una etiqueta suelta como [laugh] no hace nada.
    const emocionesMap = {
        'risa': 'laugh', 'suspiro': 'sigh', 'grito': 'scream',
        'llanto': 'cry', 'susurro': 'whisper', 'enojado': 'angry',
        'feliz': 'happy', 'triste': 'sad', 'sorpresa': 'surprise', 'miedo': 'fear'
    };

    const inicio = textarea.selectionStart;
    const fin = textarea.selectionEnd;
    const seleccionado = textarea.value.substring(inicio, fin);

    let textoInsertar;
    let selDesde;
    let selHasta;

    if (emocionesMap[expresion]) {
        const tag = emocionesMap[expresion];
        const contenido = seleccionado || 'texto';
        textoInsertar = `[${tag}]${contenido}[/${tag}]`;

        if (seleccionado) {
            selDesde = inicio;
            selHasta = inicio + textoInsertar.length;
        } else {
            // Selecciona la palabra de ejemplo para poder reescribirla directamente.
            selDesde = inicio + tag.length + 2;
            selHasta = selDesde + contenido.length;
        }
    } else {
        textoInsertar = expresionesMap[expresion];
        if (!textoInsertar) return;
        selDesde = inicio + textoInsertar.length;
        selHasta = selDesde;
    }

    textarea.value = textarea.value.substring(0, inicio) + textoInsertar + textarea.value.substring(fin);

    textarea.focus();
    textarea.setSelectionRange(selDesde, selHasta);

    selector.value = '';
    notificar('info', `Expresión "${textoInsertar}" insertada`);
}

// ==========================================
// 9. ATAJOS E INICIALIZACIÓN
// ==========================================
document.addEventListener('keydown', (e) => {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName : '';
    const enCampo = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON'
        || tag === 'VIDEO' || tag === 'AUDIO' || (target && target.isContentEditable);
    if (enCampo) return;

    if (e.code === 'Space') {
        const tabVideo = document.getElementById('tab-video');
        const player = document.getElementById('videoPngtuberResultado');
        const videoListo = tabVideo && tabVideo.classList.contains('tab-panel-activo')
            && player && !player.hidden && player.src;
        e.preventDefault();
        if (videoListo) {
            if (player.paused) player.play().catch(() => {});
            else player.pause();
        } else if (window.audioEditor && window.audioEditor.wavesurfer) {
            window.audioEditor.playPause();
        }
    }
    if (e.code === 'Delete' || e.code === 'Backspace') { if (window.audioEditor) window.audioEditor.eliminarSeleccion(); }
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); if (window.audioEditor) window.audioEditor.deshacer(); }
    if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); if (window.audioEditor) window.audioEditor.rehacer(); }
    if (e.code === 'KeyM') { if (window.audioEditor) window.audioEditor.mutear(); }
    if (e.code === 'Escape') { cerrarAyuda(); cerrarVentanaTesters(); }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.dictionaryEditor && typeof window.dictionaryEditor.loadAll === 'function') {
        window.dictionaryEditor.loadAll();
    }
    
    document.querySelectorAll('textarea').forEach(ta => {
        ta.setAttribute('spellcheck', 'false');
    });
    
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
    
    // ✅ CARGAR VOCES DINÁMICAMENTE
    cargarVoces();
    
    // ✅ CONTADOR DE CARACTERES
    const textoEntrada = document.getElementById('textoEntrada');
    const contador = document.getElementById('contadorCaracteres');
    if (textoEntrada && contador) {
        contador.innerText = `Caracteres: ${textoEntrada.value.length}`;
        textoEntrada.addEventListener('input', () => {
            const longitud = textoEntrada.value.length;
            contador.innerText = `Caracteres: ${longitud}`;
            contador.style.color = longitud > 3000 ? '#e74c3c' : '#888';
        });
    }
    
    // Checkbox de Expresiones Rápidas
    const chkExpresionesRapidas = document.getElementById('chkExpresionesRapidas');
    const expresionesRapidasContainer = document.getElementById('expresionesRapidasContainer');
    if (chkExpresionesRapidas && expresionesRapidasContainer) {
        chkExpresionesRapidas.addEventListener('change', () => {
            expresionesRapidasContainer.style.display = chkExpresionesRapidas.checked ? 'block' : 'none';
        });
    }
    
    actualizarEtiquetaEscalaPNGTuber();

    if (window.appFeatures?.languageTool === false) {
        const btnLT = document.getElementById('btnCorregirTexto');
        if (btnLT) {
            btnLT.disabled = true;
            btnLT.title = 'LanguageTool desactivado por optimización';
            btnLT.style.opacity = '0.6';
            btnLT.style.cursor = 'not-allowed';
        }
        const panelLT = document.querySelector('[data-help-section="correccion-ortografica"] p');
        if (panelLT) {
            panelLT.textContent = 'Corrección con LanguageTool desactivada por optimización. Los diccionarios locales y optimización siguen activos.';
        }
    }

    console.log('✅ Loquendo Studio cargado y listo');
    notificar('success', 'Loquendo Studio listo para usar');
});

// ==========================================
// 10. MODALES
// ==========================================
function abrirVentanaTesters() {
    const modal = document.getElementById('modalTesters');
    if (modal) modal.style.display = 'flex';
}

function cerrarVentanaTesters() {
    const modal = document.getElementById('modalTesters');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('click', (e) => {
    const modalAyuda = document.getElementById('modalAyuda');
    const modalTesters = document.getElementById('modalTesters');
    if (modalAyuda && e.target === modalAyuda) cerrarAyuda();
    if (modalTesters && e.target === modalTesters) cerrarVentanaTesters();
});

// ==========================================
// 11. EXPOSICIÓN GLOBAL
// ==========================================
window.cambiarTema = cambiarTema;
window.cambiarDiseno = cambiarDiseno;
window.abrirAyuda = abrirAyuda;
window.cerrarAyuda = cerrarAyuda;
window.abrirEnlaceExterno = abrirEnlaceExterno;
window.optimizar = optimizar;
window.generarAudio = generarAudio;
window.automatizarTodo = automatizarTodo;
window.subirImagenPNGTuber = subirImagenPNGTuber;
window.actualizarPreviewPNGTuber = actualizarPreviewPNGTuber;
window.actualizarEtiquetaEscalaPNGTuber = actualizarEtiquetaEscalaPNGTuber;
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
window.insertarEtiqueta = insertarEtiqueta;
window.insertarExpresionRapida = insertarExpresionRapida;
window.notificar = notificar;
window.cargarVoces = cargarVoces;
window.corregirTexto = corregirTexto;

console.log('✅ Funciones expuestas globalmente. ¡Listo para usar!');
