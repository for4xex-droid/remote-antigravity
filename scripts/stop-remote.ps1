# Remote Bridge 停止スクリプト (Windows PowerShell)
# 使い方: .\scripts\stop-remote.ps1

Write-Host "🛑 Stopping Remote Bridge environment..." -ForegroundColor Yellow

# ポート3000, 3001を使用しているプロセスを終了
$ports = @(3000, 3001)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "  Stopping $($process.Name) (PID: $($process.Id)) on port $port" -ForegroundColor Gray
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# cloudflaredプロセスを終了
$cloudflared = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($cloudflared) {
    Write-Host "  Stopping cloudflared tunnels..." -ForegroundColor Gray
    $cloudflared | Stop-Process -Force -ErrorAction SilentlyContinue
}

# nodeプロセスで wait-for-change を実行中のものがあれば終了
# (注意: 他のnodeプロセスは終了しない)

Write-Host ""
Write-Host "✅ Remote Bridge environment stopped." -ForegroundColor Green
