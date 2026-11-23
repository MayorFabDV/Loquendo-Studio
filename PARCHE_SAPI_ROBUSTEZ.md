# Parche futuro SAPI5 — Identidad estable y limpieza COM

Fecha: 2026-11-22. Rama **`fix/sapi-token-com-robustness`**, base `f0e29d4`. Núcleo: `76b6c5f`; restauración coordinada de alias legacy en preferencias: `c3a33a9`.

**Este parche corrige inconsistencias demostradas del flujo SAPI. No declara resuelto el E_FAIL de Leonor del tester.** Se requiere verificarlo en la computadora afectada.

## Publicación y aislamiento

Se verificó la API pública de GitHub: `Loquendo_Studio1.2v(beta)` es una pre-release publicada, con instalador y ZIP portable. Se corrigió la búsqueda inicial por el tag inexistente `v1.2.0-beta.1`. Referencia remota observada: `933cecf5255ecf76985868ed80a3823da533bc07`.

Por la condición expresa del usuario se creó una rama futura separada. No se movió el tag ni se modificaron assets, la rama de Fase 4 o los binarios existentes. La carpeta de capturas del usuario se conserva sin confirmar en Git. No se instaló ninguna voz ni se escribió en el registro.

## Archivos y cambios

| Archivo | Cambio |
|---|---|
| `backend/modules/sapi_voice_common.py` | Módulo compartido de identidad, filtro existente, enumeración, stdout y diagnóstico seguro |
| `backend/modules/listar_voces.py` | Entrada fina que devuelve ID completo interno, nombre y huella; usa el filtro compartido |
| `backend/modules/generar_voz.py` | Resolución estable/legacy, limpieza en finally y resultado de error serializable antes de desinicializar COM |
| `backend/services/audioService.js` | Comprobación de protocolo del exe; no enviar IDs nuevos a un binario legado; logs sin token/texto completos |
| `server.js` | API coordinada, selección vacía inválida y detector alternativo que usa el módulo común sin generar otro script |
| `frontend/js/main.js` | Valores de selector estables; nombres duplicados distinguibles por huella; no generar con una selección vacía |
| `frontend/js/ui/settings.js` | Restaura nombres antiguos únicos al ID sin reescribir preferencias; selección explícita ante ambigüedad/ausencia |
| `scripts/check_build_prereqs.js` | Comprueba presencia del nuevo módulo obligatorio; no compila nada |
| `tools/diagnostico_sapi/diagnostico_sapi.py` y `LEEME.md` | Versión 2, informe/ZIP público con tokens anonimizados, lectura de diagnóstico estructurado y hash del módulo común |
| `tests/sapi_robustness_test.py`, `sapiRobustness.test.js`, `sapi_native_patch.py` | Pruebas de identidad, cleanup, privacidad, protocolo, compatibilidad y síntesis real |
| `tests/sapi_diagnostic_test.py`, `subtitleMaintenance.test.js`, `scripts/smoke_projects.cjs` | Regresión de ZIP/protocolo/mantenimiento, IDs reales en UI, preferencias y detector alternativo |

### Identidad y compatibilidad

El ID exacto del token viaja desde el listado a `option.value`, petición local y generador. Se selecciona entre los tokens enumerados del proceso x86, no abriendo una ruta arbitraria del registro.

Los nombres antiguos se resuelven por descripción exacta o parcial **única**; se conserva el alias histórico `Loquendo Nombre`. Se eliminó la adivinación por última palabra arbitraria. Cero o varias coincidencias producen errores explícitos, sin usar otra voz predeterminada. Las etiquetas `[voz:Nombre]` continúan funcionando.

Las preferencias antiguas por nombre se mapean en memoria cuando son únicas y no se reescriben automáticamente. Si son ambiguas/no disponibles, se deja el selector sin voz y se exige elegir; el botón no hace fallback a Jorge. Los proyectos y sesiones no reciben migraciones de datos.

`voz_usable()` mantiene el filtro HKLM/CLSID/InprocServer32 existente. Las claves ahora se cierran explícitamente, también si la consulta falla. No se habilitan tokens HKCU ni se eliminan filtros por conjeturas.

### Limpieza y diagnóstico

- `SpFileStream.Close()` se intenta una sola vez si se abrió. Se intenta desconectar la salida asociada aunque falle el trabajo.
- Si Speak falla, sigue siendo el error primario aunque falle Close, la desconexión o CoUninitialize. Los errores secundarios quedan en `cleanup_errors`.
- El ámbito local devuelve solo datos serializables: se capturan etapa, frames sin rutas, flags, token anonimizado y HRESULT/excepinfo; se limpian frames del traceback para que no retengan wrappers al desinicializar COM.
- stdout ausente no causa `detach()` sobre None. La ejecución Python del backend usa `-B` para no añadir cachés de módulos.
- Formato **39 intacto: 48 kHz, 16 bits, estéreo**. Se registra formato solicitado y observado sin alterar negociación, calidad o conversión posterior.
- Logs sin guion/SSML ni token completo. Descripciones del sistema, campos numéricos HRESULT/excepinfo y huellas de campos libres del proveedor permiten comparar errores sin publicar texto o rutas sensibles.
- El ZIP público del diagnóstico v2 contiene solo Markdown/JSON depurados. Las entradas privadas de trabajo pueden conservar IDs para seleccionar; no se comparte toda la carpeta.

