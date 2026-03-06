@echo off
echo ============================================
echo   Battle Among Regions — Local Dev Mode
echo ============================================
echo.
echo This launches everything you need to test
echo online gameplay locally:
echo   - Game Server (port 4000)
echo   - Vite Dev Server (port 3000)
echo   - Electron Client
echo.
cd /d "%~dp0"

echo [1/3] Starting game server...
start "BaR Server" cmd /c "node --env-file=.env server/server.mjs"

echo [2/3] Starting Vite dev server...
start "BaR Vite" cmd /c "npx vite --port 3000"

echo [3/3] Waiting for dev server to start...
timeout /t 4 /nobreak >nul

echo Launching Electron in dev mode...
set ELECTRON_DEV=true
start "" npx electron .

echo.
echo All running! To test online:
echo   - Open a second browser tab at http://localhost:3000
echo   - Or run another "npx electron ." with ELECTRON_DEV=true
echo.
