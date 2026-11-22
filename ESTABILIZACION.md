# Loquendo Studio 1.2.0 — Seguimiento de estabilización

Última actualización: 2026-11-22.

Este es el índice de las etapas operativas del trabajo. La misión original agrupaba auditoría, implementación, pruebas y entrega en fases generales; aquí se registra la secuencia incremental usada en las sesiones. Las pruebas y la documentación forman parte de cada etapa, no se posponen hasta el final.

## Estado y orden de trabajo

| Etapa | Alcance | Estado |
|---|---|---|
| 0 | Protección del repositorio, respaldo y auditoría inicial | Completada |
| 1 | Arranque, puertos, acceso local y cierre de Electron | Completada |
| 2 | Pruebas, integridad de proyectos y edición en el mezclador | Completada; fallo de ondas corregido y confirmado por el usuario |
| 3 | Estabilizar las sesiones del editor de voz legacy y su integración | Completada y verificada; límites en `ESTABILIZACION_FASE3.md` |
| 4 | Gestión/recuperación de proyectos y exportación portable compatible | Completada; informe en `ESTABILIZACION_FASE4.md` |
| 5 | Regresión completa, documentación y evaluación para entrega | Completada en desarrollo; build/asar pendientes de autorización |

Las Fases 3, 4 y 5 fueron aprobadas y ejecutadas después de consolidar este registro. El usuario confirmó también la verificación manual del flujo de proyectos de la Fase 4.

## Etapa 0 — Protección y auditoría

- [x] Inspeccionar cambios existentes y preservar código nuevo y eliminaciones previas.
- [x] Crear rama `backup/loquendo-1.2.0-pre-estabilizacion`, snapshot `a06a655`.
- [x] Crear rama de trabajo `feature/estabilizacion-1.2.0`.
- [x] Copiar respaldo a `D:\Respaldo\LoquendoStudio-1.2.0-pre-estabilizacion-2026-10-28`.
- [x] Verificar igualdad SHA-256 de 29.008 archivos entre las copias temporal y permanente.
- [x] Auditar el código sin considerar los planes históricos como prueba de implementación.

El respaldo no se modifica durante las siguientes etapas. No representa una copia actualizada de los cambios posteriores a `a06a655`.

## Etapa 1 — Arranque y acceso local

- [x] Esperar el puerto realmente ligado y corregir el fallback si el inicial está ocupado.
- [x] Limitar Express a localhost y restringir orígenes de la API.
- [x] Mantener LanguageTool local sin exposición pública explícita.
- [x] Esperar la limpieza asíncrona antes de cerrar Electron.
- [x] Pruebas focalizadas y commits `82c1a0a`, `fc84a7b`.

## Etapa 2 — Mezclador

- [x] Conservar múltiples clips y parámetros de pista/master/efectos al guardar y cargar.
- [x] Conservar clips con medios ausentes y bloquear el render hasta resolverlos.
- [x] Split, copiar/cortar/pegar, duplicar, mover, recortar, eliminar y undo/redo.
- [x] Asegurar entrega de la voz editada sin publicar subidas obsoletas.
- [x] Corregir offsets, paneo, automatización y transporte; probar audio con FFmpeg real.
- [x] Pruebas Node: 17 aprobadas, ninguna omitida en la última ejecución.
- [x] Smoke Electron aislado y variante con HTML/CSS reales.
- [x] Corregir ancho cero de las ondas; usuario confirma que se ven correctamente.

Informe, comandos, commits y limitaciones: [ESTABILIZACION_FASE2.md](ESTABILIZACION_FASE2.md). Corrección posterior de ondas: `ff63b81`.

## Etapa 3 — Editor de voz legacy (completada)

Objetivo: completar el trabajo de sesiones ya iniciado y hacer fiable su integración con el mezclador, sin construir un segundo editor multipista.

