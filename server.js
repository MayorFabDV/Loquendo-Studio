// server.js - API REST con GeneraciÃ³n de SubtÃ­tulos Bajo Demanda (VersiÃ³n Final Blindada)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { pipeline } = require('stream/promises');
const APP_VERSION = require('./package.json').version;
const { escucharConFallback, origenLocalPermitido } = require('./backend/services/serverNetwork');

// ==========================================
// 1. DETECCIÃ“N DE ENTORNO Y RUTAS BASE
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
console.log('ðŸš€ LOQUENDO STUDIO - INICIANDO SERVIDOR');
console.log('========================================');
console.log(`[Server] Entorno: ${isPackaged ? 'PRODUCCIÃ“N' : 'DESARROLLO'}`);
console.log(`[Server] ROOT_DIR: ${ROOT_DIR}`);
console.log(`[Server] BACKEND_DIR: ${BACKEND_DIR}`);
console.log(`[Server] FRONTEND_DIR: ${FRONTEND_DIR}`);

// ==========================================
// 2. RUTAS CRÃTICAS
// ==========================================
const ffmpegPath = path.join(BACKEND_DIR, 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(BACKEND_DIR, 'bin', 'ffprobe.exe');
const pythonSRT = path.join(BACKEND_DIR, 'modules', 'generar_srt.py');
const pythonASS = path.join(BACKEND_DIR, 'modules', 'generar_ass.py');
const dbFolder = path.join(BACKEND_DIR, 'db');
const audioFolder = path.join(BACKEND_DIR, 'public', 'audios');
const pngtuberFolder = path.join(BACKEND_DIR, 'public', 'pngtuber');
const sfxFolder = path.join(BACKEND_DIR, 'public', 'sfx');
const PUBLIC_FOLDER = path.join(BACKEND_DIR, 'public');

// Datos persistentes del usuario (proyectos, assets y renders). NUNCA dentro de public/audios:
// main-electron borra esa carpeta al cerrar y el limpiador elimina archivos >24 h.
const DATA_DIR = process.env.LOQUENDO_DATA_DIR
    || path.join(process.env.APPDATA || process.env.LOCALAPPDATA || require('os').homedir(), 'Loquendo Studio', 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// âœ… Rutas de LanguageTool
const javaPath = path.join(BACKEND_DIR, 'bin', 'jre', 'bin', 'java.exe');
const ltJar = path.join(BACKEND_DIR, 'bin', 'languagetool', 'languagetool-server.jar');
const LT_PORT = 8011;

// âœ… Rutas de Whisper.cpp
const whisperExe = path.join(BACKEND_DIR, 'bin', 'whisper-cli.exe');
const whisperModel = path.join(BACKEND_DIR, 'bin', 'ggml-small.bin');

// âœ… Rutas de generar_voz
const generarVozExe = path.join(BACKEND_DIR, 'bin', 'generar_voz.exe');

[audioFolder, pngtuberFolder, dbFolder, DATA_DIR, PROJECTS_DIR].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

const bundledPython = path.join(BACKEND_DIR, 'python', 'python.exe');
const pythonCmd = fs.existsSync(bundledPython) ? bundledPython : 'python';

// ==========================================
// 2.5 VERIFICACIÃ“N DE COMPONENTES
// ==========================================
console.log('\n[Server] Verificando componentes:');
console.log('  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”');

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
    
    const icono = existe ? 'âœ…' : (comp.obligatorio ? 'âŒ' : 'âš ï¸ ');
    const estado = existe ? 'OK' : (comp.obligatorio ? 'FALTA (crÃ­tico)' : 'FALTA (opcional)');
    console.log(`  â”‚ ${icono} ${comp.nombre.padEnd(14)} ${estado.padEnd(20)} â”‚`);
});

console.log('  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜');
console.log(`[Server] Componentes: ${componentesOK}/${componentes.length} OK`);

if (componentesFaltantes.length > 0) {
    const criticos = componentes.filter(c => c.obligatorio && !fs.existsSync(c.ruta));
    if (criticos.length > 0) {
        console.warn(`âš ï¸  [Server] Componentes crÃ­ticos faltantes: ${criticos.map(c => c.nombre).join(', ')}`);
    }
}

// ==========================================
// 2.6 LANZAR LANGUAGETOOL LOCAL
// ==========================================
let languageToolProcess = null;

