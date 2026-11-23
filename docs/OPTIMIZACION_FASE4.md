# Optimización 1.2.0 — Fase 4: Optimización del tamaño de distribución

Fecha: 2026-11-22. Rama `feature/optimizacion-1.2.0`.
Inicio tras Fase 3 (`c032040`).

---

## 1. Respaldo Externo Independiente

Antes de realizar modificaciones y exclusiones, se resguardaron los componentes completos fuera del repositorio y fuera de cualquier ruta empaquetada por Electron:

- **Ruta física del respaldo:**
  `D:\Desarrollo\tareas_y_proyectos\Proyectos\Actualizaciones_Futuras_Loquendo_Studio_1.2.0\`

### Estructura del Respaldo:
- `LanguageTool/` — Servidor LanguageTool, JARs, diccionarios y reglas gramaticales completas (1.789 archivos, 386.31 MB).
- `Java_JRE/` — Entorno Java Runtime Environment embebido completo (316 archivos, 124.83 MB).
- `Whisper_CPP/` — Binarios y bibliotecas nativas de Whisper: `whisper-cli.exe`, `whisper.dll`, `ggml-base.dll`, `ggml-cpu-x64.dll`, `ggml.dll` (5 archivos, 3.29 MB).
- `Modelos_Whisper/` — Modelo de reconocimiento de voz `ggml-small.bin` (1 archivo, 465.01 MB).
- `Documentacion/INVENTARIO.md` — Inventario técnico con rutas de origen, versiones, tamaños en bytes, verificación hash SHA-256 e instrucciones paso a paso para restaurar los componentes en una actualización futura.

**Verificación de integridad:**
Se calcularon y contrastaron los hashes SHA-256 entre los archivos del repositorio y las copias de respaldo. Resultado: **0 discrepancias (100% idénticos)**.
Tamaño total resguardado: **979.44 MB**.

---

## 2. Medición de Tamaño: Antes vs. Después

Se generó la distribución Windows desempaquetada de prueba (`dist/win-unpacked`) mediante `npm run build:dir` (`electron-builder --win dir`).

| Componente / Directorio | Antes (Fase 3) | Después (Fase 4) | Reducción / Ahorro |
|---|---|---|---|
| `resources/backend/bin/` | 1.203,69 MB | 223,53 MB | **-980,16 MB (-81,4%)** |
| `resources/backend/python/` (Python x86) | 215,27 MB | 215,27 MB | *Conservado íntegro* |
| `resources/backend/modules/` | 15,50 MB | 15,50 MB | *Conservado* |
| `resources/backend/db/` (Diccionarios) | 0,06 MB | 0,06 MB | *Conservado* |
| `resources/app.asar` (Código fuente y UI) | 26,32 MB | 26,58 MB | +0,26 MB |
| **Total `dist/win-unpacked`** | **1.778,33 MB (1,78 GB)** | **798,42 MB (0,78 GB)** | **-979,91 MB (-55,1%)** |

### Desglose de componentes excluidos del empaquetado:
1. `backend/bin/ggml-small.bin` (465,01 MB) — Excluido de `extraResources`.
2. `backend/bin/languageTool/` (386,31 MB) — Excluido de `extraResources`.
3. `backend/bin/jre/` (124,83 MB) — Excluido de `extraResources`.
4. `backend/bin/whisper-cli.exe` y DLLs `ggml` / `whisper` (3,29 MB) — Excluidos de `extraResources`.
5. Residuos no productivos (`handle.exe`, `test_salida.srt`, `generar_voz.spec`) — Excluidos.

---

## 3. Modificaciones de Código y Políticas

Todos los cambios son reversibles y no eliminan los archivos fuente del repositorio:

1. **`backend/services/featurePolicy.js`**:
   - `languageTool: false` agregado a la política inmutable de la versión.
   - Mensaje informativo `languageToolMaintenanceMessage` añadido.

2. **`server.js`**:
   - En `iniciarLanguageTool()`: guard para no iniciar el proceso Java si `features.languageTool` está en `false`.
   - En `startServer()`: no programa el timeout de inicio si `features.languageTool` es `false`.
   - En `/api/corregir-texto`: responde `503` con código `LANGUAGETOOL_DISABLED` y mensaje de mantenimiento si se invoca.

3. **`backend/services/audioService.js`**:
   - `usarWhisperCpp` y `usarPythonSRT` condicionados explícitamente a `require('./featurePolicy').transcription`.
   - Impide de raíz cualquier intento o fallback a transcripción Whisper (C++ o Python).

4. **`frontend/js/main.js`**:
   - `corregirTexto()`: guard que avisa al usuario mediante notificación si LanguageTool está desactivado por optimización, evitando llamadas fallidas.
   - En `DOMContentLoaded`: deshabilita el botón de LanguageTool con estilo visual desactivado y actualiza el texto de ayuda indicando que los diccionarios locales y la optimización de texto permanecen activos.
   - Se respetaron los cambios cosméticos de etiquetas aportados por el usuario.

5. **`package.json`**:
   - Configurados filtros minimatch en `extraResources` para `backend/bin/` y `backend/modules/`, excluyendo JRE, LanguageTool, Whisper y modelos.

---

## 4. Componentes Críticos Conservados

Se verificó expresamente su presencia y funcionamiento:
- ✅ **Python x86 embebido** (`backend/python/python.exe`, 32 bits): Verificado en el paquete generando voz real mediante SAPI.
- ✅ **FFmpeg y FFprobe** (`backend/bin/ffmpeg.exe`, `backend/bin/ffprobe.exe`): Presentes en el paquete y respondiendo a comandos de versión.
- ✅ **Síntesis SAPI5 Loquendo** (`generar_voz.exe` + DLLs COM/runtime): Verificado en el paquete generando audio WAV válido con exit code 0.
- ✅ **Preload de Electron**: Confirmado dentro de `app.asar` (`\preload.js`).
- ✅ **Diccionarios locales y optimización**: Jergas, sinónimos, ortografía, gramática y `OrtografiaProcessor` conservados intactos.
- ✅ **Herramientas independientes SRT/ASS**: Plantilla matemática y conversión ASS sin Whisper funcionando.
- ✅ **PNGTuber**: Expresiones idle, talking y blink conservadas.
- ✅ **Mezclador, proyectos, biblioteca musical y recuperación de sesiones**: Completamente operativos.

---

## 5. Pruebas Automatizadas y de Regresión Ejecutadas

| Prueba | Comando | Resultado |
|---|---|---|
| Suite de pruebas unitarias | `npm test` | **70 pruebas aprobadas (0 falladas, 0 omitidas)** |
| Smoke Subtítulos en mantenimiento | `node scripts/smoke_projects.cjs --maintenance` | **APROBADO** (`SUBTITLE_MAINTENANCE_ELECTRON_PASS`, `SUBTITLE_MAINTENANCE_REAL_SERVER_PASS`) |
| Smoke SAPI y PNGTuber real | `node scripts/smoke_projects.cjs --sapi` | **APROBADO** (`SAPI_RENDERER_PASS`, `SAPI_HTTP_ELECTRON_PASS`) |
| Smoke Desktop y Biblioteca Musical | `node scripts/smoke_projects.cjs --desktop --music-library` | **APROBADO** (`MUSIC_LIBRARY_DESKTOP_PASS`, `DESKTOP_REAL_PASS`) |
| Smoke Recuperación de sesiones | `node scripts/smoke_audio_sessions.cjs --recovery-ux` | **APROBADO** (`RECOVERY_UX_ELECTRON_PASS`) |
| Binarios en paquete desempaquetado | PowerShell scripts sobre `dist/win-unpacked` | **APROBADO** (Síntesis WAV real 312 KB, FFmpeg 8.1.2, FFprobe 8.1.2, Python 3.13 32-bit) |
| Integridad ASAR / Preload | Script `@electron/asar` | **APROBADO** (`\preload.js` dentro del paquete) |

---

## 6. Riesgos y Plan de Reversión

- **Riesgo:** Si un usuario esperaba que el botón "Revisar con LanguageTool" ejecutara el servidor Java local.
  - **Mitigación:** La UI deshabilita el botón con cursor no permitido y muestra una explicación clara indicando que la optimización mantiene activos los diccionarios locales y la optimización de texto. La API responde `503 LANGUAGETOOL_DISABLED`.
- **Restauración:**
  1. Copiar los contenidos desde `Actualizaciones_Futuras_Loquendo_Studio_1.2.0/` a sus rutas respectivas en `backend/bin/`.
  2. Ajustar `featurePolicy.js` (`languageTool: true`, `transcription: true`).
  3. Remover los filtros de exclusión en `package.json`.
