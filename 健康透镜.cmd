@echo off
rem Copyright (c) 2026 dofen. Licensed under the MIT License.
rem HealthLens launcher: opens the app in a Microsoft Edge app window.
rem Data is kept next to this file in data\edge-profile (not on drive C:).
setlocal EnableExtensions
set "ROOT=%~dp0"
set "PAGE=%ROOT%app\index.html"
set "EDGE="
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul ^| find "REG_"') do set "EDGE=%%B"
if defined EDGE if not exist "%EDGE%" set "EDGE="
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE (
  rem No Edge found: fall back to the default browser.
  start "" "%PAGE%"
  exit /b 0
)
set "URL=file:///%PAGE:\=/%"
start "" "%EDGE%" --app="%URL%" --user-data-dir="%ROOT%data\edge-profile" --no-first-run --no-default-browser-check --window-size=1480,940
exit /b 0
