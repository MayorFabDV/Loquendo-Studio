# Loquendo Studio 1.2.0 — Regresión final y entrega de desarrollo

Fecha: 2026-10-29. Rama: `feature/estabilizacion-1.2.0`.

## Resultado

Fase 5 cerrada **en desarrollo**. Las cinco fases operativas y la protección previa están registradas en `ESTABILIZACION.md`. Se ejecutaron pruebas reales de la aplicación y de sus componentes nativos, se corrigieron los fallos reproducidos y se preservaron las funciones existentes.

**No se ejecutó ningún build de distribución**, no se recompiló `generar_voz.exe`, no se instaló ninguna dependencia y no se modificaron los respaldos. El próximo checkpoint de empaquetado/asar requiere autorización expresa. No debe distribuirse un artefacto viejo suponiendo que contiene estas correcciones.

## Verificación manual reportada por el usuario

Antes de aprobar esta fase, el usuario confirmó haber realizado la lista de comprobación propuesta para la Fase 4:

- [x] Reiniciar con `npm start`.
- [x] Crear un proyecto con dos audios y recortes o efectos.
- [x] Guardar y cerrar completamente la aplicación.
- [x] Reabrir y comprobar pistas, posiciones y efectos.
- [x] Exportar/importar `.loquendo.tar` como proyecto nuevo y comprobar que el original sigue intacto.
- [x] Probar recuperación de una fuente faltante con una copia del audio.

Esta es una confirmación manual del usuario, separada de las verificaciones automatizadas realizadas por el agente.

## Defectos reproducidos y corregidos en esta fase

### PNGTuber: expresiones superpuestas

Se reprodujo el defecto con PNG transparentes que ocupan zonas distintas del lienzo. Durante el habla todavía se veía el sprite rojo de reposo bajo la zona transparente del sprite azul; la prueba falló antes de corregirlo.

Se añadió visibilidad exclusiva: **parpadeo > habla > reposo**. La misma lógica se aplica al video de preview y al render final. Se comprueba color/alfa por píxel en MP4 negro y WebM transparente, y se verifica que parpadear durante el habla oculta también el sprite de habla.

También se corrigió el análisis de audio: silencio total produce cero segmentos de habla y un archivo inválido se rechaza en vez de generar una duración ficticia de 60 segundos. Los videos finales y scripts de filtros usan nombres únicos. Los PNG fuente no se borran para alternar expresiones; no se cambió la política existente de limpieza de copias temporales al cerrar.

### Fades del editor legacy

El render real fallaba con `curve=linear`: FFmpeg informa que no existe esa constante. Se traduce a `tri`, su rampa lineal válida. La prueba verifica tanto render como procesamiento de selección y comprueba que fuera del rango seleccionado no se modifica el audio.

### Colisiones de salidas temporales

Dos renders del mismo milisegundo devolvían la misma ruta y se sobrescribían. Se reprodujo con un reloj fijo y solicitudes concurrentes. Se usan UUID en salidas de voz, subtítulos, selección, render, ducking, MP3, video final y scripts de filtros. Se mantienen campos de respuesta, extensiones y rutas públicas compatibles.

### Runtime Python y ASS

Se eliminó el fallback implícito a `python` del PATH. El servidor usa la ruta del Python embebido y, cuando SAPI necesita ejecutar el script por falta de exe, se comprueba que sea de 32 bits. Si falta el runtime no se intenta usar un Python del sistema. Las estrategias de subtítulos mantienen Whisper.cpp prioritario y el fallback matemático cuando corresponde.

Se corrigieron logs que atribuían 64 bits a ese fallback y se convirtió a raw string un docstring ASS con escapes inválidos. No se cambió `generar_voz.py`, su ciclo COM ni la ruta del exe; no fue necesaria recompilación Nuitka.

## Pruebas ejecutadas

Todos los comandos siguientes finalizaron satisfactoriamente en su versión final. No usan proyectos, diccionarios ni carpetas temporales activas del usuario.

| Comando | Resultado / alcance |
|---|---|
| `npm test` | **43 aprobadas, 0 fallidas, 0 omitidas**; incluye nuevas regresiones de PNGTuber, fades, selección, nombres concurrentes y runtime ausente |
| `node scripts/smoke_projects.cjs` | `PROJECTS_REAL_SERVER_PASS` / `PROJECTS_ELECTRON_PASS`: proyectos, portable, fuentes, copia recuperable, render y zoom con APIs reales |
| `node scripts/smoke_projects.cjs --desktop` | `DESKTOP_REAL_PASS` y salida 0: main/preload reales, puerto ocupado, IPC http/https, ventanas nuevas denegadas, navegación externa interceptada, diccionarios CRUD con Unicode y cierre con limpieza |
| `node scripts/smoke_projects.cjs --sapi` | `SAPI_RENDERER_PASS` / `SAPI_HTTP_ELECTRON_PASS`: detección real de voces, Jorge generada desde UI, calidad 16k mono, fade local, guardado/mezclador, subida PNG y preview/video MP4 reproducibles en la UI |
| `node scripts/smoke_audio_sessions.cjs` | `AUDIO_SESSIONS_ELECTRON_PASS`: migración, transacciones, reinicios, original offline, marcadores/FX y salidas; conserva su backend simulado para esos casos |
| `node node_modules/electron/cli.js scripts/smoke_mixer.cjs --full-page` | `MIXER_ELECTRON_PASS`: ondas y layout real, split/undo/redo, transporte, pan medido 0,500; último desfase 0,008 s |
| `node scripts/smoke_native.cjs` | `NATIVE_SMOKE_PASS`: SAPI, Whisper, ASS, exportación, ducking y LanguageTool reales |
| Python embebido con `ast.parse` y `-W error::SyntaxWarning` | 4 scripts válidos, runtime confirmado de 32 bits |
| `node scripts/check_build_prereqs.js` | Archivos exigidos presentes; es una comprobación de prerequisitos, **no un build** |
| `node --check` y `git diff --check` | 68 archivos JavaScript/CJS válidos y cambios sin errores de whitespace; no sustituyen los tests funcionales |
| Configuración de empaquetado | `preload.js`, `frontend/**/*` y `backend/services/**/*` presentes en `build.files`; Electron instalado 37.10.3. No se ejecutó electron-builder |