- [x] Revisar el código actual y reproducir fallos antes de corregirlos.
- [x] Recuperar la sesión de edición tras recarga/reinicio en el mismo perfil y origen.
- [x] Conservar un audio original restaurable aunque se limpien los temporales.
- [x] Manejar errores de IndexedDB, registros incompletos y subidas concurrentes.
- [x] Sincronizar audio, marcadores y estado visible al recuperar/restaurar.
- [x] Verificar entrega de rutas al mezclador y salidas con backend simulado; no equivale a renders reales de Whisper/PNGTuber.
- [x] Añadir pruebas focalizadas, ejecutar regresiones y hacer commits locales.
- [x] Documentar resultados, limitaciones y punto de continuación en `ESTABILIZACION_FASE3.md`.

Referencias: `audioProcessor.js`, `audioSessionStore.js`, `audioPlayer.js`, `audioRenderUI.js`, `main.js`, `index.html` y `helpTexts.js`. El alcance concreto de las correcciones depende de la revisión del código real.

Resultado: 27 pruebas Node/FFmpeg aprobadas; smoke de sesiones con cinco procesos Electron separados; regresión del mezclador con HTML/CSS reales aprobada. El estado del editor se conserva en IndexedDB por origen: si cambia el puerto de la app, no se busca automáticamente la sesión del puerto anterior. Ese caso queda pendiente.

## Etapa 4 — Proyectos y medios (completada)

- [x] Completar guardado/carga e integridad; guardar revisiones ordenadas y conservar copia anterior recuperable.
- [x] Reasignar fuentes ausentes desde el mezclador sin cambiar recortes, tiempos ni FX.
- [x] Añadir paquete `.loquendo.tar` opcional con JSON v2 y medios referenciados, hashes y activación bajo un ID nuevo.
- [x] Mantener lectura de JSON legacy/v2 sin dependencias nuevas; rechazar documentos incompatibles en lugar de abrirlos parcialmente.
- [x] Probar ida y vuelta y recuperación con Node y con Express/Electron/FFmpeg reales en un sandbox.

Las protecciones contra pérdida de clips ya implementadas en la Etapa 2 no deben rehacerse ni retirarse.

Resultado de esa fase: 39 pruebas Node aprobadas; `PROJECTS_REAL_SERVER_PASS`, `PROJECTS_ELECTRON_PASS` y regresiones de Fases 2/3 aprobadas. Comandos, uso y límites en [ESTABILIZACION_FASE4.md](ESTABILIZACION_FASE4.md). La regresión final se registra en la Fase 5; los builds siguen requiriendo autorización específica.

## Etapa 5 — Regresión y cierre (completada en desarrollo)

- [x] Verificar main/preload/IPC reales, puerto ocupado, voz SAPI x86, edición, mezclador y proyectos.
- [x] Comprobar Whisper local, ASS, LanguageTool, exportaciones y PNGTuber con datos aislados.
- [x] Revisar excepciones, cierre/limpieza y rutas con espacios/acentos en Windows dentro de los casos ejecutados.
- [x] Corregir superposición de sprites PNGTuber, fades lineales inválidos y colisiones de nombres de salidas; proteger el runtime Python de 32 bits.
- [x] Actualizar informes, estado de Git y limitaciones en `ESTABILIZACION_FASE5.md`.
- [ ] Generar distribución y validar el nuevo asar: pendiente de autorización específica; no ejecutado.

Resultado final: **43 pruebas Node aprobadas, ninguna omitida**, smokes de main/preload, SAPI+video desde UI con backend real, native stack, proyectos, sesiones y mezclador aprobados. No se equipara esta verificación de desarrollo con una distribución empaquetada validada.

## PNGTuber — pendiente resuelto en Fase 5

**Resuelto y verificado:** el sprite de reposo permanecía debajo del de habla/parpadeo. Se aplica visibilidad exclusiva con prioridad parpadeo → habla → reposo tanto en preview como en render.

Se verificaron píxeles de sprites transparentes en MP4 y WebM con alfa, incluido parpadeo durante el habla. Los PNG originales se conservan durante el render. La política de limpieza de copias temporales al cerrar la app no se cambió.

## Reglas vigentes

- Rama activa de la nueva fase: `feature/optimizacion-1.2.0`, desde `d1c02ea`. La recuperación explícita y las mejoras de audio/biblioteca se conservan en sus ramas y commits anteriores.
- Pruebas y commits locales pequeños después de cada bloque verificable.
- Resumir cada fase antes de continuar con la siguiente.
- No tocar respaldos, datos del usuario o ramas remotas.
- No instalar dependencias ni introducir incompatibilidades sin autorización específica. Está autorizada una carpeta desempaquetada de prueba para medir tamaño y comprobar el paquete; no un instalador de publicación.
- No confundir verificación histórica o sintáctica con una prueba funcional actual.

