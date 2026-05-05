@echo off
setlocal

echo ============================================================
echo Gerando executavel Windows - Assistente de Audiodescricao
echo ============================================================

python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller

if exist third_party\ffmpeg\bin\ffmpeg.exe (
  if exist third_party\ffmpeg\bin\ffprobe.exe (
    echo FFmpeg portatil encontrado. Incluindo no executavel...
    pyinstaller --noconfirm --clean --onefile --name AssistenteAudioDescricao ^
      --add-data "app\templates;app\templates" ^
      --add-data "app\static;app\static" ^
      --add-binary "third_party\ffmpeg\bin\ffmpeg.exe;third_party\ffmpeg\bin" ^
      --add-binary "third_party\ffmpeg\bin\ffprobe.exe;third_party\ffmpeg\bin" ^
      run.py
    goto :done
  )
)

echo FFmpeg portatil nao encontrado. O executavel sera gerado, mas o computador precisara ter FFmpeg instalado.
pyinstaller --noconfirm --clean --onefile --name AssistenteAudioDescricao ^
  --add-data "app\templates;app\templates" ^
  --add-data "app\static;app\static" ^
  run.py

:done
echo.
echo Pronto. Veja o executavel em dist\AssistenteAudioDescricao.exe
echo.
pause
