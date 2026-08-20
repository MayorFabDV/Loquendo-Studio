<#
PowerShell helper para construir evitando locks en bin\ffmpeg.exe.
Comportamiento:
- Si existe bin\ffmpeg.exe lo mueve a %TEMP%.
- Ejecuta npx electron-builder (evita el prebuild de npm).
- Restaura ffmpeg.exe al final, incluso si hay errores.

Uso:
  .\scripts\build_safe.ps1 [args...]
Ejemplo:
  .\scripts\build_safe.ps1 --win --x64
#>

param()

# directorio del script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
# raíz del proyecto es la carpeta superior a `scripts`
$projectRoot = Split-Path -Parent $scriptDir
$src = Join-Path $projectRoot 'bin\ffmpeg.exe'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ffmpeg-build-temp-{0}.exe" -f ([guid]::NewGuid().ToString()))
$moved = $false

# Helper: test if file is locked by attempting exclusive open
function Test-FileLocked {
    param([string]$file)
    try {
        $stream = [System.IO.File]::Open($file, 'Open', 'ReadWrite', 'None')
        if ($stream) { $stream.Close(); return $false }
        return $false
    } catch {
        return $true
    }
}

# Helper: try to find and kill processes holding the handle using handle.exe
function Run-HandleAndKill {
    param([string]$targetName)
    $handleExe = Get-Command handle.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
    if (-not $handleExe) {
        # Attempt to download Handle.zip from Sysinternals to temp
        $zipUrl = 'https://download.sysinternals.com/files/Handle.zip'
        $dl = Join-Path ([IO.Path]::GetTempPath()) ("handle_{0}.zip" -f ([guid]::NewGuid().ToString()))
        try {
            Write-Host "Descargando handle.exe..."
            Invoke-WebRequest -Uri $zipUrl -OutFile $dl -UseBasicParsing -ErrorAction Stop
            $tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("handle_{0}" -f ([guid]::NewGuid().ToString()))
            New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
            Expand-Archive -Path $dl -DestinationPath $tmpDir -Force
            $maybe = Join-Path $tmpDir 'handle.exe'
            if (Test-Path $maybe) { $handleExe = $maybe }
        } catch {
            Write-Warning ("No se pudo descargar handle.exe: " + $_)
            return $false
        }
    }

    if (-not $handleExe) { Write-Warning "handle.exe no disponible"; return $false }

    try {
        Write-Host "Ejecutando handle.exe para buscar locks de '$targetName'..."
        $out = & $handleExe $targetName -nobanner 2>&1
        $pids = @()
        foreach ($line in $out) {
            if ($line -match 'pid:\s*(\d+)') { $pids += [int]$Matches[1] }
            elseif ($line -match '\s+(\w+)\s+pid:\s*(\d+)\s') { $pids += [int]$Matches[2] }
        }
        $pids = $pids | Select-Object -Unique
        if ($pids.Count -eq 0) { Write-Host "No se encontraron PIDs con handle.exe"; return $false }
        foreach ($pid in $pids) {
            try {
                Write-Host ("Matando PID: " + $pid)
                taskkill /PID $pid /F | Out-Null
            } catch { Write-Warning ("No se pudo matar PID " + $pid + ": " + $_) }
        }
        return $true
    } catch {
        Write-Warning ("handle.exe falló: " + $_)
        return $false
    }
}

try {
    Write-Host ("Script dir: " + $scriptDir)
    Write-Host ("Project root: " + $projectRoot)
    Write-Host ("Buscando ffmpeg en: " + $src)
    if (Test-Path $src) {
        # Si está bloqueado, intentar identificar y liberar el handle
        if (Test-FileLocked $src) {
            Write-Warning "El archivo $src parece estar bloqueado. Intentando identificar proceso..."
            $killed = Run-HandleAndKill (Split-Path $src -Leaf)
            if ($killed) { Start-Sleep -Seconds 2 }
        }

        Write-Host ("Moviendo ffmpeg.exe a temporal: " + $tmp)
        Move-Item -Path $src -Destination $tmp -Force
        $moved = $true
    } else {
        Write-Host ("No se encontro " + $src + " - continuara el build (asegure ffmpeg si lo necesita).")
    }

    Write-Host "Ejecutando electron-builder via npx (reintentos habilitados)..."
    $allArgsArray = @()
    if ($args) { $allArgsArray = $args }
    $maxAttempts = 3
    $attempt = 0
    $success = $false
    while ($attempt -lt $maxAttempts -and -not $success) {
        $attempt++
        Write-Host ("Intento $attempt de $maxAttempts...")
        & npx electron-builder @allArgsArray
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) { $success = $true; break }
        Write-Warning ("electron-builder falló con código $exitCode. Esperando antes de reintentar...")
        Start-Sleep -Seconds (5 * $attempt)
        # Si el problema parece EBUSY, volver a intentar liberar lock
        if (Test-Path $src -and (Test-FileLocked $src)) {
            Write-Host "Reintentando liberar lock sobre $src"
            Run-HandleAndKill (Split-Path $src -Leaf) | Out-Null
        }
    }
    if (-not $success) { throw ("electron-builder fallo con codigo " + $exitCode) }

} catch {
    Write-Error ("Error durante build: " + $_)
    exit 1
} finally {
    if ($moved -and (Test-Path $tmp)) {
        Write-Host ("Restaurando ffmpeg.exe desde temporal a " + $src)
        try { Move-Item -Path $tmp -Destination $src -Force } catch { Write-Warning ("No se pudo restaurar ffmpeg.exe: " + $_) }
    }
}

Write-Host "Build terminado."