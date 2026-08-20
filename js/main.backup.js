let diccionarioServidor = {};
let diccionarioJergas = {};
let diccionarioSinonimos = {};
let textoBaseParaAprender = "";
let musicaFondoPath = null;
let voiceAudioRealPath = null;

// ==========================================
// 1. CARGA DE DATOS
// ==========================================
async function cargarDiccionario() {
    try {
        const resJer = await fetch('http://localhost:3000/api/jergas');
        if (resJer.ok) diccionarioJergas = await resJer.json();
        
        const resSin = await fetch('http://localhost:3000/api/sinonimos');
        if (resSin.ok) diccionarioSinonimos = await resSin.json();
        
        console.log("¡Zas! Diccionarios cargados.");
    } catch (error) {
        console.error("Error al sincronizar:", error);
    }
}

// ==========================================
// 2. MOTOR DE TEXTO (EQUILIBRADO Y NATURAL)
// ==========================================
function optimizar() {
    const entrada = document.getElementById("textoEntrada").value;
    const modo = document.getElementById("modo").value;
    const salida = document.getElementById("resultado");
    
    if (!entrada || entrada.trim() === "") {
        return alert("Escribe algo en el cuadro de texto primero.");
    }
    
    let texto = entrada.trim();
    
    // 1. Filtro de Sinónimos
    if (document.getElementById("chkSinonimos")?.checked) {
        const elegirSinonimo = (valor) => {
            if (Array.isArray(valor)) {
                return valor[Math.floor(Math.random() * valor.length)];
            }
            return valor;
        };
        for (let s in diccionarioSinonimos) {
            texto = texto.replace(new RegExp(`\\b${s}\\b`, "gi"), elegirSinonimo(diccionarioSinonimos[s]));
        }
    }
    
    // 2. Filtro de Jergas y Palabras Fijas
    if (document.getElementById("chkNeutro")?.checked) {
        for (let j in diccionarioJergas) {
            texto = texto.replace(new RegExp(`\\b${j}\\b`, "gi"), diccionarioJergas[j]);
        }
        const fijas = [{ o: /\bpe\b/gi, r: "" }, { o: /\bcausa\b/gi, r: "amigo" }, { o: /\bchamba\b/gi, r: "trabajo" }];
        fijas.forEach(f => texto = texto.replace(f.o, f.r));
    }
    
    // 3. Filtro de Fonética Loquendo
    if (document.getElementById("chkLoquendo")?.checked) {
        for (let a in diccionarioServidor) {
            texto = texto.replace(new RegExp(`\\b${a}\\b`, "gi"), diccionarioServidor[a]);
        }
        const reglas = [/sql/gi, /xq/gi, /tb/gi];
        const rep = ["ese-cu-ele", "porque", "también"];
        reglas.forEach((r, i) => texto = texto.replace(r, rep[i]));
    }
    
    // 4. PUNTUACIÓN INTELIGENTE
    if (document.getElementById("chkComas")?.checked) {
        texto = texto.replace(/\s+([,.!?])/g, "$1");
        texto = texto.replace(/^(Hola|Bueno|Pues|Entonces|Así que|Oye)\b/gi, "$1,");
        const conectores = ["pero", "aunque", "sin embargo", "además", "entonces", "no obstante", "mientras", "donde", "porque", "ya que"];
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
    
    // 5. Modo Gameplay
    if (modo === "gameplay") {
        texto = texto.replace(/!/g, "!!! ");
    }
    
    // 6. Puntos finales inteligentes
    if (document.getElementById("chkPuntos")?.checked) {
        texto = texto.replace(/\.([^\s])/g, ". $1");
        if (!/[.!?]$/.test(texto)) {
            texto += ".";
        }
    }
    
    // 7. Capitalizar primera letra
    const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
    textoBaseParaAprender = textoFinal; 
    
    if (salida) {
        salida.value = textoFinal;
        salida.readOnly = false;
        salida.disabled = false;
    }
    console.log("✅ Texto optimizado con puntuación natural");
}

// ==========================================
// 3. PIPELINE DE AUDIO Y APRENDIZAJE
// ==========================================
async function generarAudio(event) {
    // 🛡️ PREVENIR RECARGA DE PÁGINA (Si el botón está dentro de un <form>)
    if (event) {
        event.preventDefault();
    }

    const btn = document.querySelector(".btn-audio");
    const resultado = document.getElementById("resultado");
    const textoEntrada = document.getElementById("textoEntrada");
    const textoFinal = resultado ? resultado.value : "";

    if (!textoFinal || textoFinal === "El texto aparecerá aquí...") {
        return alert("¡Asu! Primero debes automatizar un texto.");
    }

    if (btn) {
        btn.innerText = "Procesando Pipeline... ⏳";
        btn.disabled = true;
    }

    try {
        const respuesta = await fetch('http://localhost:3000/api/generar-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                texto: textoFinal,
                voz: document.getElementById('vozSeleccionada').value,
                usarIA: document.getElementById('chkSRT_IA')?.checked
            })
        });

        if (respuesta.ok) {
            const data = await respuesta.json();
            // ✅ Guardar la ruta real del audio (URL directa, NO blob, para evitar OOM en el renderer)
            voiceAudioRealPath = data.url;
            
            if (typeof cargarYReproducir === 'function') {
                // Pasamos la URL directa para que WaveSurfer la cargue por streaming de forma eficiente
                cargarYReproducir(data.url, data.srt);
            }
        } else {
            const errorData = await respuesta.json();
            alert("¡Asu! Error: " + (errorData.error || "El servidor falló"));
        }
    } catch (error) {
        console.error("Error fatal en red:", error);
        alert("¿Prendiste el servidor? No hay conexión.");
    } finally {
        if (btn) {
            btn.innerText = "🎙️ Generar Audio Loquendo";
            btn.disabled = false;
        }
        if (resultado) {
            resultado.readOnly = false;
            resultado.disabled = false;
            resultado.focus();
        }
        if (textoEntrada) {
            textoEntrada.readOnly = false;
            textoEntrada.disabled = false;
        }
    }
}