### Detalle de los componentes nativos

- Se verificó el header PE x86 de `generar_voz.exe` y se ejecutó desde otra carpeta. Script Python multivoz y exe terminaron con `EXITO`, sin el mensaje COM `releasing IUnknown`.
- SAPI real con Jorge/Carlos, pausas y acentos. Se verificó la calidad de salida con FFprobe: 16k mono mediante exe y 22,05k mediante fallback al Python embebido.
- Render WAV 24-bit, MP3, FLAC y Opus con pitch/rate, fades, filtros y normalización precisa; sonoridad resultante a menos de 1 LU del objetivo de −16 LUFS en los casos ejecutados.
- Ducking real con música en loop; duración final consistente con la voz. Conversión MP3 real.
- Whisper.cpp utilizó el modelo local `ggml-small.bin`, produjo texto/SRT con tiempos y el generador ASS procesó ese SRT con el Python embebido. No se descargaron modelos.
- LanguageTool/JRE se inició en un puerto local libre exclusivo del test y corrigió español. Se cerró solo ese proceso, sin usar/interrumpir un servidor del usuario en 8011.
- La prueba nativa generó salidas en una ruta de Windows **con espacios y acento**, y luego eliminó únicamente ese directorio propio.

### Aislamiento y límites de los smokes

Los smokes de escritorio/proyectos usan copias y junctions de solo lectura lógica hacia código/runtime, con DB, perfiles, audios y `LOQUENDO_DATA_DIR` propios. Se retiran las junctions antes de limpiar el sandbox. En `--desktop` se omiten intencionadamente los componentes nativos no utilizados y se simula la respuesta de voces; sus mensajes de componentes ausentes pertenecen al sandbox. `--sapi` sí incluye runtime y exe y no simula esa API.

Los enlaces externos del smoke desktop se interceptan; no se abre el navegador del usuario. Se exige salida de proceso 0 además de las aserciones del cierre. Se ajustó el harness para dejar terminar el quit real, después de observar un timeout cuando forzaba salida desde el evento de cierre.

Los smokes no son builds ni prueban un nuevo `app.asar`. La evaluación perceptual del timbre o de todas las voces no se sustituye por validar archivos y tiempos. El perfil temporal del smoke de ondas puede quedar retenido si Chromium bloquea su archivo DIPS; se informa sin tocar perfiles del usuario.

## Archivos y commits de código

- `2061aaf`: `backend/services/videoService.js`, `tests/pngtuber.test.js` — sprites exclusivos y análisis de silencio/error.
- `7d3284c`: `audioRenderService.js`, `audioService.js`, `server.js`, `generar_ass.py`, tests de audio/runtime y `scripts/smoke_native.cjs` — fades, nombres únicos y runtime x86.
- `5cc8df6`: `scripts/smoke_projects.cjs` — variantes desktop/SAPI y comprobación desde UI de video y diccionarios.
- README, índice y planes se actualizan con el informe final.

## Estado de Git y recuperación

Todos los cambios propios de estabilización están en commits locales de `feature/estabilizacion-1.2.0`. No se hizo push, merge ni rebase. Se conserva la modificación previa del usuario en `frontend/js/services/videoProcessor.js`, fuera de los commits del agente.

Respaldo inicial: rama `backup/loquendo-1.2.0-pre-estabilizacion`, commit `a06a655`, más `D:\Respaldo\LoquendoStudio-1.2.0-pre-estabilizacion-2026-10-28` (29.008 archivos comparados mediante SHA-256 al crearse). No se volvió a copiar ni modificar en esta fase. Contiene el estado anterior a estabilizar, no los commits posteriores.

Para recuperar código, abrir esa rama o extraer su `source-snapshot.zip` **en una carpeta nueva**. Las copias de `agents`, DB, runtime y distribución están junto al ZIP. No usar un reset/clean destructivo ni reemplazar datos de trabajo actuales como parte de la recuperación. Los commits de esta rama permiten revisar checkpoints posteriores sin alterar el respaldo inicial.

## Pendientes y evaluación de entrega

**Verificado como candidato de desarrollo**, no como distribución final certificada. Quedan:

1. Autorización explícita para generar un build; después comprobar asar/preload/módulos, recursos nativos y probar el artefacto en Windows. No se modificó la arquitectura Electron x64 + SAPI/Python x86.
2. Sesiones de voz IndexedDB siguen ligadas al perfil/origen: si cambia el puerto no se recupera automáticamente la sesión del otro puerto.
3. Editor multipista mantiene una fila por clip, sin multiselección; split dentro de un fade activo se rechaza para no deformarlo. No se persistió el historial completo de undo entre reinicios.
4. Portable TAR sin compresión, hasta 2 GiB/500 clips. No se ejecutaron pruebas de varios GiB ni de todos los codecs.
5. No se midió el consumo de memoria con proyectos de horas, cientos de clips o renders largos/4K. El preview no se certifica sample-accurate ni idéntico a toda la cadena FX de FFmpeg.

No se inicia otra fase ni se genera una distribución automáticamente al cerrar este informe.
