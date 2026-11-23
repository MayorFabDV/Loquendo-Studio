# 🎙️ Loquendo Studio

> **Versión 1.2.0 (Pre-release de prueba y optimización):** Las fases de desarrollo, estabilización y optimización de tamaño están documentadas en [ESTABILIZACION.md](ESTABILIZACION.md) y [OPTIMIZACION_FASE4.md](OPTIMIZACION_FASE4.md). La transcripción automática y LanguageTool se encuentran temporalmente en mantenimiento.

### Suite de automatización de voz, edición multimedia y video PNGTuber

[![Versión](https://img.shields.io/badge/versión-1.2.0--preview-e41a1a?style=for-the-badge)](https://github.com/MayorFabDV/Loquendo-Studio/releases)
[![Plataforma](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge&logo=windows)](https://github.com/MayorFabDV/Loquendo-Studio/releases)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green?style=for-the-badge)](LICENSE)
[![Estado](https://img.shields.io/badge/estado-pre--release-orange?style=for-the-badge)]()

**Convierte texto en audio con voces Loquendo y Microsoft SAPI5, organiza mezclas multipista, aplica ducking musical y genera videos PNGTuber animados — en una suite de escritorio offline para Windows.**

[Características](#-características-principales) •
[Descarga](#-descarga) •
[Historial de Versiones](#-historial-de-versiones) •
[Para Desarrolladores](#️-para-desarrolladores) •
[Roadmap](#-roadmap) •
[Licencia](#-licencia)

---

## 📖 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Limitaciones Conocidas y Avisos](#-limitaciones-conocidas-y-avisos)
- [Stack Tecnológico](#-stack-tecnológico)
- [Vista Previa](#-vista-previa)
- [Descarga](#-descarga)
- [Historial de Versiones](#-historial-de-versiones)
- [Para Desarrolladores](#️-para-desarrolladores)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Cómo Funciona](#-cómo-funciona)
- [Roadmap](#-roadmap)
- [Testers](#-testers)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## ✨ Características Principales

### 🎙️ Síntesis de Voz (SAPI5 Loquendo y Microsoft)
- **Voces Loquendo**: Jorge, Carlos, Carmen, Diego, Ludoviko, Esperanza, Francisca, Leonor, Soledad, Ximena.
- **Voces Microsoft**: Helena, Sabina, David, Zira.
- **Voces Acapella**: Diego, Carmen, Jorge.
- **Detección automática** de voces nativas instaladas en Windows mediante proceso x86 de 32 bits.
- **Control SSML**: pausas (`[pause]`), velocidad (`[slow]`, `[fast]`), tono (`[pitch]`), volumen (`[vol]`), énfasis y deletreo.
- **Multi-voz**: permite alternar voces dentro de un mismo guion con etiquetas `[voz:Nombre]`.

### 📝 Procesamiento y Optimización de Texto
- **Diccionarios locales personalizables**: jergas, sinónimos, fonética, ortografía y gramática basados en SQLite/JSON local.
- **Puntuación y comas inteligentes**: detección automática de conectores lógicos, causa, contraste y enumeración.
- **Puntos inteligentes**: segmentación de oraciones excesivamente largas para una locución fluida.
- **Modos de narración**: Estándar, Creepypasta, Tutorial, Gameplay.
- *(Nota: La corrección externa mediante servidor LanguageTool se encuentra temporalmente deshabilitada en esta versión).*

### 🎵 Editor de Audio y Mezclador Multipista
- **WaveSurfer integrado**: visualización de ondas de audio en tiempo real.
- **Operaciones de edición**: recortar, split, transiciones Fade In / Fade Out, normalización y eliminación de silencios.
- **Mezclador multipista**: soporte para múltiples clips en pistas independientes de voz, música y SFX; duplicar, mover, recortar, copiar/cortar/pegar y deshacer/rehacer.
- **Proyectos de mezcla**: guardar/abrir proyectos locales en formato JSON y paquetes completos `.loquendo.tar` con medios incorporados y recuperación de fuentes faltantes.
- **Recuperación de sesiones (Alpha)**: almacenamiento en IndexedDB local para restaurar sesiones de voz y mezcla tras reinicios accidentales.

### 🎚️ Ducking Inteligente y Biblioteca Musical
- **Atenuación automática (sidechain)** mediante FFmpeg para modular la música de fondo mientras habla la voz.
- **Biblioteca musical**: persistencia de canciones recientes y favoritas para ducking sin duplicar archivos.
- **Parámetros configurables**: volumen de música, fade in/out, bucle (loop) y umbrales de compresión.

### 🎬 Video PNGTuber
- **Gestión de expresiones**: reposo (idle), habla (talking) y parpadeo (blink) con visibilidad mutuamente exclusiva.
- **Vista previa de expresiones**: demostración cíclica de aproximadamente 4 segundos, sin pista de audio y en bucle continuo, permitiendo evaluar el personaje con cualquier fuente.
- **Exportación de video final**: generación del video sincronizado con el audio real (Studio o archivo externo WAV/MP3), respetando silencios y habla.
- **Fondos soportados**: verde (chroma key), negro o transparente (alfa).
- **Formatos de exportación**: MP4 (H.264) o WebM con canal alfa para OBS Studio / Streamlabs.
- **Ajustes de personaje**: posición, tamaño del lienzo y escala configurable.

### 📄 Herramientas de Subtítulos (Archivos existentes)
- Importación, edición manual y descarga de archivos de subtítulos **SRT** y **ASS** existentes desde el editor de Audio.
- Generación de plantillas aproximadas matemáticas sin requerir modelos de IA.
- *(Nota: La transcripción automática mediante Whisper se encuentra temporalmente deshabilitada por mantenimiento).*

---

## ⚠️ Limitaciones Conocidas y Avisos

1. **Efectos del editor de audio en la exportación final:**
   Los efectos aplicados en el editor de audio (filtros de ecualización, ciertos fades y procesamientos de escucha) todavía no se reflejan correctamente en todos los archivos finales exportados. Se recomienda utilizar el render avanzado y revisar el resultado antes de publicar.
2. **Recuperación de sesiones en estado ALPHA:**
   La recuperación automática de sesiones de voz y mezclador se encuentra en fase **Alpha**. Aunque previene pérdidas accidentales ante recargas, **el usuario debe guardar manualmente sus proyectos y realizar copias de seguridad de sus archivos de audio y guiones**.
3. **Transcripción automática (Whisper) deshabilitada:**
   La generación automática de subtítulos con IA (Whisper.cpp y modelos `ggml`) fue temporalmente deshabilitada por mantenimiento y excluida del instalador para reducir el tamaño del paquete.
4. **LanguageTool deshabilitado:**
   El corrector externo LanguageTool y su runtime Java fueron temporalmente retirados de la distribución. La corrección ortográfica y gramatical opera exclusivamente con los diccionarios locales y el procesador de texto integrado.
5. **Investigación abierta con la voz Leonor:**
   Existe un reporte de fallo COM (`Speak`) con la voz Leonor en la computadora de un tester. El fallo no se reproduce en entornos estándar y permanece bajo investigación mediante la herramienta de diagnóstico disponible en `tools/diagnostico_sapi/`.

---

## 🛠️ Stack Tecnológico

| Tecnología | Rol | Arquitectura / Detalle |
|---|---|---|
| **Electron (v37)** | Framework de escritorio | x64 |
| **Node.js + Express** | Servidor API local y orquestación | Localhost restringido |
| **Python embebido** | Síntesis SAPI5 y automatización | **32 bits (x86)** (requerido por SAPI) |
| **FFmpeg & FFprobe** | Procesamiento multimedia y renderizado | x64 |
| **WaveSurfer.js** | Visualización interactiva de ondas | Frontend |
| **sql.js (SQLite)** | Almacenamiento local de diccionarios | WebAssembly |

*(Los componentes Java/LanguageTool y Whisper.cpp están temporalmente desactivados en v1.2.0 y resguardados en respaldo externo).*

---

## 🖼️ Vista Previa

![Loquendo Studio Preview](frontend/img/preview.png)

---

## 📥 Descarga

> ℹ️ **Las descargas de prueba de la versión 1.2.0 estarán disponibles en la sección [Releases](https://github.com/MayorFabDV/Loquendo-Studio/releases) de GitHub una vez aprobada su publicación.**

Formatos previstos para Windows 10 / 11 (64 bits):
- **Instalador estándar (NSIS):** `Loquendo Studio Setup 1.2.0.exe` (~225 MB).
- **Distribución portable (ZIP):** `LoquendoStudio-v1.2.0-win64-portable.zip` (~302 MB). No requiere instalación; basta con descomprimir en una carpeta local y ejecutar `Loquendo Studio.exe`.

**Requisitos mínimos:**
- Windows 10 o Windows 11 de 64 bits.
- Voces SAPI5 instaladas en Windows si se desea síntesis Loquendo.
- No requiere instalar Python, Java ni herramientas externas.

---

## 📜 Historial de Versiones

### 📦 v1.2.0 — Optimización y Mezclador Multipista (Pre-release)
- **Mezclador multipista:** Incorporación de editor multipista con clips independientes de voz, música y efectos, soporte de split, trim, mover, duplicar y proyectos en formato JSON y `.loquendo.tar`.
- **Mejoras PNGTuber:** Soporte para audio externo (WAV/MP3), unificación de la vista previa de expresiones como demo cíclica de 4 s sin audio y exportación final sincronizada en MP4 y WebM con alfa.
- **Biblioteca musical:** Persistencia de canciones recientes y favoritas para ducking sin duplicar archivos.
- **Recuperación de sesiones (Alpha):** Recuperación de voz y mezcla ante reinicios. *(Nota: Estado Alpha; se requiere guardar proyectos manualmente).*
- **Optimización de distribución:** Reducción del tamaño de la carpeta desempaquetada de 1.778,33 MB a 798,42 MB (~55,1% de reducción).
- **Mantenimiento y resguardo:** Exclusión temporal del paquete de Whisper.cpp, modelos IA y Java/LanguageTool, preservándolos en respaldo externo documentado para reactivación futura.
- **Diccionarios locales y subtítulos:** Conservación de diccionarios locales y herramientas independientes para archivos SRT/ASS.
- **Limitación pendiente:** Los efectos aplicados en el editor de audio todavía no se reflejan correctamente en todas las exportaciones finales.

### 📦 v1.1.2v — Mejoras PNGTuber y Editor de Audio
- Ya incluía el editor de audio con WaveSurfer.
- **NO** incluía mezclador multipista.
- Introdujo mejoras en el proceso de generación de video PNGTuber.
- Incorporó el parpadeo del personaje (blink) con temporización intercalada.
- Incorporó el control de ajuste de escala del personaje PNGTuber.
- *Limitación conocida:* Los efectos del editor de audio todavía no se reflejaban correctamente en el archivo final exportado.

### 🎨 v1.1 — Nueva Interfaz y Pestañas
- Interfaz modular por pestañas: Guión → Audio → Video, con barra de flujo.
- Sistema de ayudas contextuales y tooltips interactivos en todos los controles.
- Menú de Ajustes con personalización de tema (oscuro/claro/sistema) y preferencias persistentes.
- Puntuación inteligente con corte automático de oraciones largas.

### 🔧 v1.0.1 — Parche de Estabilidad
- Corrección del historial Undo/Redo en el editor de audio.
- Corrección de la exportación del servidor REST con puerto dinámico.
- Soporte para parámetros de calidad y rutas seguras de archivos temporales.

### ✅ v1.0 — Lanzamiento Inicial
- Síntesis de voz con Loquendo SAPI5 y Microsoft Speech API.
- Procesamiento de texto con 5 diccionarios locales.
- Generación inicial de videos PNGTuber y ducking musical con FFmpeg.

---

## 🛠️ Para Desarrolladores

### Requisitos de Desarrollo
- [Node.js](https://nodejs.org/) 18+
- Python 3.10+ (32 bits, requerido para compilar y probar llamadas SAPI COM)
- Windows 10/11 x64

### Comandos Principales
```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar en desarrollo
npm start

# 3. Ejecutar suite de pruebas
npm test

# 4. Generar distribución desempaquetada de prueba (win-unpacked)
npm run build:dir

# 5. Generar instalador NSIS
npm run build:nsis
```

---

## 🎯 Cómo Funciona

```text
1. 📝 Escribe o pega tu texto en el Guión
   ↓
2. ⚙️ Aplica optimizaciones (puntuación inteligente, jergas, sinónimos, ortografía local)
   ↓
3. 🎙️ Selecciona voz SAPI5 Loquendo o Microsoft
   ↓
4. 🔊 Genera el audio de voz (WAV / MP3)
   ↓
5. ✂️ Edita o mezcla el audio en el Mezclador Multipista
   ↓
6. 🎵 Añade música de fondo con Ducking automático
   ↓
7. 🎬 Configura tu personaje PNGTuber (idle, talking, blink)
   ↓
8. 💾 Exporta tu audio final o video PNGTuber (MP4 / WebM con transparencia)
```

---

## 🚀 Roadmap

### 🔄 v1.2.x (Estabilización en curso)
- [x] Optimización del peso de distribución (exclusión temporal de Whisper y JRE).
- [x] Contrato unificado de preview PNGTuber (demo 4s) y exportación final sincronizada.
- [x] Biblioteca musical y ducking persistente.
- [ ] Reflejo fiel de efectos del editor de audio en todas las exportaciones finales.
- [ ] Maduración de la recuperación de sesiones para salir de fase Alpha.
- [ ] Diagnóstico del sistema integrado en el panel de Ajustes.
- [ ] Conclusión de investigación sobre síntesis con voz Leonor.

### 🔮 v2.0 (Futuro)
- □ Reactivación optimizada de transcripción de subtítulos y corrector gramatical.
- □ Nuevas expresiones para personajes PNGTuber (enojo, sorpresa, tristeza).
- □ Evaluaciones de migración a frameworks ligeros (Tauri/Rust).

---

## 🧪 Testers

Agradecimiento especial a los testers por su colaboración activa:

| Tester | Rol | Canal |
|---|---|---|
| LautyKT | Tester | YouTube |
| Allstarz | Tester | YouTube |
| DarkerGhost | Tester | YouTube |
| Leo | Tester | - |
| CreepyMoxo | Tester | YouTube |

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas!

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/NuevaCaracteristica`)
3. Commit tus cambios (`git commit -m 'Añade NuevaCaracteristica'`)
4. Push a la rama (`git push origin feature/NuevaCaracteristica`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

---

## 🙏 Agradecimientos

- **Loquendo** por las voces
- **OpenAI** por Whisper
- **LanguageTool** por la corrección ortográfica
- **FFmpeg** por el procesamiento multimedia
- **WaveSurfer.js** por el editor de audio
- **Electron** por el framework
- Mis testers por el feedback

---

Creado con ❤️ por BafYam

[![YouTube](https://img.shields.io/badge/YouTube-BafYamRevival-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/@BafYamRevival)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Apoyar-FF5E5B?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/bafyam)

⭐ Si te gusta el proyecto, dale una estrella ⭐
