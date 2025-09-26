@echo off
REM Batch script to deploy the factory-reset-device Supabase Edge Function

echo Deploying factory-reset-device Supabase Edge Function...

supabase functions deploy factory-reset-device

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ factory-reset-device function deployed successfully!
    echo.
    echo The function is now available at:
    echo https://[YOUR_PROJECT_ID].supabase.co/functions/v1/factory-reset-device
    echo.
    echo Next steps:
    echo 1. Upload the updated ESP32 firmware to your devices
    echo 2. Test the factory reset functionality by holding the reset button for 10 seconds
    echo 3. Verify that the device becomes unclaimed in your Supabase dashboard
) else (
    echo ❌ Failed to deploy function
    exit /b 1
)

pause
