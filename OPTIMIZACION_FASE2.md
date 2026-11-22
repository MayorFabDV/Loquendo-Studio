# Optimización 1.2.0 — Fase 2: investigación Leonor / COM

Fecha: 2026-11-22. Rama `feature/optimizacion-1.2.0`, comienzo en `f2afd6c`, árbol limpio. Herramienta y pruebas: `d7b7a1f`.

**Estado: diagnóstico reproducible entregado; causa del fallo del tester pendiente de evidencia externa. No hay corrección de síntesis aplicada.** No se inició la Fase 3.

## Investigación del código actual

- Generación simple y multivoz pasan por `generar_audio_multivoz()`. El nombre de esa función en la captura no demuestra que el fallo dependa de usar varias voces.
- Los puntos COM distintos son `Dispatch(SpVoice)`, `GetVoices`/lectura de tokens, asignación de `speaker.Voice`, creación/configuración/apertura de `SpFileStream`, asociación de salida, `Speak`, restauración de voz y cierre/liberación. Una excepción genérica `pywintypes.com_error` no identifica por sí sola cuál falló.
- El formato solicitado actualmente es 39. La ruta de texto simple también reasigna la voz después de asociar el stream; las pruebas comparan expresamente con y sin esa reasignación, sin cambiar el comportamiento de producción.
- La selección actual compara descripción exacta/parcial y finalmente la última palabra. El listado de Studio publica descripciones como IDs y filtra registros de motores; el diagnóstico compara ese listado con los tokens SAPI x86 sin filtrar. La ambigüedad es un punto de investigación, no una causa local demostrada.
- Se conserva el ciclo COM existente: función local para objetos COM y `gc.collect()` antes de `CoUninitialize()`. No se modificó el registro, el script de síntesis ni su ejecutable, y no se reinstalaron voces.

## Herramienta entregada

Carpeta [tools/diagnostico_sapi](tools/diagnostico_sapi/), instrucciones [LEEME.md](tools/diagnostico_sapi/LEEME.md).

El tester hace doble clic en **`Diagnosticar_Leonor.cmd`**. Si la herramienta está fuera del repositorio, el selector permite elegir la instalación de Studio, su carpeta extraída o `resources/backend`. Se usa únicamente su `python/python.exe` de 32 bits; no hace falta Python de sistema ni elevación. El lanzador también admite arrastrar la carpeta de Studio sobre el `.cmd`.

Resultados en una carpeta nueva bajo `%LOCALAPPDATA%\LoquendoStudio\Diagnosticos`. Se comparte solo **`para_compartir.zip`**, con `informe.json` e `informe.md`. Los WAV sintéticos quedan localmente para escucha y no se incluyen en el ZIP.

### Matriz de 26 comprobaciones con Leonor y control disponibles

1. Inventario SAPI x86 y listado real de `listar_voces.py`.
2. Para control y Leonor: COM mínimo, formato 39 sin reasignación, formato 39 reasignando tras asociar el stream, formato predeterminado y XML SAPI con flags 8.
3. Script y exe originales: texto plano (flags 0 en la ruta fuente), etiquetas pause/emphasis convertidas a XML y etiqueta `[voz:...]` sobre la misma voz.
4. Control → Leonor → control y Leonor → control → Leonor, con script y exe.

Los casos usan texto fijo, archivos nuevos y un proceso independiente por prueba. Límite predeterminado de 45 segundos por proceso; después de un fallo/timeout continúan los demás. Si Leonor falta o coincide con varios tokens, no se usa silenciosamente una voz predeterminada para declarar éxito.

### Evidencia capturada

- Arquitectura del Python y PE del exe, versiones de Windows/Python/pywin32 y hashes de script, exe, listado, Python y herramienta.
- Tokens SAPI, metadatos de voz y registro **solo lectura** en vistas 32/64: CLSID, nombre/versión/hash/arquitectura de DLL, sin su ruta completa. Se evita confundir archivos nativos System32 con la redirección x86 a SysWOW64.
- En COM mínimo: etapa antes/después de cada llamada, token y flags.
- En el script original: trazado sin proxies ni monkeypatch COM; función/línea/código original, token elegido, segmento y flags. Los eventos contienen datos serializados, no referencias COM retenidas.
- Para una excepción COM: HRESULT firmado y hexadecimal, descripción, excepinfo con `scode` interno y argumento. El primer evento de error identifica la llamada fuente; las propagaciones posteriores quedan como contexto.
- Salida/código de proceso, última etapa ante timeout o cierre nativo, advertencias de liberación IUnknown y validación del WAV, incluido audio no vacío/no silencioso.

El exe no se modifica ni instrumenta. Si falla solo el exe, se comparan su traceback/código con los casos fuente y hashes; no se inventa una llamada COM exacta cuando no hay evidencia suficiente.