## Mejora posterior — Recuperación explícita y etiqueta Alpha

Implementada y verificada en desarrollo: recuperación independiente de voz y mezcla, decisión explícita al arrancar, conservación al permanecer y protección del trabajo nuevo antes de recuperar. Informe y límites en [RECUPERACION_SESIONES.md](RECUPERACION_SESIONES.md).

Resultado actualizado: **51 pruebas Node aprobadas**, smoke de UX con siete procesos Electron y regresiones de sesiones, proyectos y mezclador aprobadas.

## Mejoras posteriores — Audio externo PNGTuber y biblioteca de ducking

Implementadas y verificadas en desarrollo. PNGTuber admite WAV/MP3 con preview sincronizada; ducking incorpora Recientes/Mi biblioteca mediante referencias persistentes, selector nativo y localización de originales ausentes. Informe: [MEJORAS_AUDIO_1_2.md](MEJORAS_AUDIO_1_2.md).

Resultado actualizado: **54 pruebas Node aprobadas**, exportaciones PNGTuber MP4/WebM reales con audio y silencio, biblioteca comprobada entre dos arranques de Electron con ducking real y regresiones de proyectos/sesiones/mezclador aprobadas. Distribución pendiente.

## Nueva estabilización y optimización 1.2.0 — Plan aprobado

Estado de Git verificado antes de modificar archivos: árbol limpio, rama `feature/optimizacion-1.2.0`, HEAD `d1c02ea` (`feat: add music library and finalize audio workflow improvements`). La etiqueta `respaldo-pre-optimizacion-1.2.0` apunta a ese commit y la rama `feature/audio-externo-biblioteca-1.2.0` permanece conservada. `videoProcessor.js` no tiene cambios pendientes. No repetir el commit de la biblioteca, crear otra rama ni restaurar archivos según información histórica.

| Fase | Alcance aprobado | Estado |
|---|---|---|
| 1 | Bloquear temporalmente la pestaña Subtítulos y los procesos de transcripción; conservar código y operaciones SRT/ASS independientes | Completada en desarrollo; informe en `OPTIMIZACION_FASE1.md` |
| 2 | Investigar Leonor/COM y generación simple/multivoz; preparar diagnóstico comparable para el tester | Diagnóstico implementado y verificado; causa bloqueada por falta del informe del tester (`OPTIMIZACION_FASE2.md`) |
| 3 | Reproducir y corregir idle al cambiar de audio; verificar preview y exportaciones | Pendiente |
| 4 | Excluir JRE/Java, LanguageTool y Whisper/modelo de la distribución; optimizar residuos por grupos y medir paquete desempaquetado | Pendiente |
| 5 | Presentar propuesta concreta de expresiones y compatibilidad; tras aprobación implementar un primer conjunto pequeño | Pendiente de propuesta y aprobación específica |

### Orden, dependencias y aceptación

