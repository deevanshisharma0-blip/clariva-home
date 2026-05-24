@echo off
title NexusOS — Autonomous Commerce Intelligence
cd /d "%~dp0"

:: Clear Electron sandbox var (safety)
set "ELECTRON_RUN_AS_NODE="

echo.
echo  ╔══════════════════════════════════════╗
echo  ║       NEXUS OS — Launching           ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Run install.bat first.
    pause & exit /b 1
)

:: Check dependencies installed
python -c "import webview" >nul 2>&1
if errorlevel 1 (
    echo Installing missing dependencies...
    call install.bat
)

echo Starting NexusOS Desktop...
python apps\desktop\main.py

if errorlevel 1 (
    echo.
    echo NexusOS exited with an error.
    pause
)
