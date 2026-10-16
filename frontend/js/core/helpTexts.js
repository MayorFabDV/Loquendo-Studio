window.HELP_TEXTS = {
    controles: {
        // Header
        logoTesters: "Ver Testers",
        btnAjustes: "Ajustes: tema, mostrar/ocultar ayudas y sonidos de notificación.",
        btnAyuda: "Abrir la Ayuda Rápida",
        btnApoyar: "Apoyar el proyecto en Ko-fi (abre el navegador)",

        // Entrada de texto
        textoEntrada: "Escribe o pega aquí tu guion. Este texto se convierte en voz con la voz seleccionada.",
        chkExpresionesRapidas: "Mostrar el selector de expresiones rápidas (saludos, muletillas y emociones).",
        expresionRapidaSelector: "Inserta una expresión en la posición del cursor (ej: ¡Hola!, suspiro, risa).",
        modo: "Estilo de narración: adapta pausas, comas y énfasis del texto antes de generar el audio.",
        tagSelector: "Inserta etiquetas de voz ([pause], [slow], [pitch], [voz:Jorge]…) en el texto.",

        // Motor de voz
        vozSeleccionada: "Voz que leerá el texto (Loquendo, Acapella o Microsoft).",
        calidadSeleccionada: "Calidad del audio generado: nativa 48 kHz, o reducida a 44/22/16 kHz mono.",
        btnOptimizar: "Aplica diccionarios, estilo de narración, ortografía y puntuación al texto.",
        btnGenerarAudio: "Convierte el texto optimizado en audio usando la voz seleccionada.",
        btnProcesoMaestro: "Hace todo seguido: optimiza el texto y genera el audio automáticamente.",

        // Texto optimizado
        resultado: "Texto optimizado. Es editable: puedes retocarlo antes de generar el audio.",
        btnCorregirTexto: "Corrige ortografía y gramática con LanguageTool (se ejecuta en tu equipo).",

        // Video del personaje
        fondoPNGTuber: "Color de fondo del video: verde (para quitar el fondo), negro o transparente.",
        pngtuberIdleInput: "Sube la imagen PNG del personaje en reposo.",
        pngtuberTalkingInput: "Sube la imagen PNG del personaje hablando.",
        btnRenderVideo: "Genera el video MP4 con el audio y las imágenes del personaje (en reposo y hablando).",

        // Reproductor y editor
        editorZoomOut: "Alejar la onda",
        editorResetZoom: "Volver al zoom original de la onda",
        editorZoomIn: "Acercar la onda",
        btnReiniciar: "Volver al inicio del audio",
        btnPlay: "Reproducir o pausar",
        btnDetener: "Detener la reproducción",
        btnCortar: "Cortar y eliminar la selección de la onda",
        fadeInDuration: "Cuántos segundos tarda en subir la voz al empezar.",
        fadeOutDuration: "Cuántos segundos tarda en bajar la voz al terminar.",
        btnAplicarFadeIn: "Hace que la voz suba poco a poco al empezar.",
        btnAplicarFadeOut: "Hace que la voz baje poco a poco al terminar.",
        fadeInMusicaDuration: "Cuántos segundos tarda en subir la música al empezar (cuando se mezcla).",
        fadeOutMusicaDuration: "Cuántos segundos tarda en bajar la música al terminar (cuando se mezcla).",
        btnNormalizar: "Sube el volumen de la voz al máximo sin que se distorsione.",
        btnQuitarSilencios: "Elimina automáticamente las pausas y silencios largos.",

        // Música y mezcla
        backgroundMusicInput: "Selecciona el archivo de música de fondo (se sube al pulsar Cargar Pista).",
        btnCargarPista: "Sube la música de fondo seleccionada.",
        chkLoopMusica: "Repite la música en bucle si es más corta que la voz.",
        duckingThreshold: "Nivel de voz a partir del cual se baja la música (más bajo = más sensible).",
        duckingRatio: "Cuánto baja la música cuando habla la voz (mayor = más bajada).",
        btnMezclarAudio: "Mezcla voz y música: baja la música automáticamente cuando habla la voz.",
        musicaVolumeSlider: "Volumen de la música de fondo respecto a la voz.",
        btnVolumenMas: "Subir el volumen de la música.",
        btnVolumenMenos: "Bajar el volumen de la música.",
        btnMuteMusica: "Silenciar o reactivar la música de fondo.",

        // Subtítulos
        palabrasSubtitulo: "Máximo de palabras por subtítulo (3-5 TikTok, 5-7 YouTube, 7-10 tutorial).",
        chkSubtitulosDinamicos: "Genera subtítulos dinámicos de frases cortas en lugar de líneas largas.",
        btnGenerarSRT: "Genera y descarga los subtítulos en formato SRT.",
        btnGenerarASS: "Genera y descarga los subtítulos en formato ASS (con efectos).",

        // Descargas
        btnDescargarWAV: "Descarga el audio final en formato WAV.",
        btnDescargaSRT: "Descarga el último SRT generado.",
        btnDescargaASS: "Descarga el último ASS generado.",
        btnExportarMP3: "Convierte y descarga el audio final en MP3.",

        // Ajustes de automatización
        chkComas: "Auto-Puntuación: añade comas en conectores y saludos, y elimina comas antinaturales.",
        chkPuntos: "Auto-Puntos de Pausa: parte las oraciones largas en puntos, cortando en las comas (priorizando las que preceden a conectores) para marcar pausas de lectura.",
        chkOrtografia: "Corrección Ortográfica: aplica tu diccionario de ortografía personalizado.",
        chkGramatica: "Corrección Gramatical: aplica tu diccionario de gramática personalizado.",
        chkPuntuacion: "Puntuación Inteligente: ajusta los signos para que la lectura sea fluida.",
        chkLoquendo: "Corrección Fonética: ajusta palabras para que se pronuncien correctamente.",
        chkNeutro: "Neutralizar Español: reemplaza jergas y regionalismos por palabras neutras.",
        chkSinonimos: "Variación por Sinónimos: cambia palabras al azar para evitar repeticiones.",
        chkSRT_IA: "SRT con IA: genera subtítulos con Whisper al crear el audio."
    },

    secciones: {
        "entrada-texto": {
            titulo: "Guion y Entrada de Texto",
            contenido: "Escribe o pega aquí el guion completo que quieres convertir en voz.\n\n• El contador muestra el largo del texto (se pone en rojo al superar 3000 caracteres).\n• Puedes insertar Expresiones Rápidas y Etiquetas de voz con los selectores de abajo.\n• El estilo de narración se elige en 'Estilo de Narración'.\n\nPulsa 'Optimizar Texto' para aplicar los ajustes, o 'Generar Audio' si usas un texto ya listo."
        },
        "expresiones-rapidas": {
            titulo: "Expresiones Rápidas",
            contenido: "Atajos para insertar frases y emociones frecuentes en el punto donde tengas el cursor.\n\n• Saludos, preguntas, muletillas y reacciones insertan texto normal.\n• Las emociones (risa, suspiro, grito, susurro…) envuelven el texto seleccionado con una etiqueta, por ejemplo [laugh]texto[/laugh], que la voz interpreta con otro tono, velocidad o volumen.\n• Selecciona primero el texto y luego elige la emoción, o elige la emoción y escribe dentro de la etiqueta.\n\nActiva la casilla para mostrar el selector."
        },
        "modo-narracion": {
            titulo: "Estilo de Narración",
            contenido: "Define cómo se adapta el texto antes de generar el audio:\n\n• Estándar / Neutral: limpia espacios y deja el texto tal cual.\n• Creepypasta / Misterio: añade pausas dramáticas (…) antes de palabras de terror.\n• Tutorial / Educativo: marca con comas las palabras clave y añade pausas tras preguntas.\n• Gameplay / Dinámico: refuerza signos (!! y ??) y pone en mayúsculas palabras de acción."
        },
        "etiquetas-voz": {
            titulo: "Etiquetas de Voz",
            contenido: "Inserta etiquetas de control de voz en el texto (SSML simplificado).\n\n• Pausas: [pause] o [pause:1000] (milisegundos).\n• Velocidad: [slow]texto[/slow], [fast], [rate:+5].\n• Tono: [pitch:+5] más agudo, [pitch:-5] más grave.\n• Volumen: [soft], [loud], [vol:50].\n• Expresiones: [emphasis] para enfatizar y [spell] para deletrear.\n• Emociones: [laugh], [sigh], [scream], [cry], [whisper], [angry], [happy], [sad], [surprise], [fear].\n• Voces: [voz:Jorge]texto[/voz] cambia de voz a mitad del guion.\n\nSi hay texto seleccionado, la etiqueta lo envuelve."
        },
        "motor-voz": {
            titulo: "Motor de Voz",
            contenido: "Centro de generación de audio.\n\n• Voz: elige el motor y la voz (Loquendo, Acapella, Microsoft).\n• Calidad: tamaño de muestra del WAV (nativa 48 kHz o reducida).\n• Optimizar Texto: aplica diccionarios, estilo y puntuación al guion.\n• Generar Audio: sintetiza el texto optimizado con la voz elegida.\n• Proceso Maestro: optimiza y genera el audio en un solo paso."
        },
        "texto-optimizado": {
            titulo: "Texto Optimizado",
            contenido: "Resultado del procesamiento. Es editable: puedes retocar el texto antes de generar el audio.\n\nSi lo modificas aquí y pulsas 'Generar Audio', se usará esta versión. También puedes pasarle 'Corregir Texto' para revisar ortografía y gramática."
        },
        "correccion-ortografica": {
            titulo: "Corrección Ortográfica",
            contenido: "Corrige ortografía y gramática con LanguageTool, que se ejecuta en local (no envía tu texto a internet).\n\nPulsa 'Revisar con LanguageTool' para analizar el texto optimizado y aplicar las correcciones automáticamente."
        },
        "video-pngtuber": {
            titulo: "Video del Personaje",
            contenido: "Genera un video MP4 del personaje reaccionando a la voz.\n\n• Fondo: verde (para quitar el fondo), negro o transparente.\n• Imagen en reposo: el personaje quieto.\n• Imagen hablando: el personaje cuando habla.\n• Al crear el video, alterna entre ambas imágenes según el audio.\n\nRequiere haber generado un audio antes."
        },
        "reproductor": {
            titulo: "Reproductor y Editor de Audio",
            contenido: "Editor de audio que aparece al generar un audio.\n\n• Onda: arrastra para seleccionar una zona y usar 'Cortar'.\n• Zoom: -, 100% (reset) y +.\n• Volumen: sube y baja la voz y la música al empezar o terminar.\n• Efectos: Igualar volumen (subir al máximo) y Quitar pausas largas.\n• Música: carga una pista, ajusta volumen y mézclala bajando la música cuando habla la voz.\n• Descargas: WAV y MP3.\n\nLos subtítulos (SRT/ASS) se generan en la pestaña 'Subtítulos'."
        },
        "musica-ducking": {
            titulo: "Música de Fondo",
            contenido: "Añade música de fondo que baja automáticamente cuando habla la voz.\n\n• Cargar Pista: sube el archivo de música.\n• Nivel de voz: a partir de qué volumen de voz se baja la música.\n• Cuánto baja la música: cuánto se reduce mientras habla la voz.\n• Volumen: nivel base de la música.\n• Repetir en bucle: repite la música si es más corta que el audio.\n• Mezclar Audio: aplica la mezcla final."
        },
        "subtitulos": {
            titulo: "Subtítulos Dinámicos",
            contenido: "Genera subtítulos a partir del audio y del texto.\n\n• Palabras por subtítulo: 3-5 para TikTok, 5-7 para YouTube, 7-10 para tutorial.\n• Subtítulos dinámicos: frases cortas sincronizadas con la voz.\n• SRT: formato estándar, compatible con casi cualquier editor.\n• ASS: incluye estilos y efectos.\n\nPuedes descargar el resultado y usarlo en tu editor de video."
        },
        "automatizacion": {
            titulo: "Ajustes de Automatización",
            contenido: "Opciones que se aplican al pulsar 'Optimizar Texto' o 'Proceso Maestro'.\n\n• Auto-Puntuación: añade comas en conectores y saludos, y limpia comas antinaturales.\n• Auto-Puntos: parte oraciones largas en puntos, cortando en comas (prioriza las que preceden a conectores).\n• Ortografía / Gramática: aplican los diccionarios correspondientes.\n• Puntuación Inteligente: ajusta los signos para una lectura fluida.\n• Corrección Fonética: corrige la pronunciación de siglas y palabras.\n• Neutralizar Español: unifica jergas y regionalismos.\n• Variación por Sinónimos: evita repeticiones cambiando palabras.\n• SRT con IA: genera subtítulos con Whisper al crear el audio."
        },
        "diccionarios": {
            titulo: "Diccionarios Personalizados",
            contenido: "Editor de diccionarios que se aplican al optimizar el texto.\n\n• Jergas: reemplaza regionalismos por palabras neutras.\n• Sinónimos: lista de alternativas (separadas por coma) entre las que se elige al azar.\n• Fonética: indica cómo debe sonar una palabra (ej: sql → ese-cu-ele).\n\nAñade la palabra original y su reemplazo, y pulsa 'Agregar'. Los cambios se guardan en el servidor (la Fonética, en el navegador)."
        }
    }
};