## Implicación para el ejecutable existente

No se ha actualizado `generar_voz.exe`. El antiguo acepta nombres, pero no IDs estables. Usarlo con el nuevo frontend podía sintetizar otra voz silenciosamente.

El backend realiza una sonda de metadatos **`--sapi-protocol`**, con timeout de cinco segundos y caché por instancia. Solo permite el exe que anuncie protocolo 2 y 32 bits. En esta rama, con el exe publicado actual, usa el **Python embebido x86 y el script parcheado**. Nunca recurre a Python de sistema ni a transcripción. Una futura compilación compatible puede anunciar el protocolo; aquí no se produjo tal binario.

Este camino puede tener un coste de arranque distinto al exe; no se hizo un benchmark de rendimiento. El módulo común ya queda cubierto por el patrón de recursos de módulos de Fase 4 y por el prerrequisito nuevo. No se modificaron `package.json`, los filtros de exclusión ni `featurePolicy.js`.

**La beta ya instalada sigue usando sus fuentes/binarios originales y no recibe automáticamente este parche.** Un paquete nuevo o un ejecutable nuevo requieren un trabajo de build separado; no se presenta la validación de desarrollo como validación de una distribución nueva.

## Validación ejecutada

| Comando/prueba | Resultado |
|---|---|
| `npm test` | **75 aprobadas, 0 falladas, 0 omitidas** |
| Suite Python integrada en `sapiRobustness.test.js` | 12 pruebas: IDs/legacy, duplicados/parciales, stdout, filtro/cierres, formato39, XML/multivoz, error primario y cleanup |
| `backend\python\python.exe -B tests\sapi_native_patch.py` | Ocho WAV nativos Leonor/Jorge: ID/nombre × plano/XML; 48 kHz estéreo16-bit, selección y flags comprobados |
| Control negativo nativo | Error real conocido de clase no registrada conservado en Speak, sin avisos IUnknown. No es el E_FAIL remoto |
| `node scripts/smoke_projects.cjs --sapi --voice=Jorge` | Electron/Express reales, ID en selector, nombre legacy/API XML, calidad16k, editor/mezclador/PNGTuber, fallback del detector y preferencia antigua; aprobado |
| `node scripts/smoke_projects.cjs --sapi --voice=Leonor` | Flujo equivalente aprobado |
| `node scripts/smoke_projects.cjs --external-audio` | Demo muda, externos WAV/MP3, MP4/WebM sincronizados y respuestas tardías aprobados |
| `node scripts/smoke_audio_sessions.cjs --recovery-ux` | Recuperación/protección de sesiones aprobada |
| `node scripts/smoke_projects.cjs --maintenance` | Subtítulos/transcripción bloqueados; SRT/ASS independiente aprobado. El bloqueo de LanguageTool se verifica en la suite Node |
| `node scripts/smoke_projects.cjs --desktop --music-library` | Biblioteca/ducking y main/preload entre reinicios aprobados |
| Lanzador independiente PowerShell/CMD | Versión2: **26/26 comprobaciones ok**, informe público con referencias anonimizadas |
| Sintaxis y prerrequisitos | JS y Python embebido mediante AST correctos; helper presente; sin compilar |

Las pruebas simuladas fuerzan Speak y limpieza fallidos simultáneamente y comprueban por referencias débiles que speaker/stream no siguen vivos al entrar en CoUninitialize. El caso nativo negativo usa una voz ya excluida por el filtro local; no modifica ni registra voces. El smoke del detector alternativo renombra solo la copia de `listar_voces.py` dentro de un sandbox propio y verifica que no se cree otro detector divergente.

La matriz del diagnóstico compara fuente nueva y exe legado por nombre. No debe interpretarse como prueba de un exe nuevo parcheado: no existe todavía. El informe local v2 de la versión final del código quedó en `%TEMP%\opencode\sapi-f15ad8ca7ca9\para_compartir.zip`.

## Integridad y Fase 4

Huellas contrastadas con la referencia y los digests públicos de la release:

| Artefacto conservado | SHA-256 |
|---|---|
| `backend/bin/generar_voz.exe` y copia de `dist/win-unpacked` | `f824afe81dfb2be4ac781303d2723f4740290083c20cd6e4965f74bc5763c4ea` |
| Instalador existente | `56020693c12d491d4d589e2005c859d7549b4f34599348b0a4ee3aa78f5b9eb5` |
| ZIP portable existente | `0ff0184e8fa996304571c7688263238fe4b3d24a4799fd316c0ba1b576c48384` |

El paquete optimizado inspeccionado sigue sin JRE, LanguageTool, whisper-cli, modelo y bibliotecas Whisper/ggml excluidas comprobadas. Capacidades y filtros de Fase 4 sin cambios. No se generó otra distribución ni se hicieron operaciones de publicación o cambios de tag.

## Pendientes

- Validación en la computadora del tester: **no afirmar resuelto su E_FAIL**. Las pruebas locales positivas solo acreditan este entorno.
- WinError 3 sigue separado. Ahora el diagnóstico identifica la etapa de directorio/stream y el código Win32, pero no se cambió la raíz de almacenamiento ni se atribuyó la causa remota.
- Futuro build/deploy del parche por separado, manteniendo los artefactos actuales inmutables.
- Fase 5 y diagnóstico general de Configuración permanecen fuera del alcance.
