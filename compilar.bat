@echo off
title Compilar Loquendo Studio
color 0C

echo ========================================
echo    COMPILANDO LOQUENDO STUDIO
echo ========================================
echo.

cd /d "%~dp0"

:: ========================================
:: VERIFICAR REQUISITOS
:: ========================================
echo [1/5] Verificando requisitos...

:: Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado.
    pause
    exit /b 1
)
echo   - Node.js OK

:: package.json
if not exist "package.json" (
    echo ERROR: No se encuentra package.json
    pause
    exit /b 1
)
echo   - package.json OK

:: main-electron.js
if not exist "main-electron.js" (
    echo ERROR: No se encuentra main-electron.js
    pause
    exit /b 1
)
echo   - main-electron.js OK

:: server.js
if not exist "server.js" (
    echo ERROR: No se encuentra server.js
    pause
    exit /b 1
)
echo   - server.js OK

:: Icono
if not exist "frontend\img\logo.ico" (
    echo ADVERTENCIA: No se encuentra logo.ico
    echo    La app usara el icono por defecto de Electron
    echo    Convierte logo.png a logo.ico y guardalo en frontend\img\
    echo.
    timeout /t 3 /nobreak >nul
)
echo   - Icono verificado

:: ========================================
:: INSTALAR DEPENDENCIAS
:: ========================================
echo.
echo [2/5] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo la instalacion de dependencias
    pause
    exit /b 1
)
echo   - Dependencias instaladas

:: ========================================
:: LIMPIAR COMPILACION ANTERIOR
:: ========================================
echo.
echo [3/5] Limpiando compilacion anterior...
if exist "dist" rmdir /s /q "dist"
echo   - Limpieza completada

:: ========================================
:: COMPILAR
:: ========================================
echo.
echo [4/5] Compilando aplicacion...
echo.
echo Opciones:
echo   1) Portable (un solo .exe)
echo   2) Instalador NSIS
echo   3) Ambos
echo.
set /p OPCION="Elige una opcion (1/2/3): "

if "%OPCION%"=="1" (
    echo Compilando PORTABLE...
    call npx electron-builder --win portable
) else if "%OPCION%"=="2" (
    echo Compilando NSIS...
    call npx electron-builder --win nsis
) else if "%OPCION%"=="3" (
    echo Compilando AMBOS...
    call npx electron-builder --win portable nsis
) else (
    echo Opcion invalida. Compilando portable por defecto...
    call npx electron-builder --win portable
)

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Fallo la compilacion
    pause
    exit /b 1
)

:: ========================================
:: VERIFICAR RESULTADO
:: ========================================
echo.
echo [5/5] Verificando resultado...
if exist "dist" (
    echo.
    echo ========================================
    echo    COMPILACION COMPLETADA
    echo ========================================
    echo.
    echo Archivos generados en dist\:
    dir /b "dist\*.exe"
    echo.
    echo Ubicacion: %CD%\dist\
) else (
    echo ADVERTENCIA: No se genero la carpeta dist
)

pause