function iniciarLanguageTool() {
    if (!fs.existsSync(javaPath) || !fs.existsSync(ltJar)) {
        console.warn('[LanguageTool] No disponible. CorrecciÃ³n ortogrÃ¡fica desactivada.');
        return;
    }
    
    console.log(`[LanguageTool] Iniciando servidor en puerto ${LT_PORT}...`);
    
    languageToolProcess = spawn(javaPath, [
        '-Xmx512m',
        '-cp', ltJar,
        'org.languagetool.server.HTTPServer',
        '--port', String(LT_PORT)
    ], { 
        windowsHide: true,
        cwd: path.dirname(ltJar)
    });
    
    languageToolProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && msg.includes('Server started')) {
            console.log('[LanguageTool] âœ… Servidor listo');
        }
    });
    
    languageToolProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && msg.includes('Server started')) {
            console.log('[LanguageTool] âœ… Servidor listo');
        }
    });
    
    languageToolProcess.on('close', (code) => {
        console.log(`[LanguageTool] Servidor cerrado (cÃ³digo ${code})`);
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
// 3. CONFIGURACIÃ“N MULTER & EXPRESS
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
    limits: { fileSize: 1024 * 1024 * 1024 }, 
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
        const prefix = file.fieldname === 'talking' ? 'talking' : (file.fieldname === 'blink' ? 'blink' : 'idle');
        cb(null, `${prefix}-${Date.now()}${ext}`);
    }
});
const uploadPngTuber = multer({ 
    storage: pngtuberStorage, 
    limits: { fileSize: 20 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png' || file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Solo imÃ¡genes'), false);
    }
});

const appExpress = express();
const puertoConfigurado = Number(process.env.PORT);
const PORT = Number.isInteger(puertoConfigurado) && puertoConfigurado > 0 && puertoConfigurado <= 65535
    ? puertoConfigurado
    : 3000;

appExpress.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !origenLocalPermitido(origin, boundPort)) {
        return res.status(403).json({ error: 'Origen no permitido' });
    }
    next();
});
appExpress.use(cors({
    origin: (origin, callback) => {
        if (!origin || !origenLocalPermitido(origin, boundPort)) {
            return callback(null, false);
        }
        callback(null, origin);
    }
}));
appExpress.use(express.json({ limit: '25mb' }));

const FRONTEND_PATH = fs.existsSync(FRONTEND_DIR) ? FRONTEND_DIR : ROOT_DIR;
appExpress.use(express.static(FRONTEND_PATH));
appExpress.use('/audios', express.static(audioFolder));
appExpress.use('/pngtuber', express.static(pngtuberFolder));
appExpress.use('/sfx', express.static(sfxFolder));
appExpress.use('/media/projects', express.static(PROJECTS_DIR, { index: false, dotfiles: 'deny' }));

// ==========================================
// 4. SERVICIOS
// ==========================================
const DatabaseService = require('./backend/services/databaseService');
const AudioService = require('./backend/services/audioService');
const AudioRenderService = require('./backend/services/audioRenderService');
const VideoService = require('./backend/services/videoService');
const { AssetStore } = require('./backend/services/projects/assetStore');
const { PortableProject, MAX_BYTES: MAX_PORTABLE_BYTES } = require('./backend/services/projects/portableProject');
const { PeaksService } = require('./backend/services/audio/peaksService');
const { ProjectRenderService } = require('./backend/services/audio/projectRenderService');

const dbService = new DatabaseService(dbFolder);
const audioService = new AudioService(pythonSRT, audioFolder, ffmpegPath, pythonCmd);
const audioRenderService = new AudioRenderService(ffmpegPath, ffprobePath, audioFolder);
const videoService = new VideoService(ffmpegPath, audioFolder, pngtuberFolder, ffprobePath);

const assetStore = new AssetStore(DATA_DIR, { raicesPermitidas: [PUBLIC_FOLDER, DATA_DIR] });
const portableProject = new PortableProject(assetStore);
const uploadPortable = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(assetStore.cacheDir, 'imports');
            try { fs.mkdirSync(dir, { recursive: true }); cb(null, dir); } catch (error) { cb(error); }
        },
        filename: (req, file, cb) => cb(null, `${randomUUID()}.tar`)
    }),
    limits: { fileSize: MAX_PORTABLE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => cb(/\.tar$/i.test(file.originalname) ? null : new Error('Selecciona un paquete .loquendo.tar'), /\.tar$/i.test(file.originalname))
});
const peaksService = new PeaksService(ffmpegPath, assetStore.cacheDir);

