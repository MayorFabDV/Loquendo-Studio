param([string]$StudioPath = '', [string]$Voice = 'Leonor', [string]$ControlVoice = '',
      [string]$OutputParent = '', [switch]$NoPause)
$ErrorActionPreference = 'Stop'
try {
    if (-not $StudioPath) { $StudioPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')) }
    function Find-Backend([string]$Root) {
        foreach ($candidate in @((Join-Path $Root 'backend'), (Join-Path $Root 'resources\backend'), $Root)) {
            if ((Test-Path -LiteralPath (Join-Path $candidate 'python\python.exe')) -and
                (Test-Path -LiteralPath (Join-Path $candidate 'modules\generar_voz.py'))) { return $candidate }
        }
        return $null
    }
    $backend = Find-Backend $StudioPath
    if (-not $backend) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Selecciona la carpeta de Loquendo Studio (o resources\backend). No se modificara su contenido.'
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
        $StudioPath = $dialog.SelectedPath
        $backend = Find-Backend $StudioPath
        $dialog.Dispose()
    }
    if (-not $backend) { throw 'No se encontro el Python embebido y el script de voz. Elige la carpeta de la aplicacion extraida o instalada.' }
    $arguments = @('-B', (Join-Path $PSScriptRoot 'diagnostico_sapi.py'), '--studio', $StudioPath, '--voice', $Voice)
    if ($ControlVoice) { $arguments += @('--control', $ControlVoice) }
    if ($OutputParent) { $arguments += @('--output-parent', $OutputParent) }
    & (Join-Path $backend 'python\python.exe') @arguments
    if ($LASTEXITCODE -ne 0) { throw 'El diagnostico no termino. Conserva el mensaje mostrado.' }
    if (-not $NoPause) { Read-Host 'Comparte solo para_compartir.zip de la carpeta indicada. Pulsa Entrar para salir' }
} catch {
    Write-Error $_
    exit 1
}
