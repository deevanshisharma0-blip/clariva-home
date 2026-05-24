@echo off
echo ============================================
echo   NexusOS — Mobile Network Mode
echo ============================================
echo.
echo Open on your phone: http://10.17.108.8:3000
echo.
set NEXUS_HOST=0.0.0.0
set NEXUS_WEB_HOST=0.0.0.0
set NEXT_PUBLIC_API_URL=http://10.17.108.8:8000
python apps\desktop\main.py