function dentroDe(base, candidato) {
    const rel = path.relative(path.resolve(base), path.resolve(candidato));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolverFuenteAbsoluta(src) {
    if (typeof src !== 'string' || !src.trim()) return null;
    let limpia = src.trim().split('?')[0].split('#')[0].replace(/\\/g, '/');
    if (/^https?:/i.test(limpia)) {
        try { limpia = new URL(limpia).pathname; } catch (e) { return null; }
    }
    try { limpia = decodeURIComponent(limpia); } catch (e) { /* mantener */ }
    if (limpia.includes('\u0000') || limpia.includes('..')) return null;

    if (limpia.startsWith('/media/')) {
        const absoluta = path.resolve(DATA_DIR, limpia.slice('/media/'.length));
        return dentroDe(DATA_DIR, absoluta) && fs.existsSync(absoluta) ? absoluta : null;
    }

    let relativa = limpia.replace(/^\/+/, '');
    if (relativa.startsWith('public/')) relativa = relativa.slice(7);
    if (!relativa || relativa.includes('/../')) return null;
    if (!/^(audios|sfx|pngtuber)\//.test(relativa)) {
        if (relativa.includes('/')) return null;
        relativa = 'audios/' + relativa;
    }

    const absoluta = path.resolve(PUBLIC_FOLDER, relativa);
    return dentroDe(PUBLIC_FOLDER, absoluta) && fs.existsSync(absoluta) ? absoluta : null;
}

const projectRenderService = new ProjectRenderService(ffmpegPath, ffprobePath, assetStore, {
    audioRenderService,
    resolverFuente: resolverFuenteAbsoluta
});

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
        version: APP_VERSION,
        entorno: isPackaged ? 'produccion' : 'desarrollo',
        servicios: {
            ffmpeg: fs.existsSync(ffmpegPath),
            ffprobe: fs.existsSync(ffprobePath),
            python: fs.existsSync(pythonCmd),
            generar_voz: fs.existsSync(generarVozExe),
            java: fs.existsSync(javaPath),
            languagetool: fs.existsSync(ltJar),
            whispercpp: fs.existsSync(whisperExe),
            whispermodel: fs.existsSync(whisperModel)
        },
        puerto: boundPort || PORT,
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
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos invÃ¡lidos' });
    dbService.guardarDiccionario('jergas', original, reemplazo);
    res.json({ mensaje: 'Jerga guardada' });
});
appExpress.post('/api/sinonimos', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string' || typeof reemplazo !== 'string') return res.status(400).json({ error: 'Datos invÃ¡lidos' });
    dbService.guardarDiccionario('sinonimos', original, reemplazo);
    res.json({ mensaje: 'SinÃ³nimo guardado' });
});
appExpress.post('/api/ortografia', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos invÃ¡lidos' });
    dbService.guardarDiccionario('ortografia', original, reemplazo);
    res.json({ mensaje: 'OrtografÃ­a guardada' });
});
appExpress.post('/api/gramatica', (req, res) => {
    const { original, reemplazo } = req.body;
    if (typeof original !== 'string') return res.status(400).json({ error: 'Datos invÃ¡lidos' });
    dbService.guardarDiccionario('gramatica', original, reemplazo);
    res.json({ mensaje: 'GramÃ¡tica guardada' });
});

appExpress.delete('/api/jergas/:word', (req, res) => { dbService.eliminarEntrada('jergas', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/sinonimos/:word', (req, res) => { dbService.eliminarEntrada('sinonimos', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/ortografia/:word', (req, res) => { dbService.eliminarEntrada('ortografia', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/gramatica/:word', (req, res) => { dbService.eliminarEntrada('gramatica', req.params.word); res.json({ mensaje: 'Entrada eliminada' }); });
appExpress.delete('/api/diccionario', (req, res) => { dbService.limpiarTodo(); res.json({ mensaje: 'Diccionarios limpiados' }); });

// --- Voces y CorrecciÃ³n ---
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
                console.error('âŒ Error spawn voces:', err.message);
                reject(new Error('Error iniciando Python: ' + err.message));
            });
        });
        
        if (resultado.error) return res.status(500).json({ error: resultado.error });
        res.json({ voces: resultado, total: resultado.length });
    } catch (error) {
        console.error('âŒ Error listando voces:', error.message);
        res.status(500).json({ error: 'No se pudieron detectar las voces' });
    }
});

