// server.js - API REST Mejorada para Producción
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ==========================================
// 1. DETECCIÓN DE ENTORNO
// ==========================================
let electronApp;
try { electronApp = require('electron').app; } catch (e) { electronApp = null; }

const isPackaged = electronApp ? electronApp.isPackaged : (process.env.NODE_ENV === 'production');
const BASE_PATH = isPackaged ? process.resourcesPath : __dirname;

console.log('[Server] Entorno:', isPackaged ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('[Server] BASE_PATH:', BASE_PATH);
console.log('[Server] process.resourcesPath:', process.resourcesPath || 'N/A');

// ==========================================
// 2. RESOLUCIÓN DE RUTAS ROBUSTA
// ==========================================
function resolveResource(relPath) {
    const candidates = [];
    
    if (isPackaged && process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, relPath));
    }
    
    if (process.execPath) {
        const exeDir = path.dirname(process.execPath);
        candidates.push(path.join(exeDir, relPath));
        candidates.push(path.join(exeDir, 'resources', relPath));
    }
    
    candidates.push(path.join(__dirname, relPath));
    candidates.push(path.join(BASE_PATH, relPath));
    
    for (const c of candidates) {
        const normalized = path.normalize(c);
        if (fs.existsSync(normalized)) {
            console.log(`[Server] ✅ Resuelto: ${relPath} -> ${normalized}`);
            return normalized;
        }
    }
    
    console.warn(`[Server] ⚠️ No encontrado: ${relPath}`);
    return candidates[0];
}

// Rutas críticas
const ffmpegPath = resolveResource(path.join('bin', 'ffmpeg.exe'));
const pythonSRT = resolveResource(path.join('modules', 'generar_srt.py'));
const dbFolder = resolveResource('db');
const audioFolder = resolveResource(path.join('public', 'audios'));
const pngtuberFolder = resolveResource(path.join('public', 'pngtuber'));
const PUBLIC_FOLDER = path.dirname(audioFolder);
const FRONTEND_PATH = __dirname;

// Asegurar carpetas
[audioFolder, pngtuberFolder, dbFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        console.log(`[Server] 📁 Creada carpeta: ${folder}`);
    }
});

// Python embebido
const bundledPython = (() => {
    const candidates = [
        resolveResource(path.join('python', 'python.exe')),
        path.join(BASE_PATH, 'python', 'python.exe')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
})();

// ==========================================
// 3. CONFIGURACIÓN MULTER
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
        else cb(new Error('Solo archivos de audio'), false);
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
        else cb(new Error('Solo imágenes PNG'), false);
    }
});

// ==========================================
// 4. EXPRESS
// ==========================================
const appExpress = express();
const PORT = process.env.PORT || 3000;

appExpress.use(cors({ origin: '*' }));
appExpress.use(express.json({ limit: '10mb' }));
appExpress.use(express.static(FRONTEND_PATH));
appExpress.use('/audios', express.static(audioFolder));
appExpress.use('/pngtuber', express.static(pngtuberFolder));

// ==========================================
// 5. SERVICIOS
// ==========================================
const DictionaryService = require('./services/dictionaryService');
const AudioService = require('./services/audioService');
const VideoService = require('./services/videoService');

const dictService = new DictionaryService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, bundledPython);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder);

// ==========================================
// 6. VALIDACIÓN DE RUTAS
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
// 7. RUTAS API
// ==========================================

// Diccionarios
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
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dictService.guardarDiccionario('jergas', original, reemplazo);
    res.json({ mensaje: 'Jerga guardada' });
});

appExpress.post('/api/sinonimos', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string' || typeof reemplazo !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dictService.guardarDiccionario('sinonimos', original, reemplazo);
    res.json({ mensaje: 'Sinónimo guardado' });
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
    res.json({ mensaje: 'Diccionarios limpiados' });
});

