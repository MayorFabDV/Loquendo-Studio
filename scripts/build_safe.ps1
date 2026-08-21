<#
PowerShell helper para construir evitando locks en bin\ffmpeg.exe.
Comportamiento:
- Mata procesos previos de Loquendo Studio.
- Borra dist/ con retries.
- Ejecuta npx electron-builder.
- Copia ffmpeg.exe a resources/bin/ y junto al portable.
#>
param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir
$src = Join-Path $projectRoot 'bin\ffmpeg.exe'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ffmpeg-build-temp-{0}.exe" -f ([guid]::NewGuid().ToString()))
$moved = $false

function Test-FileLocked {
    param([string]$file)
    try {
        $stream = [System.IO.File]::Open($file, 'Open', 'ReadWrite', 'None')
        if ($stream) { $stream.Close(); return $false }
        return $false
    } catch { return $true }
}

function Kill-LoquendoProcesses {
    Write-Host "Buscando procesos de Loquendo Studio..."
    $processes = Get-Process | Where-Object { 
        $_.ProcessName -like "*Loquendo*" -or 
        $_.ProcessName -like "*electron*" 
    }
    foreach ($p in $processes) {
        try {
            Write-Host ("  Matando proceso: " + $p.ProcessName + " (PID: " + $p.Id + ")")
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        } catch { Write-Warning ("No se pudo matar PID " + $p.Id) }
    }
    Start-Sleep -Seconds 2
}

function Remove-DistFolder {
    param([string]$distPath, [int]$maxAttempts = 5)
    for ($i = 1; $i -le $maxAttempts; $i++) {
        if (-not (Test-Path $distPath)) { return $true }
        try {
            Write-Host ("Intentando borrar dist/ (intento " + $i + "/" + $maxAttempts + ")...")
            Remove-Item -Path $distPath -Recurse -Force -ErrorAction Stop
            Write-Host "  OK - dist/ eliminado"
            return $true
        } catch {
            Write-Warning ("  No se pudo borrar dist/: " + $_)
            Start-Sleep -Seconds (2 * $i)
        }
    }
    return $false
}

try {
    Write-Host ("Script dir: " + $scriptDir)
    Write-Host ("Project root: " + $projectRoot)
    Write-Host ("Buscando ffmpeg en: " + $src)
    
    # 1. Matar procesos previos que bloqueen app.asar
    Kill-LoquendoProcesses
    
    # 2. Borrar dist/ si existe
    $distPath = Join-Path $projectRoot 'dist'
    if (-not (Remove-DistFolder -distPath $distPath)) {
        throw "No se pudo eliminar la carpeta dist/. Cierra la app manualmente y reintenta."
    }
    
    # 3. Mover ffmpeg.exe temporalmente para evitar lock
    if (Test-Path $src) {
        if (Test-FileLocked $src) {
            Write-Warning "ffmpeg.exe esta bloqueado. Esperando..."
            Start-Sleep -Seconds 3
        }
        Write-Host ("Moviendo ffmpeg.exe a temporal: " + $tmp)
        Move-Item -Path $src -Destination $tmp -Force
        $moved = $true
    } else {
        Write-Host ("No se encontro " + $src + " - continuara el build.")
    }

    # 4. Ejecutar electron-builder
    Write-Host "Ejecutando electron-builder via npx..."
    $maxAttempts = 3
    $attempt = 0
    $success = $false
    
    while ($attempt -lt $maxAttempts -and -not $success) {
        $attempt++
        Write-Host ("Intento " + $attempt + " de " + $maxAttempts + "...")
        & npx electron-builder
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) { $success = $true; break }
        Write-Warning ("electron-builder fallo con codigo " + $exitCode + ". Esperando...")
        Start-Sleep -Seconds (5 * $attempt)
    }
    
    if (-not $success) { 
        throw ("electron-builder fallo tras " + $maxAttempts + " intentos. Codigo: " + $exitCode) 
    }

    # 5. Restaurar ffmpeg.exe y copiar a destinos finales
    if ($moved -and (Test-Path $tmp)) {
        Write-Host ("Restaurando ffmpeg.exe a " + $src)
        Move-Item -Path $tmp -Destination $src -Force
        $moved = $false
        
        # Copiar a resources/bin/
        $destBin = Join-Path $projectRoot 'dist\win-unpacked\resources\bin'
        if (-not (Test-Path $destBin)) { 
            New-Item -ItemType Directory -Path $destBin -Force | Out-Null 
        }
        Copy-Item -Path $src -Destination $destBin -Force
        Write-Host "ffmpeg.exe copiado manualmente a resources/bin/"

        # Copiar junto al portable como fallback
        $portables = Get-ChildItem -Path (Join-Path $projectRoot 'dist') -Filter "*.exe" | 
            Where-Object { $_.Name -notmatch "Uninstall|Setup" }
        foreach ($p in $portables) {
            Copy-Item -Path $src -Destination $p.DirectoryName -Force
            Write-Host ("ffmpeg.exe copiado junto al portable: " + $p.Name)
        }
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  BUILD COMPLETADO EXITOSAMENTE"
    Write-Host "========================================"

} catch {
    Write-Error ("Error durante build: " + $_)
    exit 1
    
} finally {
    # Restaurar ffmpeg.exe si quedo en temp
    if ($moved -and (Test-Path $tmp)) {
        Write-Host ("Restaurando ffmpeg.exe desde temporal a " + $src)
        try { 
            Move-Item -Path $tmp -Destination $src -Force 
        } catch { 
            Write-Warning ("No se pudo restaurar ffmpeg.exe: " + $_) 
        }
    }
}