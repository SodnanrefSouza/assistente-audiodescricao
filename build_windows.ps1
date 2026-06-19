$ErrorActionPreference = "Stop"

Write-Host "============================================================"
Write-Host "Gerando executavel Windows - Assistente de Audiodescricao"
Write-Host "============================================================"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = (Get-Command python -ErrorAction Stop).Source
}

$oldExe = Join-Path $root "dist\AssistenteAudioDescricao.exe"
Get-Process "AssistenteAudioDescricao" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $oldExe } |
    Stop-Process -Force
Start-Sleep -Milliseconds 500

& $python -m pip install -r requirements.txt pyinstaller

$arguments = @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name", "AssistenteAudioDescricao",
    "--add-data", "app\templates;app\templates",
    "--add-data", "app\static;app\static",
    "--collect-data", "faster_whisper",
    "--collect-binaries", "ctranslate2",
    "--collect-binaries", "onnxruntime",
    "--hidden-import", "faster_whisper"
)

$ffmpeg = Join-Path $root "third_party\ffmpeg\bin\ffmpeg.exe"
$ffprobe = Join-Path $root "third_party\ffmpeg\bin\ffprobe.exe"

if (-not (Test-Path $ffmpeg)) {
    $command = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($command) {
        $ffmpeg = $command.Source
    }
}
if (-not (Test-Path $ffprobe)) {
    $command = Get-Command ffprobe -ErrorAction SilentlyContinue
    if ($command) {
        $ffprobe = $command.Source
    }
}

if ((Test-Path $ffmpeg) -and (Test-Path $ffprobe)) {
    Write-Host "Incluindo FFmpeg e FFprobe no executavel..."
    $arguments += @(
        "--add-binary", "$ffmpeg;third_party\ffmpeg\bin",
        "--add-binary", "$ffprobe;third_party\ffmpeg\bin"
    )
} else {
    Write-Warning "FFmpeg portatil nao encontrado. O computador de destino precisara ter FFmpeg instalado."
}

$arguments += "run.py"
& $python @arguments

if ($LASTEXITCODE -ne 0) {
    throw "O PyInstaller terminou com erro $LASTEXITCODE."
}

$exe = Join-Path $root "dist\AssistenteAudioDescricao.exe"
$zip = Join-Path $root "dist\AssistenteAudioDescricao_portatil.zip"
if (-not (Test-Path $exe)) {
    throw "O executavel nao foi criado em $exe."
}

Compress-Archive -LiteralPath $exe -DestinationPath $zip -Force

Write-Host ""
Write-Host "Pronto:"
Write-Host "  $exe"
Write-Host "  $zip"
