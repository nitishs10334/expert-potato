@echo off
title Offline Examination Portal Launcher
color 0F

echo ========================================================
echo         OFFLINE EXAMINATION PORTAL LAUNCHER
echo ========================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to your system PATH.
    echo.
    echo To run this portal offline, you need to install Python.
    echo.
    echo Quick steps to install:
    echo 1. Open the Microsoft Store on your computer.
    echo 2. Search for "Python" and select a recent version - like Python 3.10, 3.11, or 3.12.
    echo 3. Click "Get" / "Install" - it is completely free and official.
    echo 4. Once the installation is complete, double-click this file again!
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b
)

echo [1/3] Python detected successfully.
echo [2/3] Starting local mock test server in background...

:: Start the Python HTTP server in a separate minimized window
start "Offline Exam Server" /min python -m http.server 8080

:: Give the server 2 seconds to start up
ping -n 3 127.0.0.1 >nul

echo [3/3] Opening portal in your default browser...
start http://localhost:8080

echo.
echo ========================================================
echo PORTAL IS ACTIVE!
echo.
echo * You can now take mock tests in your browser.
echo * Do not close this command window while using the portal.
echo.
echo TO STOP THE PORTAL:
echo Press any key in this window to turn off the server.
echo ========================================================
echo.
pause

:: Kill the Python server running on port 8080 when user presses a key
echo Stopping server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo Done. Goodbye!
ping -n 3 127.0.0.1 >nul
