@echo off
setlocal
cd /d "%~dp0"
title La Familia Launcher - Testversion 1.3.0
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm wurde nicht gefunden.
  echo Bitte Node.js von https://nodejs.org/ installieren und danach erneut starten.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [La Familia] Installiere Electron fuer den ersten Test ...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Die Installation ist fehlgeschlagen. Internetverbindung und npm-Fehler pruefen.
    pause
    exit /b 1
  )
)
echo [La Familia] Launcher starten ...
call npm.cmd start
if errorlevel 1 (
  echo.
  echo Launcher konnte nicht gestartet werden.
  pause
  exit /b 1
)
endlocal
