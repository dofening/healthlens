@echo off
rem Copyright (c) 2026 dofen. Licensed under the MIT License.
rem Creates "HealthLens" shortcuts on the Desktop and in the Start menu (runs tools\setup-shortcut.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup-shortcut.ps1"
echo.
pause
