// server.js - API REST con Generación de Subtítulos Bajo Demanda (Versión Final Blindada)
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

// ✅ Rutas de LanguageTool
const javaPath = path.join(BACKEND_DIR, 'bin', 'jre', 'bin', 'java.exe');
const ltJar = path.join(BACKEND_DIR, 'bin', 'languagetool', 'languagetool-server.jar');
const LT_PORT = 8011;

// ✅ Rutas de Whisper.cpp
const whisperExe = path.join(BACKEND_DIR, 'bin', 'whisper-cli.exe');
const whisperModel = path.join(BACKEND_DIR, 'bin', 'ggml-small.bin');

// ✅ Rutas de generar_voz
const generarVozExe = path.join(BACKEND_DIR, 'bin', 'generar_voz.exe');

[audioFolder, pngtuberFolder, dbFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const bundledPython = path.join(BACKEND_DIR, 'python', 'python.exe');
const pythonCmd = fs.existsSync(bundledPython) ? bundledPython : 'python';

// ==========================================
// 2.5 VERIFICACIÓN DE COMPONENTES
// ==========================================
console.log('\n[Server] Verificando componentes:');
console.log('  ┌─────────────────────────────────────────────────────────┐');

const componentes = [
    { nombre: 'FFmpeg',       ruta: ffmpegPath,        obligatorio: true },
    { nombre: 'Python',       ruta: pythonCmd,          obligatorio: true },
    { nombre: 'generar_voz',  ruta: generarVozExe,      obligatorio: true },
    { nombre: 'Java (JRE)',   ruta: javaPath,           obligatorio: false },
    { nombre: 'LanguageTool', ruta: ltJar,              obligatorio: false },
    { nombre: 'Whisper.cpp',  ruta: whisperExe,         obligatorio: false },
    { nombre: 'Modelo IA',    ruta: whisperModel,       obligatorio: false }
];

let componentesOK = 0;
let componentesFaltantes = [];

componentes.forEach(comp => {
    const existe = fs.existsSync(comp.ruta);
    if (existe) componentesOK++;
    else componentesFaltantes.push(comp.nombre);
    
    const icono = existe ? '✅' : (comp.obligatorio ? '❌' : '⚠️ ');
    const estado = existe ? 'OK' : (comp.obligatorio ? 'FALTA (crítico)' : 'FALTA (opcional)');
    console.log(`  │ ${icono} ${comp.nombre.padEnd(14)} ${estado.padEnd(20)} │`);
});

console.log('  └─────────────────────────────────────────────────────────┘');
console.log(`[Server] Componentes: ${componentesOK}/${componentes.length} OK`);

if (componentesFaltantes.length > 0) {
    const criticos = componentes.filter(c => c.obligatorio && !fs.existsSync(c.ruta));
    if (criticos.length > 0) {
        console.warn(`⚠️  [Server] Componentes críticos faltantes: ${criticos.map(c => c.nombre).join(', ')}`);
    }
}

// ==========================================
// 2.6 LANZAR LANGUAGETOOL LOCAL
// ==========================================
let languageToolProcess = null;

function iniciarLanguageTool() {
    if (!fs.existsSync(javaPath) || !fs.existsSync(ltJar)) {
        console.warn('[LanguageTool] No disponible. Corrección ortográfica desactivada.');
        return;
    }
    
    console.log(`[LanguageTool] Iniciando servidor en puerto ${LT_PORT}...`);
    
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
        if (msg && msg.includes('Server started')) {
            console.log('[LanguageTool] ✅ Servidor listo');
        }
    });
    
    languageToolProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && msg.includes('Server started')) {
            console.log('[LanguageTool] ✅ Servidor listo');
        }
    });
    
    languageToolProcess.on('close', (code) => {
        console.log(`[LanguageTool] Servidor cerrado (código ${code})`);
    });
    
    languageToolProcess.on('error', (err) => {
        console.error('[LanguageTool] Error:', err.message);
    });
}

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
    filename: (req, file, cb) => {
        const originalLimpio = (file.originalname || 'audio').replace(/[\\/]/g, '').replace(/[^a-zA-Z0-9._\- ]+/g, '_');
        cb(null, `music-${Date.now()}-${originalLimpio}`);
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
        else cb(new Error('Solo imágenes'), false);
    }
});

