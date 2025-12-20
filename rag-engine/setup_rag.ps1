# Check if python is available
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "Error: Python is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Setting up RAG Engine environment..." -ForegroundColor Cyan

# Create venv if not exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
}

# Activate venv
$venvActivate = ".\venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
}
else {
    Write-Host "Error: Could not find venv activation script." -ForegroundColor Red
    exit 1
}

# Install requirements
Write-Host "Installing dependencies..."
pip install -r requirements.txt

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "To run the server:"
Write-Host "  1. . .\venv\Scripts\Activate.ps1"
Write-Host "  2. python server.py"
