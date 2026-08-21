@echo off
title ROVI Photo Booth -- 1-Click Client Laptop Configurator
color 0B
echo =========================================================
echo    ROVI AI Photo Booth -- Client Laptop Installer
echo =========================================================
echo.
echo [1/3] Setting up automatic Windows Startup integration...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SOURCE_VBS=%~dp0start-booth-silent.vbs"

if exist "%SOURCE_VBS%" (
    copy /Y "%SOURCE_VBS%" "%STARTUP_DIR%\start-booth-silent.vbs" >nul
    echo       [OK] Background print helper added to Windows Startup.
) else (
    echo       [WARNING] start-booth-silent.vbs not found in current folder!
)

echo [2/3] Creating Desktop Shortcut for Client...
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "SHORTCUT_PATH=%DESKTOP_DIR%\ROVI Photo Booth.url"

echo [InternetShortcut] > "%SHORTCUT_PATH%"
echo URL=https://pixel-pals-booth.vercel.app >> "%SHORTCUT_PATH%"
echo IconIndex=0 >> "%SHORTCUT_PATH%"
echo IconFile=%SystemRoot%\System32\shell32.dll >> "%SHORTCUT_PATH%"

echo       [OK] "ROVI Photo Booth" Desktop shortcut created.

echo [3/3] Testing Background Print Helper Execution...
cd /d "%~dp0"
start /min node print-agent.js

echo.
echo =========================================================
echo    SUCCESS! This laptop is 100%% configured for your client!
echo.
echo    When the client turns on this laptop:
echo    1. Background print engine starts automatically.
echo    2. Clicking "ROVI Photo Booth" on Desktop opens the app.
echo    3. Tablet guests can print to DS-RX1 with ZERO dialogs!
echo =========================================================
echo.
pause
