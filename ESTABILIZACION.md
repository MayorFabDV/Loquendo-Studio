# Loquendo Studio 1.2.0 — Seguimiento de estabilización

Última actualización: 2026-10-29.

Este es el índice de las etapas operativas del trabajo. La misión original agrupaba auditoría, implementación, pruebas y entrega en fases generales; aquí se registra la secuencia incremental usada en las sesiones. Las pruebas y la documentación forman parte de cada etapa, no se posponen hasta el final.

## Estado y orden de trabajo

| Etapa | Alcance | Estado |
|---|---|---|
| 0 | Protección del repositorio, respaldo y auditoría inicial | Completada |
| 1 | Arranque, puertos, acceso local y cierre de Electron | Completada |
| 2 | Pruebas, integridad de proyectos y edición en el mezclador | Completada; fallo de ondas corregido y confirmado por el usuario |
| 3 | Estabilizar las sesiones del editor de voz legacy y su integración | Aprobada por el usuario; implementación aún no iniciada |
| 4 | Gestión y recuperación de proyectos; investigación de exportación portable | Pendiente |
| 5 | Regresión completa, documentación y evaluación para entrega | Pendiente |

La Fase 3 se aprueba en la conversación después de confirmar que las ondas del mezclador vuelven a verse. El siguiente mensaje solicita consolidar primero este registro.

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

## Etapa 3 — Editor de voz legacy (aprobada)

Objetivo: completar el trabajo de sesiones ya iniciado y hacer fiable su integración con el mezclador, sin construir un segundo editor multipista.

- [ ] Revisar el código actual y reproducir fallos antes de corregirlos.
- [ ] Recuperar la sesión de edición tras recarga y reinicio de la aplicación.
- [ ] Conservar un audio original restaurable aunque se limpien los temporales.
- [ ] Manejar errores de IndexedDB, registros incompletos y subidas concurrentes.
- [ ] Sincronizar audio, marcadores y estado visible al recuperar/restaurar.
- [ ] Verificar que mezclador, exportación, subtítulos y video reciben el audio correcto.
- [ ] Añadir pruebas focalizadas, ejecutar regresiones y hacer commits pequeños.
- [ ] Entregar resumen de resultados y pendientes antes de continuar.

Referencias: `audioProcessor.js`, `audioSessionStore.js`, `audioPlayer.js`, `audioRenderUI.js`, `main.js`, `index.html` y `helpTexts.js`. El alcance concreto de las correcciones depende de la revisión del código real.

## Etapa 4 — Proyectos y medios

- [ ] Completar la revisión de guardado/carga, integridad de assets y recuperación ante errores.
- [ ] Evaluar recuperación/reasignación de medios faltantes, manteniendo los clips del proyecto.
- [ ] Investigar un paquete portable adicional con JSON y medios incluidos.
- [ ] Mantener compatibilidad con proyectos existentes. Pedir autorización si una solución exige cambios incompatibles o nuevas dependencias.
- [ ] Probar ida y vuelta de proyectos y documentar lo que quede pendiente.

Las protecciones contra pérdida de clips ya implementadas en la Etapa 2 no deben rehacerse ni retirarse.

## Etapa 5 — Regresión y cierre

- [ ] Verificar inicio, voz SAPI con Python embebido de 32 bits, edición, mezclador y proyectos.
- [ ] Comprobar subtítulos, exportaciones y PNGTuber con datos de prueba aislados.
- [ ] Revisar errores de consola, recursos y compatibilidad Windows.
- [ ] Actualizar informes y entregar estado final de Git, pruebas y limitaciones.
- [ ] Solicitar autorización específica antes de cualquier build de distribución y posterior validación del asar.

## Pendiente transversal: PNGTuber

**Registrado, todavía sin resolver:** al cambiar de expresión, los PNG anteriores permanecen visibles y se superponen. La previsualización reproduce el mismo video temporal y muestra el defecto.

Comportamiento deseado: visibilidad exclusiva por expresión, similar al ojo de las capas de GIMP; activar un sprite oculta el anterior sin borrar sus archivos. Su fase de corrección se decidirá con el usuario; no forma parte de la implementación de sesiones legacy.

## Reglas vigentes

- Trabajar exclusivamente en `feature/estabilizacion-1.2.0`, preservando cambios ajenos.
- Pruebas y commits locales pequeños después de cada bloque verificable.
- Resumir cada fase antes de continuar con la siguiente.
- No tocar respaldos, datos del usuario o ramas remotas.
- No instalar dependencias, ejecutar builds de distribución ni introducir incompatibilidades sin autorización específica.
- No confundir verificación histórica o sintáctica con una prueba funcional actual.
