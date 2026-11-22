window.HELP_TEXTS = {
    controles: {
        // Header
        logoTesters: "Ver Testers",
        btnAjustes: "Ajustes: tema, pestaña inicial, tooltips, sonidos y notificaciones, reproducción, zoom inicial y limpieza de temporales. La voz y los subtítulos se configuran y recuerdan desde sus pestañas.",
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
        resolucionPNGTuber: "Tamaño del video. Original usa las dimensiones de la imagen en reposo; 16:9 usa un lienzo estándar. En ambos casos la imagen se ajusta sin recortar.",
        escalaPNGTuber: "Escala del personaje sobre el lienzo. 100% lo ajusta sin recortar; por encima de 100% se amplía y puede recortar los bordes.",
        pngtuberIdleInput: "Sube la imagen PNG del personaje en reposo.",
        pngtuberTalkingInput: "Sube la imagen PNG del personaje hablando.",
        pngtuberBlinkInput: "Imagen opcional del personaje con los ojos cerrados. Si la subes, el video intercala parpadeos automáticos.",
        btnRenderVideo: "Genera el video con el audio y las imágenes del personaje (en reposo y hablando). Con fondo transparente se exporta en WebM.",
        previewPngtuber: "Demostración de expresiones de 4 segundos, sin audio y en bucle: reposo, hablando y parpadeo. Es independiente del audio de Studio o externo. El video final sí se sincroniza con el audio real.",
        btnActualizarPreview: "Vuelve a generar la vista previa con las imágenes y el fondo actuales.",
        videoPngtuberResultado: "Reproductor del video final. Revísalo aquí; si te gusta, descárgalo y edítalo a tu manera. Si no, cambia las opciones y genera otro.",
        btnDescargarVideoPngtuber: "Descarga el video final con audio para editarlo o compartirlo.",

        // Reproductor y editor
        editorZoomOut: "Alejar la onda",
        editorResetZoom: "Volver al zoom original de la onda",
        editorZoomIn: "Acercar la onda",
        btnReiniciar: "Volver al inicio del audio",
        btnPlay: "Reproducir o pausar",
        btnDetener: "Detener la reproducción",
        btnCortar: "Cortar y eliminar la selección de la onda",
        btnDeshacer: "Deshace el último cambio en el audio (Ctrl+Z).",
        btnRehacer: "Vuelve a aplicar el último cambio deshecho (Ctrl+Y).",
        btnRestaurarOriginal: "Recupera la copia original del audio y sus marcadores, y reinicia el historial. Los ajustes de escucha se mantienen. La sesión se guarda localmente para volver a abrirla.",
        btnEscucharSeleccion: "Reproduce solo el tramo seleccionado de la onda.",
        btnAplicarFxSeleccion: "Aplica la cadena de efectos actual con FFmpeg solo al tramo seleccionado.",
        btnSelNormalizar: "Sube el volumen del tramo seleccionado hasta -1 dB sin distorsionar.",
        btnSelSilenciar: "Silencia el tramo seleccionado sin borrarlo.",
        btnSelFadeIn: "Aplica un fade in de 1 segundo al inicio de la selección.",
        btnSelFadeOut: "Aplica un fade out de 1 segundo al final de la selección.",
        btnSelLimpiar: "Reduce el ruido de fondo del tramo seleccionado con FFmpeg.",
        btnSelDeesser: "Suaviza las sibilancias del tramo seleccionado con FFmpeg.",
        btnSelCopiar: "Copia el tramo seleccionado al portapapeles del editor.",
        btnSelPegar: "Pega el portapapeles en el audio. Si hay selección, la reemplaza.",
        btnSelDuplicar: "Inserta una copia del tramo seleccionado justo después de la selección.",
        btnSelCrossfade: "Reemplaza la selección con el portapapeles, mezclando los bordes para evitar chasquidos.",
        btnMarkerCargar: "Carga un SRT o VTT y coloca sus marcadores sobre la onda.",
        btnMarkerDescargar: "Descarga los marcadores actuales como SRT.",
        btnMarkerLimpiar: "Elimina todos los marcadores del editor.",
        audioMarkerStart: "Segundo en el que empieza el marcador activo. Se puede ajustar a mano.",
        audioMarkerEnd: "Segundo en el que termina el marcador activo. Se puede ajustar a mano.",
        audioMarkerText: "Texto que se mostrará en el subtítulo de este marcador.",
        btnMarkerGuardar: "Aplica los tiempos y el texto editados al marcador activo.",
        btnMarkerIr: "Mueve la reproducción al inicio del marcador activo.",
        btnMarkerDividir: "Parte el marcador activo en dos en la posición actual del cursor.",
        btnMarkerUnir: "Une el marcador activo con el siguiente, sumando sus tiempos y textos.",
        btnMarkerEliminar: "Borra el marcador activo sin tocar el audio.",
        basicFadeIn: "Aplica un fade in de 1 segundo al inicio del audio.",
        basicFadeOut: "Aplica un fade out de 1 segundo al final del audio.",
        fadeInDuration: "Cuántos segundos tarda en subir la voz al empezar.",
        fadeOutDuration: "Cuántos segundos tarda en bajar la voz al terminar.",
        btnAplicarFadeIn: "Hace que la voz suba poco a poco al empezar.",
        btnAplicarFadeOut: "Hace que la voz baje poco a poco al terminar.",
        // Modos del editor de audio
        btnAudioModeBasico: "Cambia al Modo Básico del editor: controles simplificados, preajustes de voz y descarga rápida.",
        btnAudioModeAvanzado: "Cambia al Modo Avanzado del editor: ecualizador paramétrico, dinámica, efectos de estudio y renderizado acústico.",
        basicPresetPlana: "Voz original sin filtros aplicados.",
        basicPresetVoz: "Voz clara: realza la inteligibilidad y limpia frecuencias molestas.",
        basicPresetPodcast: "Voz con cuerpo y calidez, ideal para grabaciones largas o narración.",
        basicPresetCalida: "Tono cálido con graves suaves y agudos sedosos.",
        basicPresetRadio: "Efecto locutor de radio con compresión presente y medios reforzados.",
        basicPresetSuave: "Voz delicada con ligera reverberación para lecturas relajantes.",
        basicVolume: "Ajusta el volumen general de la voz.",
        basicClarity: "Aumenta o reduce la claridad y el brillo de la voz.",
        basicRate: "Ajusta la velocidad de reproducción del audio.",

        fadeInMusicaDuration: "Cuántos segundos tarda en subir la música al empezar (cuando se mezcla).",
        fadeOutMusicaDuration: "Cuántos segundos tarda en bajar la música al terminar (cuando se mezcla).",
        btnNormalizar: "Sube el volumen de la voz al máximo sin que se distorsione.",
        btnQuitarSilencios: "Elimina automáticamente las pausas y silencios largos.",
        btnLoopAudio: "Repite el audio completo en bucle mientras escuchas los efectos.",
        audioRate: "Cambia la velocidad de reproducción sin alterar el tono (0.5× a 2×).",
        audioPitch: "Sube o baja el tono de la voz en semitonos, sin cambiar la velocidad.",
        btnBypassFX: "Compara el audio con y sin efectos (A/B).",
        audioFxPreset: "Aplica un conjunto de efectos preparado para distintos estilos de voz.",
        btnResetFX: "Vuelve todos los efectos a sus valores neutros.",
        fxHighpass: "Quita los ruidos graves por debajo de la frecuencia indicada.",
        fxLowpass: "Quita los ruidos agudos por encima de la frecuencia indicada.",
        fxEqLow: "Sube o baja los graves de la voz.",
        fxEqMid: "Sube o baja los medios, donde se entiende la voz.",
        fxEqHigh: "Sube o baja los agudos y la claridad.",
        fxCompThreshold: "Nivel a partir del cual el compresor reduce el volumen para igualar la voz.",
        fxCompRatio: "Cuánto reduce el compresor por encima del umbral (mayor = más compresión).",
        fxGateThreshold: "Silencia el audio por debajo de este nivel para quitar ruido de fondo.",
        fxReverbWet: "Cantidad de reverberación añadida a la voz.",
        fxLimiterThreshold: "Techo máximo de volumen para evitar saturación.",
        fxVolume: "Volumen general de la reproducción con efectos.",

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

        // Render final
        audioRenderFormat: "Formato del archivo final: WAV (sin pérdida), MP3 320 kbps, FLAC (sin pérdida comprimido) u Opus 160 kbps.",
        audioRenderBitDepth: "Profundidad de bits del WAV: 16 bits (estándar) o 24 bits (más rango dinámico).",
        audioRenderLoudness: "Nivel de sonoridad al que se normaliza el audio. -16 LUFS es lo habitual para voz y YouTube; -14 para streaming.",
        chkAudioRenderPrecise: "Normalización en dos pasadas: mide primero y aplica después para un resultado más exacto. Más lento.",
        chkAudioRenderDenoise: "Aplica reducción de ruido de fondo con FFmpeg (afftdn).",
        chkAudioRenderDeesser: "Suaviza las sibilancias o sonidos 'sss' con FFmpeg (deesser).",
        btnAnalizarAudio: "Mide la sonoridad integrada, el pico real y el rango dinámico del audio actual.",
        btnRenderizarAudio: "Aplica los efectos y la limpieza con FFmpeg, normaliza el volumen y carga el archivo final en el editor.",


        // Ajustes de automatización
        chkComas: "Auto-Puntuación: añade comas en conectores y saludos, y elimina comas antinaturales.",
        chkPuntos: "Auto-Puntos de Pausa: parte las oraciones largas en puntos, cortando en las comas (priorizando las que preceden a conectores) para marcar pausas de lectura.",
        chkOrtografia: "Corrección Ortográfica: aplica tu diccionario de ortografía personalizado.",
        chkGramatica: "Corrección Gramatical: aplica tu diccionario de gramática personalizado.",
        chkPuntuacion: "Puntuación Inteligente: ajusta los signos para que la lectura sea fluida.",
        chkLoquendo: "Corrección Fonética: ajusta palabras para que se pronuncien correctamente.",
        chkNeutro: "Neutralizar Español: reemplaza jergas y regionalismos por palabras neutras.",
        chkSinonimos: "Variación por Sinónimos: cambia palabras al azar para evitar repeticiones.",
        chkSRT_IA: "SRT con IA: se activa en Subtítulos y genera los subtítulos con Whisper al crear el próximo audio."
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
            contenido: "Genera un video MP4 del personaje reaccionando a la voz.\n\n• Fondo: verde (para quitar el fondo), negro o transparente.\n• Resolución: Original conserva el tamaño de la imagen en reposo; 16:9 usa 1280x720 o 1920x1080. La imagen se ajusta sin recortar.\n• Escala: 100% ajusta el personaje sin recortar; súbela para acercarlo (más de 100% puede recortar bordes).\n• Imagen en reposo: el personaje quieto.\n• Imagen hablando: el personaje cuando habla.\n• Ojos cerrados (opcional): intercala parpadeos automáticos.\n• Balanceo: el personaje respira con un vaivén sutil.\n• Vista previa: muestra al personaje alternando reposo y habla; se actualiza al subir una imagen o cambiar fondo, resolución o escala.\n• Reproductor: al generar el video se muestra aquí; no se descarga automáticamente. Revísalo y, si te gusta, usa «Descargar video»; si no, cambia las opciones y genera otro.\n• Al crear el video, alterna entre ambas imágenes según el audio.\n\nCon fondo transparente el video se exporta en WebM (VP9). Requiere haber generado un audio antes."
        },
        "modo-basico-audio": {
            titulo: "Modo Básico del Editor",
            contenido: "Edición rápida y sencilla sin complicaciones técnicas:\n\n• Selecciona un Preajuste de Voz para mejorar el sonido al instante (Original, Voz Clara, Podcast, Cálida, Radio o Suave).\n• Ajusta Volumen, Claridad y Velocidad con deslizadores directos.\n• Utiliza los botones de corte, reproducción y zoom en la onda de audio.\n• Descarga tu archivo en WAV o MP3 directamente sin configurar parámetros complejos."
        },
        "reproductor": {
            titulo: "Reproductor y Editor de Audio",
            contenido: "Editor de audio que aparece al generar un audio.\n\n• Edición: arrastra sobre la onda para seleccionar una zona y usar 'Cortar'.\n• Efectos: EQ, compresor, limitador, paso alto/bajo, puerta y reverb en vivo con Tone.js.\n• Mezcla: sube y baja la voz y la música al empezar o terminar, y mezcla con ducking.\n• Exportar: descarga el audio editado en WAV o MP3.\n• Zoom: -, 100% (reset) y +.\n• Transporte: velocidad, tono, loop y comparación A/B.\n\nLos subtítulos (SRT/ASS) se generan en la pestaña 'Subtítulos'."
        },
        "efectos-audio": {
            titulo: "Efectos en Vivo",
            contenido: "El editor reproduce el audio con Tone.js y aplica los efectos en tiempo real.\n\n• Edición: onda, selección, cortes, fades y efectos rápidos.\n• Efectos: EQ, compresor, limitador, paso alto/bajo, puerta y reverb, con medidores.\n• Mezcla: volumen, fades y música de fondo con ducking.\n• Exportar: descarga el audio editado.\n\n• Velocidad: cambia la rapidez sin alterar el tono.\n• Tono: sube o baja la voz en semitonos.\n• A/B: compara con y sin efectos.\n• Presets: aplica una combinación preparada y ajusta después.\n\nLos efectos son una vista previa en vivo. El render final con FFmpeg (LUFS, limpieza y formatos) está en la pestaña Exportar."
        },
        "seleccion-audio": {
            titulo: "Selección y Efectos por Tramo",
            contenido: "Aplica efectos solo a una parte del audio, como en Audacity.\n\n• Arrastra sobre la onda para seleccionar un tramo.\n• Escuchar: reproduce únicamente la selección.\n• Aplicar efectos: procesa el tramo con la cadena de efectos actual (EQ, compresor, filtros, reverb…) y lo reemplaza en el audio.\n• Normalizar: sube el tramo a -1 dB.\n• Silenciar: deja el tramo en silencio.\n• Fade in / Fade out: suaviza el inicio o el final del tramo.\n• Limpiar ruido / Sibilancias: reducción de ruido y deesser con FFmpeg.\n• Copiar / Pegar / Duplicar: mueve tramos de audio dentro de la onda.\n• Crossfade: reemplaza la selección con el portapapeles y mezcla los bordes.\n\nLos cambios son destructivos sobre el audio editado, pero puedes deshacerlos con Ctrl+Z o con el botón Deshacer."
        },
        "marcadores-audio": {
            titulo: "Marcadores SRT",
            contenido: "Los marcadores son los bloques de los subtítulos, dibujados sobre la onda.\n\n• Al generar un SRT, los marcadores se cargan automáticamente; también puedes cargar un archivo SRT/VTT.\n• Haz clic en un bloque o en la lista para seleccionarlo y saltar a su inicio.\n• Ajusta Inicio y Fin y pulsa 'Guardar cambios' para mover sus límites.\n• Dividir parte el marcador en el cursor; Unir lo fusiona con el siguiente.\n• Descargar SRT exporta los marcadores actuales.\n\nEditar marcadores no modifica el audio. Al cortar o pegar audio, los tiempos se desplazan solos."
        },
        "exportar-audio": {
            titulo: "Render y Exportación",
            contenido: "Genera el archivo final aplicando los efectos actuales con FFmpeg.\n\n• Formato: WAV (16/24 bits), MP3 320 kbps, FLAC u Opus 160 kbps.\n• Sonoridad: normaliza a -14/-16/-18/-23 LUFS o deja el audio sin normalizar.\n• Normalización precisa: dos pasadas para un nivel más exacto (más lento).\n• Reducir ruido: aplica limpieza de fondo.\n• Reducir sibilancias: atenúa los sonidos 'sss'.\n\n• Analizar sonoridad: muestra LUFS integrado, pico real y rango dinámico.\n• Renderizar y cargar: procesa todo el audio y lo deja listo en el editor para descargar.\n\nEl render afecta al archivo completo; los efectos en vivo son solo la vista previa."
        },
        "musica-ducking": {
            titulo: "Música de Fondo",
            contenido: "Añade música de fondo que baja automáticamente cuando habla la voz.\n\n• Cargar Pista: sube el archivo de música.\n• Nivel de voz: a partir de qué volumen de voz se baja la música.\n• Cuánto baja la música: cuánto se reduce mientras habla la voz.\n• Volumen: nivel base de la música.\n• Repetir en bucle: repite la música si es más corta que el audio.\n• Mezclar Audio: aplica la mezcla final."
        },
        "subtitulos": {
            titulo: "Subtítulos Dinámicos",
            contenido: "Genera subtítulos a partir del audio y del texto.\n\n• Generar SRT con IA: usa Whisper al crear el próximo audio desde Guion y Voz. Se activa aquí.\n• Palabras por subtítulo: 3-5 para TikTok, 5-7 para YouTube, 7-10 para tutorial.\n• Subtítulos dinámicos: frases cortas sincronizadas con la voz.\n• SRT: formato estándar, compatible con casi cualquier editor.\n• ASS: incluye estilos y efectos.\n\nPuedes descargar el resultado y usarlo en tu editor de video."
        },
        "automatizacion": {
            titulo: "Ajustes de Automatización",
            contenido: "Opciones que se aplican al pulsar 'Optimizar Texto' o 'Proceso Maestro'.\n\n• Auto-Puntuación: añade comas en conectores y saludos, y limpia comas antinaturales.\n• Auto-Puntos: parte oraciones largas en puntos, cortando en comas (prioriza las que preceden a conectores).\n• Ortografía / Gramática: aplican los diccionarios correspondientes.\n• Puntuación Inteligente: ajusta los signos para una lectura fluida.\n• Corrección Fonética: corrige la pronunciación de siglas y palabras.\n• Neutralizar Español: unifica jergas y regionalismos.\n• Variación por Sinónimos: evita repeticiones cambiando palabras."
        },
        "diccionarios": {
            titulo: "Diccionarios Personalizados",
            contenido: "Editor de diccionarios que se aplican al optimizar el texto.\n\n• Jergas: reemplaza regionalismos por palabras neutras.\n• Sinónimos: lista de alternativas (separadas por coma) entre las que se elige al azar.\n• Fonética: indica cómo debe sonar una palabra (ej: sql → ese-cu-ele).\n\nAñade la palabra original y su reemplazo, y pulsa 'Agregar'. Los cambios se guardan en el servidor (la Fonética, en el navegador)."
        }
    }
};
