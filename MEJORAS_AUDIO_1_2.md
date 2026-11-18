# Audio externo y música reutilizable — Loquendo Studio 1.2.0

Rama: `feature/audio-externo-biblioteca-1.2.0`, desde la recuperación explícita de sesiones.

## PNGTuber: audio externo

En Generar video se puede elegir audio de Studio o importar WAV/MP3. El audio externo tiene nombre, duración validada, reproductor, cambio y retirada de archivo. La selección es independiente del editor de voz y del mezclador. Un archivo inválido no reemplaza el anterior, y una carga tardía no revive una selección retirada o cambiada.

`POST /api/pngtuber/audio` recibe una copia temporal con UUID, verifica stream/duración con FFprobe y decodifica con FFmpeg sin modificar el original. El máximo es 1 GB; una validación fallida elimina solo esa copia temporal. La selección externa no se restaura entre reinicios; sus copias temporales siguen la limpieza existente.

La vista previa usa hasta cuatro segundos del audio elegido y el mismo análisis de silencio/expresiones de la exportación; sus controles permiten activar sonido. Sin audio conserva la demostración. La prioridad exclusiva sigue siendo parpadeo > hablando > reposo, también con alfa. Fondo transparente exporta WebM/VP9/Opus; los fondos opacos exportan MP4/H.264/AAC.

Verificado con `node scripts/smoke_projects.cjs --external-audio`: Electron/Express/FFmpeg reales, WAV/MP3, reproducción, inválido conservando anterior, exportaciones MP4/WebM con audio y silencio, original sin modificar y selección Studio compatible. `node --test tests/pngtuber.test.js tests/audioSession.test.js`: 12 aprobadas, incluidos píxeles de expresiones y transparencia.

Se preserva fuera de estos commits la modificación previa de `frontend/js/services/videoProcessor.js`.
