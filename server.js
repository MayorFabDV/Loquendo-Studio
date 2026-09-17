// server.js - API REST con Generación de Subtítulos Bajo Demanda
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

// ==========================================
// 1. DETECCIÓN DE ENTORNO Y RUTAS BASE
// ==========================================
let electronApp;
try { electronApp = require('electron').app; } catch (e) { electronApp = null; }

const isPackaged = electronApp ? electronApp.isPackaged : (process.env.NODE_ENV === 'production');
const ROOT_DIR = __dirname;

// ✅ RUTAS ARREGLADAS para producción
const BACKEND_DIR = isPackaged 
    ? path.join(process.resourcesPath, 'backend') 
    : path.join(ROOT_DIR, 'backend');

const FRONTEND_DIR = isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'frontend')
    : path.join(ROOT_DIR, 'frontend');

console.log('\n========================================');
console.log('🚀 LOQUENDO STUDIO - INICIANDO SERVIDOR');
console.log('========================================');
console.log(`[Server] Entorno: ${isPackaged ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
console.log(`[Server] ROOT_DIR: ${ROOT_DIR}`);
console.log(`[Server] BACKEND_DIR: ${BACKEND_DIR}`);
console.log(`[Server] FRONTEND_DIR: ${FRONTEND_DIR}`);
console.log(`[Server] resourcesPath: ${process.resourcesPath || 'N/A'}`);

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

// ✅ RUTAS DE LANGUAGETOOL
const javaPath = path.join(BACKEND_DIR, 'bin', 'jre', 'bin', 'java.exe');
const ltJar = path.join(BACKEND_DIR, 'bin', 'languagetool', 'languagetool-server.jar');
const LT_PORT = 8011;

[audioFolder, pngtuberFolder, dbFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const bundledPython = path.join(BACKEND_DIR, 'python', 'python.exe');
const pythonCmd = fs.existsSync(bundledPython) ? bundledPython : 'python';

// ✅ LOGS DE DIAGNÓSTICO
console.log('\n[Server] Rutas configuradas:');
console.log('  - ffmpeg:', ffmpegPath, '| Existe:', fs.existsSync(ffmpegPath));
console.log('  - pythonSRT:', pythonSRT, '| Existe:', fs.existsSync(pythonSRT));
console.log('  - pythonASS:', pythonASS, '| Existe:', fs.existsSync(pythonASS));
console.log('  - python:', pythonCmd, '| Existe:', fs.existsSync(pythonCmd));
console.log('  - java:', javaPath, '| Existe:', fs.existsSync(javaPath));
console.log('  - languagetool:', ltJar, '| Existe:', fs.existsSync(ltJar));
console.log('  - dbFolder:', dbFolder);
console.log('  - audioFolder:', audioFolder);

// ==========================================
// 2.5 LANZAR LANGUAGETOOL LOCAL
// ==========================================
let languageToolProcess = null;

function iniciarLanguageTool() {
    if (!fs.existsSync(javaPath)) {
        console.warn('[LanguageTool] JRE no encontrado. Corrección ortográfica desactivada.');
        return;
    }
    
    if (!fs.existsSync(ltJar)) {
        console.warn('[LanguageTool] JAR no encontrado. Corrección ortográfica desactivada.');
        return;
    }
    
    console.log('[LanguageTool] Iniciando servidor en puerto', LT_PORT);
    
    languageToolProcess = spawn(javaPath, [
        '-Xmx512m',
        '-cp', ltJar,
        'org.languagetool.server.HTTPServer',
        '--port', String(LT_PORT),
        '--allow-origin', '*',
        '--public'
    ], { 
        windowsHide: true,
        cwd: path.dirname(ltJar)
    });
    
    languageToolProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[LanguageTool]', msg);
    });
    
    languageToolProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[LanguageTool]', msg);
    });
    
    languageToolProcess.on('close', (code) => {
        console.log(`[LanguageTool] Servidor cerrado (código ${code})`);
    });
    
    languageToolProcess.on('error', (err) => {
        console.error('[LanguageTool] Error:', err.message);
    });
    
    console.log('[LanguageTool] Servidor iniciado en http://localhost:' + LT_PORT);
}

// Cerrar LanguageTool al salir
process.on('exit', () => {
    if (languageToolProcess) {
        console.log('[LanguageTool] Cerrando...');
        languageToolProcess.kill();
    }
});

process.on('SIGINT', () => {
    if (languageToolProcess) languageToolProcess.kill();
    process.exit();
});

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

// ✅ NUEVO: LISTAR VOCES DISPONIBLES EN EL SISTEMA
appExpress.get('/api/voces', async (req, res) => {
    try {
        const scriptVoces = path.join(BACKEND_DIR, 'modules', 'listar_voces.py');
        
        // Crear script si no existe
        if (!fs.existsSync(scriptVoces)) {
            const scriptContent = `# -*- coding: utf-8 -*-
import win32com.client
import json
import sys

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

try:
    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    voces = speaker.GetVoices()
    resultado = []
    for i in range(voces.Count):
        desc = voces.Item(i).GetDescription()
        resultado.append({"id": desc, "nombre": desc})
    print(json.dumps(resultado, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;
            fs.writeFileSync(scriptVoces, scriptContent, 'utf8');
        }
        
        const resultado = await new Promise((resolve, reject) => {
            const proceso = spawn(pythonCmd, [scriptVoces], { windowsHide: true });
            let stdout = '';
            let stderr = '';
            
            proceso.stdout.on('data', (data) => { stdout += data.toString(); });
            proceso.stderr.on('data', (data) => { stderr += data.toString(); });
            
            proceso.on('close', (code) => {
                if (code === 0 && stdout) {
                    try {
                        resolve(JSON.parse(stdout.trim()));
                    } catch (e) {
                        reject(new Error('Error parseando JSON: ' + stdout));
                    }
                } else {
                    reject(new Error(stderr || 'Error ejecutando Python'));
                }
            });
            
            proceso.on('error', reject);
        });
        
        if (resultado.error) {
            return res.status(500).json({ error: resultado.error });
        }
        
        res.json({ voces: resultado, total: resultado.length });
        
    } catch (error) {
        console.error('❌ Error listando voces:', error.message);
        res.status(500).json({ error: 'No se pudieron detectar las voces', detalles: error.message });
    }
});

