# Plan — Mejoras de flujo y rediseño de Guion y Voz

> **Actualización de estabilización 1.2.0 (2026-10-29):** índice de etapas en [ESTABILIZACION.md](ESTABILIZACION.md). Fases 2 y 3 completadas; informes en `ESTABILIZACION_FASE2.md` y `ESTABILIZACION_FASE3.md`. La Fase 4 no se inició. Las evaluaciones anteriores del mezclador que aparecen más abajo son históricas.

Estado: mejoras de flujo, rediseño, ayudas y Ajustes implementados y validados en desarrollo. La sección 8 simplifica Ajustes y deja pendiente solo `npm run build:safe` y la verificación del asar, con autorización expresa.

## 1. Cambiar a Audio cada vez que se genera/carga un audio

Problema: `tabs.js` solo detecta la primera vez que `#contenedorReproductor` cambia de `display:none` a `block`. Las siguientes generaciones mantienen `block` y no disparan el observer.

- [x] En `frontend/js/services/audioPlayer.js` (`cargarYReproducir`), llamar siempre a `window.tabs.irA('audio')` al mostrar el reproductor.
- [x] Mantener en `frontend/js/ui/tabs.js` el observer solo para sincronizar `audioPlaceholder`.
- [x] Quitar del observer el auto-cambio a Audio, que pasa a ser responsabilidad de `cargarYReproducir`.
- [x] Validar dos generaciones consecutivas: ambas deben terminar en Audio.

## 2. Rediseñar Guion y Voz con barra lateral fija

Layout elegido: dos columnas con barra lateral sticky. Diccionarios abiertos por defecto.

- [x] Envolver el contenido de `#tab-guion` en `.guion-layout`.
- [x] Columna principal `.guion-main`: entrada de texto, Motor de Voz + acciones, Texto Optimizado y Revisar Ortografía.
- [x] Barra lateral `.guion-sidebar`: Ajustes de Automatización y Diccionarios.
- [x] Mover ambos bloques a la barra lateral, conservando todos los IDs.
- [x] Dejar Diccionarios abiertos por defecto (`<details open>`).
- [x] Añadir CSS para grid `minmax(0, 1fr) 360px`, sticky, scroll interno y una columna en automatización.
- [x] Breakpoint aproximado en `1100px`: apilar columnas y desactivar sticky.
- [x] Revisar temas claro/oscuro y uso del editor de diccionarios a 360px.

## 3. Mover “SRT con IA” a Subtítulos

- [x] Quitar `#chkSRT_IA` del grid de Automatización en Guion y Voz.
- [x] Añadirlo en `#tab-subtitulos`, cerca de “Subtítulos dinámicos” y “Palabras por subtítulo”.
- [x] Mantener `id="chkSRT_IA"` para no romper `main.js` (`usarIA: chkSRT?.checked`).
- [x] Añadir nota: se aplica la próxima vez que se genere audio desde Guion y Voz.
- [x] Actualizar el párrafo introductorio de Subtítulos.
- [x] Actualizar `frontend/js/core/helpTexts.js`: `chkSRT_IA`, sección `automatizacion` y sección `subtitulos`.

## 4. Verificación

- [x] `node --check` sobre los JS modificados.
- [x] Smoke estático: `#chkSRT_IA` dentro de `#tab-subtitulos`; `.guion-sidebar` contiene automatización y `#dictionaryEditor`; IDs existentes presentes.
- [x] Smoke con audio real: cargar/generar audio dos veces y comprobar que ambas llevan a Audio.
- [x] Verificar que el checkbox de Subtítulos llega como `usarIA: true` al generar audio.
- [x] Prueba visual a 1200px y 900px, temas claro/oscuro, Diccionarios abierto/plegado.
- [ ] `npm run build:safe` solo al final, cuando el usuario lo autorice.
- [ ] Verificar el asar final.

Sin commit hasta que el usuario lo indique.

## 5. Reubicar y estilizar botones de ayuda

Objetivo: que los `?` de la barra rápida no se monten encima de los selects.

- [x] Añadir etiquetas compactas «Expresiones», «Etiquetas» y «Estilo».
- [x] Añadir `data-help-anchor` a `expresiones-rapidas`, `etiquetas-voz` y `modo-narracion`.
- [x] Colocar los botones `?` inline junto a las etiquetas.
- [x] Mejorar el estilo del botón: circular, hover con acento, `focus-visible` y tooltip accesible.
- [x] Revisar que no se solapen controles en 1200px ni 900px.

