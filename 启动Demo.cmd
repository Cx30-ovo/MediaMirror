@echo off
chcp 65001 >nul
setlocal
title MediaMirror Demo
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org/
  pause
  exit /b 1
)
node "%~dp0scripts\start-demo.mjs" %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
endlocal