const appExpress = express();
const PORT = process.env.PORT || 3000;

appExpress.use(cors({ origin: '*' }));
appExpress.use(express.json({ limit: '10mb' }));

const FRONTEND_PATH = fs.existsSync(FRONTEND_DIR) ? FRONTEND_DIR : ROOT_DIR;
appExpress.use(express.static(FRONTEND_PATH));
appExpress.use('/audios', express.static(audioFolder));
appExpress.use('/pngtuber', express.static(pngtuberFolder));

// ==========================================
// 4. SERVICIOS
// ==========================================
const DatabaseService = require('./backend/services/databaseService');
const AudioService = require('./backend/services/audioService');
const VideoService = require('./backend/services/videoService');

const dbService = new DatabaseService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, pythonCmd);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder);

function sanitizarRutaAudio(ruta) {
    if (!ruta || typeof ruta !== 'string') return null;
    let limpia = ruta.split('?')[0].replace(/\\/g, '/');
    if (limpia.includes('..')) return null;
    const publicRoot = path.resolve(PUBLIC_FOLDER);
    const absoluta = path.resolve(path.join(publicRoot, limpia));
    const dentroDePublic = absoluta === publicRoot || absoluta.startsWith(publicRoot + path.sep);
    if (!dentroDePublic || !fs.existsSync(absoluta)) return null;
    return limpia;
}

// ==========================================
// 5. RUTAS API
// ==========================================

// --- Health Check ---
appExpress.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        entorno: isPackaged ? 'produccion' : 'desarrollo',
        servicios: {
            ffmpeg: fs.existsSync(ffmpegPath),
            python: fs.existsSync(pythonCmd),
            generar_voz: fs.existsSync(generarVozExe),
            java: fs.existsSync(javaPath),
            languagetool: fs.existsSync(ltJar),
            whispercpp: fs.existsSync(whisperExe),
            whispermodel: fs.existsSync(whisperModel)
        },
        puerto: PORT,
        languageToolPort: LT_PORT
    });
});

// --- Diccionarios ---
appExpress.get('/api/jergas', (req, res) => { try { res.json(dbService.getDiccionario('jergas')); } catch (err) { res.status(500).json({ error: err.message }); } });
appExpress.get('/api/sinonimos', (req, res) => { try { res.json(dbService.getDiccionario('sinonimos')); } catch (err) { res.status(500).json({ error: err.message }); } });
appExpress.get('/api/ortografia', (req, res) => { try { res.json(dbService.getDiccionario('ortografia')); } catch (err) { res.status(500).json({ error: err.message }); } });
appExpress.get('/api/gramatica', (req, res) => { try { res.json(dbService.getDiccionario('gramatica')); } catch (err) { res.status(500).json({ error: err.message }); } });

appExpress.post('/api/jergas', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dbService.guardarDiccionario('jergas', original, reemplazo);
    res.json({ mensaje: 'Jerga guardada' });
});
appExpress.post('/api/sinonimos', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string' || typeof reemplazo !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dbService.guardarDiccionario('sinonimos', original, reemplazo);
    res.json({ mensaje: 'Sinónimo guardado' });
});
appExpress.post('/api/ortografia', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dbService.guardarDiccionario('ortografia', original, reemplazo);
    res.json({ mensaje: 'Ortografía guardada' });
});
appExpress.post('/api/gramatica', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos inválidos' });
    dbService.guardarDiccionario('gramatica', original, reemplazo);
    res.json({ mensaje: 'Gramática guardada' });
});

