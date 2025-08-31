# ESP32 Device State Fetch Function Deployment Script
Write-Host "Deploying ESP32 Device State Fetch Function to Supabase..." -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
try {
    $supabaseVersion = supabase --version 2>$null
    Write-Host "Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Supabase CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install it from: https://supabase.com/docs/guides/cli" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Proceeding with deployment..." -ForegroundColor Cyan
Write-Host ""

# Deploy the new edge function
Write-Host "Deploying get-device-states function..." -ForegroundColor Yellow

try {
    supabase functions deploy get-device-states
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ SUCCESS: get-device-states function deployed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The ESP32 can now fetch device states at startup." -ForegroundColor Cyan
        Write-Host "Make sure to upload the updated Arduino code to your ESP32." -ForegroundColor Cyan
        Write-Host ""
        
        # Test the function
        Write-Host "Would you like to test the function? (y/n): " -NoNewline -ForegroundColor Yellow
        $testChoice = Read-Host
        
        if ($testChoice -eq "y" -or $testChoice -eq "Y") {
            Write-Host "Testing function with sample MAC address..." -ForegroundColor Yellow
            
            $testBody = @{
                mac_address = "AA:BB:CC:DD:EE:FF"
            } | ConvertTo-Json
            
            Write-Host "Test request body: $testBody" -ForegroundColor Gray
            Write-Host "You can test this manually with your actual ESP32 MAC address." -ForegroundColor Cyan
        }
    } else {
        Write-Host ""
        Write-Host "❌ ERROR: Failed to deploy the function." -ForegroundColor Red
        Write-Host "Please check your Supabase configuration and try again." -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host "❌ ERROR: Exception occurred during deployment: $_" -ForegroundColor Red
}

Write-Host "Deployment process completed." -ForegroundColor Cyan
Read-Host "Press Enter to exit"
