// main-electron.js - Versión Final Unificada y Sin Errores
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// --- ARRANQUE DEL SERVIDOR EXPRESS ---
const serverModule = require('./server.js');

// --- RUTAS DE CARPETAS (CORREGIDO) ---
const isDev = !app.isPackaged;

// ✅ FIX: En producción, la base es resources/backend
const __base = isDev 
    ? __dirname 
    : path.join(process.resourcesPath, 'backend');

const audioFolder = path.join(__base, 'public', 'audios');
const pngtuberFolder = path.join(__base, 'public', 'pngtuber');

// Asegurar carpetas
[audioFolder, pngtuberFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// --- FUNCIÓN PARA ESPERAR AL SERVIDOR ---
function getBoundPort() {
    const port = (serverModule.getPort && serverModule.getPort()) || Number(process.env.PORT) || 3000;
    return port;
}

let BOUND_PORT = getBoundPort();

function esperarPuertoLigado(maxAttempts = 40, delay = 250) {
    return new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
            const port = getBoundPort();
            if (port) return resolve(port);
            attempts++;
            if (attempts >= maxAttempts) return resolve(BOUND_PORT);
            setTimeout(check, delay);
        };
        check();
    });
}

function waitForServer(maxAttempts = 20, delay = 500) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            const req = http.get(`http://localhost:${BOUND_PORT}/api/health`, (res) => {
                let body = '';
                res.on('data', (d) => { body += d.toString(); });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        if (data && data.status === 'ok') {
                            console.log(`[MAIN] ✅ Servidor (API Loquendo) listo después de ${attempts} intentos`);
                            resolve();
                        } else {
                            throw new Error('Respuesta inesperada del health check');
                        }
                    } catch (e) {
                        console.error(`[MAIN] ⚠️ Puerto ${BOUND_PORT} responde pero NO es nuestro server (${e.message})`);
                        reject(new Error(`El puerto ${BOUND_PORT} está ocupado por otra aplicación`));
                    }
                });
            });
            req.on('error', () => {
                if (attempts >= maxAttempts) {
                    reject(new Error(`El servidor no arrancó después de ${(maxAttempts * delay)}ms`));
                } else {
                    setTimeout(check, delay);
                }
            });
            req.setTimeout(500, () => {
                req.destroy();
                if (attempts >= maxAttempts) {
                    reject(new Error('Timeout esperando al servidor'));
                } else {
                    setTimeout(check, delay);
                }
            });
        };
        check();
    });
}

// --- ENLACES EXTERNOS ---
// El renderer se sirve desde http://localhost:<puerto real>. Todo lo que no sea
// ese origen (http/https) se manda al navegador del sistema, nunca a una ventana
// de Electron. NO usar un puerto fijo: server.js incrementa si 3000 está ocupado.
function appOrigin() {
    return `http://localhost:${BOUND_PORT}`;
}

function abrirEnNavegador(url) {
    if (typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url)) return;
    shell.openExternal(url);
}

function urlEsInterna(url) {
    if (url === 'about:blank') return true;
    try {
        return new URL(url).origin === appOrigin();
    } catch (e) {
        return false;
    }
}

// --- VENTANA PRINCIPAL ---
let mainWindow;

function createWindow() {
    // ✅ FIX: El icono está dentro del asar, así que __dirname funciona
    const iconPath = path.join(__dirname, 'frontend', 'img', 'logo.ico');
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Loquendo Studio',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            // ✅ contextIsolation:true habilitado de nuevo. El crash 0xC0000005 de
            // decodeAudioData() era un bug de Electron 28.3.3 (issue #42271),
            // arreglado en versiones ≥29. Ahora estamos en 37.10.3.
            contextIsolation: true,
            webSecurity: true,
            sandbox: false
        }
    });

    // ✅ FIX enlaces externos: única barrera que impide abrir ventanas de Electron.
    // Cubre window.open() y target="_blank" desde cualquier frame. No afecta
    // fetch/XHR ni la navegación interna, así que los diccionarios siguen igual.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        abrirEnNavegador(url);
        return { action: 'deny' };
    });

    // Navegación de la ventana principal hacia fuera (link sin target, location.href...)
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (urlEsInterna(url)) return;
        event.preventDefault();
        abrirEnNavegador(url);
    });

    mainWindow.loadURL(`http://localhost:${BOUND_PORT}`);

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error(`💥 RENDERER MURIÓ: ${details.reason} | Código: ${details.exitCode}`);
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        }, 2000);
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// --- IPC HANDLERS ---
ipcMain.on('app-close', () => app.quit());
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });

ipcMain.on('abrir-enlace-externo', (event, url) => {
    abrirEnNavegador(url);
});

// --- CICLO DE VIDA ---
const tieneInstanciaUnica = app.requestSingleInstanceLock();

if (!tieneInstanciaUnica) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(async () => {
    try {
        console.log('[MAIN] Esperando al servidor...');
        
        // Espera a que Express haya ligado realmente un puerto (puede ser != 3000)
        BOUND_PORT = await esperarPuertoLigado();
        console.log(`[MAIN] Puerto detectado: ${BOUND_PORT}`);
        
        await waitForServer();
        console.log('[MAIN] ✅ Backend listo, creando ventana...');
        createWindow();
    } catch (err) {
        console.error('[MAIN] ❌ Error:', err.message);
        const { dialog } = require('electron');
        dialog.showErrorBox('Error Crítico', `No se pudo iniciar el servidor:\n\n${err.message}`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- LIMPIEZA TOTAL AL CERRAR (CORREGIDO) ---
app.on('before-quit', async () => {
    console.log('🧹 Limpiando caché de audio y PNGTuber...');
    
    // ✅ FIX: En producción, apuntar a resources/backend/public
    const backendPublic = isDev 
        ? path.join(__dirname, 'backend', 'public')
        : path.join(process.resourcesPath, 'backend', 'public');
    
    console.log(`[MAIN] Limpiando en: ${backendPublic}`);
    
    const carpetasALimpiar = [
        { ruta: path.join(backendPublic, 'audios'), extensiones: /\.(wav|srt|ass|mp3|mp4)$/i },
        { ruta: path.join(backendPublic, 'pngtuber'), extensiones: /\.(png|jpg|jpeg)$/i }
    ];

    for (const carpeta of carpetasALimpiar) {
        if (!fs.existsSync(carpeta.ruta)) continue;
        try {
            const archivos = await fs.promises.readdir(carpeta.ruta);
            const borrables = archivos.filter(f => carpeta.extensiones.test(f));
            await Promise.all(
                borrables.map(archivo =>
                    fs.promises.unlink(path.join(carpeta.ruta, archivo)).catch(() => {})
                )
            );
            if (borrables.length > 0) {
                console.log(`✅ ${borrables.length} temporales eliminados en ${path.basename(carpeta.ruta)}`);
            }
        } catch (err) {
            console.error(`❌ Error limpiando ${carpeta.ruta}:`, err.message);
        }
    }
    console.log('🧹 Limpieza completada.');
});