appExpress.post('/api/corregir-texto', async (req, res) => {
    const { texto } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacÃ­o' });
    
    try {
        const response = await fetch(`http://localhost:${LT_PORT}/v2/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ text: texto, language: 'es', enabledOnly: 'false' })
        });
        
        if (!response.ok) throw new Error(`LanguageTool respondiÃ³ ${response.status}`);
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

// --- GeneraciÃ³n de Audio y SubtÃ­tulos ---
appExpress.post('/api/generar-audio', async (req, res) => {
    // FIX Bug #5: leer usarIA del body en lugar de hardcodear false
    const { texto, voz, modo, opciones, usarIA } = req.body;
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Texto vacÃ­o' });
    
    try {
        const opcionesConMax = {
            ...(opciones || {}),
            maxPalabras: opciones?.maxPalabras || 7
        };
        const resultado = await audioService.procesar(texto, voz, usarIA ?? false, dbService, modo, opcionesConMax);
        res.json(resultado);
    } catch (error) {
        console.error('âŒ Error generar-audio:', error.message);
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
        console.warn('[SRT] Whisper.cpp fallÃ³, usando fallback Python...');
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
        console.error('âŒ Error spawn SRT:', err.message);
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
            console.error('âŒ Error spawn ASS:', err.message);
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
            console.warn('[ASS] Whisper.cpp fallÃ³, usando Python...');
        }

        const procesoSRT = spawn(pythonCmd, [pythonSRT, audioAbsoluto, rutaSRTAbsoluta, textoOriginal || '', String(palabrasMax)], { windowsHide: true });
        let stderrSRT = '';
        procesoSRT.stderr.on('data', (data) => { stderrSRT += data.toString(); });
        procesoSRT.on('close', (code) => {
            if (code === 0 && fs.existsSync(rutaSRTAbsoluta)) {
                ejecutarASS(rutaSRTAbsoluta);
            } else {
                console.warn('[ASS] SRT temp fallÃ³:', stderrSRT);
                nombreSRTFinal = null;
                ejecutarASS(null);
            }
        });
        procesoSRT.on('error', (err) => {
            console.error('âŒ Error spawn SRT temp:', err.message);
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
        console.error('âŒ Error ducking:', error.message);
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
        console.error('âŒ Error MP3:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/audio/render', async (req, res) => {
    const { audioPath, recipe, format, bitDepth, loudness } = req.body || {};
    if (!audioPath) return res.status(400).json({ error: 'Falta ruta de audio' });

    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });

    const formatos = ['wav', 'mp3', 'flac', 'opus'];
    const formato = String(format || 'wav').toLowerCase();
    if (!formatos.includes(formato)) return res.status(400).json({ error: 'Formato no soportado' });

    try {
        const receta = Object.assign({}, recipe || {});
        if (loudness !== undefined) receta.loudness = loudness;
        const resultado = await audioRenderService.renderizar(
            path.join(PUBLIC_FOLDER, audioLimpio),
            receta,
            { format: formato, bitDepth: Number(bitDepth) === 24 ? 24 : 16 }
        );
        res.json({ ...resultado, mensaje: 'Render listo' });
    } catch (error) {
        console.error('âŒ Error render:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/audio/process-selection', async (req, res) => {
    const { audioPath, start, end, recipe, normalize } = req.body || {};
    if (!audioPath) return res.status(400).json({ error: 'Falta ruta de audio' });
    const inicio = Number(start);
    const fin = Number(end);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) {
        return res.status(400).json({ error: 'Rango de selecciÃ³n invÃ¡lido' });
    }
    if (fin <= inicio) {
        return res.status(400).json({ error: 'El final de la selecciÃ³n debe ser mayor que el inicio' });
    }
    if (fin - inicio < 0.05) {
        return res.status(400).json({ error: 'La selecciÃ³n es demasiado corta (mÃ­nimo 0.05 s)' });
    }

    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });

    try {
        const resultado = await audioRenderService.procesarSeleccion(
            path.join(PUBLIC_FOLDER, audioLimpio),
            inicio,
            fin,
            recipe || {},
            { normalize: normalize || {} }
        );
        res.json({ ...resultado, mensaje: 'SelecciÃ³n procesada' });
    } catch (error) {
        console.error('âŒ Error al procesar selecciÃ³n:', error.message);
        if (/no encontrado/i.test(error.message)) {
            return res.status(404).json({ error: error.message });
        }
        const errorCliente = /rango|selecciÃ³n es demasiado corta|no hay efectos|no se pudo medir/i.test(error.message);
        res.status(errorCliente ? 400 : 500).json({ error: error.message });
    }
});

appExpress.post('/api/audio/analyze', async (req, res) => {
    const { audioPath } = req.body || {};
    if (!audioPath) return res.status(400).json({ error: 'Falta ruta de audio' });

    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });

    try {
        const resultado = await audioRenderService.analizar(path.join(PUBLIC_FOLDER, audioLimpio));
        res.json(resultado);
    } catch (error) {
        console.error('âŒ Error anÃ¡lisis:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Video y Uploads ---
appExpress.post('/api/generar-video-pngtuber', async (req, res) => {
    const { audioPath, idleImagePath, talkingImagePath, blinkImagePath, fondo, resolucion, escala } = req.body;
    if (!audioPath) return res.status(400).json({ error: 'Falta audio' });
    
    const audioLimpio = sanitizarRutaAudio(audioPath);
    if (!audioLimpio) return res.status(403).json({ error: 'Ruta no permitida' });
    
    try {
        const resultado = await videoService.generarPNGTuber(path.join(PUBLIC_FOLDER, audioLimpio), { idleImagePath, talkingImagePath, blinkImagePath, fondo, resolucion, escala });
        res.json({ ...resultado, mensaje: 'Video generado' });
    } catch (error) {
        console.error('âŒ Error PNGTuber:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/pngtuber/preview', async (req, res) => {
    const { idleImagePath, talkingImagePath, blinkImagePath, fondo, resolucion, escala } = req.body;
    try {
        const resultado = await videoService.generarPreviewPNGTuber({ idleImagePath, talkingImagePath, blinkImagePath, fondo, resolucion, escala });
        res.json({ ...resultado, mensaje: 'Vista previa generada' });
    } catch (error) {
        console.error('âŒ Error vista previa PNGTuber:', error.message);
        res.status(500).json({ error: error.message });
    }
});

appExpress.post('/api/upload-pngtuber', uploadPngTuber.fields([{ name: 'idle', maxCount: 1 }, { name: 'talking', maxCount: 1 }, { name: 'blink', maxCount: 1 }]), (req, res) => {
    const file = req.files?.idle?.[0] || req.files?.talking?.[0] || req.files?.blink?.[0];
    if (!file) return res.status(400).json({ error: 'No se subiÃ³ imagen' });
    res.json({ url: `/pngtuber/${file.filename}`, type: file.fieldname, mensaje: 'Imagen cargada' });
});

appExpress.post('/api/upload-music', upload.single('music'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subiÃ³ archivo' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'MÃºsica subida' });
});

// --- Biblioteca de efectos de sonido (carpeta local del usuario) ---
appExpress.get('/api/sfx/list', async (req, res) => {
    try {
        await fs.promises.mkdir(sfxFolder, { recursive: true });
        const entradas = await fs.promises.readdir(sfxFolder, { withFileTypes: true });
        const extensiones = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.aac']);
        const items = entradas
            .filter((e) => e.isFile() && extensiones.has(path.extname(e.name).toLowerCase()))
            .map((e) => ({
                nombre: path.basename(e.name, path.extname(e.name)),
                archivo: e.name,
                url: `/sfx/${encodeURIComponent(e.name)}`
            }));
        res.json({ items });
    } catch (error) {
        console.error('âŒ Error listando SFX:', error.message);
        res.status(500).json({ error: 'No se pudo leer la biblioteca SFX' });
    }
});

appExpress.post('/api/upload-audio-editado', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subiÃ³ audio' });
    res.json({ url: `/audios/${req.file.filename}`, mensaje: 'Audio subido' });
});

// ==========================================
// PROYECTOS PERSISTENTES, ASSETS, PICOS Y RENDER
// ==========================================
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

appExpress.get('/api/proyectos', (req, res) => {
    res.json({ ok: true, items: assetStore.listarProyectos() });
});

appExpress.post('/api/proyectos', asyncHandler(async (req, res) => {
    const datos = req.body && req.body.project ? req.body.project : req.body;
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    }
    const id = datos.id || req.body.id;
    const proyecto = await assetStore.guardarProyecto(id, datos);
    res.json({ ok: true, proyecto });
}));

appExpress.get('/api/proyectos/:id', (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto inválido' });
    const { proyecto, recuperado } = assetStore.leerConRespaldo(req.params.id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json({ ok: true, proyecto, recuperado });
});

appExpress.post('/api/proyectos/importar-portable', uploadPortable.single('project'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el paquete de proyecto' });
    try {
        const proyecto = await portableProject.importar(req.file.path);
        res.json({ ok: true, proyecto });
    } catch (error) {
        res.status(400).json({ error: error.message });
    } finally { await fs.promises.unlink(req.file.path).catch(() => {}); }
}));

appExpress.get('/api/proyectos/:id/portable', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto inválido' });
    const paquete = await portableProject.exportar(req.params.id);
    res.set('Content-Type', 'application/x-tar');
    res.attachment(paquete.nombre);
    try { await pipeline(paquete.stream, res); }
    catch (error) { if (res.headersSent) res.destroy(error); else throw error; }
}));

appExpress.get('/api/proyectos/:id/integridad', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto inválido' });
    if (!assetStore.leerProyecto(req.params.id)) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(await assetStore.comprobarIntegridad(req.params.id));
}));

appExpress.put('/api/proyectos/:id', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    const datos = req.body && req.body.project ? req.body.project : req.body;
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    }
    const proyecto = await assetStore.guardarProyecto(req.params.id, datos);
    res.json({ ok: true, proyecto });
}));

appExpress.delete('/api/proyectos/:id', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    const eliminado = await assetStore.eliminarProyecto(req.params.id);
    res.json({ ok: true, eliminado });
}));

appExpress.get('/api/proyectos/:id/assets', (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    res.json({ ok: true, items: assetStore.listarAssets(req.params.id) });
});

appExpress.post('/api/proyectos/:id/assets', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    const src = req.body && (req.body.src || req.body.path || req.body.url);
    const absoluta = resolverFuenteAbsoluta(src);
    if (!absoluta) return res.status(400).json({ error: 'Origen de audio no vÃ¡lido o inexistente' });
    const asset = await assetStore.importarAsset(req.params.id, absoluta, { nombre: req.body.nombre });
    res.json({ ok: true, ...asset });
}));

appExpress.post('/api/proyectos/:id/assets/upload', upload.single('audio'), asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    if (!req.file) return res.status(400).json({ error: 'No se subiÃ³ audio' });
    const asset = await assetStore.importarAsset(req.params.id, req.file.path, { nombre: req.file.originalname });
    res.json({ ok: true, ...asset });
}));

appExpress.get('/api/audio/peaks', asyncHandler(async (req, res) => {
    const absoluta = resolverFuenteAbsoluta(req.query.src || req.query.path);
    if (!absoluta) return res.status(400).json({ error: 'Audio no encontrado' });
    const datos = await peaksService.obtener(absoluta, {
        points: req.query.points,
        inSec: req.query.in,
        outSec: req.query.out
    });
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ ok: true, ...datos });
}));

appExpress.post('/api/proyectos/:id/render', asyncHandler(async (req, res) => {
    if (!assetStore.idValido(req.params.id)) return res.status(400).json({ error: 'Proyecto invÃ¡lido' });
    const cuerpo = req.body || {};
    const proyecto = (cuerpo.project && typeof cuerpo.project === 'object')
        ? cuerpo.project
        : assetStore.leerProyecto(req.params.id);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    const resultado = await projectRenderService.render(
        { ...proyecto, id: req.params.id },
        { projectId: req.params.id, formato: cuerpo.formato }
    );
    res.json({ ok: true, ...resultado });
}));

// --- Limpieza de temporales (>24 h) ---
const TEMPORAL_MAX_EDAD_MS = 24 * 60 * 60 * 1000;

function normalizarRutaPublica(ruta) {
    if (typeof ruta !== 'string' || !ruta.trim()) return null;
    let limpia = ruta.split('?')[0].split('#')[0].replace(/\\/g, '/');
    const idxPublic = limpia.toLowerCase().lastIndexOf('/public/');
    if (idxPublic !== -1) limpia = limpia.slice(idxPublic + 8);
    limpia = limpia.replace(/^public\//i, '').replace(/^\.?\//, '');
    if (!limpia || limpia.includes('..')) return null;
    return limpia;
}

async function limpiarCarpetaTemporal(carpeta, conservar) {
    let eliminados = 0;
    let bytes = 0;
    let errores = 0;
    const ahora = Date.now();

    async function recorrer(dir) {
        let entradas;
        try {
            entradas = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch (err) {
            errores++;
            return;
        }

        for (const entrada of entradas) {
            const absoluta = path.join(dir, entrada.name);
            if (entrada.isDirectory()) {
                await recorrer(absoluta);
                continue;
            }
            if (!entrada.isFile()) continue;
            if (entrada.name === '.gitkeep' || entrada.name.toLowerCase() === 'idle.png') continue;

            const relativa = path.relative(PUBLIC_FOLDER, absoluta).split(path.sep).join('/');
            if (conservar.has(relativa)) continue;

            try {
                const stats = await fs.promises.stat(absoluta);
                if (ahora - stats.mtimeMs < TEMPORAL_MAX_EDAD_MS) continue;
                await fs.promises.unlink(absoluta);
                eliminados++;
                bytes += stats.size;
            } catch (err) {
                if (err && (err.code === 'ENOENT' || err.code === 'EBUSY' || err.code === 'EPERM')) {
                    errores++;
                    continue;
                }
                errores++;
            }
        }
    }

    await recorrer(carpeta);
    return { eliminados, bytes, errores };
}

appExpress.post('/api/limpiar-temporales', async (req, res) => {
    try {
        const lista = Array.isArray(req.body && req.body.conservar) ? req.body.conservar : [];
        const conservar = new Set(lista.map(normalizarRutaPublica).filter(Boolean));
        const audios = await limpiarCarpetaTemporal(audioFolder, conservar);
        const pngtuber = await limpiarCarpetaTemporal(pngtuberFolder, conservar);
        res.json({
            ok: true,
            eliminados: audios.eliminados + pngtuber.eliminados,
            bytes: audios.bytes + pngtuber.bytes,
            errores: audios.errores + pngtuber.errores,
            detalle: { audios, pngtuber }
        });
    } catch (error) {
        console.error('âŒ Error limpiando temporales:', error);
        res.status(500).json({ error: 'No se pudieron limpiar los temporales' });
    }
});

// ==========================================
// 6. MANEJO DE ERRORES Y CATCH-ALL
// ==========================================
appExpress.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    if (err) {
        console.error('âŒ Error no manejado:', err);
        return res.status(500).json({ error: err.message || String(err) });
    }
    next();
});

appExpress.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/audios') || req.path.startsWith('/pngtuber') || req.path.startsWith('/sfx/') || req.path.startsWith('/media/')) {
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
let serverRuntime = null;

function startServer(port = PORT) {
    serverRuntime = escucharConFallback(appExpress, port, 'localhost', 20, (ocupado, siguiente) => {
        console.log(`\nâš ï¸  Puerto ${ocupado} ocupado, intentando ${siguiente}...`);
    });
    server = serverRuntime.getServidor();

    serverRuntime.listo.then((servidorLigado) => {
        server = servidorLigado;
        boundPort = serverRuntime.getPuerto();
        console.log('\n========================================');
        console.log(`âœ… Servidor escuchando en: http://localhost:${boundPort}`);
        console.log('========================================');
        console.log(`ðŸ“Š Health check: http://localhost:${boundPort}/api/health`);
        console.log('');

        setTimeout(() => { iniciarLanguageTool(); }, 1500);
    }).catch((err) => {
        console.error('Error del servidor:', err);
        process.exit(1);
    });
    return serverRuntime;
}

function getPort() {
    return boundPort;
}

// FIX Bug #2: module.exports se evalÃºa ANTES de que la IIFE async termine.
// El campo `server` siempre era null al momento del export.
// Se expone `getServer()` como getter lazy para obtener el valor actual.
function getServer() { return serverRuntime ? serverRuntime.getServidor() : server; }

if (process.env.LOQUENDO_NO_AUTOSTART !== '1') {
    (async () => {
        await dbService.whenReady();
        startServer(PORT);
    })();
}
module.exports = { expressApp: appExpress, getServer, getPort };
