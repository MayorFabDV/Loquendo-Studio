🎙️ Loquendo Studio
Herramienta profesional de automatización de voz, edición de audio y generación de contenido con avatares PNGTuber.
✨ Características
🎙️ Síntesis de voz con múltiples voces (SAPI/Loquendo)
🧠 Subtítulos con IA usando Whisper (OpenAI)
✂️ Editor de audio integrado con WaveSurfer.js (corte, fade, normalizar, eliminar silencios)
🎵 Ducking automático con música de fondo vía FFmpeg
🎬 Generación de video PNGTuber con fondo verde (chroma key)
📚 Diccionarios personalizables (jergas, sinónimos, perfil de usuario)
🧠 Modos de narración (Estándar, Creepypasta, Tutorial, Gameplay)
📋 Requisitos
Node.js 18+ y npm
Python 3.8+ con:
openai-whisper
pywin32 (solo Windows)
Windows (por dependencias SAPI y binarios .exe)
FFmpeg y FFprobe (incluidos en bin/)
🚀 Instalación
bash
# 1. Clonar el repositorio
git clone https://github.com/tuusuario/loquendo-studio.git
cd loquendo-studio

# 2. Instalar dependencias de Node
npm install

# 3. Instalar dependencias de Python
pip install openai-whisper pywin32

# 4. Ejecutar en modo desarrollo
npm start
📁 Estructura del proyecto
plain
loquendo-studio/
├── main-electron.js      # Proceso principal de Electron
├── preload.js            # Puente seguro IPC
├── server.js             # API REST (Express)
├── index.html            # Frontend
├── css/                  # Estilos
├── js/                   # Scripts del frontend
├── services/             # Lógica de negocio (Node)
├── modules/              # Scripts de Python
├── bin/                  # Binarios (FFmpeg, generar_voz.exe)
├── public/audios/        # Archivos generados (temporal)
├── db/                   # Diccionarios JSON
└── img/                  # Imágenes y logo
🛡️ Seguridad
Este proyecto utiliza:
contextIsolation: true y preload.js para comunicación segura
Validación de rutas y tipos de archivo
Limpieza automática de archivos temporales
📄 Licencia
MIT © 2026 BafYam