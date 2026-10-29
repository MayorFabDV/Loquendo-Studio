# Estabilización 1.2.0 — Fase 2: mezclador

Fecha: 2026-10-29. Rama: `feature/estabilizacion-1.2.0`.

## Alcance y estado

Fase 2 finalizada. Se conservaron Electron, WaveSurfer-Multitrack, Tone.js y FFmpeg; no se instalaron dependencias ni se ejecutaron builds de distribución. No se modificaron los respaldos ni se utilizaron proyectos o diccionarios del usuario en las pruebas.

La Fase 1 permanece en `82c1a0a` y `fc84a7b`. El respaldo previo permanece en la rama `backup/loquendo-1.2.0-pre-estabilizacion`, commit `a06a655`, y en `D:\Respaldo\LoquendoStudio-1.2.0-pre-estabilizacion-2026-10-28`.

## Cambios implementados

- Cargar un proyecto ya no elimina los clips adicionales de voz y música. Se conserva el formato JSON v2 y la lectura de datos legacy.
- Se conservan los parámetros de pista, efectos por clip y master al normalizar, guardar y recuperar el estado local. Añadir o quitar un clip no reinicia los ajustes de las demás pistas.
- Los clips con medios ausentes se conservan. Se advierte del problema y se bloquean preview/render hasta recuperar los medios o retirar explícitamente los clips. El selector de clips permite seleccionar y eliminar uno aunque su onda no se pueda cargar. Exportar el JSON conserva las referencias aunque los medios falten.
- Operaciones: split en cursor, copiar/cortar/pegar, duplicar al final del clip, eliminar, mover con posición numérica y recortar mediante entrada/salida de la fuente.
- Historial en memoria de hasta 100 estados del proyecto, sin duplicar ondas/picos. Incluye undo/redo, invalida redo tras una edición nueva y guarda el estado resultante en localStorage. El historial no se persiste entre reinicios.
- Nuevos controles en la barra del mezclador. Atajos limitados al mezclador visible y fuera de campos de edición: `S`, `Delete`, `Ctrl/Cmd+C/X/V`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` y `Ctrl/Cmd+Y`.
- Añadir voz o música ya no reemplaza automáticamente todos los clips de esa categoría.
- Añadir voz espera la persistencia de la versión editada. Si la subida falla, no se añade silenciosamente la versión antigua. Una subida que termina después de cargar/editar otro audio no publica su ruta obsoleta.
- El preview compensa `clip.in` al convertir posición de proyecto a posición de fuente. Mantiene el cursor al reconstruir y espera la carga antes de reproducir. Las reconstrucciones rápidas se encolan y los callbacks de instancias obsoletas se ignoran.
- Balance estéreo con Web Audio nativo, usando la misma atenuación de canales que el render FFmpeg. Incluye ganancia/mute de pista y ganancia master. El mezclador pausa la reproducción del editor de voz al iniciar.
- El transporte se detiene en la duración efectiva del proyecto, no al terminar las colas silenciadas de los archivos fuente.
- FFmpeg interpola los puntos de automatización exteriores antes del trim, conserva rampas al dividir y evalúa ganancia en bloques de 128 muestras para reducir saltos. `fadeCurve: linear` se traduce a `tri`, el nombre de FFmpeg para una rampa lineal.
- Los renders incluyen UUID para evitar sobrescribir dos salidas del mismo proyecto generadas en el mismo segundo.

## Commits funcionales

| Commit | Bloque |
|---|---|
| `a19ac0a` | Integridad de proyectos, clips múltiples, medios ausentes y round-trip de parámetros |
| `d7cd8c9` | Operaciones de clips, historial, controles e integración de voz editada |
| `08bf942` | Automatización con trim, fades lineales y nombres únicos de render |
| `0ddb6aa` | Preview, offset, paneo, ciclo de reconstrucción y smoke Electron |
| `67112dc` | Ajustes de pistas vacías y regresiones de almacenamiento/subidas obsoletas |
| `54672b8` | Espera de medios tras seek y cancelación de reproducción pendiente |

## Pruebas y cómo repetirlas

### Node y FFmpeg

```powershell
npm test
```

Resultado: **17 pruebas aprobadas, ninguna omitida** en el entorno de esta revisión (incluye las seis de Fase 1).

- `tests/mixer.test.js`: múltiples clips, round-trip por almacenamiento local, parámetros de pista/master/FX, proyectos legacy y vacíos, conservación de medios ausentes y bloqueo de render antes de escribir, split con offset, clipboard independiente e IDs únicos, undo/redo, movimiento, recorte, pistas vacías, fallo de almacenamiento, voz editada/fallo de persistencia, subida obsoleta y cancelación de reproducción pendiente.
- `tests/mixerAudio.test.js`: ejecuta los binarios reales `backend/bin/ffmpeg.exe` y `ffprobe.exe`, genera un seno estéreo en un directorio temporal exclusivo y renderiza el proyecto. Compara samples de original/split, retardo inicial, duración, relación de canales del paneo, ganancia de −6 dB, fades y nombres únicos. La prueba se omite explícitamente si esos binarios no están disponibles.
- Las pruebas eliminan únicamente sus propios directorios temporales creados con `mkdtemp`.
- Los mensajes de medios ausentes en el test son fallos esperados e inyectados, no un error de la suite.

### Electron real, sin arrancar la aplicación del usuario

```powershell
node node_modules/electron/cli.js scripts/smoke_mixer.cjs
```

Resultado: **`MIXER_ELECTRON_PASS`**, exit code 0.

El smoke crea un perfil temporal y un servidor HTTP local con audio/picos sintéticos (incluye soporte Range). Carga las bibliotecas y módulos reales del mezclador en un renderer Electron aislado. Comprueba offset de fuente, split, undo/redo, ediciones rápidas, reconstrucciones, reproducción, fin de proyecto y ausencia de excepciones/rechazos no controlados. Mide los canales después del balance Web Audio con analizadores: relación izquierda/derecha **0,500** con pan derecho de 0,5; en la última ejecución, desfase fuente/cursor **0,013 s**, por debajo del umbral de 0,35 s usado en el smoke.

También se ejecutó `node --check` sobre 58 archivos JavaScript/CJS rastreados y `git diff --check` sobre los cambios.

## Límites y pendientes

- La visualización conserva una fila por clip de la biblioteca actual. Las categorías Voz/Música/SFX admiten varios clips, pero no se implementaron carriles visuales compartidos ni pistas de tipo arbitrario.
- El split exige al menos 0,01 s por lado y se rechaza dentro de un fade activo para evitar alterar su curva. Dividir ese caso manteniendo exactamente el fade queda pendiente.
- Selección de un clip y edición numérica de rangos; no hay multiselección ni selección de rango global arrastrable entre varias pistas.
- La automatización y la sincronización del motor actual son aproximadas; no se garantiza precisión sample-accurate en preview. El backend usa evaluación de ganancia por bloques, no por muestra.
- Se comprobó numéricamente ganancia, pan, tiempos y fades. No se certifica igualdad de toda la cadena FX/limiter/loudness entre preview y export. Los FX de Tone del editor legacy no se transfieren implícitamente al mezclador; se añade el audio editado persistido.
- El JSON sigue siendo una referencia a medios externos, no un contenedor portable. No se implementó relink gráfico de archivos faltantes.
- No se ejecutaron SAPI, Whisper ni renders PNGTuber en esta fase. El smoke no sustituye una revisión visual/auditiva completa de la aplicación ni una prueba de la distribución empaquetada.
- Las sesiones IndexedDB y la recuperación del original del editor legacy siguen pendientes de su fase correspondiente.

### PNGTuber — defecto registrado, sin corregir en Fase 2

Al cambiar de expresión, los PNG anteriores permanecen visibles y se superponen en el video generado. La previsualización reproduce ese video temporal y refleja el mismo defecto.

Comportamiento deseado: **visibilidad exclusiva por expresión**, como el ojo de las capas de GIMP. Activar un sprite debe ocultar el anterior sin borrar los archivos originales. Pendiente de diagnóstico/corrección en una fase posterior autorizada.

## Punto de continuación

Detenerse al finalizar esta fase. No comenzar Fase 3 sin aprobación del usuario. Priorizar después la revisión del editor legacy, portabilidad/recuperación de medios y regresión completa, según el alcance que se apruebe.
