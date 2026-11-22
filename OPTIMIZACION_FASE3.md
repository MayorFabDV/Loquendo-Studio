# Optimización 1.2.0 — Fase 3: idle y cambios de fuente PNGTuber

Fecha: 2026-11-22. Rama `feature/optimizacion-1.2.0`. Inicio en `8648913`, con la carpeta de capturas aportada por el usuario como único cambio sin confirmar; se conservó intacta y fuera de los commits.

## Propuesta registrada antes de la corrección

Commit `ad83bf0`: arquitectura pendiente de **Diagnóstico del sistema dentro de Configuración/Ajustes**, sin nueva pestaña principal. Incluye análisis rápido/profundo, ZIP depurado, reutilización del diagnóstico Leonor y respaldo CMD, respetando capacidades deshabilitadas/retiradas. Solo se documentó en `ESTABILIZACION.md`; no se implementó la función. Requiere aprobación específica de alcance aunque esta fase quede completada.

## Reproducción y causas verificadas

### 1. La preview desaparecía al segundo audio

Con imágenes ya subidas y una preview visible, se importó otro audio en la misma ventana. `videoAudioInput.importar()` invalidaba el reproductor, quitaba `src` y lo ocultaba; al terminar la importación no solicitaba una nueva preview. Idle seguía registrado, pero su vista quedaba vacía hasta actualizar manualmente o volver a subir una imagen.

La regresión se reprodujo antes de corregirla con `node scripts/smoke_projects.cjs --external-audio`: timeout esperando una nueva preview tras importar el segundo MP3. También falló la prueba focalizada de UI. El smoke anterior siempre pulsaba Actualizar después de importar y por eso no detectaba esa omisión.

### 2. Una ruta anterior podía quedar asociada a la revisión nueva

Preview y exportación obtenían primero la ruta con `await ...ruta()` y solo después leían la revisión de fuente. Si la fuente cambiaba durante ese `await`, podían enviar la ruta anterior pero tratar el resultado como vigente. Las dos pruebas focalizadas fallaron antes del arreglo: se enviaba una petición que debía descartarse.

### 3. Las previews de demostración compartían archivo

`generarPreviewPNGTuber()` reutilizaba `preview.mp4`/`preview.webm` y eliminaba la salida del formato contrario. Se reprodujo la colisión con FFmpeg real: dos peticiones devolvían la misma URL. Eso permitía sobrescribir o retirar un recurso que aún podía estar usando otro reproductor o petición.

## Correcciones

- Al confirmar una importación, cambiar de modo o quitar archivo, se detiene/limpia la preview y el resultado anterior —incluido su enlace de descarga— y se solicita la preview de la fuente vigente cuando Video está visible. Un archivo inválido conserva la selección previa y permite reconstruir su preview.
- La carga de audio de Studio notifica al selector de video. Al volver a Video se detectan también revisiones de voz cambiadas por edición o recuperación. No se inicia un render automático mientras se trabaja en otra pestaña.
- Cada petición captura **antes del primer await** una instantánea de fuente, imágenes, fondo, resolución y escala. Se comprueba antes de enviar el render y al recibirlo. Los errores de fuentes obsoletas tampoco vacían la preview ni notifican un fallo de la fuente actual.
- La preview mantiene una sola petición en curso y encola la actualización más reciente. La exportación evita solicitudes simultáneas desde el renderer. Los controles se restablecen en `finally`.
- Se conservan las imágenes del personaje entre fuentes. No se modifica ni añade audio al mezclador. Los reproductores se pausan y reinician; no se añaden temporizadores de animación ni listeners por cada audio.
- Cada demostración recibe un nombre con UUID. Cambiar de MP4 a WebM no elimina la salida previa. La limpieza temporal existente sigue gestionando esos recursos.

El análisis de silencio mantiene sus datos locales por llamada y las pruebas repetidas no mostraron segmentos heredados del audio anterior. Se conservan el detector y las expresiones FFmpeg existentes, con prioridad exclusiva **blink > talking > idle**. En esta fase no se cambió la regla de activación de expresiones.

