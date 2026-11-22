# Audio externo y música reutilizable — Loquendo Studio 1.2.0

Rama: `feature/audio-externo-biblioteca-1.2.0`, desde la recuperación explícita de sesiones.

## PNGTuber: audio externo

En Generar video se puede elegir audio de Studio o importar WAV/MP3. El audio externo tiene nombre, duración validada, reproductor, cambio y retirada de archivo. La selección es independiente del editor de voz y del mezclador. Un archivo inválido no reemplaza el anterior, y una carga tardía no revive una selección retirada o cambiada.

`POST /api/pngtuber/audio` recibe una copia temporal con UUID, verifica stream/duración con FFprobe y decodifica con FFmpeg sin modificar el original. El máximo es 1 GB; una validación fallida elimina solo esa copia temporal. La selección externa no se restaura entre reinicios; sus copias temporales siguen la limpieza existente.

La vista previa usa hasta cuatro segundos del audio elegido y el mismo análisis de silencio/expresiones de la exportación; sus controles permiten activar sonido. Sin audio conserva la demostración. La prioridad exclusiva sigue siendo parpadeo > hablando > reposo, también con alfa. Fondo transparente exporta WebM/VP9/Opus; los fondos opacos exportan MP4/H.264/AAC.

Verificado con `node scripts/smoke_projects.cjs --external-audio`: Electron/Express/FFmpeg reales, WAV/MP3, reproducción, inválido conservando anterior, exportaciones MP4/WebM con audio y silencio, original sin modificar y selección Studio compatible. `node --test tests/pngtuber.test.js tests/audioSession.test.js`: 12 aprobadas, incluidos píxeles de expresiones y transparencia.

Se preserva fuera de estos commits la modificación previa de `frontend/js/services/videoProcessor.js`.

## Ducking: Recientes y Mi biblioteca

En el panel Mezcla con Música, **Cargar Pista** abre el selector nativo de Electron. Debajo aparecen el nombre/duración de la selección y **Recientes y Mi biblioteca**. Cada canción se puede seleccionar de nuevo; los archivos ausentes muestran **Localizar archivo**. **Quitar de biblioteca** mantiene la entrada en Recientes; **Olvidar** elimina sus metadatos. Ninguna de estas acciones borra el original.

Antes de aplicar ducking a una selección no guardada se pregunta: «¿Quieres guardar esta canción en tu biblioteca para usarla más adelante?», con **Sí, guardar** y **No, continuar**. Ambas permiten la mezcla. Las guardadas no vuelven a preguntar, tampoco tras reiniciar. Una canción no guardada puede volver a provocar la pregunta en otro uso. Si falla únicamente el guardado opcional en biblioteca, se avisa y se permite continuar con ducking.

La persistencia vive en `LOQUENDO_DATA_DIR/music-library.json`, fuera de la limpieza de temporales y de los proyectos/sesiones del mezclador. Guarda referencias absolutas a los originales, nombre, duración, ID y estado guardado. Los cambios se serializan y publican mediante archivo temporal y rename; un JSON ilegible se conserva sin permitir sobrescrituras. Se retienen hasta 30 referencias no guardadas y todas las guardadas; Recientes presenta las 30 últimas selecciones.

El puente `electronAPI.selectMusic()` usa diálogo nativo y valida que el emisor sea la ventana principal en el origen/puerto real de la app. La API HTTP solo admite IDs previamente registrados, no rutas arbitrarias. La reproducción y ducking leen el original mediante esa referencia. Se conserva la API anterior de música temporal para compatibilidad.

### Pruebas de biblioteca

- `node scripts/smoke_projects.cjs --desktop --music-library`: dos procesos completos con main/preload/IPC/Express y ducking FFmpeg reales. Se simula únicamente la respuesta del diálogo nativo. Comprueba ambas decisiones, no repetir pregunta, reinicio y limpieza real, selección cancelada/inválida que conserva la anterior, deduplicación, originales sin copias/modificaciones, archivo movido, localización y eliminación de metadatos.
- `tests/musicLibrary.test.js`: referencias concurrentes y persistencia, faltantes/localización, archivos inválidos, eliminación segura y corrupción conservada byte a byte.

### Límites

- Elegir o localizar referencias nuevas requiere Electron. El modo navegador mantiene la carga temporal anterior, sin registrar automáticamente esa carga en la biblioteca.
- Mover o borrar un original deja su referencia ausente hasta localizarlo. No se incluyen canciones en paquetes de proyectos ni se trasladan al mezclador automáticamente.
- Dos archivos en rutas distintas se consideran referencias distintas aunque tengan contenido idéntico. Las rutas canónicas repetidas se deduplican.
- La validación completa limita los archivos a 1 GB y los procesos de comprobación a 120 segundos; archivos que no se puedan decodificar dentro de ese plazo se rechazan.
- No hay reparación automática de un JSON de biblioteca corrupto: se conserva el archivo y se informa del problema.

## Regresión final

Verificación de desarrollo: 2026-11-18. **54 pruebas de `npm test` aprobadas, ninguna omitida**. Pasaron además los smokes de audio externo, biblioteca de escritorio, proyectos, sesiones base, recuperación UX y mezclador con HTML/CSS reales (ondas 830/550 px y balance 0,500).

El smoke de recuperación UX tenía una carrera entre la restauración del backend de prueba y el autoguardado: podía guardarse el trabajo antes de que apareciera la confirmación esperada. La inyección del fallo ahora se mantiene hasta que se muestra el diálogo y se drenan los guardados anteriores antes de probar el fallo remoto.

El smoke del mezclador aprobó sus comprobaciones e informó `EBUSY` al retirar el archivo DIPS de su perfil temporal. Las pruebas usan sandboxes aislados; no se modifican respaldos ni datos reales del usuario. No se ha generado distribución ni ejecutado optimización de tamaño.
