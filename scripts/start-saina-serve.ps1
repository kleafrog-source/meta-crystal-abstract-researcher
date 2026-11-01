[CmdletBinding()]
param(
    [string]$InstallDir = 'D:\tools\ollama-saina',
    [string]$ModelsDir = 'D:\models\saina-helm-models',
    [string]$HostAddress = '127.0.0.1:11435'
)

$ErrorActionPreference = 'Stop'
$ollamaExe = Join-Path $InstallDir 'ollama.exe'
$stockExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'

if (-not (Test-Path -LiteralPath $ollamaExe -PathType Leaf)) {
    throw "Saina binary not found at '$ollamaExe'. Build or install the Saina branch first; see docs/saina-ollama-windows.md."
}
if ([IO.Path]::GetFullPath($ollamaExe) -ieq [IO.Path]::GetFullPath($stockExe)) {
    throw 'Refusing to run the stock Ollama executable as the Saina runtime.'
}
if (-not (Test-Path -LiteralPath $ModelsDir -PathType Container)) {
    New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null
}

$previousHost = $env:OLLAMA_HOST
$previousModels = $env:OLLAMA_MODELS
try {
    $env:OLLAMA_HOST = $HostAddress
    $env:OLLAMA_MODELS = $ModelsDir
    Write-Host "Starting isolated Saina Ollama at http://$HostAddress"
    Write-Host "Saina model directory: $ModelsDir"
    Write-Host 'Stock Ollama on 11434 is not modified.'
    Push-Location $InstallDir
    try {
        & $ollamaExe serve
        if ($LASTEXITCODE -ne 0) { throw "Saina ollama serve exited with code $LASTEXITCODE." }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:OLLAMA_HOST = $previousHost
    $env:OLLAMA_MODELS = $previousModels
}
