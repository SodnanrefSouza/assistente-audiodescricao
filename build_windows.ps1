Write-Host "============================================================"
Write-Host "Gerando executavel Windows - Assistente de Audiodescricao"
Write-Host "============================================================"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller

$ffmpeg = "third_party\ffmpeg\bin\ffmpeg.exe"
$ffprobe = "third_party\ffmpeg\bin\ffprobe.exe"

if ((Test-Path $ffmpeg) -and (Test-Path $ffprobe)) {
    Write-Host "FFmpeg portatil encontrado. Incluindo no executavel..."
    pyinstaller --noconfirm --clean --onefile --name AssistenteAudioDescricao `
      --add-data "app\templates;app\templates" `
      --add-data "app\static;app\static" `
      --add-binary "third_party\ffmpeg\bin\ffmpeg.exe;third_party\ffmpeg\bin" `
      --add-binary "third_party\ffmpeg\bin\ffprobe.exe;third_party\ffmpeg\bin" `
      run.py
} else {
    Write-Host "FFmpeg portatil nao encontrado. O executavel precisara de FFmpeg instalado no computador."
    pyinstaller --noconfirm --clean --onefile --name AssistenteAudioDescricao `
      --add-data "app\templates;app\templates" `
      --add-data "app\static;app\static" `
      run.py
}

Write-Host "Pronto. Veja o executavel em dist\AssistenteAudioDescricao.exe"