## 6. Ampliar la pantalla de Ajustes (histórico)

> Esta sección describe la primera versión de Ajustes. La sección 8 la reemplaza: Voz, Subtítulos y Modo del editor ya no viven en Ajustes; se configuran en sus pestañas y se recuerdan automáticamente.

Formato aprobado: popover actual más ancho, con pestañas internas y scroll.

### General
- [x] Tema oscuro/claro/sistema.
- [x] Pestaña inicial: Guion, Audio, Subtítulos o Video.
- [x] Mostrar tooltips.
- [x] Mostrar botones `?` de sección.
- [x] Retardo de tooltips: instantáneo, 300 ms o 600 ms.
- [x] Sonidos de notificación.
- [x] Volumen de notificaciones.
- [x] Duración de notificaciones.
- [x] Recordar opciones de automatización.

### Voz (movido a Guion y Voz)
- [x] Voz por defecto, cargada dinámicamente.
- [x] Calidad por defecto.
- [x] Estilo de narración por defecto.

### Audio (solo reproducción y zoom)
- [x] Modo inicial Básico/Avanzado.
- [x] Reproducir automáticamente al generar/cargar.
- [x] Zoom inicial de la onda: 50 %, 100 % o 150 %.

### Subtítulos (movido a Subtítulos)
- [x] Palabras por subtítulo por defecto.
- [x] Subtítulos dinámicos por defecto.
- [x] SRT con IA por defecto.

### Mantenimiento
- [x] Endpoint `POST /api/limpiar-temporales`.
- [x] Borrar audios/PNGtuber con más de 24 h.
- [x] Confirmación, notificación y conteo de espacio liberado.
- [x] Restaurar ajustes sin tocar diccionarios.

### Persistencia
- [x] Centralizar claves y lectura/escritura en `settings.js`.
- [x] Mantener compatibilidad con `loquendo.audio_mode`.
- [x] Aplicar voz después de `cargarVoces()` y el resto al iniciar.
- [x] Guardado automático al cambiar cada control.

## 7. Verificación del nuevo alcance

- [x] `node --check` de los JS modificados.
- [x] Smoke de ayuda: botones inline y sin solapamiento.
- [x] Smoke de ajustes: persistencia tras recargar.
- [x] Smoke de voz: voz por defecto aplicada tras detectar voces.
- [x] Smoke de automatización, subtítulos, audio y notificaciones.
- [x] Regresión: tabs, player, waveform y markers.
- [x] Capturas 1200/900 en claro/oscuro con el popover abierto.
- [ ] `npm run build:safe` solo con autorización.

## 8. Eliminar duplicados de Ajustes y pulir UX

Objetivo: que Ajustes contenga solo preferencias globales. Los controles que ya viven en Guion, Audio o Subtítulos se configuran ahí y se recuerdan automáticamente.

### Ajustes simplificados
- [x] Dejar solo las pestañas General y Audio, más el footer de mantenimiento.
- [x] General: tema, pestaña inicial, tooltips, botones `?`, retardo, sonidos, volumen, duración y recordar automatización.
- [x] Audio: reproducir al cargar y zoom inicial.
- [x] Quitar de Ajustes la pestaña Voz: voz, calidad y estilo.
- [x] Quitar de Ajustes la pestaña Subtítulos: palabras, dinámicos y SRT IA.
- [x] Quitar el modo del editor de Ajustes; se sigue cambiando en la pestaña Audio.
- [x] Mantener el guardado de `loquendo.audio_mode` desde `audioEditorUI`.

### Persistencia desde cada pestaña
- [x] Guardar la voz al cambiar `#vozSeleccionada` y aplicarla tras `cargarVoces()`.
- [x] Guardar la calidad al cambiar `#calidadSeleccionada`.
- [x] Guardar el estilo al cambiar `#modo`.
- [x] Guardar palabras por subtítulo, subtítulos dinámicos y SRT IA al cambiarlos en Subtítulos.
- [x] No volver a escribir esos valores en Ajustes al abrirlo.

### Pulido UX
- [x] Navegación por teclado en las pestañas de Ajustes: flechas, Home/End y `aria-controls`.
- [x] Devolver el foco al botón Ajustes al cerrar el popover.
- [x] Suprimir los `title` nativos cuando los tooltips están desactivados y restaurarlos al activarlos.
- [x] Pedir confirmación antes de restaurar todos los ajustes.
- [x] Mostrar estado «Limpiando…» mientras se ejecuta el mantenimiento.
- [x] Mantener el popover dentro del viewport a 1200 px y 900 px.

