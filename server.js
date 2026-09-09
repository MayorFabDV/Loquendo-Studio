// server.js - API REST con Generación de Subtítulos Bajo Demanda
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process'); // ✅ Agregado para ejecutar Python

// ==========================================
// 1. DETECCIÓN DE ENTORNO Y RUTAS BASE
// ==========================================
let electronApp;
try { electronApp = require('electron').app; } catch (e) { electronApp = null; }

const isPackaged = electronApp ? electronApp.isPackaged : (process.env.NODE_ENV === 'production');
const ROOT_DIR = __dirname;
const BACKEND_DIR = isPackaged ? process.resourcesPath : path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

console.log('\n========================================');
console.log('🚀 LOQUENDO STUDIO - INICIANDO SERVIDOR');
console.log('========================================');
console.log(`[Server] Entorno: ${isPackaged ? 'PRODUCCIÓN' : 'DESARROLLO'}`);

// ==========================================
// 2. RUTAS CRÍTICAS
// ==========================================
const ffmpegPath = path.join(BACKEND_DIR, 'bin', 'ffmpeg.exe');
const pythonSRT = path.join(BACKEND_DIR, 'modules', 'generar_srt.py');
const pythonASS = path.join(BACKEND_DIR, 'modules', 'generar_ass.py');
const dbFolder = path.join(BACKEND_DIR, 'db');
const audioFolder = path.join(BACKEND_DIR, 'public', 'audios');
const pngtuberFolder = path.join(BACKEND_DIR, 'public', 'pngtuber');
const PUBLIC_FOLDER = path.join(BACKEND_DIR, 'public');

