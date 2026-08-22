#  Loquendo Studio

![Versión](https://img.shields.io/badge/versión-1.0.0-e41a1a?style=flat-square)
![Plataforma](https://img.shields.io/badge/Windows-10%2F11-blue?style=flat-square&logo=windows)
![Licencia](https://img.shields.io/badge/licencia-ISC-green?style=flat-square)

> **Automatización profesional de narración con Loquendo.**  
> Convierte texto en audio, genera subtítulos con IA, aplica efectos visuales y crea videos PNGTuber con fondo verde — todo en una sola aplicación.

---

## ✨ Características Principales

| Característica | Descripción |
|----------------|-------------|
| **Síntesis de Voz** | Genera audio con voces Loquendo (Jorge, Carlos, Carmen, Diego, Ludoviko) y Microsoft. Soporta SSML y multi-voz. |
|  **Subtítulos con IA** | Transcripción automática con **OpenAI Whisper** + corrección fonética. Exporta SRT y ASS con efectos visuales. |
| **Mezcla con Música** | Sube tu música de fondo y aplica **Ducking automático** (sidechain) para que la voz siempre destaque. |
| **Editor de Audio** | Recorta, aplica Fade In/Out, normaliza volumen y elimina silencios con WaveSurfer integrado. |
|  **Video PNGTuber** | Genera videos con tu avatar (Idle/Talking) sobre fondo verde, listo para OBS/Streamlabs. |
|  **Diccionarios Personalizados** | Jergas, sinónimos aleatorios y fonética Loquendo para que la IA pronuncie todo correctamente. |
|  **Modos de Narración** | Estándar, Creepypasta, Tutorial y Gameplay con ajustes automáticos de tono y pausas. |
|  **Soporta etiquetas tipo textaloud** | "Etiquetas soportadas: [pause], [pause:1000], [slow]texto[/slow], [fast]texto[/fast], [soft]texto[/soft], [loud]texto[/loud], [voz:nombre]texto[/voz]"
---

## Vista Previa


![Loquendo Studio Preview](img/preview.png)

---

## Descarga e Instalación

### Para Usuarios (Portable)
1. Ve a la sección **[Releases](https://github.com/tuusuario/loquendo-studio/releases)**.
2. Descarga `Loquendo-Studio-vX.X.X-portable.zip`.
3. Descomprime en cualquier carpeta.
4. Ejecuta `Loquendo Studio.exe`.

> ⚠️ **Requisitos:** Windows 10/11 (64 bits). No requiere instalación ni Python. 

---

## 🛠️ Para Desarrolladores

### Requisitos
- [Node.js](https://nodejs.org/) 18+
- [Python](https://python.org/) 3.10+ (solo para desarrollo)
- Windows 10/11

### Instalación
```bash
# 1. Clonar el repositorio
git clone https://github.com/tuusuario/loquendo-studio.git
cd loquendo-studio

# 2. Instalar dependencias
npm install

# 3. Instalar Whisper (opcional, para subtítulos IA)
pip install openai-whisper numpy

# 4. Ejecutar en desarrollo
npm start

# Compilación segura (evita locks en ffmpeg.exe)
npm run build:safe

# O compilación rápida
npm run build

Loquendo-Studio/
├── bin/                    # Binarios nativos (ffmpeg.exe, generar_voz.exe)
├── css/                    # Estilos Tailwind/CSS
├── db/                     # Diccionarios y perfil de usuario (JSON)
├── img/                    # Assets e iconos
├── js/                     # Frontend (main.js, audioEditor.js, etc.)
├── modules/                # Scripts Python (Whisper, ASS, SRT)
├── public/                 # Archivos generados (audios, pngtuber)
├── scripts/                # Scripts de build
├── services/               # Backend Node.js (Express)
├── main-electron.js        # Entry point de Electron
├── server.js               # API REST
└── package.json

 Cómo Funciona
Entra tu texto en el área de trabajo.
Automatiza con comas, puntos, fonética y sinónimos.
Selecciona voz y modo de narración.
Genera audio — se crea el WAV + SRT/ASS automáticamente.
Edita el audio (cortes, fades, normalización).
Mezcla con música subiendo un MP3 y aplicando Ducking.
Exporta a MP3 o genera un Video PNGTuber con fondo verde.

📄 Licencia
Este proyecto está bajo la licencia ISC.
Creado con amor al Loquendo por BafYam. 
Youtube
https://www.youtube.com/@BafYamRevival
