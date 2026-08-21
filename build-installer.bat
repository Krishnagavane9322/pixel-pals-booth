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

echo [1/2] Compiling genuine native Windows executable PhotoBooth-Setup.exe...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-installer.ps1"

echo.
echo =========================================================
echo    SUCCESS! Native PhotoBooth-Setup.exe created in dist\
echo =========================================================
echo.

:DONE
dir "%~dp0dist"
pause