// ==========================================
// 4. INTERFAZ Y MEMORIA
// ==========================================
function cambiarTema() {
    const h = document.documentElement;
    h.setAttribute("data-theme", h.getAttribute("data-theme") === "light" ? "dark" : "light");
}

function cambiarDiseno() {
    document.querySelector('.contenedor-flexible')?.classList.toggle('modo-columnas');
}

async function guardarPalabra() {
    const original = document.getElementById("palabraNueva").value.trim().toLowerCase();
    const reemplazo = document.getElementById("significadoNuevo").value.trim().toLowerCase();
    const tipo = "jergas";
    
    if (original && reemplazo) {
        try {
            let valorFinal = reemplazo;
            if (reemplazo.includes(',')) {
                valorFinal = reemplazo.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            const res = await fetch(`http://localhost:3000/api/${tipo}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ original, reemplazo: valorFinal })
            });
            if (res.ok) { 
                alert("Aprendido con éxito"); 
                document.getElementById("palabraNueva").value = "";
                document.getElementById("significadoNuevo").value = "";
                cargarDiccionario(); 
            }
        } catch (e) {
            alert("Error de conexión al guardar");
        }
    } else {
        alert("Escribe una palabra y su significado");
    }
}

async function borrarMemoria() {
    if (confirm("¿Borrar todos los registros de los diccionarios y tu perfil de usuario?")) {
        try {
            await fetch('http://localhost:3000/api/diccionario', { method: 'DELETE' });
            alert("Memoria borrada");
            location.reload();
        } catch (e) {
            alert("Error al borrar");
        }
    }
}

async function automatizarTodo() {
    optimizar();
    await new Promise(resolve => setTimeout(resolve, 100));
    await generarAudio();
}

// ==========================================
// 5. GENERADOR DE VIDEO PNGTUBER
// ==========================================
async function generarVideoPNGTuber() {
    const btnDescargar = document.getElementById('btnDescargar');
    const audioElement = document.getElementById('audioReproductor');
    let audioPath = null;
    
    if (audioElement && audioElement.src && !audioElement.src.includes('blob:')) {
        audioPath = audioElement.src;
    } else if (btnDescargar && btnDescargar.href && btnDescargar.href !== window.location.href) {
        audioPath = btnDescargar.href;
    }

    if (!audioPath) {
        return alert('⚠️ Primero genera un audio válido.');
    }

    let rutaLimpia = audioPath.replace('http://localhost:3000', '');
    rutaLimpia = rutaLimpia.split('?')[0];
    
    const btnVideo = document.querySelector('.btn-video');
    const textoOriginalBtn = btnVideo ? btnVideo.innerText : 'Generar Video PNGTuber';
    
    if (btnVideo) {
        btnVideo.innerText = '⏳ Procesando video...';
        btnVideo.disabled = true;
    }

    try {
        const res = await fetch('http://localhost:3000/api/generar-video-pngtuber', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioPath: rutaLimpia })
        });
        const data = await res.json();
        
        if (res.ok) {
            alert('✅ ¡Video PNGTuber generado con éxito!');
            const link = document.createElement('a');
            link.href = `http://localhost:3000${data.video}`;
            link.download = 'video_pngtuber.mp4';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert('❌ Error al generar el video:\n' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        alert('Error de conexión con el servidor.');
    } finally {
        if (btnVideo) {
            btnVideo.innerText = textoOriginalBtn;
            btnVideo.disabled = false;
        }
    }
}

// ==========================================
// 6. 🎵 MÚSICA DE FONDO Y DUCKING
// ==========================================
function subirMusicaFondo() {
    const input = document.getElementById('backgroundMusicInput');
    if (!input.files || input.files.length === 0) {
        alert('Selecciona un archivo de audio primero.');
        return;
    }

    const formData = new FormData();
    formData.append('music', input.files[0]);
    
    fetch('http://localhost:3000/api/upload-music', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.url) {
            musicaFondoPath = data.url;
            if (window.audioEditor && typeof window.audioEditor.cargarMusica === 'function') {
                const urlCompleta = `http://localhost:3000${data.url}`;
                window.audioEditor.cargarMusica(urlCompleta);
            }
            alert('✅ Música de fondo subida y cargada en waveform');
        }
    })
    .catch(error => {
        console.error('Error al subir música:', error);
        alert('Error al subir la música de fondo');
    });
}

function aplicarDucking() {
    const voiceAudioPath = voiceAudioRealPath || document.getElementById('btnDescargar')?.href || '';
    
    if (!voiceAudioPath) {
        alert('Primero genera un audio de voz.');
        return;
    }
    
    if (voiceAudioPath.startsWith('blob:')) {
        alert('⚠️ El audio actual es una versión editada temporal. Para aplicar Ducking, genera un audio nuevo primero.');
        return;
    }
    
    if (!musicaFondoPath) {
        alert('Primero sube una música de fondo.');
        return;
    }

    const options = {
        musicVolume: 0.3,
        duckAmount: 0.15,
        loopMusic: document.getElementById('chkLoopMusica')?.checked || false,
        fadeInMusic: parseFloat(document.getElementById('fadeInMusicaDuration')?.value) || 2,
        fadeOutMusic: parseFloat(document.getElementById('fadeOutMusicaDuration')?.value) || 3
    };

    fetch('http://localhost:3000/api/audio/apply-ducking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            voiceAudioPath: voiceAudioPath.replace('http://localhost:3000', '').split('?')[0],
            musicPath: musicaFondoPath,
            options
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.url) {
            //para el boton mp3 y srt        
            voiceAudioRealPath = data.url; 
            const btnDescargar = document.getElementById('btnDescargar');
            if (btnDescargar) {
                btnDescargar.href = `http://localhost:3000${data.url}`;
            }
                    const btnMP3 = document.getElementById('btnExportarMP3');
        if (btnMP3) {
            btnMP3.style.display = "inline-block";
        }
            const btnSRT = document.getElementById('btnDescargaSRT');
            if (btnSRT) {
                btnSRT.style.display = 'inline-flex'; 
            }
            if (typeof cargarYReproducir === 'function') {
                cargarYReproducir(data.url);
            }
            alert('✅ Ducking aplicado. ¡Audio y música fusionados!');
        } else {
            alert('Error: ' + (data.error || 'Desconocido'));
        }
    })
    .catch(error => {
        console.error('Error al aplicar ducking:', error);
        alert('Error de conexión con el servidor');
    });
}