Archivos de aplicación modificados: `frontend/js/main.js`, `frontend/js/ui/videoAudioInput.js`, dos avisos de integración en `frontend/js/services/audioPlayer.js` y nombres de salida en `backend/services/videoService.js`.

## Verificación inicial (commit `ac7f75c`)

| Comando | Resultado |
|---|---|
| `npm test` | **64 aprobadas, ninguna omitida** |
| `node scripts/smoke_projects.cjs --external-audio` | Electron/Express/FFmpeg reales, cambios repetidos WAV/MP3 y Studio, silencio WAV/MP3, MP4/WebM, original sin modificar y fotogramas por píxeles; aprobado |
| `node scripts/smoke_projects.cjs --sapi --voice=Leonor` | Voz real Leonor, calidad 16k, edición/persistencia/mezclador y preview/video reales; aprobado |
| `node scripts/smoke_projects.cjs --maintenance` | Bloqueo de Subtítulos/transcripción y soporte SRT/ASS independiente; aprobado |
| `node scripts/smoke_audio_sessions.cjs --recovery-ux` | Recuperaciones separadas, permanecer/cancelar/fallos/reinicios; aprobado |
| `node scripts/smoke_audio_sessions.cjs` | Sesiones/original offline/FX/marcadores/salidas; aprobado |
| `node scripts/smoke_projects.cjs --desktop --music-library` | Main/preload/IPC y biblioteca/ducking entre reinicios; aprobado |
| `node scripts/smoke_projects.cjs` | Proyectos y medios reales, portable, localización, revisión recuperable y render; aprobado |
| `node node_modules/electron/cli.js scripts/smoke_mixer.cjs --full-page` | Ondas 830/550 px, edición/reproducción y balance 0,500; aprobado |

### Cobertura nueva

- `tests/pngtuberSource.test.js`: siete casos de renovación tras segundo audio, ruta tardía en preview/exportación, error obsoleto, render anterior no publicado, retorno a Video tras cambio de voz Studio y retirada durante una importación.
- `tests/pngtuber.test.js`: se conserva la comprobación de píxeles de exclusividad de las tres expresiones y alfa con parpadeo durante habla; se añade identidad independiente de previews y conservación de ambos formatos.
- Smoke Electron ampliado: seis cambios de archivos con pausas/habla y silencio WAV/MP3; comprueba idle al inicio y a lo largo del silencio, habla durante el segmento correcto y transparencia sin idle debajo. Se examinan archivos de preview y exportación, no solo mensajes de éxito.
- Se retiene deliberadamente en el renderer una respuesta de preview y otra de exportación **ya producidas por el servidor real**, se cambia el audio y después se libera la respuesta. Se comprueba que la preview nueva usa el silencio actual y que el video/descarga anteriores no reaparecen.
- Los originales de las fixtures se comparan por SHA-256. Los archivos inválidos no sustituyen una selección válida.

El mock de documento de una prueba legacy se completó con `querySelector`, que el controlador usa ahora antes de esperar la persistencia; la prueba volvió a verificar que no se envían rutas antiguas cuando esa persistencia falla. Se validó sintaxis de los ocho JS/CJS afectados. El smoke del mezclador aprobó sus comprobaciones e informó `EBUSY` al eliminar DIPS de su perfil temporal.

## Límites y continuidad

- Los resultados obsoletos se descartan en la UI; un FFmpeg que ya empezó en el servidor puede terminar y dejar un temporal para la limpieza existente. No se incorpora cancelación de procesos en esta corrección.
- Verificado en desarrollo con datos aislados y exportaciones reales; no se generó ni validó una distribución nueva en esta fase.
- La excepción Leonor del tester sigue pendiente de su informe; no se presenta como resuelta por estas regresiones locales.
- Fase 4 permanece pendiente: exclusiones y medición de paquete desempaquetado, sin instalador de publicación.
- Diagnóstico general y nuevas expresiones continúan sujetos a sus aprobaciones específicas; no se implementaron aquí.

## Seguimiento: reposo al seleccionar audio externo sin archivo

Fecha: 2026-11-22. Base de este seguimiento: `ac7f75c`. Se reabrió la comprobación de Fase 3 antes de avanzar a Fase 4.

### Reproducción y comparación

