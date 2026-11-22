# AGENTS.md — Guía para Agentes de IA

Documento de referencia para que agentes de IA (o devs) trabajen en Loquendo Studio sin romper nada.

## Qué es el proyecto

**Loquendo Studio** es una suite de escritorio offline (Windows 10/11, 64 bits) para automatización de voz y edición multimedia. Convierte texto en audio profesional mediante SAPI (voces Loquendo/Microsoft), genera subtítulos con Whisper.cpp, aplica efectos de audio y genera videos PNGTuber.

Ruta raíz del repo: `D:\Desarrollo\tareas_y_proyectos\Proyectos\Loquendo Studiov1.0`

## Stack y la regla de oro: TODO 32 BITS

El proyecto integra 4 lenguajes y mezcla binarios nativos de 32 y 64 bits. **Pueden romperse fácilmente si mezclas arquitecturas o cambias una ruta sin verificar.**

| Componente | Ruta | Arquitectura |
|------------|------|--------------|
| Electron (frontend) | `main-electron.js` + `frontend/` | x64 — **v37.10.3** (upgrade desde 28.3.3) |
| API REST (Express) | `server.js` | Node.js |
| Python embebido (SAPI) | `backend/python/python.exe` | **32 bits** (crítico: SAPI lo requiere) |
| generar_voz | `backend/bin/generar_voz.exe` | **32 bits** (compilado con Nuitka) |
| FFmpeg/FFprobe | `backend/bin/` | 64 bits |
| Whisper.cpp | `backend/bin/whisper-cli.exe` + `ggml-small.bin` | 64 bits |
| JRE + LanguageTool | `backend/bin/jre/` + `backend/bin/languagetool/` | Java, puerto 8011 |

**Nunca** usar un Python de sistema de 64 bits para tareas de `backend/modules/*.py`: falla al cargar `win32com`/`pythoncom`. Usar SIEMPRE `backend\python\python.exe`.

## Comandos

```bash
# Desarrollo (interfaz Electron + servidor API en :3000)
npm start

# Conteo que usa el Python embebido para generar audio/subtítulos
backend\python\python.exe -m pip install <paquete>   # si falta algo
backend\python\python.exe -m py_compile backend\modules\generar_voz.py

# Compilación con electron-builder
npm run build:portable   # distribuible portable/self-extracting
npm run build:nsis       # instalador
npm run build            # limpia dist/ y compila (corre check_build_prereqs.js)
```

No hay lint/typecheck configurado. Existe suite Node (`npm test`) y smokes Electron en `scripts/smoke_*.cjs`, además de verificación con Python embebido y binarios reales. El seguimiento vigente está en `ESTABILIZACION.md`; no confundir resultados históricos con verificaciones actuales.

## Política temporal de funciones (optimización 1.2.0)

- Rama activa: `feature/optimizacion-1.2.0`, base `d1c02ea`, etiqueta intocable `respaldo-pre-optimizacion-1.2.0`.
- `backend/services/featurePolicy.js` es la fuente de capacidades; `/api/features.js` la comparte con el renderer y `/api/health` informa `capabilities`.
- La pestaña Subtítulos y la transcripción están temporalmente bloqueadas, incluso si hay binarios Whisper o ajustes IA antiguos. No reactivarlas como efecto lateral de un arreglo.
- Conservar el código y las operaciones independientes: marcadores SRT existentes desde Audio, plantillas matemáticas explícitas (`metodo: 'plantilla'`) y conversión de SRT existente a ASS.
- Los procesos Python de conversión reciben `LOQUENDO_TRANSCRIPTION_ENABLED=0`: no importar ni iniciar Whisper desde ese camino. No hacer fallback a transcripción si falta el SRT.
- El usuario autorizó una carpeta desempaquetada de prueba para medir tamaño en la Fase 4, con salida separada. No generar instalador de publicación. Plan completo y estados en `ESTABILIZACION.md`.
- Diagnóstico Leonor preparado en `tools/diagnostico_sapi/` (lanzador `.cmd`, Python embebido x86). Referencia en `OPTIMIZACION_FASE2.md`: las pruebas locales pasan, pero la causa del fallo del tester sigue pendiente de evidencia externa. No presentar multivoz/formato/registro como causa confirmada ni modificar la síntesis sin reproducirla.

