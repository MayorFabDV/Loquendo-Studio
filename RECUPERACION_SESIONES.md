# Recuperación explícita de sesiones y mezclador Alpha

Verificación: 2026-11-18. Rama: `feature/recuperacion-sesiones-alpha`.

## Comportamiento

- El mezclador muestra la etiqueta **Alpha** y una recomendación discreta de guardar los proyectos.
- Detectar sesiones no cambia de pestaña ni carga automáticamente el editor de voz.
- Si hay una mezcla válida, se ofrece una vez por arranque: «Encontramos una sesión anterior del mezclador. ¿Quieres recuperarla y abrir el mezclador?».
- «Recuperar y abrir el mezclador» recupera exclusivamente la mezcla. «Permanecer aquí» conserva las sesiones para después, incluso si se inicializa una mezcla vacía y se autoguarda.
- El acceso **Recuperar sesiones anteriores**, bajo la cabecera, permite recuperar voz y mezcla por separado, así como el trabajo archivado antes de otra recuperación.
- Reemplazar trabajo actual sin guardar requiere «Guardar y recuperar» o «Cancelar». Si falla el guardado, no se aplica la sesión anterior.
- Los medios ausentes conservan clips, recortes, tiempos y efectos. Se utiliza el flujo existente **Recuperar fuente**.
- Los datos vacíos o inválidos no provocan una oferta automática ni se eliminan al detectarlos.

## Conservación y compatibilidad

`sessionRecovery.js` coordina detección, confirmación y recuperación. Antes de permitir escrituras del autoguardado se conserva un checkpoint independiente de cada tipo. Si la lectura o conservación falla, se bloquea la escritura correspondiente y se muestra **Reintentar detección**.

Se mantiene IndexedDB `loquendo-audio-sessions` versión 2 y su almacén `metadata`: claves `recovery.pending.voice`, `recovery.pending.mixer` y `recovery.saved.<tipo>.<id>`. La recuperación confirmada consume únicamente su checkpoint pendiente. No cambia el formato JSON v2 de proyectos ni las rutas de sus assets.

Si al reiniciar existe un checkpoint antiguo y trabajo activo diferente más reciente, se archiva también ese trabajo antes de permitir su reemplazo. Las huellas SHA-256 evitan repetir ese mismo archivo de recuperación en cada arranque. Sin soporte de huellas se conserva otra copia.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm test` | 51 pruebas aprobadas, ninguna omitida |
| `node scripts/smoke_audio_sessions.cjs --recovery-ux` | Siete procesos Electron: vacío, detección, permanecer, recarga, aceptación, recuperación posterior y corrupción; aprobado |
| `node scripts/smoke_audio_sessions.cjs` | Migración, atomicidad IndexedDB, original offline, FX, marcadores y salidas; aprobado |
| `node scripts/smoke_projects.cjs` | Express/Electron y archivos reales: guardado, catálogo, portable, reasignación de fuentes, copia recuperable y render; aprobado |
| `node node_modules/electron/cli.js scripts/smoke_mixer.cjs --full-page` | HTML/CSS reales; ondas con 830 y 550 px, offset, split, undo/redo, reproducción y balance 0,500; aprobado |

El smoke de UX usa HTML/CSS, IndexedDB, localStorage y procesos Electron reales con perfil aislado; simula los endpoints de audio/proyectos y provoca abortos reales de transacciones y respuestas HTTP 503. No representa un build distribuido. Las pruebas de proyectos y los renders de la suite usan backend/FFmpeg reales en sus respectivos sandboxes.

Se corrigió una espera de prueba basada en pocos ciclos del event loop: las operaciones WebCrypto ahora se esperan con plazo temporal. El smoke del mezclador informó bloqueo `EBUSY` de `DIPS` al borrar su perfil temporal después de aprobar sus comprobaciones.

## Límites

- Voz y checkpoints siguen vinculados al perfil y origen de Chromium, incluido el puerto. No se buscan automáticamente sesiones de otro puerto.
- Los checkpoints archivados no se purgan automáticamente y pueden ocupar espacio adicional, especialmente con audio largo.
- Una mezcla sin clips no se ofrece como sesión recuperable; los proyectos vacíos siguen siendo compatibles con el almacenamiento existente.
- La comprobación visual automatizada no sustituye una revisión manual de todos los temas y tamaños de pantalla.
- La distribución empaquetada y su ASAR quedan pendientes de verificación específica.
