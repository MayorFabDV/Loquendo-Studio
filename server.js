// server.js - API REST pura para Loquendo Studio
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ==========================================
// CONFIGURACIÓN MULTER (subida de música)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(__dirname, 'public', 'audios');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, `music-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB máximo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de audio'), false);
  }
});

// Asegurar que la carpeta pngtuber exista y definir su ruta antes de usarla en multer
const pngtuberFolder = path.join(__dirname, 'public', 'pngtuber');
if (!fs.existsSync(pngtuberFolder)) fs.mkdirSync(pngtuberFolder, { recursive: true });

const pngtuberStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(pngtuberFolder)) fs.mkdirSync(pngtuberFolder, { recursive: true });
    cb(null, pngtuberFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const prefix = file.fieldname === 'talking' ? 'talking' : 'idle';
    cb(null, `${prefix}-${Date.now()}${ext}`);
  }
});

const uploadPngTuber = multer({
  storage: pngtuberStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes PNG'), false);
  }
});

// ==========================================
// RUTAS DE BINARIOS Y CARPETAS (soporte para app empaquetada)
// ==========================================
const isPackaged = process.env.NODE_ENV === 'production' || !!process.resourcesPath;

function resolveResource(relPath) {
  // 1) Preferir ruta relativa al proyecto
  const local = path.join(__dirname, relPath);
  if (fs.existsSync(local)) return local;
  // 2) Si estamos empaquetados en Electron, probar process.resourcesPath
  if (process.resourcesPath) {
    const res = path.join(process.resourcesPath, relPath);
    if (fs.existsSync(res)) return res;
  }
  // 3) Devolver la ruta local aunque no exista (para mensajes de error claros)
  return local;
}

const ffmpegPath = resolveResource(path.join('bin', 'ffmpeg.exe'));
const pythonSRT = resolveResource(path.join('modules', 'generar_srt.py'));
// Detectar intérprete Python embebido (si se incluye en extraResources/python/)
const bundledPython = (function(){
  const candidates = [
    path.join(__dirname, 'python', 'python.exe'),
    path.join(process.resourcesPath || '', 'python', 'python.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'python', 'python.exe')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
})();

const dbFolder = resolveResource('db');
const audioFolder = resolveResource(path.join('public', 'audios'));

// ==========================================
// INICIALIZAR EXPRESS
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));
app.use('/audios', express.static(audioFolder));
app.use('/pngtuber', express.static(pngtuberFolder));

// ==========================================
// SERVICIOS
// ==========================================
const DictionaryService = require('./services/dictionaryService');
const AudioService = require('./services/audioService');
const VideoService = require('./services/videoService');

const dictService = new DictionaryService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, bundledPython);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder);

// ==========================================
// HELPER: VALIDACIÓN DE RUTAS (anti path traversal)
// ==========================================
function sanitizarRutaAudio(ruta) {
  if (!ruta || typeof ruta !== 'string') return null;

  // Quitar query params y normalizar
  let limpia = ruta.split('?')[0].replace(/\\/g, '/');

  // Bloquear path traversal
  if (limpia.includes('..')) return null;

  // Asegurar que resuelva dentro de public/
  const absoluta = path.resolve(path.join(__dirname, 'public', limpia));
  const publicRoot = path.resolve(path.join(__dirname, 'public'));

  if (!absoluta.startsWith(publicRoot)) return null;
  if (!fs.existsSync(absoluta)) return null;

  return limpia;
}

// ==========================================
// RUTAS API
// ==========================================

