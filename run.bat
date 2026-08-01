@echo off
setlocal EnableExtensions
cd  "c:\Users\kitan\Documents\Projects\Mission control\project-cortex\run.bat"

echo.
echo ========================================
echo   PROJECT CORTEX - LAUNCH
echo ========================================
echo.
echo Working directory:
echo   %CD%
echo.

if not exist "%~dp0requirements.txt" (
  echo ERROR: requirements.txt not found next to run.bat
  echo Expected: %~dp0requirements.txt
  echo.
  echo Run this file from inside the project-cortex folder.
  pause
  exit /b 1
)

if not exist "%~dp0app.py" (
  echo ERROR: app.py not found next to run.bat
  echo Expected: %~dp0app.py
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python was not found on PATH.
  echo Install Python 3 and try again.
  pause
  exit /b 1
)

if not exist "%~dp0venv\Scripts\python.exe" (
  echo [1/3] Creating virtual environment...
  python -m venv "%~dp0venv"
  if errorlevel 1 (
    echo ERROR: Failed to create venv.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Virtual environment already exists.
)

echo [2/3] Installing requirements...
"%~dp0venv\Scripts\python.exe" -m pip install --upgrade pip
"%~dp0venv\Scripts\python.exe" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo ERROR: pip install failed.
  pause
  exit /b 1
)

echo [3/3] Starting Project Cortex...
echo.
"%~dp0venv\Scripts\python.exe" "%~dp0app.py"

echo.
echo Server stopped.
pause
