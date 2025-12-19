# Remote Bridge 起動スクリプト (Windows PowerShell)
# 使い方: .\scripts\start-remote.ps1

Write-Host "🧹 Cleaning up existing processes..." -ForegroundColor Yellow

# ポート3000, 3001を使用しているプロセスを終了
$ports = @(3000, 3001)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "  Killing process $($process.Name) (PID: $($process.Id)) on port $port"
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# cloudflaredプロセスも終了
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2
Write-Host "✅ Cleanup complete" -ForegroundColor Green

# ログディレクトリの準備
$logDir = Join-Path $PSScriptRoot "..\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

Write-Host ""
Write-Host "🚀 Starting Bridge Server..." -ForegroundColor Cyan
$bridgeDir = Join-Path $PSScriptRoot "..\bridge-server"
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $bridgeDir -WindowStyle Hidden -RedirectStandardOutput "$logDir\bridge.log" -RedirectStandardError "$logDir\bridge-error.log"

Write-Host "🤖 Starting Antigravity Runner..." -ForegroundColor Cyan
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "runner" -WorkingDirectory $bridgeDir -WindowStyle Hidden -RedirectStandardOutput "$logDir\runner.log" -RedirectStandardError "$logDir\runner-error.log"

Write-Host "🚀 Starting UI Server..." -ForegroundColor Cyan
$uiDir = Join-Path $PSScriptRoot "..\mobile-client"
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $uiDir -WindowStyle Hidden -RedirectStandardOutput "$logDir\ui.log" -RedirectStandardError "$logDir\ui-error.log"

Start-Sleep -Seconds 5

Write-Host "☁️ Starting Cloudflare Tunnel (Named)..." -ForegroundColor Cyan
# Named Tunnel (antigravity-link)
# config.yml is in the root directory
$configPath = Join-Path $PSScriptRoot "..\config.yml"
Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--config", $configPath, "run", "antigravity-link" -WindowStyle Hidden -RedirectStandardOutput "$logDir\tunnel.log" -RedirectStandardError "$logDir\tunnel-error.log"

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "✅ Remote Bridge environment is ACTIVE!" -ForegroundColor Green
Write-Host ""
Write-Host "🌍 Public URLs (Fixed):" -ForegroundColor Yellow
Write-Host "   Frontend: https://agent.motista.online"
Write-Host "   Backend:  https://socket.motista.online"
Write-Host ""
Write-Host "📱 Next: Run 'node wait-for-change.js' to start listening for mobile commands."
