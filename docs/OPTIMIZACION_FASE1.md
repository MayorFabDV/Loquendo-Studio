# Optimización 1.2.0 — Fase 1: Subtítulos en mantenimiento

Fecha: 2026-11-22. Rama `feature/optimizacion-1.2.0`, base verificada `d1c02ea`. Árbol limpio antes de iniciar; etiqueta `respaldo-pre-optimizacion-1.2.0` en esa misma base. Biblioteca musical ya confirmada por el usuario; no se repitió su commit. `videoProcessor.js` estaba limpio y no se modificó.

## Implementación

- `backend/services/featurePolicy.js`: capacidades inmutables de la versión, independientes de ajustes o binarios presentes. `subtitlesUI=false`, `transcription=false`, `subtitleFiles=true`. LanguageTool sigue habilitado hasta su grupo de trabajo en Fase 4.
- `/api/features.js` comparte esa política con el renderer antes de cargar la aplicación; `/api/health` informa las mismas capacidades. Sin política cargada, la UI no habilita Subtítulos ni IA.
- Pestaña, paso de flujo, selección de pestaña inicial y navegación programática bloqueados. Aviso visible de mantenimiento. La preferencia antigua de pestaña inicial se conserva, pero se abre Guion; la preferencia IA también se conserva sin activar el checkbox ni enviar IA.
- Las funciones públicas de generación SRT/ASS de la UI se detienen antes de persistir audio o hacer peticiones.
- La ruta de voz ignora `usarIA:true` durante mantenimiento y `AudioService` aplica el mismo bloqueo para llamadas directas. La entrada directa a Whisper.cpp rechaza antes de lanzar un proceso.
- Se reutiliza el panel existente de marcadores SRT desde **Audio → Archivos SRT existentes**. No se construye otro editor. La onda permanece en Audio incluso si se intenta activar manualmente el evento de Subtítulos.

## Operaciones independientes conservadas

La pestaña está deshabilitada; las utilidades de archivos no están ligadas a la transcripción:

- Cargar, editar y descargar marcadores SRT desde Audio, sin cambiar el archivo original.
- Lectura/descarga de archivos SRT/ASS existentes por sus rutas habituales.
- `POST /api/generar-srt` con `metodo: 'plantilla'`, `audioPath` y `textoOriginal`: plantilla aproximada mediante el generador matemático existente, sin IA. No es alineación por reconocimiento de voz.
- `POST /api/generar-ass` con un `srtPath` existente o con `metodo: 'plantilla'`: conversión con el Python embebido x86. El proceso recibe `LOQUENDO_TRANSCRIPTION_ENABLED=0`; los scripts omiten incluso la importación de Whisper en ese modo.
- Solicitudes de generación sin una entrada independiente explícita responden `503`, código `TRANSCRIPTION_DISABLED`. Un SRT inexistente o con extensión incorrecta responde `400` sin fallback a transcripción.

Se conservan todos los caminos fuente para una futura reactivación. Las nuevas salidas SRT/ASS usan UUID para no sobrescribir archivos entre peticiones concurrentes. No se elimina ningún proyecto o archivo del usuario al deshabilitar la función. La política preexistente de temporales no se cambia.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm test` | 55 aprobadas, ninguna omitida |
| `node scripts/smoke_projects.cjs --maintenance` | Electron/Express reales: pestaña inicial antigua, navegación bloqueada, IA guardada desactivada, handlers sin llamadas, APIs bloqueadas, plantilla SRT, ASS real desde SRT/plantilla, SRT ausente sin fallback, importación/descarga de marcadores y originales conservados |
| `node scripts/smoke_projects.cjs --sapi` | SAPI real Jorge, WAV 16k, edición/persistencia/mezclador y preview/video PNGTuber reales; petición API directa `usarIA:true` produce solo voz, sin SRT/ASS |
| `node scripts/smoke_projects.cjs --external-audio` | WAV/MP3, inválido, silencio y MP4/WebM reales; aprobado |
| `node scripts/smoke_projects.cjs --desktop --music-library` | Main/preload/IPC y ducking reales entre dos procesos; biblioteca/faltantes/localización/originales intactos; aprobado |
| `node scripts/smoke_audio_sessions.cjs --recovery-ux` | Siete procesos, decisiones de recuperación y protección de datos; aprobado |
| `node scripts/smoke_audio_sessions.cjs` | Sesiones, original offline, FX, marcadores y rutas de salida; aprobado |
| `node node_modules/electron/cli.js scripts/smoke_mixer.cjs --full-page` | Ondas 830/550 px, split, undo/redo y balance 0,500; aprobado |

La prueba de servicio simula únicamente la síntesis para verificar que con IA solicitada y binarios presentes no se lanza ningún proceso de transcripción. El smoke de mantenimiento usa Express y conversiones Python reales, con una barrera de prueba que rechaza intentos de iniciar Whisper o `generar_srt.py` y comprueba el entorno de conversión ASS. Los smokes son aislados: no escriben en los datos reales del usuario.

El smoke base de sesiones conserva una política simulada habilitada exclusivamente para probar los handlers legacy retenidos para reactivación. La variante recovery-ux y los smokes con servidor real usan la política de mantenimiento vigente.

Sintaxis: 13 archivos JS/CJS y ambos scripts de subtítulos validados; Python comprobado mediante AST con el intérprete embebido, sin generar cachés. El mezclador informó `EBUSY` al retirar DIPS de su perfil temporal después de aprobar sus comprobaciones.

## Continuidad

- Fase 2: aislar la llamada COM que falla con Leonor y preparar diagnóstico comparable. Sin arreglo especulativo ni modificación del registro.
- Fase 3: reproducir y corregir idle con cambios repetidos de audio; las pruebas actuales no sustituyen esa reproducción específica.
- Fase 4: exclusiones de paquete por grupos y medición de carpeta desempaquetada autorizada. Esta fase todavía no excluye Java/LanguageTool/Whisper ni modifica el empaquetado.
- Fase 5: propuesta concreta y aprobación antes del conjunto inicial de nuevas expresiones.