## Compilar generar_voz.py con Nuitka (proceso establecido)

`generar_voz.exe` es el ejecutable que `audioService.js` invoca para hablar el texto. Se compila con Nuitka **4.2.1** (instalado en el Python embebido de 32 bits).

1. Editar `backend/modules/generar_voz.py`.
2. Validar sintaxis: `backend\python\python.exe -m py_compile backend\modules\generar_voz.py`.
3. Probar el script directo, p. ej.:
   `backend\python\python.exe backend\modules\generar_voz.py "texto" "Voz" "C:\tmp\salida.wav"`
4. Compilar:
   ```
   backend\python\python.exe -m nuitka --mode=standalone --output-dir="build_nuitka" --windows-console-mode=force --include-package=win32com --include-package=pythoncom --assume-yes-for-downloads backend\modules\generar_voz.py
   ```
   - Nuitka 4.x: `--mode=standalone` = onedir/carpeta (el flag `--onedir` ya no existe).
   - MSVC requerido (Visual Studio Community 2026 en `D:\VISUALSTUDIO`).
5. Aplanar la salida: copiar el contenido de `build_nuitka\generar_voz.dist\*` a `backend/bin/` **FORZANDO sobrescritura** (el exe debe quedar como archivo único `backend/bin/generar_voz.exe`, que es lo que esperan `audioService.js` y `check_build_prereqs.js`).
6. Probar el exe desde una ruta cualquiera y verificar: WAV generado, stdout con `EXITO`, exit code 0.
7. **Antivirus**: Windows Defender está activo pero el directorio del proyecto está en exclusiones. Verificar el exe COPÁNDOLO a una ruta sin exclusiones (p. ej. `C:\Users\FBI\AppData\Local\Temp\opencode\...`) y escaneando:
   `& "C:\Program Files\Windows Defender\MpCmdRun.exe" -Scan -ScanType 3 -File <carpeta>`

### Detalles COM de generar_voz (¡no romper!)

- El script usa SAPI vía COM (`win32com`/`pythoncom`). El ciclo de vida COM debe ser:
  `CoInitialize()` → trabajo dentro de una única función local → `finally: gc.collect(); CoUninitialize()`.
- El refactor correcto vive en `_procesar_audio_voz(win32com_client, pythoncom, ...)`, al que llama `generar_audio_multivoz()` con `try/finally` (`gc.collect()` + `pythoncom.CoUninitialize()`).
- **Síntoma de bug**: al cerrar, el exe imprime `Win32 exception occurred releasing IUnknown` (con exit 0). Ocurre cuando objetos COM (`speaker`, `stream`, `voces`) sobreviven como globales cuando termina el intérprete; la solución es el patrón de arriba.
- Si el proceso se levanta con `Start-Process`, redirige stdout y stderr a archivos separados para depurar.
- `parsear_segmentos_voz()` entiende `[voz:Nombre]` (multi-voz) y `[pause]/[emphasis]` → los convierte a SSML.
- Formato de salida del stream: `stream.Format.Type = 39`. En la práctica SAPI/Loquendo emite **48 kHz estéreo 16-bit (~192 KB/s)** sin importar el `Type` (36→8-bit, 41→8 kHz, 40 crashea). La selección de calidad (`16k`/`22k`/`44k` mono) se aplica **después** con ffmpeg en `AudioService._aplicarCalidad()`,
  no en el script/exe.

## Enlaces externos y preload (Electron)

Bug ya corregido. Documentado para que no se repita.

**Síntoma**: los enlaces externos (Ko-fi, YouTube, etc.) abrían una ventana de Electron en producción, pero funcionaban en `npm start`.

**Causa raíz**: `preload.js` no estaba en `build.files` de `package.json`, así que electron-builder no lo empaquetaba en `app.asar`. En producción el preload no cargaba → `window.electronAPI === undefined` → el renderer caía al fallback `window.open(url, '_blank')` → Electron creaba un `BrowserWindow` nuevo. En dev el archivo sí existe, por eso la divergencia.