// ==========================================
// 7. 🎛️ CONTROL DE VOLUMEN DE MÚSICA
// ==========================================
function subirVolumenMusica() {
    if (window.audioEditor && typeof window.audioEditor.subirVolumen === 'function') {
        window.audioEditor.subirVolumen(10);
    }
}

function bajarVolumenMusica() {
    if (window.audioEditor && typeof window.audioEditor.bajarVolumen === 'function') {
        window.audioEditor.bajarVolumen(10);
    }
}

function mutearMusica() {
    if (window.audioEditor && typeof window.audioEditor.mutear === 'function') {
        window.audioEditor.mutear();
    }
}

function cambiarVolumenMusica(valor) {
    if (window.audioEditor && typeof window.audioEditor.cambiarVolumenDesdeSlider === 'function') {
        window.audioEditor.cambiarVolumenDesdeSlider(valor);
    }
}

// ==========================================
// 8. ⌨️ ATAJOS DE TECLADO PROFESIONALES
// ==========================================
document.addEventListener('keydown', (e) => {
    // 1. SEGURIDAD: Si el usuario está escribiendo en un TEXTAREA o INPUT, ignorar atajos.
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        return;
    }

    // 2. ATAJO: ESPACIO = Play / Pausa
    if (e.code === 'Space') {
        e.preventDefault();
        if (window.audioEditor && window.audioEditor.wavesurfer) {
            window.audioEditor.playPause();
        }
    }
    
    // 3. ATAJO: DELETE o BACKSPACE = Eliminar región seleccionada
    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (window.audioEditor && typeof window.audioEditor.eliminarSeleccion === 'function') {
            window.audioEditor.eliminarSeleccion();
        }
    }
    
    // 4. ATAJO: CTRL + Z = Deshacer
    if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault();
        if (window.audioEditor && typeof window.audioEditor.deshacer === 'function') {
            window.audioEditor.deshacer();
        }
    }
    
    // 5. ATAJO: CTRL + Y = Rehacer
    if (e.ctrlKey && e.code === 'KeyY') {
        e.preventDefault();
        if (window.audioEditor && typeof window.audioEditor.rehacer === 'function') {
            window.audioEditor.rehacer();
        }
    }
    
    // 6. ATAJO: M = Silenciar / Activar música de fondo
    if (e.code === 'KeyM') {
        if (window.audioEditor && typeof window.audioEditor.mutear === 'function') {
            window.audioEditor.mutear();
        }
    }
});
console.log('✅ Atajos de teclado registrados (Espacio, Delete, Ctrl+Z, Ctrl+Y, M)');