Se utilizó un personaje de prueba con imágenes separadas y transparentes: idle rojo, talking azul y blink verde. Después de usar audio de Studio, seleccionar **audio externo sin un archivo importado** devolvía `audioPath:null`; el backend ejecutaba entonces la demostración habitual, que alterna hablando y parpadeo en momentos fijos. A 1,05 s aparecía talking y no idle, aunque las tres rutas de imagen seguían intactas.

La prueba Electron falló antes de la corrección en la comprobación «Sin archivo externo, idle debe seguir visible en vez de simular habla». Una prueba del controlador confirmó también que no se solicitaba un modo de reposo explícito. Por tanto, el caso reproducido es de **comportamiento visual de la preview sin archivo seleccionado**, no de pérdida/carga del PNG idle.

Con WAV/MP3 ya importados, se compararon preview y MP4/WebM: idle aparece en el primer fotograma, los silencios intermedios y el silencio final. La exportación con audio no reprodujo este defecto visual de la selección vacía. La matriz conserva además la comprobación de audio totalmente silencioso en WAV/MP3.

### Corrección mínima

- El selector informa si se ha elegido externo sin archivo; esa condición forma parte del snapshot previo al `await`.
- La petición de preview solicita `soloReposo:true` únicamente para ese estado. El backend lo utiliza solo cuando no hay audio y compone una preview de idle sin simular habla ni parpadeo.
- Al importar un archivo, se vuelve automáticamente al análisis/sincronización de audio existentes; al quitarlo se vuelve a reposo. Las imágenes talking/blink se conservan y vuelven a utilizarse con audio.
- La nota visible aclara **«Sin audio externo: vista previa en reposo»**. No se recurre a la voz de Studio como fallback al elegir externo vacío.
- Se conservan la demostración anterior para los clientes/modos que no soliciten reposo y las exportaciones con audio. No se cambia ningún documento de proyecto, configuración persistente, archivo de audio ni imagen original.
- Permanecen los snapshots de fuente/opciones, la cola de preview, las URLs únicas y el descarte de respuestas obsoletas de Fase 3. Con audio sigue vigente la prioridad exclusiva **blink > talking > idle**.

### Pruebas de este seguimiento

| Comando | Resultado |
|---|---|
| `npm test` | **67 aprobadas, ninguna omitida** |
| `node --test tests/pngtuberSource.test.js tests/pngtuber.test.js` | 13 casos focalizados aprobados |
| `node scripts/smoke_projects.cjs --external-audio` | Electron/Express/FFmpeg reales: reposo sin archivo, WAV/MP3, Studio/externo, MP4/WebM, alfa, cambios consecutivos y respuestas tardías; aprobado |
| `node scripts/smoke_projects.cjs --sapi --voice=Leonor` | Flujo real de voz/edición/persistencia/mezclador y PNGTuber aprobado |
| `node scripts/smoke_projects.cjs --maintenance` | Mantenimiento de Subtítulos y operaciones SRT/ASS independientes aprobados |
| `node scripts/smoke_projects.cjs` | Proyectos, portable, medios y render reales aprobados |

Para comprobar expresiones exactas, solo el servidor del smoke externo fija parpadeos en 1,20 y 2,20 s; el calendario aleatorio de producción no cambia. En preview y exportación se verifican por píxeles: **0 s idle; 1,05 s talking; 1,25 s blink; 1,75 s idle; 2,25 s blink; 2,96 s idle**, sin superposiciones. Se verifican también los primeros/últimos fotogramas de la preview sin audio y se captura un fotograma directamente del reproductor de Electron mediante canvas, confirmando idle en pantalla.

Los ciclos adicionales externo → Studio → externo conservan exactamente las tres rutas de imágenes. La suite retiene las pruebas de importación retirada, rutas tardías y respuestas de preview/exportación obsoletas. Sintaxis de ocho JS/CJS y `git diff --check` correctos.

**Estado:** seguimiento corregido y verificado en desarrollo. La preview con audio sigue mostrando los primeros cuatro segundos; no se agregan silencios artificiales al video. No se inició Fase 4 ni se generó distribución. El diagnóstico general sigue pendiente de aprobación de alcance.