**Reglas**:

- `preload.js` debe estar en `build.files` de `package.json`. Si añades un archivo en la raíz que el main necesita, añádelo ahí también: `build.files` **reemplaza** el patrón por defecto de electron-builder, no lo extiende.
- El fallback a `window.open` está **prohibido**. Si `window.electronAPI` no existe, loguear y no hacer nada. Nunca abrir ventanas de Electron desde el renderer.
- El flujo correcto es: renderer → `window.electronAPI.openExternal(url)` → IPC `abrir-enlace-externo` → `shell.openExternal(url)` en el main. `main-electron.js` valida que la URL sea `http/https` antes de abrirla.
- `main-electron.js` tiene dos barriers en `createWindow()`, antes del `loadURL`:
  - `setWindowOpenHandler` → `{ action: 'deny' }` + `abrirEnNavegador(url)`. Es la **única** barrera que impide crear ventanas de Electron (cubre `window.open` y `target="_blank"`).
  - `will-navigate` → solo bloquea si el origen **no** es el de la app. No hace falta para las ventanas nuevas; sirve para que la ventana principal no se vaya a un sitio externo.
- Ambas comparan contra `appOrigin()` (`http://localhost:${BOUND_PORT}`), que se evalúa **en el momento de usarse**, no al cargar el módulo: `BOUND_PORT` se reasigna dentro de `whenReady()`.

**Trampa del puerto**: `server.js:613-619` incrementa a 3001/3002/... si el 3000 está ocupado (`startServer(port + 1)`). **Nunca** hardcodear `http://localhost:3000` en un guard de navegación ni en la API base; `frontend/js/core/config.js` ya deriva la base de `window.location.origin` por esto. Una allow-list con puerto fijo marca el origen de la propia app como externo y rompe la navegación interna.

**Por qué una versión anterior de este arreglo rompía los diccionarios**: los diccionarios son `fetch` puro (`frontend/js/ui/dictionaryEditor.js:42-45`, `frontend/js/core/apiClient.js`). Un `setWindowOpenHandler`/`will-navigate` bien escrito no toca `fetch`. Si los diccionarios dejan de funcionar al añadir un guard, el guard está bloqueando el origen de la app o la página se está cargando desde un origen distinto al del API.

**Verificar un build**: tras `npm run build:portable`, confirmar que el preload está dentro del asar antes de instalar:

```bash
node -e "const a=require('@electron/asar');const l=a.listPackage('dist/win-unpacked/resources/app.asar');console.log(l.filter(p=>/preload/i.test(p)).join('\n')||'NO PRELOAD FOUND')"
```

`NO PRELOAD FOUND` = el build está mal. En la app compilada, F12 → si aparece `Unable to load preload script`, el binario es viejo.

## Invariantes que no cambiar sin permiso

- `preload.js` debe seguir listado en `build.files` del `package.json` (ver sección de enlaces externos).
- `backend/services/audioService.js` (líneas 9 y ~320) y `scripts/check_build_prereqs.js` esperan el exe en **`backend/bin/generar_voz.exe`** como archivo único. No cambiar la ruta; aplanar ahí.
- El Python embebido debe seguir siendo **32 bits**.
- `server.js` despliega rutas desde `BACKEND_DIR` que en producción apunta a `process.resourcesPath/backend`; si añades archivos al binario, regístralos en `extraResources`/`asarUnpack` del `package.json`.
- Los diccionarios viven en `backend/db/*.json` (jergas, sinónimos, ortografía, gramática). No commitear cambios accidentales ahí.
- Archivos generados en ejecución: `backend/public/audios/` y `backend/public/pngtuber/` (temporales, se limpian solos).

## Resolver problemas del binario final

- Si el exe del backend no cambia tras editar el .py: recompilar Nuitka + re-aplanar `build_nuitka\generar_voz.dist\*` en `backend/bin` con `-Force`.
- El exe anterior de PyInstaller se respalda como `backend/bin/generar_voz_old_pyinstaller.exe` (no borrar a la ligera).
- Si `npm run build` peta por prereqs, `scripts/check_build_prereqs.js` indica qué binario falta.