1. **Subtítulos:** política compartida frontend/backend, bloqueo de pestaña/paso de flujo/navegación programática y pestaña inicial guardada; no activar IA desde ajustes antiguos o peticiones directas. Revisar el traslado de la onda a Subtítulos. Conservar archivos, marcadores y utilidades SRT/ASS sin Whisper.
2. **Leonor:** distinguir enumeración/selección/asignación de token, apertura y formato del stream, `Speak`, cierre y liberación COM. Informar IDs de token, arquitectura x86, HRESULT/excepinfo y traceback por etapa. Comparar texto plano, etiquetas y cambios de voz, script y exe. Que aparezca `generar_audio_multivoz` en una traza no demuestra que multivoz sea la causa. No modificar registro, reinstalar voces ni aplicar arreglos especulativos; documentar lo que deba ejecutar el tester.
3. **PNGTuber:** probar en una misma ventana cambios WAV/MP3 repetidos, silencio, fuentes Studio/externas y respuestas tardías. Revisar revisiones de fuente, listeners/temporizadores, rutas y análisis de silencio. Mantener prioridad exclusiva blink > talking > idle y comprobar MP4/WebM, incluido alfa.
4. **Optimización por grupos:** primero desactivar limpiamente arranque/controles de LanguageTool; después excluir Java/JRE/LanguageTool y Whisper/modelo/dependencias exclusivas, impidiendo también fallback Whisper Python. Preservar puntuación y diccionarios propios, SAPI, FFmpeg, FFprobe y runtime x86. Auditar DLL y dependencias antes de excluir herramientas Python, cachés, `.git` y residuos. No borrar código fuente. Medir bytes/archivos/ahorro por grupo frente al artefacto anterior disponible; usar una salida desempaquetada separada, sin limpiar el respaldo anterior, y verificar ASAR/preload y ejecución empaquetada.
5. **Expresiones:** definir catálogo extensible, compatibilidad con idle/talking/blink, activación manual o por intervalos, prioridades y fallback de imágenes ausentes. Presentar la propuesta antes de implementar un conjunto inicial pequeño. Sin detección automática de emociones.

Pruebas automatizadas y Electron reales por fase; commits independientes y actualización de continuidad después de cada una. Mantener recuperación de sesiones, audio externo y biblioteca musical. Editor de audio y ampliaciones multipista fuera de alcance salvo correcciones necesarias para evitar regresiones. No se autoriza un instalador de publicación.

### Continuidad tras Fase 1

- Política central de mantenimiento implementada en frontend/backend; no inicia transcripción desde la UI, la API ni el servicio de audio aunque se solicite IA.
- El editor existente de marcadores SRT permanece accesible desde Audio. Plantillas explícitas y conversión SRT a ASS funcionan sin Whisper; archivos originales conservados en las pruebas.
- **55 pruebas Node aprobadas, ninguna omitida**. Smokes Electron de mantenimiento, SAPI real (incluida petición API con `usarIA:true`), audio externo, biblioteca musical entre reinicios, recuperación, sesiones base y mezclador aprobados.
- No se modificó `generar_voz.py`, no se recompiló el exe ni se retiraron componentes del paquete en esta fase. No se generó distribución.
- Siguiente fase: diagnóstico reproducible Leonor/COM, sin atribuir aún la causa a multivoz. Informe técnico de esta fase: [OPTIMIZACION_FASE1.md](OPTIMIZACION_FASE1.md).

### Continuidad tras investigación local de Fase 2

- Herramienta independiente en `tools/diagnostico_sapi/`, lanzador `Diagnosticar_Leonor.cmd`: usa el Python embebido x86, sin instalar nada ni modificar registro/archivos de Studio. Produce `para_compartir.zip` con Markdown/JSON depurados, sin WAV ni rutas personales.
- Se comparan COM mínimo, script original y exe original, texto plano/XML, etiquetas de voz, formato/reasignación y cambios Jorge/Leonor en procesos separados. Se registra llamada/línea original, token, arquitectura, HRESULT externo e interno (`excepinfo`), timeouts y fallos nativos.
- Leonor está instalada localmente y **26 comprobaciones reales pasaron**, incluido el listado usado por Studio. También pasó la generación real de Leonor desde Electron. **No se reprodujo el error del tester**; no se atribuyó a multivoz ni se aplicó un cambio especulativo de síntesis.
- **56 pruebas en `npm test` aprobadas**, incluida una prueba que ejecuta siete verificaciones Python del diagnóstico. Smoke de mantenimiento de Fase 1 y smoke SAPI/Electron con Leonor aprobados.
- Commit de herramienta/pruebas: `d7b7a1f`. Se preservan `generar_voz.py`, exe y política de Fase 1 sin modificaciones. No se inició Fase 3 ni se generó distribución.
- **Bloqueo externo:** falta ejecutar la herramienta sobre la instalación que falla y recibir su `para_compartir.zip`, versión/arquitectura de Loquendo TTS, captura/traza original depurada y, si los casos fijos pasan, una frase mínima sin datos personales que reproduzca el error. Procedimiento y referencia local: [OPTIMIZACION_FASE2.md](OPTIMIZACION_FASE2.md).
