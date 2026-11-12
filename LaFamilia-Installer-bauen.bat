@echo off
setlocal
cd /d "%~dp0"
title La Familia - Windows Installer bauen
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte https://nodejs.org/ aufrufen.
  pause
  exit /b 1
)
if not defined LA_FAMILIA_UPDATES_OWNER (
  echo [Hinweis] Kein Update-Repository angegeben. Dieses Setup wird nur zum Testen gebaut.
)
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto :failed
call npm.cmd run check
if errorlevel 1 goto :failed
call npm.cmd test
if errorlevel 1 goto :failed
call npm.cmd run dist:win
if errorlevel 1 goto :failed
start "" "%~dp0dist"
echo.
echo LaFamilia-Setup.exe wurde in dist erzeugt.
pause
exit /b 0
:failed
echo.
echo Build fehlgeschlagen. Bitte die Fehlermeldung im Terminal ansehen.
pause
exit /b 1