### Verificación
- [x] Actualizar smoke tests de Ajustes al nuevo número de pestañas y paneles.
- [x] Verificar autoguardado y recarga de voz, calidad, estilo y subtítulos.
- [x] Verificar que Ajustes ya no contiene controles duplicados.
- [x] Capturas 1200/900 en claro/oscuro con el popover abierto.
- [x] Regresión: tabs, player, waveform, markers y limpieza de temporales.
- [ ] `npm run build:safe` solo con autorización.

Resultados: `SETTINGS_PASS`, `SETTINGS_EXPANDED_PASS`, `SETTINGS_LAYOUT_PASS`, `DEFAULT_VOICE_PASS`, `AUTOMATION_PERSIST_PASS`, `START_TAB_PASS`, `TEMP_CLEANUP_PASS`, `SMOKE_PASS`, `PLAYER_PASS`, `SUBTITLES_WAVEFORM_PASS`, `MARKERS_UI_PASS`, `GUION_LAYOUT_PASS`. Capturas en `C:\Users\FBI\AppData\Local\Temp\opencode\loquendo_visual\`.
## Revisión de WaveSurfer‑Multitrack (mixerService.js)

### Resumen rápido
| Área | Estado | Comentario |
|------|--------|------------|
| **Inicialización** | ✅ | Usa `Multitrack.create(pistas, opcionesPista())` y verifica que `Multitrack` exista antes de crear. |
| **Persistencia** | ✅ | Guarda `clips` y `zoomPx` en `localStorage` con un timer de debounce (400 ms). |
| **Reconstrucción / Destrucción** | ⚠️ | Llama a `multitrack.destroy()` antes de crear una nueva instancia – correcto, pero hay un detalle con la **asignación de índices** (ver punto 3). |
| **Gestión de pistas** | ✅ | Crea pistas a partir de `clips` y añade una pista “reserve” para SFX drop‑zone. |
| **Controles (play, pause, stop, zoom, volumen)** | ✅ | Implementados, pero el **control de volumen** usa índices que pueden desincronizarse después de añadir/quitar clips. |
| **Eventos** | ✅ | Registra `start-position-change`, `canplay` (actualiza duraciones y decora), y maneja errores con `console.error` / `notificar`. |
| **Carga de recursos externos** | ✅ | Verifica la existencia de los archivos con `HEAD` antes de usarlos. |
| **UI / Decoración** | ✅ | Añade chips, sliders de volumen y botón de borrar a cada pista. |
| **Manejo de errores** | ✅ | Usa `try … catch` y notificaciones; buen nivel de tolerancia. |
| **Código duplicado / legibilidad** | ⚠️ | Algunas funciones repiten lógica (p.ej. `aplicarVolumen` y el *listener* del slider). |
| **Tipo de datos / validación** | ✅ | Valida `pista`, `src`, `startPosition`, `volumen`. |
| **Dependencias** | ✅ | `wavesurfer-multitrack.min.js` está presente en `frontend/js/libs/`. |

### Detalle de puntos críticos
#### 2.1 Inicialización y reconstrucción
```js
function reconstruir() { … }
```
- **Correcto**: se protege contra recursión (`reconstruyendo`) y contra ausencia del script (`Multitrack`).
- **Mejora**: `opcionesPista` recibe `clip` pero no lo usa; puede eliminar el parámetro.

#### 2.2 Persistencia y carga
- Guardado con debounce evita escrituras excesivas.
- Carga verifica que cada clip siga existiendo mediante `HEAD`. ✅

#### 2.3 Control de volumen – **posible desalineación**
```js
function aplicarVolumen(indice, valor) { … }
```
- **Problema**: el `indice` corresponde al orden actual de `clips`. Al eliminar o reordenar pistas, el índice interno de `multitrack` cambia (la pista de reserva siempre está al final). El método `setTrackVolume` espera el **índice de la pista dentro de Multitrack**.
- **Solución sugerida**: usar el **`id`** de la pista en vez del índice, o recalcular el índice después de cada cambio.
  ```js
  function aplicarVolumen(idClip, valor) {
      const clip = clips.find(c => c.id === idClip);
      if (!clip) return;
      clip.volumen = Math.max(0, Math.min(1, valor));
      const trackIdx = multitrack.tracks.findIndex(t => t.id === clip.id);
      if (trackIdx !== -1 && multitrack.setTrackVolume) {
          multitrack.setTrackVolume(trackIdx, clip.volumen);
      }
      guardar();
  }
  ```
  Y en el listener del slider pasar `clips[i].id` en vez de `i`.

#### 2.4 Zoom
- `multitrack.zoom(zoomPx)` ya actualiza el render; la asignación extra de `multitrack.options.minPxPerSec` probablemente sea innecesaria.

#### 2.5 Decoración de pistas
- Crea chips, controles y botones de borrado correctamente.
- **Mejora estética**: añadir `aria-label` y usar `type="button"` (ya está).

#### 2.6 Manejo de carga de clips SFX
- Uso correcto de `dragover`/`drop` y zona de reserva.
- La cadena de `Promise`s con `reduce` funciona pero puede ser más legible con `async/await`.

#### 2.7 API pública (`window.mixer`)
- Claro y compacto; fácil de extender.

### Recomendaciones de mejora (orden de prioridad)
| Prioridad | Acción | Por qué |
|-----------|--------|---------|
| **Alta** | Cambiar la lógica de `aplicarVolumen` para usar el `id` de la pista en vez del índice. | Evita que el volumen se aplique a la pista equivocada tras añadir/quitar clips. |
| **Alta** | Documentar dentro del archivo qué propiedades de `Multitrack` son utilizadas. | Facilita el mantenimiento y evita dependencias implícitas. |
| **Media** | Simplificar `opcionesPista` quitando el parámetro `clip` no usado. |
| **Media** | Convertir la cadena de `Promise` en `cargarArchivosSfx` a `async/await` para mayor legibilidad. |
| **Baja** | Eliminar la línea `multitrack.options.minPxPerSec = zoomPx;` si la API no la necesita. |
| **Baja** | Añadir atributos `aria-label` a los botones y sliders para accesibilidad. |

### Próximos pasos
1. Implementar la corrección de volumen (usar `id`).
2. Ejecutar pruebas manuales:
   - Añadir varias pistas y comprobar que los sliders de volumen controlan la pista correcta.
   - Probar zoom y reproducción sin errores en consola.
3. Ejecutar `npm run build` y probar la versión empaquetada para confirmar que `preload.js` sigue listado en `package.json` (según AGENTS.md).
## Evaluación general del proyecto

| Área | Estado | Comentario |
|------|--------|------------|
| **Arquitectura** | ✅ | Mezcla Electron (frontend) + Express REST API + Python 32 bits (SAPI) bien separada. |
| **Gestión de audio** | ✅ | WaveSurfer‑Multitrack y Tone.js como fallback; persistencia de clips y zoom correctamente implementada. |
| **Persistencia & sincronización** | ✅ | Guardado/autoguardado con debounce y verificación de recursos mediante `HEAD`. |
| **Interfaz UI** | ✅ | UI rica con chips, sliders, barra lateral sticky, dark‑mode y ayuda contextual. |
| **Calidad de código** | ⚠️ | Alguna duplicación (volumen/pistas), funciones con parámetros no usados y falta de JSDoc/tests. |
| **Dependencias** | ✅ | Librerías incluidas en `frontend/js/libs/`; `package.json` actualizado. |
| **Compilación & despliegue** | ✅ | Scripts de `electron‑builder` listos; `preload.js` incluido en `build.files`. |
| **Seguridad** | ✅ | No se abre ventanas Electron externas sin validar URL; uso correcto de `preload`. |
| **Mantenibilidad** | ⚠️ | Código repartido en varios servicios; podría beneficiarse de módulos comunes y tests automatizados. |

### Puntos fuertes
- Arquitectura clara y respetada la regla de 32 bits.
- Implementación robusta del mezclador multitrack.
- Diseño visual premium y responsive.
- Cumplimiento de normas críticas (AGENTS.md).

### Áreas de mejora
1. Eliminar duplicación y usar `id` en control de volumen.
2. Añadir JSDoc y crear una suite mínima de pruebas (API y mezclador).
3. Simplificar funciones con parámetros innecesarios.
4. Mejorar accesibilidad (`aria-label` en controles).
5. Consolidar lógica de servicios comunes.

### Próximos pasos recomendados
- Refactorizar `aplicarVolumen` según la solución propuesta.
- Implementar tests unitarios para `apiClient.js` y `mixerService.js`.
- Documentar las propiedades de `Multitrack` usadas.
- Ejecutar `npm run build` y validar que `preload.js` sigue en `package.json`.
