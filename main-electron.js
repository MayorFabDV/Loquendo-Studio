// main-electron.js - Versión Final Unificada y Sin Errores
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// --- ARRANQUE DEL SERVIDOR EXPRESS ---
// Requerir el servidor y obtener la instancia exportada para conocer el puerto real
const serverModule = require('./server.js');

// --- RUTAS DE CARPETAS (Corregido para Producción/Portable) ---
const isDev = !app.isPackaged;
const __base = isDev ? __dirname : process.resourcesPath;
const audioFolder = path.join(__base, 'public', 'audios');
const pngtuberFolder = path.join(__base, 'public', 'pngtuber');

// Asegurar carpetas
[audioFolder, pngtuberFolder].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
});

// --- FUNCIÓN PARA ESPERAR AL SERVIDOR ---
// Determinar puerto enlazado por el servidor (si está disponible)
const BOUND_PORT = (serverModule && serverModule.server && serverModule.server.address && serverModule.server.address().port) || process.env.PORT || 3000;

function waitForServer(maxAttempts = 20, delay = 500) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            const req = http.get(`http://localhost:${BOUND_PORT}`, (res) => {
                console.log(`[MAIN] ✅ Servidor listo después de ${attempts} intentos`);
                resolve();
            });
            req.on('error', () => {
                if (attempts >= maxAttempts) {
                    reject(new Error('El servidor no arrancó después de ' + (maxAttempts * delay) + 'ms'));
                } else {
                    setTimeout(check, delay);
                }
            });
            req.setTimeout(500, () => req.destroy());
        };
        check();
    });
}

// --- VENTANA PRINCIPAL ---
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Loquendo Studio - Rango Leyenda',
        icon: path.join(__base, 'img', 'logo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
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

// ✅ NUEVO: Abrir enlaces en el navegador externo del sistema operativo (Para el botón de Ko-fi)
ipcMain.on('abrir-enlace-externo', (event, url) => {
    shell.openExternal(url);
});

// --- CICLO DE VIDA ---
app.whenReady().then(async () => {
    try {
        console.log('[MAIN] Esperando al servidor...');
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


// --- LIMPIEZA TOTAL AL CERRAR ---
app.on('before-quit', async () => {
    console.log('🧹 Limpiando caché de audio y PNGTuber...');
    
    // ✅ FIX: Apuntar explícitamente a la carpeta backend/public
    const backendPublic = path.join(__dirname, 'backend', 'public');
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