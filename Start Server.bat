@echo off
echo ============================================
echo   Battle Among Regions — Local Server
echo ============================================
echo.
echo Starting server on port 4000...
echo Press Ctrl+C to stop the server.
echo.
cd /d "%~dp0"
node server/server.mjs
