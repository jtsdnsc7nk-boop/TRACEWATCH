@echo off
REM TraceWatch for Windows:  start.bat          start (installs and builds on first run)
REM                         start.bat update   pull the latest version, then start
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo TraceWatch needs Node.js 20 or newer.
  echo Install it with:  winget install OpenJS.NodeJS.LTS
  echo or download it from https://nodejs.org
  pause
  exit /b 1
)

node scripts\tracewatch.mjs %*
if errorlevel 1 pause
