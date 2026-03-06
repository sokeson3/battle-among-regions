@echo off
echo ============================================
echo   Battle Among Regions — Local Server
echo ============================================
echo.
echo Starting Stripe webhook listener...
start "Stripe Listener" cmd /c "C:\Users\simon\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe listen --forward-to localhost:4000/api/stripe/webhook"
echo Starting server on port 4000...
echo Press Ctrl+C to stop the server.
echo.
cd /d "%~dp0"
node --env-file=.env server/server.mjs