// ==========================================
// 9. EXPORTAR A MP3
// ==========================================
async function exportarAMp3() {
    const voiceAudioPath = voiceAudioRealPath || document.getElementById('btnDescargar')?.href || '';
    
    if (!voiceAudioPath) {
        return alert('Primero genera un audio válido.');
    }
    
    if (voiceAudioPath.startsWith('blob:')) {
        return alert('️ El audio actual es una versión editada temporal. Para exportar a MP3, genera un audio nuevo primero.');
    }

    const btnMP3 = document.getElementById('btnExportarMP3');
    const textoOriginal = btnMP3 ? btnMP3.innerText : '🎵 Exportar a MP3';
    
    if (btnMP3) {
        btnMP3.innerText = '⏳ Convirtiendo...';
        btnMP3.disabled = true;
    }

    try {
        const rutaLimpia = voiceAudioPath.replace('http://localhost:3000', '').split('?')[0];
        
        const respuesta = await fetch('http://localhost:3000/api/audio/convertir-mp3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wavPath: rutaLimpia })
        });

        const data = await respuesta.json();

        if (respuesta.ok && data.url) {
            // Crear enlace de descarga automática
            const link = document.createElement('a');
            link.href = `http://localhost:3000${data.url}`;
            link.download = `audio_loquendo_${Date.now()}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            alert('✅ Audio exportado a MP3 correctamente');
        } else {
            alert(' Error al convertir: ' + (data.error || 'Desconocido'));
        }
    } catch (error) {
        console.error('Error al exportar MP3:', error);
        alert('Error de conexión con el servidor');
    } finally {
        if (btnMP3) {
            btnMP3.innerText = textoOriginal;
            btnMP3.disabled = false;
        }
    }
}

// ==========================================
// 10. INICIALIZACIÓN Y BLINDAJE DE EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    cargarDiccionario();
    
    const resultado = document.getElementById("resultado");
    if (resultado) {
        resultado.readOnly = false;
        resultado.disabled = false;
        console.log("✅ Textarea de resultado inicializado como editable");
    }

    // 🛡️ BLINDAJE EXTRA: Asegurar que el clic en el botón de generar NUNCA recargue la página
    const btnGenerar = document.querySelector('.btn-audio');
    if (btnGenerar) {
        // Eliminamos cualquier onclick inline antiguo para evitar conflictos
        btnGenerar.removeAttribute('onclick');
        // Forzamos type="button" por si está dentro de un <form>
        btnGenerar.setAttribute('type', 'button');
        // Adjuntamos el listener con preventDefault garantizado
        btnGenerar.addEventListener('click', generarAudio);
    }
});

document.getElementById('textoEntrada').addEventListener('input', function() {
    const contador = document.getElementById('contadorCaracteres');
    const longitud = this.value.length;
    contador.innerText = `Caracteres: ${longitud}`;
    
    if (longitud > 3000) {
        contador.style.color = '#e74c3c'; // Rojo
        contador.innerText += ' ⚠️ (Texto muy largo. Se recomienda dividir en bloques para evitar lentitud)';
    } else {
        contador.style.color = '#2ecc71'; // Verde
    }
});