appExpress.delete('/api/jergas/:word', (req, res) => { dbService.eliminarEntrada('jergas', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/sinonimos/:word', (req, res) => { dbService.eliminarEntrada('sinonimos', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/ortografia/:word', (req, res) => { dbService.eliminarEntrada('ortografia', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/gramatica/:word', (req, res) => { dbService.eliminarEntrada('gramatica', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/diccionario', (req, res) => { dbService.limpiarTodo(); res.json({ mensaje: 'Diccionarios limpiados' }); });

// --- Voces y Corrección ---
appExpress.get('/api/voces', async (req, res) => {
    try {
        const scriptVoces = path.join(BACKEND_DIR, 'modules', 'listar_voces.py');
        if (!fs.existsSync(scriptVoces)) {
            const scriptContent = `import win32com.client, json, sys, winreg\ndef q(t):\n    try:\n        r=t.Id.strip()\n        if not r.upper().startswith("HKEY_LOCAL_MACHINE\\\\"): return False\n        k=winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r.split("HKEY_LOCAL_MACHINE\\\\",1)[1])\n        clsid=winreg.QueryValueEx(k,"CLSID")[0]\n        s="CLSID\\\\"+clsid\n        winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,s)\n        winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,s+"\\\\InprocServer32")\n        return True\n    except Exception:\n        return False\ntry:\n    voces = win32com.client.Dispatch("SAPI.SpVoice").GetVoices()\n    print(json.dumps([{"id": voces.Item(i).GetDescription(), "nombre": voces.Item(i).GetDescription()} for i in range(voces.Count) if q(voces.Item(i))], ensure_ascii=False))\nexcept Exception as e:\n    print(json.dumps({"error": str(e)})); sys.exit(1)`;
            fs.writeFileSync(scriptVoces, scriptContent, 'utf8');
        }
        
        const resultado = await new Promise((resolve, reject) => {
            const proceso = spawn(pythonCmd, [scriptVoces], { windowsHide: true });
            let stdout = '', stderr = '';
            proceso.stdout.on('data', (data) => { stdout += data.toString(); });
            proceso.stderr.on('data', (data) => { stderr += data.toString(); });
            proceso.on('close', (code) => {
                if (code === 0 && stdout) {
                    try { resolve(JSON.parse(stdout.trim())); } catch (e) { reject(new Error('Error parseando JSON')); }
                } else { reject(new Error(stderr || 'Error ejecutando Python')); }
            });
            proceso.on('error', (err) => {
                console.error('❌ Error spawn voces:', err.message);
                reject(new Error('Error iniciando Python: ' + err.message));
            });
        });
        
        if (resultado.error) return res.status(500).json({ error: resultado.error });
        res.json({ voces: resultado, total: resultado.length });
    } catch (error) {
        console.error('❌ Error listando voces:', error.message);
        res.status(500).json({ error: 'No se pudieron detectar las voces' });
    }
});

appExpress.post('/api/corregir-texto', async (req, res) => {
    const { texto } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacío' });
    
    try {
        const response = await fetch(`http://localhost:${LT_PORT}/v2/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ text: texto, language: 'es', enabledOnly: 'false' })
        });
        
        if (!response.ok) throw new Error(`LanguageTool respondió ${response.status}`);
        const data = await response.json();
        
        let textoCorregido = texto;
        const correcciones = [];
        const matches = [...data.matches].sort((a, b) => b.offset - a.offset);
        
        for (const match of matches) {
            if (match.replacements && match.replacements.length > 0) {
                const reemplazo = match.replacements[0].value;
                textoCorregido = textoCorregido.substring(0, match.offset) + reemplazo + textoCorregido.substring(match.offset + match.length);
                correcciones.push({
                    original: match.context.text.substring(match.context.offset, match.context.offset + match.context.length),
                    corregido: reemplazo,
                    mensaje: match.message,
                    tipo: match.rule.issueType
                });
            }
        }
        res.json({ textoOriginal: texto, textoCorregido, correcciones, totalCorrecciones: correcciones.length });
    } catch (error) {
        console.error('[LanguageTool] Error:', error.message);
        res.status(500).json({ error: 'Error al corregir texto', detalles: error.message });
    }
});

// --- Generación de Audio y Subtítulos ---
appExpress.post('/api/generar-audio', async (req, res) => {
    const { texto, voz, modo, opciones } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacío' });
    
    try {
        const opcionesConMax = {
            ...(opciones || {}),
            maxPalabras: opciones?.maxPalabras || 7
        };
        const resultado = await audioService.procesar(texto, voz, false, dbService, modo, opcionesConMax);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error generar-audio:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/generar-srt', async (req, res) => {
    const { audioPath, textoOriginal, maxPalabras } = req.body;
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta de audio no permitida' });

    const nombreSRT = `subtitulos-${Date.now()}.srt`;
    const rutaSRT = path.join(audioFolder, nombreSRT);
    const audioAbsoluto = path.join(PUBLIC_FOLDER, audioLimpio);
    const palabrasMax = parseInt(maxPalabras) || 7;

    try {
        console.log('[SRT] Intentando con Whisper.cpp...');
        await audioService.generarSRTWhisperCpp(audioAbsoluto, rutaSRT, palabrasMax);
        if (fs.existsSync(rutaSRT)) {
            return res.json({ srtUrl: `/audios/${nombreSRT}`, mensaje: 'SRT generado con Whisper.cpp', metodo: 'whispercpp' });
        }
    } catch (error) {
        console.warn('[SRT] Whisper.cpp falló, usando fallback Python...');
    }

    const proceso = spawn(pythonCmd, [pythonSRT, audioAbsoluto, rutaSRT, textoOriginal || '', String(palabrasMax)], { windowsHide: true });
    let stderr = '';
    proceso.stderr.on('data', (data) => { stderr += data.toString(); });
    proceso.on('close', (code) => {
        if (code === 0 && fs.existsSync(rutaSRT)) {
            res.json({ srtUrl: `/audios/${nombreSRT}`, mensaje: 'SRT generado con Python', metodo: 'python' });
        } else {
            res.status(500).json({ error: 'Error al generar SRT: ' + stderr });
        }
    });
    proceso.on('error', (err) => {
        console.error('❌ Error spawn SRT:', err.message);
        res.status(500).json({ error: 'Error generando SRT: ' + err.message });
    });
});

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
                res.json({ assUrl: `/audios/${nombreASS}`, srtUrl: nombreSRTFinal ? `/audios/${nombreSRTFinal}` : null, mensaje: 'ASS generado' });
            } else {
                res.status(500).json({ error: 'Error al generar ASS: ' + stderrASS });
            }
        });
        procesoASS.on('error', (err) => {
            console.error('❌ Error spawn ASS:', err.message);
            res.status(500).json({ error: 'Error generando ASS: ' + err.message });
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

        try {
            await audioService.generarSRTWhisperCpp(audioAbsoluto, rutaSRTAbsoluta, palabrasMax);
            if (fs.existsSync(rutaSRTAbsoluta)) return ejecutarASS(rutaSRTAbsoluta);
        } catch (error) {
            console.warn('[ASS] Whisper.cpp falló, usando Python...');
        }

        const procesoSRT = spawn(pythonCmd, [pythonSRT, audioAbsoluto, rutaSRTAbsoluta, textoOriginal || '', String(palabrasMax)], { windowsHide: true });
        let stderrSRT = '';
        procesoSRT.stderr.on('data', (data) => { stderrSRT += data.toString(); });
        procesoSRT.on('close', (code) => {
            if (code === 0 && fs.existsSync(rutaSRTAbsoluta)) {
                ejecutarASS(rutaSRTAbsoluta);
            } else {
                console.warn('[ASS] SRT temp falló:', stderrSRT);
                nombreSRTFinal = null;
                ejecutarASS(null);
            }
        });
        procesoSRT.on('error', (err) => {
            console.error('❌ Error spawn SRT temp:', err.message);
            nombreSRTFinal = null;
            ejecutarASS(null);
        });
    }
});

// --- Audio Avanzado ---
appExpress.post('/api/audio/apply-ducking', async (req, res) => {
    const { voiceAudioPath, musicPath, options } = req.body;
    if (!voiceAudioPath || !musicPath) return res.status(400).json({ error: 'Faltan rutas' });
    
    const vozLimpia = sanitizarRutaAudio(voiceAudioPath);
    const musLimpia = sanitizarRutaAudio(musicPath);
    if (!vozLimpia || !musLimpia) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const resultado = await audioService.aplicarDucking(path.join(PUBLIC_FOLDER, vozLimpia), path.join(PUBLIC_FOLDER, musLimpia), options);
        res.json(resultado);
    } catch (error) {
        console.error('❌ Error ducking:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/audio/convertir-mp3', async (req, res) => {
    const { wavPath, originalWavPath } = req.body;
    if (!wavPath) return res.status(400).json({ error: 'Falta ruta WAV' });
    
    const wavLimpio = sanitizarRutaAudio(wavPath);
    if (!wavLimpio) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const wavAbsoluta = path.join(PUBLIC_FOLDER, wavLimpio);
        const originalLimpio = originalWavPath ? sanitizarRutaAudio(originalWavPath) : null;
        
        if (originalLimpio && originalLimpio !== wavLimpio) {
            const [mainRes, origRes] = await Promise.all([
                audioService.convertirAMp3(wavAbsoluta, audioFolder),
                audioService.convertirAMp3(path.join(PUBLIC_FOLDER, originalLimpio), audioFolder)
            ]);
            res.json({ urls: [{ type: 'ducked', url: mainRes.url }, { type: 'original', url: origRes.url }], mensaje: 'MP3s listos' });
        } else {
            const resultado = await audioService.convertirAMp3(wavAbsoluta, audioFolder);
            res.json({ urls: [{ type: 'original', url: resultado.url }], mensaje: resultado.mensaje || 'MP3 listo' });
        }
    } catch (error) {
        console.error('❌ Error MP3:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Video y Uploads ---
appExpress.post('/api/generar-video-pngtuber', async (req, res) => {
    const { audioPath, idleImagePath, talkingImagePath } = req.body;
    if (!audioPath) return res.status(400).json({ error: 'Falta audio' });
    
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const resultado = await videoService.generarPNGTuber(path.join(PUBLIC_FOLDER, audioLimpio), { idleImagePath, talkingImagePath });
        res.json({ ...resultado, mensaje: 'Video generado' });
    } catch (error) {
        console.error('❌ Error PNGTuber:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/upload-pngtuber', uploadPngTuber.fields([{ name: 'idle', maxCount: 1 }, { name: 'talking', maxCount: 1 }]), (req, res) => {
    const file = req.files?.idle?.[0] || req.files?.talking?.[0];
    if (!file) return res.status(400).json({ error: 'No se subió imagen' });
    res.json({ url: `/pngtuber/${file.filename}`, type: file.fieldname, mensaje: 'Imagen cargada' });
});

appExpress.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'Música subida' });
});

appExpress.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió audio' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'Audio subido' });
});

// ==========================================
// 6. MANEJO DE ERRORES Y CATCH-ALL
// ==========================================
appExpress.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) {
        console.error('❌ Error no manejado:', err);
        return res.status(500).json({ error: err.message || String(err) });
    }
    next();
});

appExpress.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/audios') || req.path.startsWith('/pngtuber')) {
        return res.status(404).json({ error: 'Ruta de API no encontrada' });
    }
    const indexPath = path.join(FRONTEND_PATH, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(404).send('Interfaz no encontrada.');
});

// ==========================================
// 7. INICIAR SERVIDOR
// ==========================================
let boundPort = null;
let server = null;

function startServer(port = 3000) {
    const server = appExpress.listen(port, () => {
        boundPort = server.address().port;
        console.log('\n========================================');
        console.log(`✅ Servidor escuchando en: http://localhost:${boundPort}`);
        console.log('========================================');
        console.log(`📊 Health check: http://localhost:${boundPort}/api/health`);
        console.log('');

        setTimeout(() => { iniciarLanguageTool(); }, 1500);
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

function getPort() {
    if (boundPort) return boundPort;
    return server && server.address() ? server.address().port : null;
}

(async () => {
    await dbService.whenReady();
    server = startServer(3000);
})();
module.exports = { expressApp: appExpress, server, getPort };