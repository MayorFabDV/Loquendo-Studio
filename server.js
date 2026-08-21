// server.js - API REST Definitiva para Loquendo Studio (Produccion)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ==========================================
// 1. RESOLUCION DE RUTAS (DEV vs PROD vs PORTABLE)
// ==========================================
let electronApp;
try { electronApp = require('electron').app; } catch (e) { electronApp = null; }

const isPackaged = electronApp ? electronApp.isPackaged : (process.env.NODE_ENV === 'production');

function resolveResource(relPath) {
    const candidates = [];

    if (isPackaged) {
        // 1. process.resourcesPath (NSIS instalado, o portable segun Electron)
        candidates.push(path.join(process.resourcesPath, relPath));

        // 2. Carpeta del ejecutable portable (para target portable de electron-builder)
        if (process.execPath) {
            const exeDir = path.dirname(process.execPath);
            candidates.push(path.join(exeDir, relPath));
            // 3. Subcarpeta resources/ junto al .exe
            candidates.push(path.join(exeDir, 'resources', relPath));
        }
    }

    // 4. Desarrollo: raiz del proyecto (__dirname)
    candidates.push(path.join(__dirname, relPath));

    for (const c of candidates) {
        const normalized = path.normalize(c);
        if (fs.existsSync(normalized)) return normalized;
    }

    // Devolver el primero para logs de error claros
    return candidates[0] || path.join(__dirname, relPath);
}

// FRONTEND_PATH: donde esta index.html (dentro del ASAR en prod, raiz en dev)
const FRONTEND_PATH = __dirname;

// Rutas criticas resueltas
const ffmpegPath = resolveResource(path.join('bin', 'ffmpeg.exe'));
const pythonSRT = resolveResource(path.join('modules', 'generar_srt.py'));
const dbFolder = resolveResource('db');
const audioFolder = resolveResource(path.join('public', 'audios'));
const pngtuberFolder = resolveResource(path.join('public', 'pngtuber'));

// CARPETA PUBLIC CORRECTA: usamos la raiz de audioFolder
const PUBLIC_FOLDER = path.dirname(audioFolder);

// Asegurar carpetas criticas
[audioFolder, pngtuberFolder, dbFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// Python embebido (opcional)
const bundledPython = (() => {
    const candidates = [
        resolveResource(path.join('python', 'python.exe')),
        resolveResource(path.join('..', 'python', 'python.exe'))
    ];
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (e) {}
    }
    return null;
})();

