@echo off
echo ========================================
echo  Verificando requisitos de Loquendo Studio
echo ========================================
echo.

echo [1/5] Verificando Node.js...
where node >nul 2>nul
if %errorlevel%==0 (
    echo ✅ Node.js instalado
    node --version
) else (
    echo ❌ Node.js NO está instalado
    echo Descárgalo de: https://nodejs.org
)

echo.
echo [2/5] Verificando Loquendo...
where loquendo >nul 2>nul
if %errorlevel%==0 (
    echo ✅ Loquendo instalado
) else (
    echo ⚠️ Loquendo NO encontrado en PATH
    echo Asegúrate de tener Loquendo instalado
)

echo.
echo [3/5] Verificando FFmpeg...
where ffmpeg >nul 2>nul
if %errorlevel%==0 (
    echo ✅ FFmpeg instalado
    ffmpeg -version | findstr /i "version"
) else (
    echo ⚠️ FFmpeg NO encontrado
    echo Descárgalo de: https://ffmpeg.org
)

echo.
echo [4/5] Verificando puerto 3000...
netstat -an | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo ⚠️ Puerto 3000 ya está en uso
    echo Posible conflicto con otro servicio
) else (
    echo ✅ Puerto 3000 libre
)

echo.
echo [5/5] Verificando conexión al backend...
curl -s http://localhost:3000/api/health >nul 2>nul
if %errorlevel%==0 (
    echo ✅ Backend respondiendo
) else (
    echo ⚠️ Backend no responde
)

echo.
echo ========================================
echo  Verificación completada
echo ========================================
pause