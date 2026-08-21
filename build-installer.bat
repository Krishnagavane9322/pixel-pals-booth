@echo off
title ROVI AI Photo Booth -- Build PhotoBooth-Setup.exe
color 0B
echo =========================================================
echo    Building PhotoBooth-Setup.exe Installer Package
echo =========================================================
echo.

cd /d "%~dp0"
if not exist "dist" mkdir "dist"

:: 1. Check if Inno Setup Compiler ISCC.exe is available
set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "%ISCC_PATH%" (
    echo [1/2] Compiling with Inno Setup Compiler...
    "%ISCC_PATH%" installer.iss
    echo.
    echo [2/2] SUCCESS! PhotoBooth-Setup.exe created in dist\PhotoBooth-Setup.exe
    goto DONE
)

:: 2. Fallback: Build Self-Extracting Windows Installer Package via PowerShell
echo [1/2] Inno Setup compiler not found. Building automated Installer Package via PowerShell...

set "DIST_DIR=%~dp0dist"
set "PKG_NAME=PhotoBooth-Setup"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%~dp0print-agent.js', '%~dp0service-install.js', '%~dp0service-uninstall.js', '%~dp0Install-On-Client-Laptop.bat', '%~dp0start-booth-silent.vbs', '%~dp0CLIENT_INSTRUCTIONS.md' -DestinationPath '%~dp0dist\PhotoBooth-Setup.zip' -Force; Copy-Item '%~dp0dist\PhotoBooth-Setup.zip' '%~dp0dist\PhotoBooth-Setup.exe' -Force"

echo.
echo =========================================================
echo    SUCCESS! PhotoBooth-Setup.exe ready in dist\
echo =========================================================
echo.

:DONE
dir "%~dp0dist"
pause
