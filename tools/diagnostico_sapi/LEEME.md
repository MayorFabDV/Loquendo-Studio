# Diagnóstico de Leonor y SAPI/COM

Herramienta independiente para comparar dos computadoras. **No instala Python ni voces, no escribe en el registro y no cambia los archivos de Loquendo Studio.** Usa el Python embebido de 32 bits de la instalación que selecciones. No hace falta ejecutar como administrador.

## Ejecución sencilla

1. Copia esta carpeta completa (`Diagnosticar_Leonor.cmd`, `.ps1`, `diagnostico_sapi.py` y este documento) a la computadora.
2. Para una comparación inicial consistente, cierra Loquendo Studio y Loquendo TTS en ambas computadoras.
3. Haz doble clic en **`Diagnosticar_Leonor.cmd`**. Si no encuentra Studio, aparecerá un selector de carpeta: elige la carpeta de la aplicación instalada o extraída, que contiene `resources/backend`, o directamente su carpeta `backend`.
4. Espera al mensaje **«Informe listo»**. Un caso bloqueado se corta a los 45 segundos y se continúa con los demás.
5. Envía **solo `para_compartir.zip`**, que contiene `informe.md` e `informe.json`.

Los resultados quedan en una carpeta nueva bajo `%LOCALAPPDATA%\LoquendoStudio\Diagnosticos`. Puedes abrir esa ruta con Win+R. Los WAV de prueba se conservan localmente para escucharlos y comprobar que corresponde la voz; no se incluyen en el ZIP.

La herramienta necesita los componentes que Studio ya incluye: `backend/python/python.exe`, `backend/modules/generar_voz.py` y, para compararlo, `backend/bin/generar_voz.exe`. No sirve seleccionar únicamente el archivo portable autoextraíble sin su contenido instalado/extraído.

## Qué compara

Si encuentra un único token Leonor y una voz de control, realiza **26 comprobaciones**:

- Inventario SAPI x86 sin el filtro de la aplicación y listado obtenido con el `listar_voces.py` real.
- Para Leonor y el control: COM mínimo con formato 39, con/sin reasignar voz después de abrir el stream, formato predeterminado y XML.
- Script original y ejecutable original: texto plano, etiquetas XML/SSML y etiqueta de voz sobre sí misma.
- Cambios control → Leonor → control y Leonor → control → Leonor, en script y ejecutable.

Control predeterminado: Jorge, o una alternativa disponible si falta. El informe identifica el token mediante una huella anonimizada. Si Leonor no aparece o su nombre coincide con varios tokens, no se la sustituye silenciosamente por otra voz ni se declara que pasó la prueba. Un ID exacto puede utilizarse como entrada privada para desambiguar; no se publica en el informe.

El código fuente original se observa mediante trazado de Python, sin modificarlo ni envolver los objetos COM. Se registran función, línea y llamada, token, segmento y flags. Para un `com_error` se conservan HRESULT firmado/hexadecimal, descripción, `excepinfo` —incluido su `scode` interno— y argumento. El HRESULT externo puede ser solo `DISP_E_EXCEPTION`: también hay que mirar el interno.

Cada prueba va en un proceso nuevo. Si hay un cierre nativo o timeout, se conservan el código de salida y la última operación registrada. El exe no está instrumentado: una excepción exclusiva del exe debe compararse con el caso de script equivalente; no se atribuye una llamada exacta solo por el código de salida.

El inventario de registro es de **solo lectura** en vistas 32/64 bits. Recoge token/CLSID y versión, hash y arquitectura del DLL del motor, sin su ruta completa. La inspección de archivos nativos evita confundir `System32` con la redirección x86 a `SysWOW64`.

## Informe y privacidad

Se usa exclusivamente texto fijo de prueba. No se leen guiones, proyectos, biblioteca musical, diccionarios ni credenciales. El informe no recoge nombre de usuario/equipo ni rutas de instalación: los mensajes de error y logs se depuran para eliminar rutas absolutas, identidades del entorno, SID personales y correos. Desde la versión 2, `informe.json`, `informe.md` y el ZIP sustituyen los tokens completos por huellas SHA-256. Los archivos internos de trabajo sí pueden contener IDs necesarios para seleccionar voces: comparte solo `para_compartir.zip`, no toda la carpeta de resultados.

Además de los errores, se guardan las versiones/arquitecturas y hashes del Python, script de voz, listado, módulo común SAPI si existe, exe y herramienta. Así se detecta si se está comparando código o binarios distintos. Un WAV vacío, silencioso o un aviso de liberación IUnknown no se considera una síntesis correcta sin observaciones. La herramienta puede comparar la beta publicada antigua y la rama de parche futura; no modifica sus ejecutables ni exige que ambos tengan el nuevo protocolo de selección.

`not_reproduced_with_fixed_cases` significa que estos casos no reprodujeron el error; no demuestra que el fallo original no exista.

## Qué necesitamos del tester

1. `para_compartir.zip` ejecutado sobre **la misma instalación de Studio que falla**. Ejecuta la misma herramienta en la otra computadora.
2. Versión visible de Studio y versión de Loquendo TTS, indicando su arquitectura si la muestra.
3. Si falla texto simple o solo un guion con etiquetas, qué voz estaba seleccionada y si ocurre desde el primer intento o tras cambiar voces.
4. Traza/captura completa del fallo original, ocultando nombres y rutas personales.
5. Si todos los casos pasan, una frase mínima **sin datos personales** que reproduzca el problema, conservando las etiquetas necesarias. Indicar también si la aplicación se ejecutaba elevada o con otros programas de voz abiertos.

No necesitamos exportaciones del registro, instaladores de voces ni guiones privados. No reinstales ni cambies el registro para esta comparación.

## Opciones avanzadas

Desde PowerShell, sin instalar nada:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Diagnosticar_Leonor.ps1" -StudioPath "D:\Aplicaciones\Loquendo Studio" -Voice "Leonor" -ControlVoice "Jorge"
```

También se puede arrastrar la carpeta de Studio sobre el `.cmd`. Para automatización: `-NoPause` evita la espera final y `-OutputParent` elige dónde crear una carpeta de resultados nueva. El script Python admite `--timeout` para cambiar el límite por caso; nunca recurre al Python del sistema.