// --- Diccionarios ---
app.get('/api/jergas', (req, res) => {
  try { res.json(dictService.getDiccionario('jergas')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sinonimos', (req, res) => {
  try { res.json(dictService.getDiccionario('sinonimos')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/jergas', (req, res) => {
  const { original, reemplazo } = req.body;
  if (typeof original !== 'string') {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  dictService.guardarDiccionario('jergas', original, reemplazo);
  res.json({ mensaje: 'Jerga guardada' });
});

app.post('/api/sinonimos', (req, res) => {
  const { original, reemplazo } = req.body;
  if (typeof original !== 'string' || typeof reemplazo !== 'string') {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  dictService.guardarDiccionario('sinonimos', original, reemplazo);
  res.json({ mensaje: 'Sinónimo guardado' });
});

app.delete('/api/jergas/:word', (req, res) => {
    const { word } = req.params;
    dictService.eliminarEntrada('jergas', word);
    res.json({ mensaje: 'Entrada eliminada' });
});

app.delete('/api/sinonimos/:word', (req, res) => {
    const { word } = req.params;
    dictService.eliminarEntrada('sinonimos', word);
    res.json({ mensaje: 'Entrada eliminada' });
});

// --- Generación de Audio ---
app.post('/api/generar-audio', async (req, res) => {
  const { texto, voz, usarIA } = req.body;
  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'El texto no puede estar vacío' });
  }
  try {
    const resultado = await audioService.procesar(texto, voz, usarIA, dictService);
    res.json(resultado);
  } catch (error) {
    console.error('❌ Error en /api/generar-audio:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Ducking (mezcla con música) ---
app.post('/api/audio/apply-ducking', async (req, res) => {
  const { voiceAudioPath, musicPath, options } = req.body;

  if (!voiceAudioPath || !musicPath) {
    return res.status(400).json({ error: 'Faltan rutas de audio' });
  }

  // Validar que las rutas no salgan de public/
  const vozLimpia = sanitizarRutaAudio(voiceAudioPath);
  const musLimpia = sanitizarRutaAudio(musicPath);

  if (!vozLimpia || !musLimpia) {
    return res.status(403).json({ error: 'Ruta de audio no permitida o no existe' });
  }

  try {
    const resultado = await audioService.aplicarDucking(voiceAudioPath, musicPath, options);
    res.json(resultado);
  } catch (error) {
    console.error('❌ Error en ducking:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Conversión a MP3 ---
app.post('/api/audio/convertir-mp3', async (req, res) => {
  const { wavPath, originalWavPath } = req.body;
  if (!wavPath) return res.status(400).json({ error: 'Falta ruta WAV' });

  const wavLimpio = sanitizarRutaAudio(wavPath);
  if (!wavLimpio) {
    return res.status(403).json({ error: 'Ruta no permitida o archivo no existe' });
  }

  // Opcional: intentar convertir también la versión original si fue enviada
  const originalLimpio = originalWavPath ? sanitizarRutaAudio(originalWavPath) : null;

  try {
    if (originalLimpio && originalLimpio !== wavLimpio) {
      // Normalizar rutas relativas para audioService (sin slash inicial ni "public/")
      const wavRel = String(wavLimpio).replace(/^\/+/, '').replace(/^public\//i, '');
      const origRel = String(originalLimpio).replace(/^\/+/, '').replace(/^public\//i, '');
      // Convertir ambas en paralelo
      const [mainRes, origRes] = await Promise.all([
        audioService.convertirAMp3(wavRel),
        audioService.convertirAMp3(origRel)
      ]);
      // Etiquetar la principal como 'ducked' y la original como 'original'
      res.json({ urls: [
        { type: 'ducked', url: mainRes.url },
        { type: 'original', url: origRes.url }
      ], mensaje: 'MP3s listos' });
    } else {
      const wavRel = String(wavLimpio).replace(/^\/+/, '').replace(/^public\//i, '');
      const resultado = await audioService.convertirAMp3(wavRel);
      // Inferir tipo según nombre del WAV
      const base = path.basename(wavLimpio || '');
      const tipoInferido = base && base.startsWith('ducked-') ? 'ducked' : 'original';
      res.json({ urls: [{ type: tipoInferido, url: resultado.url }], mensaje: resultado.mensaje || 'MP3 listo' });
    }
  } catch (error) {
    console.error('❌ Error en conversión MP3:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Video PNGTuber ---
app.post('/api/generar-video-pngtuber', async (req, res) => {
  const { audioPath, idleImagePath, talkingImagePath } = req.body;
  if (!audioPath) return res.status(400).json({ error: 'Falta la ruta del audio' });

  const audioLimpio = sanitizarRutaAudio(audioPath);
  if (!audioLimpio) {
    return res.status(403).json({ error: 'Ruta de audio no permitida o no existe' });
  }

  try {
    const resultado = await videoService.generarPNGTuber(audioPath, {
      idleImagePath,
      talkingImagePath
    });
    res.json({ ...resultado, mensaje: 'Video generado exitosamente' });
  } catch (error) {
    console.error('❌ Error en PNGTuber:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-pngtuber', (req, res) => {
  uploadPngTuber.fields([
    { name: 'idle', maxCount: 1 },
    { name: 'talking', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      console.error('❌ Error al subir PNGTuber:', err.message);
      return res.status(400).json({ error: err.message || 'Error al subir la imagen' });
    }

    const file = req.files?.idle?.[0] || req.files?.talking?.[0];
    if (!file) return res.status(400).json({ error: 'No se subió ninguna imagen' });

    const url = `/pngtuber/${file.filename}`;
    console.log(`✅ PNGTuber cargado: ${url}`);
    res.json({ url, type: file.fieldname, mensaje: 'Imagen PNGTuber cargada correctamente' });
  });
});

// --- Subir música de fondo ---
app.post('/api/upload-music', upload.single('music'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const url = `/audios/${req.file.filename}`;
  console.log(`✅ Música subida: ${url}`);
  res.json({ url, mensaje: 'Música subida correctamente' });
});

// --- Limpiar diccionarios ---
app.delete('/api/diccionario', (req, res) => {
  dictService.limpiarTodo();
  res.json({ mensaje: 'Diccionarios y perfil limpiados' });
});

// --- Subir audio editado desde el editor ---
app.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió audio' });
    const url = `/audios/${req.file.filename}`;
    console.log(`✅ Audio editado subido: ${url}`);
    res.json({ url, mensaje: 'Audio editado subido correctamente' });
});
// --- Guardar audio editado (blob del editor) ---
app.post('/api/guardar-audio-blob', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió audio' });
  
  const url = `/audios/${req.file.filename}`;
  console.log(`✅ Audio editado guardado: ${url}`);
  res.json({ url, mensaje: 'Audio editado guardado' });
});
// ==========================================
// MANEJO DE ERRORES GLOBAL
// ==========================================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    console.error('❌ Error no manejado:', err.stack || err.message || err);
    return res.status(500).json({ error: err.message || String(err) });
  }
  next();
});

// ==========================================
// ARRANCAR SERVIDOR
// ==========================================
const server = app.listen(PORT, () => {
  console.log(`Loquendo Studio corriendo en http://localhost:${PORT}`);
  console.log('Rutas clave:');
  console.log(' - ffmpegPath:', ffmpegPath);
  console.log(' - pythonSRT:', pythonSRT);
  console.log(' - bundledPython:', bundledPython || '(no embebido)');
  console.log(' - audioFolder:', audioFolder);
  if (!fs.existsSync(ffmpegPath)) console.warn('⚠️ ffmpeg.exe no encontrado en la ruta esperada. Verifique bin/ffmpeg.exe o extraResources en el empaquetado.');
  if (!fs.existsSync(path.join(__dirname, 'bin', 'generar_voz.exe')) && !fs.existsSync(path.join(process.resourcesPath || '', 'bin', 'generar_voz.exe'))) {
    console.warn('⚠️ generar_voz.exe no encontrado en bin/. Si usa voces .exe, agréguelo; de lo contrario instale Python 3 en el sistema.');
  }
});

module.exports = { expressApp: app, server };