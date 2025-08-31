@echo off
echo Deploying ESP32 Device State Fetch Function to Supabase...
echo.

REM Check if Supabase CLI is installed
supabase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Supabase CLI is not installed or not in PATH
    echo Please install it from: https://supabase.com/docs/guides/cli
    pause
    exit /b 1
)

echo Supabase CLI found. Proceeding with deployment...
echo.

REM Deploy the new edge function
echo Deploying get-device-states function...
supabase functions deploy get-device-states

if %errorlevel% equ 0 (
    echo.
    echo ✅ SUCCESS: get-device-states function deployed successfully!
    echo.
    echo The ESP32 can now fetch device states at startup.
    echo Make sure to upload the updated Arduino code to your ESP32.
    echo.
) else (
    echo.
    echo ❌ ERROR: Failed to deploy the function.
    echo Please check your Supabase configuration and try again.
    echo.
)

echo Deployment process completed.
pause
