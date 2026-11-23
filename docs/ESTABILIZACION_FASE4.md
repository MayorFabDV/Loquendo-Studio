# Estabilización 1.2.0 — Fase 4: proyectos y medios

Fecha: 2026-10-29. Rama: `feature/estabilizacion-1.2.0`.

## Estado

Fase 4 cerrada en desarrollo. Se conserva el JSON de proyecto v2 y la lectura del formato legacy; se añade un contenedor portable opcional, sin dependencias nuevas. No se ejecutaron builds ni se modificaron respaldos o datos del usuario. La modificación previa de `frontend/js/services/videoProcessor.js` permanece fuera de estos commits.

## Uso en la interfaz

En el mezclador:

1. **Guardar en equipo** guarda el documento y copia los medios disponibles al almacenamiento persistente. Al terminar verifica su integridad; si falta algún medio, lo indica en lugar de afirmar que todo está completo.
2. **Proyectos guardados… / Actualizar lista / Abrir guardado** permiten reabrir proyectos del almacenamiento del equipo. Antes de sustituir la mezcla actual, se confirma su guardado; si hay cambios mientras se comprueban las fuentes, se cancela la apertura y se pide reintentar.
3. **Exportar JSON / Abrir JSON** conservan el formato anterior. El JSON contiene referencias, no los bytes de audio. Incluso si el servidor falla, se permite descargar la estructura actual con un aviso.
4. **Recuperar fuente** abre un selector de archivo para el clip seleccionado. Se reasigna a todos los clips que comparten esa fuente y se conservan sus posiciones, recortes, ganancia, pan, fades y automatización. Un audio demasiado corto se rechaza sin truncar clips.
5. **Exportar portable / Abrir portable** usan `.loquendo.tar` con el JSON y los audios necesarios. El importador asigna un ID nuevo para no reemplazar un proyecto existente.

Los proyectos viven en `LOQUENDO_DATA_DIR/projects`. En Electron, la base se configura como `app.getPath('userData')/data`; no se mueve el almacenamiento ni se hardcodea una ruta de usuario.

## Persistencia y recuperación

- Añadir medios confirma también el documento del proyecto, no solo sus archivos de audio. Las ediciones posteriores autoguardan metadatos en el servidor local; el estado en localStorage se mantiene para compatibilidad.
- Los guardados por proyecto se serializan y capturan su documento al iniciar. Se evitan reescrituras idénticas ya confirmadas y se protege frente a respuestas de otro proyecto/carga.
- Se conserva `project.previous.json` mediante copia temporal y reemplazo atómico. Si el principal es ilegible, se ofrece la revisión anterior con un indicador de recuperación.
- Si se vuelve a guardar sobre un documento corrupto, se conserva su contenido como `project.corrupt-<uuid>.json`; no se elimina silenciosamente.
- Los assets se verifican por SHA-256. Se verifica también que la copia coincida con el origen y que las rutas reales estén dentro de las carpetas permitidas.
- Si ya existe un asset con nombre hash pero contenido dañado, una reimportación crea una copia válida con nombre independiente; conserva el archivo dañado.
- El backend de render rechaza assets persistentes ausentes/dañados y rechaza más de 500 clips en vez de descartar el exceso.
- El zoom del proyecto se incluye como campo opcional en el JSON, usando el soporte de lectura ya existente.

## Portable: formato y límites

- TAR USTAR estándar sin compresión, generado y leído por streaming con módulos nativos de Node.
- Contiene `manifest.json`, `project.json` y los archivos de `assets/` referenciados por los clips, deduplicados.
- El manifiesto incluye tamaño y SHA-256 del documento y de los medios. En la importación se verifican cabeceras, rutas, tamaños, tipos de entrada, duplicados, hashes y referencias de clips.
- No se aceptan enlaces, rutas externas/traversal, entradas arbitrarias, paquetes truncados ni archivos sin cobertura del manifiesto.
- Se extrae a staging propio y solo se activa como proyecto nuevo al validar todo. Los fallos limpian únicamente ese staging y la copia temporal de la subida; no tocan proyectos existentes ni el archivo original que seleccionó el usuario.
- Al activar se reescriben `id`, `projectId` y las URL de los clips. El manifiesto solo pertenece al paquete original; no se deja como un manifiesto obsoleto junto al JSON reidentificado.
- Límite del paquete: **2 GiB**; JSON individual: **25 MiB**; hasta **500 clips** al importar/renderizar. No se cambió el límite de los JSON existentes en disco ni se truncan mezclas de forma silenciosa.
- No es un importador TAR genérico: acepta el formato portable de Loquendo, no archivos arbitrarios recompuestos con extensiones PAX/enlaces.
- No incluye ejecutables, voces instaladas, diccionarios, sesiones del editor legacy, historial de deshacer, imágenes PNGTuber ni medios no referenciados. No equivale a un build portable de la aplicación.

## API añadida o ampliada