[audioFolder, pngtuberFolder, dbFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const bundledPython = path.join(BACKEND_DIR, 'python', 'python.exe');
const pythonCmd = fs.existsSync(bundledPython) ? bundledPython : 'python';

// ==========================================
// 3. CONFIGURACIÓN MULTER & EXPRESS
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(audioFolder)) fs.mkdirSync(audioFolder, { recursive: true });
        cb(null, audioFolder);
    },
    filename: (req, file, cb) => cb(null, `music-${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Solo archivos de audio'), false);
}});

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
const uploadPngTuber = multer({ storage: pngtuberStorage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'), false);
}});

const appExpress = express();
const PORT = process.env.PORT || 3000;

appExpress.use(cors({ origin: '*' }));
appExpress.use(express.json({ limit: '10mb' }));
const FRONTEND_PATH = fs.existsSync(FRONTEND_DIR) ? FRONTEND_DIR : ROOT_DIR;
appExpress.use(express.static(FRONTEND_PATH));
appExpress.use('/audios', express.static(audioFolder));
appExpress.use('/pngtuber', express.static(pngtuberFolder));

appExpress.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/audios') || req.path.startsWith('/pngtuber')) return next();
    const indexPath = path.join(FRONTEND_PATH, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(404).send('Interfaz no encontrada.');
});

// ==========================================
// 4. SERVICIOS
// ==========================================
const DictionaryService = require('./backend/services/dictionaryService');
const AudioService = require('./backend/services/audioService');
const VideoService = require('./backend/services/videoService');

const dictService = new DictionaryService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, pythonCmd);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder);

function sanitizarRutaAudio(ruta) {
    if (!ruta || typeof ruta !== 'string') return null;
    let limpia = ruta.split('?')[0].replace(/\\/g, '/');
    if (limpia.includes('..')) return null;
    const publicRoot = path.resolve(PUBLIC_FOLDER);
    const absoluta = path.resolve(path.join(publicRoot, limpia));
    if (!absoluta.startsWith(publicRoot) || !fs.existsSync(absoluta)) return null;
    return limpia;
}

// ==========================================
// 5. RUTAS API
// ==========================================

// Diccionarios
appExpress.get('/api/jergas', (req, res) => { try { res.json(dictService.getDiccionario('jergas')); } catch (err) { res.status(500).json({ error: err.message }); } });
appExpress.get('/api/sinonimos', (req, res) => { try { res.json(dictService.getDiccionario('sinonimos')); } catch (err) { res.status(500).json({ error: err.message }); } });
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
appExpress.delete('/api/jergas/:word', (req, res) => { dictService.eliminarEntrada('jergas', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/sinonimos/:word', (req, res) => { dictService.eliminarEntrada('sinonimos', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/diccionario', (req, res) => { dictService.limpiarTodo(); res.json({ mensaje: 'Diccionarios limpiados' }); });

// ✅ 1. GENERAR AUDIO (SOLO AUDIO, SIN SRT/ASS)
appExpress.post('/api/generar-audio', async (req, res) => {
    const { texto, voz, modo, opciones } = req.body; // ✅ Agregamos opciones
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacío' });
    try {
        // ✅ Pasamos las opciones al servicio de audio
        const resultado = await audioService.procesar(texto, voz, false, dictService, modo, opciones);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error generar-audio:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ✅ 2. GENERAR SRT BAJO DEMANDA
appExpress.post('/api/generar-srt', async (req, res) => {
    const { audioPath, textoOriginal } = req.body;
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida' });

    const nombreSRT = `subtitulos-${Date.now()}.srt`;
    const rutaSRT = path.join(audioFolder, nombreSRT);
    const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);

    const proceso = spawn(pythonCmd, [pythonSRT, audioAbsoluto, rutaSRT, textoOriginal || ''], { windowsHide: true });
    let stderr = '';
    proceso.stderr.on('data', (data) => { stderr += data.toString(); });

    proceso.on('close', (code) => {
        if (code === 0 && fs.existsSync(rutaSRT)) {
            res.json({ srtUrl: `/audios/${nombreSRT}`, mensaje: 'SRT generado' });
        } else {
            res.status(500).json({ error: 'Error al generar SRT: ' + stderr });
        }
    });
});

// ✅ 3. GENERAR ASS BAJO DEMANDA (Genera SRT primero si no se pasa uno)
appExpress.post('/api/generar-ass', async (req, res) => {
    const { audioPath, textoOriginal, modo, srtPath } = req.body;
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida' });

    const nombreASS = `subtitulos-${Date.now()}.ass`;
    const rutaASS = path.join(audioFolder, nombreASS);
    const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);

    let rutaSRTAbsoluta = null;
    let nombreSRTFinal = null;

    const ejecutarASS = (rutaSRTParaAss) => {
        const argsASS = [pythonASS, audioAbsoluto, rutaASS, modo || 'normal'];
        if (rutaSRTParaAss) argsASS.push(rutaSRTParaAss);
        argsASS.push(textoOriginal || '');

        const procesoASS = spawn(pythonCmd, argsASS, { windowsHide: true });
        let stderrASS = '';
        procesoASS.stderr.on('data', (data) => { stderrASS += data.toString(); });

        procesoASS.on('close', (code) => {
            if (code === 0 && fs.existsSync(rutaASS)) {
                res.json({ 
                    assUrl: `/audios/${nombreASS}`, 
                    srtUrl: nombreSRTFinal ? `/audios/${nombreSRTFinal}` : null,
                    mensaje: 'ASS generado' 
                });
            } else {
                res.status(500).json({ error: 'Error al generar ASS: ' + stderrASS });
            }
        });
    };

    if (srtPath) {
        const srtLimpio = sanitizarRutaAudio(srtPath);
        if (srtLimpio) {
            rutaSRTAbsoluta = path.join(PUBLIC_FOLDER, srtLimpio);
            nombreSRTFinal = srtLimpio.split('/').pop();
            ejecutarASS(rutaSRTAbsoluta);
        } else {
            ejecutarASS(null); // Si la ruta SRT es inválida, que Whisper lo haga solo
        }
    } else {
        // Generar SRT primero
        const nombreSRTTemp = `subtitulos-temp-${Date.now()}.srt`;
        rutaSRTAbsoluta = path.join(audioFolder, nombreSRTTemp);
        nombreSRTFinal = nombreSRTTemp;

        const procesoSRT = spawn(pythonCmd, [pythonSRT, audioAbsoluto, rutaSRTAbsoluta, textoOriginal || ''], { windowsHide: true });
        procesoSRT.on('close', (code) => {
            if (code === 0 && fs.existsSync(rutaSRTAbsoluta)) {
                ejecutarASS(rutaSRTAbsoluta);
            } else {
                ejecutarASS(null); // Fallback a Whisper directo
            }
        });
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
                urls: [{ type: 'ducked', url: mainRes.url }, { type: 'original', url: origRes.url }], 
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
        const resultado = await videoService.generarPNGTuber(audioAbsoluto, { 
            idleImagePath, 
            talkingImagePath 
        });
        res.json({ ...resultado, mensaje: 'Video generado' });
    } catch (error) {
        console.error('❌ Error PNGTuber:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Uploads
appExpress.post('/api/upload-pngtuber', (req, res) => {
    uploadPngTuber.fields([{ name: 'idle', maxCount: 1 }, { name: 'talking', maxCount: 1 }])(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const file = req.files?.idle?.[0] || req.files?.talking?.[0];
        if (!file) return res.status(400).json({ error: 'No se subió imagen' });
        res.json({ url: `/pngtuber/${file.filename}`, type: file.fieldname, mensaje: 'Imagen cargada' });
    });
});

appExpress.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'Música subida' });
});

appExpress.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió audio' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'Audio subido' });
});

// Errores
appExpress.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) {
        console.error('❌ Error no manejado:', err);
        return res.status(500).json({ error: err.message || String(err) });
    }
    next();
});

// ==========================================
// 6. INICIAR SERVIDOR
// ==========================================
function startServer(port = 3000) {
    const server = appExpress.listen(port, () => {
        console.log(`✅ Servidor escuchando en: http://localhost:${port}`);
        console.log(`📁 ffmpeg: ${fs.existsSync(ffmpegPath) ? '✅' : '❌'}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') startServer(port + 1);
        else { console.error('❌ Error del servidor:', err); process.exit(1); }
    });
    return server;
}

const server = startServer(3000);
module.exports = { expressApp: appExpress, server };