// ✅ NUEVO: CORREGIR TEXTO CON LANGUAGETOOL
appExpress.post('/api/corregir-texto', async (req, res) => {
    const { texto } = req.body;
    
    if (!texto || texto.trim() === '') {
        return res.status(400).json({ error: 'Texto vacío' });
    }
    
    try {
        const response = await fetch(`http://localhost:${LT_PORT}/v2/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                text: texto,
                language: 'es',
                enabledOnly: 'false'
            })
        });
        
        if (!response.ok) {
            throw new Error(`LanguageTool respondió ${response.status}`);
        }
        
        const data = await response.json();
        
        let textoCorregido = texto;
        const correcciones = [];
        
        const matches = [...data.matches].sort((a, b) => b.offset - a.offset);
        
        for (const match of matches) {
            if (match.replacements && match.replacements.length > 0) {
                const reemplazo = match.replacements[0].value;
                textoCorregido = 
                    textoCorregido.substring(0, match.offset) + 
                    reemplazo + 
                    textoCorregido.substring(match.offset + match.length);
                
                correcciones.push({
                    original: match.context.text.substring(match.context.offset, match.context.offset + match.context.length),
                    corregido: reemplazo,
                    mensaje: match.message,
                    tipo: match.rule.issueType
                });
            }
        }
        
        res.json({
            textoOriginal: texto,
            textoCorregido,
            correcciones,
            totalCorrecciones: correcciones.length
        });
        
    } catch (error) {
        console.error('[LanguageTool] Error:', error.message);
        res.status(500).json({ error: 'Error al corregir texto', detalles: error.message });
    }
});

// ✅ 1. GENERAR AUDIO
appExpress.post('/api/generar-audio', async (req, res) => {
    const { texto, voz, modo, opciones } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacío' });
    try {
        const resultado = await audioService.procesar(texto, voz, false, dictService, modo, opciones);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error generar-audio:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ✅ 2. GENERAR SRT
appExpress.post('/api/generar-srt', async (req, res) => {
    const { audioPath, textoOriginal, maxPalabras } = req.body;
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida' });

    const nombreSRT = `subtitulos-${Date.now()}.srt`;
    const rutaSRT = path.join(audioFolder, nombreSRT);
    const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);
    const palabrasMax = parseInt(maxPalabras) || 7;

    const proceso = spawn(pythonCmd, [
        pythonSRT, audioAbsoluto, rutaSRT, textoOriginal || '', String(palabrasMax)
    ], { windowsHide: true });
    
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

// ✅ 3. GENERAR ASS
appExpress.post('/api/generar-ass', async (req, res) => {
    const { audioPath, textoOriginal, modo, srtPath, maxPalabras } = req.body;
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida' });

    const nombreASS = `subtitulos-${Date.now()}.ass`;
    const rutaASS = path.join(audioFolder, nombreASS);
    const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);
    const palabrasMax = parseInt(maxPalabras) || 7;

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
            ejecutarASS(null);
        }
    } else {
        const nombreSRTTemp = `subtitulos-temp-${Date.now()}.srt`;
        rutaSRTAbsoluta = path.join(audioFolder, nombreSRTTemp);
        nombreSRTFinal = nombreSRTTemp;

        const procesoSRT = spawn(pythonCmd, [
            pythonSRT, audioAbsoluto, rutaSRTAbsoluta, textoOriginal || '', String(palabrasMax)
        ], { windowsHide: true });
        
        procesoSRT.on('close', (code) => {
            if (code === 0 && fs.existsSync(rutaSRTAbsoluta)) {
                ejecutarASS(rutaSRTAbsoluta);
            } else {
                ejecutarASS(null);
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
        console.log(`\n✅ Servidor escuchando en: http://localhost:${port}`);
        console.log(`📁 ffmpeg: ${fs.existsSync(ffmpegPath) ? '✅' : '❌'}`);
        console.log(`🐍 python: ${fs.existsSync(pythonCmd) ? '✅' : '❌'}`);
        console.log(`☕ java: ${fs.existsSync(javaPath) ? '✅' : '❌'}`);
        console.log(`📝 LanguageTool: ${fs.existsSync(ltJar) ? '✅' : '❌'}\n`);
        
        // Lanzar LanguageTool después de iniciar el servidor
        setTimeout(() => {
            iniciarLanguageTool();
        }, 1500);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') startServer(port + 1);
        else { console.error('❌ Error del servidor:', err); process.exit(1); }
    });
    return server;
}

const server = startServer(3000);
module.exports = { expressApp: appExpress, server };