- `GET /api/proyectos`: catálogo con indicadores de documento corrupto o recuperado.
- `GET /api/proyectos/:id`: mantiene `{ proyecto }` y añade `recuperado`.
- `GET /api/proyectos/:id/integridad`: medios faltantes/dañados por clip.
- `GET /api/proyectos/:id/portable`: descarga TAR como attachment.
- `POST /api/proyectos/importar-portable`, multipart `project`: valida y crea una copia con ID nuevo.
- Se reutiliza `POST /api/proyectos/:id/assets/upload` para la reasignación de fuentes.

Las rutas nuevas conservan las restricciones de localhost/origen de la Fase 1. Los módulos nuevos están bajo `backend/services/**/*`, ya incluido en la configuración de empaquetado; no se modificó `preload.js` ni se ejecutó un build.

## Pruebas y resultados

```powershell
npm test
node scripts/smoke_projects.cjs
node scripts/smoke_audio_sessions.cjs
node node_modules/electron/cli.js scripts/smoke_mixer.cjs --full-page
```

- **39 pruebas Node aprobadas, ninguna omitida**, incluidas las pruebas anteriores de sesiones, red y FFmpeg real.
- `tests/projectStore.test.js`: guardados concurrentes, captura de snapshots, revisión previa, recuperación de JSON corrupto, archivo corrupto conservado y asset dañado no sobrescrito.
- `tests/portableProject.test.js`: exportar/importar en un almacenamiento vacío, IDs nuevos, parámetros/bytes conservados y rechazo sin proyectos parciales ante corrupción, truncación, traversal, enlaces o entradas duplicadas. El TAR generado también se listó correctamente con `bsdtar 3.5.2` del sistema.
- `tests/mixer.test.js`: reasignación compartida sin cambiar recortes/FX, rechazo de archivos cortos, snapshots ordenados, respuestas tardías, protección de cambios durante apertura, JSON incompatible rechazado completo y descarga JSON con servidor no disponible.
- **`PROJECTS_REAL_SERVER_PASS` y `PROJECTS_ELECTRON_PASS`**: el smoke crea un sandbox con `server.js`, Express, almacenamiento y frontend reales, además de FFmpeg/FFprobe reales. Prueba guardar, catálogo, portable de ida y vuelta, medio ausente recuperado, JSON recuperado de la copia anterior, render WAV de dos segundos y paquete inválido con HTTP 400 sin documentos parciales.
- Solo la detección de voces del smoke de proyectos se intercepta para evitar usar Python/SAPI del sistema. No se ejecutan LanguageTool, Whisper o PNGTuber; las APIs de proyecto/medios/render sí son reales.
- Regresiones **`AUDIO_SESSIONS_ELECTRON_PASS` y `MIXER_ELECTRON_PASS`** aprobadas. Las ondas conservaron 830 px de ancho a 1200 y 550 px a 900; paneo medido 0,500 y desfase fuente/cursor 0,019 s en esa ejecución.
- Se ejecutó `node --check` sobre 64 archivos JavaScript/CJS y `git diff --check`. Los mensajes de error esperados en pruebas negativas no son fallos de la suite.

## Commits funcionales

- `4271fcb` — revisiones recuperables e integridad del almacenamiento.
- `0583b4d` — contenedor portable validado y rutas de API.
- `0ad2a8a` — guardado/catálogo/reasignación en UI, compatibilidad JSON y smoke con servidor real.
- `f94a0d0` — comprobación del zoom persistido en disco y dentro del portable.

## Límites y continuación

- Esperar la confirmación de **Guardar en equipo** antes de cerrar o trasladar trabajo importante: no se garantiza una escritura que todavía esté en curso si se mata el proceso o se pierde energía.
- La copia anterior es una revisión recuperable, no un historial ilimitado. Los originales/corrupciones preservados no se purgan automáticamente.
- Recuperar una fuente requiere disponer de su archivo correcto. No se inventa audio que ya se haya perdido; un reemplazo más corto no cambia recortes automáticamente.
- Se conserva el modelo visual de la Fase 2: una fila por clip y tres categorías. Esta fase no implementa carriles compartidos, grabación, nuevas pistas arbitrarias ni nuevos efectos.
- Portable verifica integridad de bytes, no autenticidad de quien creó el paquete ni calidad del audio. La decodificación sigue dependiendo de FFmpeg.
- No se probaron paquetes de varios GiB ni todos los codecs de audio; los tests usan WAV y archivos controlados. No se certificó la distribución empaquetada.
- Las sesiones IndexedDB del editor legacy siguen ligadas al perfil/origen; esta fase no implementa su recuperación entre puertos. El catálogo de proyectos sí usa el almacenamiento persistente del backend.
- El problema de expresiones PNGTuber superpuestas permanece registrado y sin modificar.

La **Fase 5 no se inició**. Requiere aprobación para la regresión final y una autorización específica adicional antes de ejecutar builds de distribución.