// ==========================================
// 2. CONFIGURACION MULTER
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder, { recursive: true });
        cb(null, audioFolder);
    },
    filename: (req, file, cb) => {
        cb(null, `music-${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) cb(null, true);
        else cb(new Error('Solo se permiten archivos de audio'), false);
    }
});

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
        else cb(new Error('Solo se permiten imagenes PNG'), false);
    }
});

// ==========================================
// 3. INICIALIZAR EXPRESS
// ==========================================
const appExpress = express();
const PORT = process.env.PORT || 3000;

appExpress.use(cors({ origin: '*' }));
appExpress.use(express.json({ limit: '10mb' }));

// Servir frontend desde __dirname (dentro del ASAR en prod)
appExpress.use(express.static(FRONTEND_PATH));

// Servir archivos generados desde las carpetas resueltas
appExpress.use('/audios', express.static(audioFolder));
appExpress.use('/pngtuber', express.static(pngtuberFolder));

// ==========================================
// 4. SERVICIOS
// ==========================================
const DictionaryService = require('./services/dictionaryService');
const AudioService = require('./services/audioService');
const VideoService = require('./services/videoService');

const dictService = new DictionaryService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, bundledPython);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder);

// ==========================================
// 5. HELPER: VALIDACION ANTI PATH TRAVERSAL
// ==========================================
function sanitizarRutaAudio(ruta) {
    if (!ruta || typeof ruta !== 'string') return null;

    let limpia = ruta.split('?')[0].replace(/\\/g, '/');
    if (limpia.includes('..')) return null;

    const publicRoot = path.resolve(PUBLIC_FOLDER);
    const absoluta = path.resolve(path.join(publicRoot, limpia));

    if (!absoluta.startsWith(publicRoot)) return null;
    if (!fs.existsSync(absoluta)) return null;
    return limpia;
}

// ==========================================
// 6. RUTAS API
// ==========================================

// --- Diccionarios ---
appExpress.get('/api/jergas', (req, res) => {
    try { res.json(dictService.getDiccionario('jergas')); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

appExpress.get('/api/sinonimos', (req, res) => {
    try { res.json(dictService.getDiccionario('sinonimos')); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

appExpress.post('/api/jergas', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos invalidos' });
    dictService.guardarDiccionario('jergas', original, reemplazo);
    res.json({ mensaje: 'Jerga guardada' });
});

appExpress.post('/api/sinonimos', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string' || typeof reemplazo !== 'string') return res.status(400).json({ error: 'Datos invalidos' });
    dictService.guardarDiccionario('sinonimos', original, reemplazo);
    res.json({ mensaje: 'Sinonimo guardado' });
});

appExpress.delete('/api/jergas/:word', (req, res) => {
    dictService.eliminarEntrada('jergas', req.params.word);
    res.json({ mensaje: 'Entrada eliminada' });
});

appExpress.delete('/api/sinonimos/:word', (req, res) => {
    dictService.eliminarEntrada('sinonimos', req.params.word);
    res.json({ mensaje: 'Entrada eliminada' });
});

appExpress.delete('/api/diccionario', (req, res) => {
    dictService.limpiarTodo();
    res.json({ mensaje: 'Diccionarios y perfil limpiados' });
});

// --- Generacion de Audio ---
appExpress.post('/api/generar-audio', async (req, res) => {
    const { texto, voz, usarIA, modo } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'El texto no puede estar vacio' });
    try {
        const resultado = await audioService.procesar(texto, voz, usarIA, dictService, modo);
        res.json(resultado);
    } catch (error) {
        console.error('Error en /api/generar-audio:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Ducking ---
appExpress.post('/api/audio/apply-ducking', async (req, res) => {
    const { voiceAudioPath, musicPath, options } = req.body;
    if (!voiceAudioPath || !musicPath) return res.status(400).json({ error: 'Faltan rutas de audio' });

    const vozLimpia = sanitizarRutaAudio(voiceAudioPath);
    const musLimpia = sanitizarRutaAudio(musicPath);
    if (!vozLimpia || !musLimpia) return res.status(403).json({ error: 'Ruta de audio no permitida o no existe' });

    try {
        const vozAbsoluta = path.join(PUBLIC_FOLDER, vozLimpia);
        const musAbsoluta = path.join(PUBLIC_FOLDER, musLimpia);
        const resultado = await audioService.aplicarDucking(vozAbsoluta, musAbsoluta, options);
        res.json(resultado);
    } catch (error) {
        console.error('Error en ducking:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Conversion MP3 ---
appExpress.post('/api/audio/convertir-mp3', async (req, res) => {
    const { wavPath, originalWavPath } = req.body;
    if (!wavPath) return res.status(400).json({ error: 'Falta ruta WAV' });

    const wavLimpio = sanitizarRutaAudio(wavPath);
    if (!wavLimpio) return res.status(403).json({ error: 'Ruta no permitida o archivo no existe' });

    const originalLimpio = originalWavPath ? sanitizarRutaAudio(originalWavPath) : null;

    try {
        const wavAbsoluta = path.join(PUBLIC_FOLDER, wavLimpio);

        if (originalLimpio && originalLimpio !== wavLimpio) {
            const origAbsoluta = path.join(PUBLIC_FOLDER, originalLimpio);
            const [mainRes, origRes] = await Promise.all([
                audioService.convertirAMp3(wavAbsoluta, audioFolder),
                audioService.convertirAMp3(origAbsoluta, audioFolder)
            ]);
            res.json({ 
                urls: [
                    { type: 'ducked', url: mainRes.url }, 
                    { type: 'original', url: origRes.url }
                ], 
                mensaje: 'MP3s listos' 
            });
        } else {
            const resultado = await audioService.convertirAMp3(wavAbsoluta, audioFolder);
            const base = path.basename(wavLimpio || '');
            const tipoInferido = base && base.startsWith('ducked-') ? 'ducked' : 'original';
            res.json({ 
                urls: [{ type: tipoInferido, url: resultado.url }], 
                mensaje: resultado.mensaje || 'MP3 listo' 
            });
        }
    } catch (error) {
        console.error('Error en conversion MP3:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Video PNGTuber ---
appExpress.post('/api/generar-video-pngtuber', async (req, res) => {
    const { audioPath, idleImagePath, talkingImagePath } = req.body;
    if (!audioPath) return res.status(400).json({ error: 'Falta la ruta del audio' });

    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida o no existe' });

    try {
        const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);
        const resultado = await videoService.generarPNGTuber(audioAbsoluto, { 
            idleImagePath, 
            talkingImagePath 
        });
        res.json({ ...resultado, mensaje: 'Video generado exitosamente' });
    } catch (error) {
        console.error('Error en PNGTuber:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Uploads ---
appExpress.post('/api/upload-pngtuber', (req, res) => {
    uploadPngTuber.fields([{ name: 'idle', maxCount: 1 }, { name: 'talking', maxCount: 1 }])(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Error al subir la imagen' });
        const file = req.files?.idle?.[0] || req.files?.talking?.[0];
        if (!file) return res.status(400).json({ error: 'No se subio ninguna imagen' });
        const url = `/pngtuber/${file.filename}`;
        console.log(`PNGTuber cargado: ${url}`);
        res.json({ url, type: file.fieldname, mensaje: 'Imagen PNGTuber cargada correctamente' });
    });
});

appExpress.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subio ningun archivo' });
    const url = `/audios/${req.file.filename}`;
    console.log(`Musica subida: ${url}`);
    res.json({ url, mensaje: 'Musica subida correctamente' });
});

appExpress.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subio audio' });
    const url = `/audios/${req.file.filename}`;
    console.log(`Audio editado subido: ${url}`);
    res.json({ url, mensaje: 'Audio editado subido correctamente' });
});

appExpress.post('/api/guardar-audio-blob', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibio audio' });
    const url = `/audios/${req.file.filename}`;
    console.log(`Audio editado guardado: ${url}`);
    res.json({ url, mensaje: 'Audio editado guardado' });
});

// ==========================================
// 7. MANEJO DE ERRORES GLOBAL
// ==========================================
appExpress.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) {
        console.error('Error no manejado:', err.stack || err.message || err);
        return res.status(500).json({ error: err.message || String(err) });
    }
    next();
});

// ==========================================
// 8. ARRANCAR SERVIDOR
// ==========================================
const server = appExpress.listen(PORT, () => {
    console.log(`Loquendo Studio corriendo en http://localhost:${PORT}`);
    console.log('Rutas clave:');
    console.log(' - isPackaged:', isPackaged);
    console.log(' - process.resourcesPath:', process.resourcesPath);
    console.log(' - process.execPath:', process.execPath);
    console.log(' - PUBLIC_FOLDER:', PUBLIC_FOLDER);
    console.log(' - FRONTEND_PATH:', FRONTEND_PATH);
    console.log(' - ffmpegPath:', ffmpegPath, '| Existe:', fs.existsSync(ffmpegPath));
    console.log(' - pythonSRT:', pythonSRT, '| Existe:', fs.existsSync(pythonSRT));
    console.log(' - bundledPython:', bundledPython || '(no embebido)');
    console.log(' - audioFolder:', audioFolder, '| Existe:', fs.existsSync(audioFolder));
    console.log(' - pngtuberFolder:', pngtuberFolder, '| Existe:', fs.existsSync(pngtuberFolder));

    if (!fs.existsSync(ffmpegPath)) console.warn('ffmpeg.exe NO encontrado.');
    if (!fs.existsSync(path.join(FRONTEND_PATH, 'index.html'))) console.warn('index.html NO encontrado en FRONTEND_PATH.');
});

module.exports = { expressApp: appExpress, server };