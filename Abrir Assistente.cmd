@echo off
setlocal

cd /d "%~dp0"

set "AD_ASSIST_DATA_DIR=%~dp0data"
if not defined AD_ASSIST_PORT set "AD_ASSIST_PORT=8765"

if not exist ".venv\Scripts\python.exe" (
  echo Ambiente Python local nao encontrado.
  echo Execute scripts\setup_windows.ps1 antes de abrir o assistente.
  pause
  exit /b 1
)

echo Abrindo Assistente de Audiodescricao...
echo A janela do navegador sera aberta automaticamente.
echo Para encerrar o app, feche esta janela.
echo.

".venv\Scripts\python.exe" run.py

echo.
echo O assistente foi encerrado.
pause
