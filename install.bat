@echo off
title NexusOS — Installer
cd /d "%~dp0"
echo.
echo  ╔══════════════════════════════════════╗
echo  ║        NEXUS OS — Installing         ║
echo  ╚══════════════════════════════════════╝
echo.

:: Create .env if not exists
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [1/4] Created .env from template
) else (
    echo [1/4] .env already exists
)

:: Python deps
echo [2/4] Installing Python dependencies...
pip install -r apps\api\requirements.txt --quiet
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python 3.10+ is installed.
    pause & exit /b 1
)
echo       Done.

:: Node deps for web dashboard
echo [3/4] Installing Node.js dependencies...
cd apps\web
call npm install --legacy-peer-deps --loglevel error
if errorlevel 1 (
    echo ERROR: npm install failed.
    cd ..\..
    pause & exit /b 1
)
cd ..\..
echo       Done.

:: Create data dir
if not exist "data" mkdir data

echo.
echo [4/4] All dependencies installed!
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║  NEXT STEPS:                                         ║
echo  ║  1. Edit .env — add your ANTHROPIC_API_KEY           ║
echo  ║  2. Double-click launch.bat to start NexusOS         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
