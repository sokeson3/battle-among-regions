@echo off
echo ============================================
echo   Battle Among Regions — Dev Launch
echo ============================================
echo.
echo Building latest source code...
cd /d "%~dp0"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed! Fix any errors above and try again.
    pause
    exit /b 1
)
echo.
echo Starting dev server...
start "BaR Server" cmd /c "npm run dev"
