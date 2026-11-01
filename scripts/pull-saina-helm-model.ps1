[CmdletBinding()]
param(
    [string]$InstallDir = 'D:\tools\ollama-saina',
    [string]$HostAddress = '127.0.0.1:11435',
    [string]$Model = 'run-saina/saina-helm-3-0.8b'
)

$ErrorActionPreference = 'Stop'
$ollamaExe = Join-Path $InstallDir 'ollama.exe'
$stockExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $ollamaExe -PathType Leaf)) {
    throw "Saina binary not found at '$ollamaExe'. See docs/saina-ollama-windows.md."
}
if ([IO.Path]::GetFullPath($ollamaExe) -ieq [IO.Path]::GetFullPath($stockExe)) {
    throw 'Refusing to pull through the stock Ollama executable.'
}

$previousHost = $env:OLLAMA_HOST
try {
    $env:OLLAMA_HOST = "http://$HostAddress"
    & $ollamaExe pull $Model
    if ($LASTEXITCODE -ne 0) { throw "Saina model pull exited with code $LASTEXITCODE." }
}
finally {
    $env:OLLAMA_HOST = $previousHost
}
