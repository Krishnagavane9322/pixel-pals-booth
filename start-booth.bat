@echo off
title ROVI AI Photo Booth Kiosk & Print Agent
color 0A
echo =========================================================
echo    ROVI AI Photo Booth -- Automated Client Launcher
echo =========================================================
echo.
echo [1/2] Launching Local Print Agent for DS-RX1 Printer...
cd /d "%~dp0"
start "ROVI Print Agent" /min node print-agent.js

echo [2/2] Waiting 2 seconds for Print Agent initialization...
timeout /t 2 /nobreak >nul

echo [3/3] Opening Photo Booth Kiosk in Fullscreen Mode...
start "" "chrome.exe" --kiosk --app=https://pixel-pals-booth.vercel.app

echo.
echo =========================================================
echo    Photo Booth is LIVE & ready for event guests!
echo =========================================================
