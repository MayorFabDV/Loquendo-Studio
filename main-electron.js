const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- ARRANQUE DEL SERVIDOR EXPRESS ---
require('./server.js');

// --- RUTAS DE CARPETAS ---
const __base = __dirname;
const audioFolder = path.join(__base, 'public', 'audios');
const pngtuberFolder = path.join(__base, 'public', 'pngtuber');

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

    mainWindow.loadURL('http://localhost:3000');

    // DevTools solo con F12 o Ctrl+Shift+I
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    // Manejo seguro de crashes del renderer
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error(`💥 RENDERER MURIÓ: ${details.reason} | Código: ${details.exitCode}`);
        if (details.reason === 'oom') {
            console.warn('⚠️ MEMORIA AGOTADA');
        }
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        }, 2000);
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// --- IPC HANDLERS ---
ipcMain.on('app-close', () => app.quit());
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });

// --- CICLO DE VIDA ---
app.whenReady().then(() => {
    setTimeout(createWindow, 500);
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

    const carpetasALimpiar = [
        { ruta: path.join(__base, 'public', 'audios'), extensiones: /\.(wav|srt|ass|mp3|mp4)$/i },
        { ruta: path.join(__base, 'public', 'pngtuber'), extensiones: /\.(png|jpg|jpeg)$/i }
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