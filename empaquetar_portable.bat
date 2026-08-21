@echo off
chcp 65001 >nul
title Empaquetador Loquendo Studio - Portable ZIP
cls
color 0B

echo ============================================
echo   EMPAQUETADOR PORTABLE ZIP
echo   Loquendo Studio
echo ============================================
echo.

set "PROJECT_DIR=%~dp0"
set "SOURCE=%PROJECT_DIR%dist\win-unpacked"
set "PACKAGE_JSON=%PROJECT_DIR%package.json"

REM Obtener version desde package.json
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%PACKAGE_JSON%' | ConvertFrom-Json).version"') do set "VERSION=%%a"
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%PACKAGE_JSON%' | ConvertFrom-Json).build.productName"') do set "APP_NAME=%%a"

if not defined VERSION set "VERSION=1.0.0"
if not defined APP_NAME set "APP_NAME=LoquendoStudio"

set "ZIP_NAME=%APP_NAME%-v%VERSION%-portable.zip"
set "OUTPUT=%PROJECT_DIR%dist\%ZIP_NAME%"

echo [1/4] Verificando carpeta fuente...
if not exist "%SOURCE%" (
    echo.
    echo    ERROR: No se encontro %SOURCE%
    echo    Primero ejecuta: npm run build
    echo    o: npx electron-builder --win dir
    echo.
    pause
    exit /b 1
)
echo    OK - Carpeta encontrada
echo.

echo [2/4] Limpiando ZIP anterior...
if exist "%OUTPUT%" (
    del /q "%OUTPUT%"
    echo    ZIP anterior eliminado
) else (
    echo    No habia ZIP anterior
)
echo.

echo [3/4] Comprimiendo win-unpacked...
echo    Esto puede tardar unos segundos...
echo    Origen:  %SOURCE%
echo    Destino: %OUTPUT%
echo.

powershell -NoProfile -Command "
    $source = '%SOURCE%';
    $output = '%OUTPUT%';
    $compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal;
    Add-Type -AssemblyName System.IO.Compression.FileSystem;
    [System.IO.Compression.ZipFile]::CreateFromDirectory($source, $output, $compressionLevel, $false);
"

if not exist "%OUTPUT%" (
    echo.
    echo    ERROR: No se pudo crear el ZIP.
    pause
    exit /b 1
)

echo    OK - ZIP creado exitosamente
echo.

echo [4/4] Verificando resultado...
for %%F in ("%OUTPUT%") do (
    set "SIZE=%%~zF"
)

echo    Archivo: %ZIP_NAME%
echo    Tamano: %SIZE% bytes
echo    Ruta: %OUTPUT%
echo.

echo ============================================
echo   PORTABLE LISTO PARA DISTRIBUIR
echo ============================================
echo.
echo Instrucciones para el usuario:
echo 1. Descomprimir el ZIP en cualquier carpeta
echo 2. Ejecutar: Loquendo Studio.exe
echo 3. Listo, no requiere instalacion
echo.
pause
