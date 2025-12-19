Write-Host "🛑 Stopping Remote Bridge..." -ForegroundColor Red

# Kill all node processes
# Since we are in a dedicated environment, killing all node processes is usually safe and effective for cleanup
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill cloudflared
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "✅ All processes stopped." -ForegroundColor Green
