# Execute na raiz do projeto:
# powershell -ExecutionPolicy Bypass -File scripts/setup_windows.ps1

py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Write-Host "Ambiente preparado. Rode: python run.py"