// Generar Audio
appExpress.post('/api/generar-audio', async (req, res) => {
    const { texto, voz, usarIA, modo } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacío' });
    
    try {
        const resultado = await audioService.procesar(texto, voz, usarIA, dictService, modo);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error generar-audio:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Ducking
appExpress.post('/api/audio/apply-ducking', async (req, res) => {
    const { voiceAudioPath, musicPath, options } = req.body;
    if (!voiceAudioPath || !musicPath) return res.status(400).json({ error: 'Faltan rutas' });
    
    const vozLimpia = sanitizarRutaAudio(voiceAudioPath);
    const musLimpia = sanitizarRutaAudio(musicPath);
    if (!vozLimpia || !musLimpia) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const vozAbsoluta = path.join(PUBLIC_FOLDER, vozLimpia);
        const musAbsoluta = path.join(PUBLIC_FOLDER, musLimpia);
        const resultado = await audioService.aplicarDucking(vozAbsoluta, musAbsoluta, options);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error ducking:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// MP3
appExpress.post('/api/audio/convertir-mp3', async (req, res) => {
    const { wavPath, originalWavPath } = req.body;
    if (!wavPath) return res.status(400).json({ error: 'Falta ruta WAV' });
    
    const wavLimpio = sanitizarRutaAudio(wavPath);
    if (!wavLimpio) return res.status(403).json({ error: 'Ruta no permitida' });
    
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
        console.error('❌ Error MP3:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PNGTuber
appExpress.post('/api/generar-video-pngtuber', async (req, res) => {
    const { audioPath, idleImagePath, talkingImagePath } = req.body;
    if (!audioPath) return res.status(400).json({ error: 'Falta audio' });
    
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);
        console.log('[API PNGTuber] Audio absoluto:', audioAbsoluto);
        console.log('[API PNGTuber] Existe:', fs.existsSync(audioAbsoluto));
        
        const resultado = await videoService.generarPNGTuber(audioAbsoluto, { 
            idleImagePath, 
            talkingImagePath 
        });
        res.json({ ...resultado, mensaje: 'Video generado' });
    } catch (error) {
        console.error('❌ Error PNGTuber:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// Uploads
appExpress.post('/api/upload-pngtuber', (req, res) => {
    uploadPngTuber.fields([{ name: 'idle', maxCount: 1 }, { name: 'talking', maxCount: 1 }])(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const file = req.files?.idle?.[0] || req.files?.talking?.[0];
        if (!file) return res.status(400).json({ error: 'No se subió imagen' });
        const url = `/pngtuber/${file.filename}`;
        console.log(`✅ PNGTuber subido: ${url}`);
        res.json({ url, type: file.fieldname, mensaje: 'Imagen cargada' });
    });
});

appExpress.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    const url = `/audios/${req.file.filename}`;
    console.log(`✅ Música subida: ${url}`);
    res.json({ url, mensaje: 'Música subida' });
});

appExpress.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió audio' });
    const url = `/audios/${req.file.filename}`;
    console.log(`✅ Audio editado subido: ${url}`);
    res.json({ url, mensaje: 'Audio subido' });
});

appExpress.post('/api/guardar-audio-blob', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió audio' });
    const url = `/audios/${req.file.filename}`;
    console.log(`✅ Audio guardado: ${url}`);
    res.json({ url, mensaje: 'Audio guardado' });
});

// Errores
appExpress.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) {
        console.error(' Error no manejado:', err);
        return res.status(500).json({ error: err.message || String(err) });
    }
    next();
});

// ==========================================
// 8. INICIAR SERVIDOR
// ==========================================
function startServer(port = 3000) {
    const server = appExpress.listen(port, () => {
        console.log('\n ========================================');
        console.log('🚀   LOQUENDO STUDIO - SERVIDOR ACTIVO');
        console.log('🚀 ========================================');
        console.log(`📡 Puerto: http://localhost:${port}`);
        console.log(`📦 Empaquetado: ${isPackaged ? 'SÍ' : 'NO'}`);
        console.log('📁 Rutas críticas:');
        console.log(`   - ffmpeg: ${ffmpegPath} | ${fs.existsSync(ffmpegPath) ? '✅' : '❌'}`);
        console.log(`   - audioFolder: ${audioFolder} | ${fs.existsSync(audioFolder) ? '✅' : '❌'}`);
        console.log(`   - pngtuberFolder: ${pngtuberFolder} | ${fs.existsSync(pngtuberFolder) ? '✅' : '❌'}`);
        console.log(`   - index.html: ${path.join(FRONTEND_PATH, 'index.html')} | ${fs.existsSync(path.join(FRONTEND_PATH, 'index.html')) ? '✅' : '❌'}`);
        console.log('🚀 ========================================\n');
        
        if (!fs.existsSync(ffmpegPath)) {
            console.warn('⚠️  WARNING: ffmpeg.exe no encontrado. El ducking y PNGTuber no funcionarán.');
        }
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`\n⚠️  Puerto ${port} ocupado, intentando ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('❌ Error del servidor:', err);
            process.exit(1);
        }
    });
    
    return server;
}

const server = startServer(3000);

module.exports = { expressApp: appExpress, server };