No se recopilan guiones, proyectos, biblioteca ni diccionarios. Rutas absolutas, identidades del entorno, SID personales y correos se depuran de los logs/informe. Los IDs SAPI/CLSID técnicos se conservan. El ZIP contiene únicamente los dos informes, no binarios ni WAV.

## Resultado local

Ejecución completa mediante el lanzador PowerShell, apuntando a la instalación real del repositorio: **26/26 `ok`**, conclusión `not_reproduced_with_fixed_cases`. Los 24 casos de síntesis generaron WAV válidos con muestras no silenciosas. Sin excepción COM, cierre nativo ni advertencia de liberación IUnknown observados en esa ejecución.

| Dato | Referencia local |
|---|---|
| Windows | 10.0.19045, sistema AMD64 |
| Python | 3.13.14, proceso de 32 bits |
| pywin32 | 312 |
| Exe de voz | PE x86 |
| Leonor | `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\LTTS7Leonor` |
| Control | Token `LTTS7Jorge` |
| Leonor visible en listado de Studio | Sí |
| Motor registrado x86 | `LTTS7SAPI5.dll`, versión 7.0.7.0 |
| CLSID del motor | `{780fe1fc-1376-4ffb-8ebb-3477bfee873d}` |

Huellas SHA-256 de referencia, para comparar con el informe del tester:

| Componente | SHA-256 |
|---|---|
| `generar_voz.py` | `b8bb8601495537ace6c0579da0ed2999244145f8caa0327c6eed00a19de367ee` |
| `generar_voz.exe` | `f824afe81dfb2be4ac781303d2723f4740290083c20cd6e4965f74bc5763c4ea` |
| Motor `LTTS7SAPI5.dll` | `998eb0e4e10c8bf0a2c133fee4caffddba035ae0137bdf5684a2bc1daed274b4` |
| Herramienta `diagnostico_sapi.py` | `37114b1f520273fea928dab4bc73be4f4b162fd961a117f2579cc7dff92820c2` |

Informe completo de esta ejecución en `%TEMP%\opencode\sapi-9ee8a12fd3ea\para_compartir.zip`; los datos clave quedan también registrados aquí porque esa carpeta es temporal.

**Interpretación:** el entorno local reproduce correctamente los caminos sospechosos, pero eso no descarta un fallo por versión, token, arquitectura del motor, instalación o texto en la otra computadora. Que Leonor funcione en Loquendo TTS no confirma que esa aplicación use la misma interfaz SAPI, arquitectura o token. No se elige ninguna de estas hipótesis como causa sin la comparación externa.

## Pruebas y regresiones

- `npm test`: **56 aprobadas, ninguna omitida**. Incluye `tests/sapiDiagnostic.test.js`, que ejecuta siete pruebas con Python embebido: llamada COM exacta, línea original, HRESULT/excepinfo, depuración de datos, timeout, ausencia/ambigüedad sin falso éxito, contenido del ZIP y resolución de archivos en vista nativa. Las primeras comprobaciones comparten algunos de esos aspectos en un mismo caso.
- Lanzador PowerShell con `-NoPause` y ruta con espacios: matriz real completa aprobada.
- `node scripts/smoke_projects.cjs --sapi --voice=Leonor`: **aprobado**, Leonor desde UI Electron, WAV 16k, edición/persistencia/mezclador y preview/video PNGTuber reales. La petición API con `usarIA:true` conserva el bloqueo de Fase 1 y genera solo audio.
- `node scripts/smoke_projects.cjs --maintenance`: **aprobado**, navegación/transcripción bloqueadas y operaciones SRT/ASS independientes reales.
- El informe local generado fue revisado sin encontrar rutas absolutas, nombre de usuario ni correo; las pruebas de depuración incluyen valores simulados de esos datos.

Solo cambió el smoke para permitir elegir la voz mediante `--voice=...`; no cambió código de aplicación, sesiones, biblioteca ni política de funciones.

## Bloqueo externo y próximo paso

Falta recibir del tester:

1. El `para_compartir.zip` de **la instalación exacta que falla**, usando la misma herramienta; ejecutar también en la otra computadora para comparar hashes y casos.
2. Versión visible de Studio y versión/arquitectura de Loquendo TTS si se conoce.
3. Captura/traza completa del error original, depurada de identidades/rutas personales, y voz seleccionada.
4. Si los casos fijos pasan: una frase mínima sin datos personales con las etiquetas necesarias para reproducirlo, y las condiciones de aparición (primer intento/cambio de voz, elevación u otros programas de voz abiertos).

Comparar primero si difieren script/exe/motor o tokens; después, el primer fallo COM de casos equivalentes y su código interno. Solo tras reproducir una causa se aplicará una corrección mínima y su regresión. Esta fase **no declara resuelto el bug**: la investigación queda explícitamente bloqueada por esa evidencia. La Fase 3 no se inició en esta sesión.
