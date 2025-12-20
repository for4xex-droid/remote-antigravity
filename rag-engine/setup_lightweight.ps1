Write-Host "Setting up Lightweight RAG Engine..." -ForegroundColor Cyan

# Remove old venv if exists
if (Test-Path "venv") {
    Write-Host "Removing old venv..."
    Remove-Item -Recurse -Force venv
}

# Create venv
Write-Host "Creating new venv (using py launcher)..."
py -m venv venv

# Install
Write-Host "Installing lightweight dependencies..."
.\venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "Starting Server..."
.\venv\Scripts\python.exe server.py
