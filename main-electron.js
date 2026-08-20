const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- ARRANQUE DEL SERVIDOR EXPRESS ---
require('./server.js'); 

// --- RUTAS DE CARPETAS ---
const __base = __dirname;
const audioFolder = path.join(__base, 'public', 'audios');

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
      nodeIntegration: true,       // ✅ Confirmado que funciona
      contextIsolation: false,     // ✅ Confirmado que funciona
      webSecurity: false           // ✅ CLAVE: Evita bloqueos de permisos con blobs/archivos locales grandes (previene el crash -1073741819)
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  // ✅ 1. DEVTOOLS PROFESIONAL: Solo se abre con F12 o Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // ✅ 2. MANEJO SEGURO DE CRASHES: Evita el bucle infinito de "pantalla blanca"
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`💥 EL RENDERER MURIÓ. Razón: ${details.reason} | Código: ${details.exitCode}`);
    
    if (details.reason === 'oom') {
      console.warn('⚠️ ¡MEMORIA AGOTADA! El archivo de audio es demasiado pesado para decodificar en RAM.');
    }
    
    // Recarga con delay para no saturar la CPU en un bucle
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- 3. IPC HANDLERS (Comunicación Frontend -> Backend) ---
ipcMain.on('app-close', () => {
  app.quit();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

// --- CICLO DE VIDA DE ELECTRON ---
app.whenReady().then(() => {
  // Pequeño delay para asegurar que el servidor Express (puerto 3000) esté listo
  setTimeout(createWindow, 500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- 4. LIMPIEZA INTELIGENTE AL CERRAR (¡Protege tus videos!) ---
app.on('before-quit', async () => {
  console.log('🧹 Limpiando archivos temporales de audio...');
  
  if (fs.existsSync(audioFolder)) {
    try {
      const archivos = await fs.promises.readdir(audioFolder);
      
      // ⚠️ IMPORTANTE: Solo borramos .wav y .srt. 
      // NUNCA borramos .mp4 para que el usuario no pierda sus videos PNGTuber.
      const borrables = archivos.filter(f => /\.(wav|srt)$/i.test(f));
      
      await Promise.all(
        borrables.map(archivo => 
          fs.promises.unlink(path.join(audioFolder, archivo)).catch(() => {})
        )
      );
      
      console.log(`✅ ${borrables.length} archivos temporales eliminados.`);
    } catch (err) {
      console.error('❌ Error limpiando temporales:', err.message);
    }
  }
});