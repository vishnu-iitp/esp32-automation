#!/usr/bin/env pwsh
# PowerShell script to deploy the factory-reset-device Supabase Edge Function

Write-Host "Deploying factory-reset-device Supabase Edge Function..." -ForegroundColor Green

try {
    # Deploy the function
    supabase functions deploy factory-reset-device
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ factory-reset-device function deployed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The function is now available at:" -ForegroundColor Cyan
        Write-Host "https://[YOUR_PROJECT_ID].supabase.co/functions/v1/factory-reset-device" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor White
        Write-Host "1. Upload the updated ESP32 firmware to your devices" -ForegroundColor Gray
        Write-Host "2. Test the factory reset functionality by holding the reset button for 10 seconds" -ForegroundColor Gray
        Write-Host "3. Verify that the device becomes unclaimed in your Supabase dashboard" -ForegroundColor Gray
    } else {
        Write-Host "❌ Failed to deploy function" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error during deployment: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
