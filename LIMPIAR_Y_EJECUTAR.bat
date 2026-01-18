@echo off
REM Script para limpiar caché y ejecutar MDFX-Exporter limpiamente

setlocal enabledelayedexpansion

echo.
echo ====================================
echo MDFX-Exporter - Limpieza y Ejecución
echo ====================================
echo.

REM Detener todos los procesos de Electron
echo [*] Deteniendo procesos previos...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "MDFX-Exporter.exe" >nul 2>&1
timeout /t 2 /nobreak

REM Limpiar caché de Electron
echo [*] Limpiando caché...
rmdir /S /Q "%APPDATA%\mdfx-exporter" >nul 2>&1
rmdir /S /Q "%LocalAppData%\mdfx-exporter" >nul 2>&1
rmdir /S /Q "%TEMP%\electron*" >nul 2>&1

REM Limpiar carpetas de build
echo [*] Limpiando carpetas temporales...
cd /d "C:\Users\Hamza\Desktop\mt-data-bridge"
rmdir /S /Q "dist\win-unpacked" >nul 2>&1

echo [✓] Limpieza completada
echo.

REM Ejecutar el instalador/app
echo [*] Iniciando MDFX-Exporter...
echo.

if exist "dist\MDFX-Exporter Setup 1.0.0.exe" (
    start "" "dist\MDFX-Exporter Setup 1.0.0.exe"
    echo [✓] MDFX-Exporter iniciado
) else (
    echo [ERROR] No se encontró el ejecutable
    echo Asegúrate de haber compilado primero con: npm run build:win
    pause
)

echo.
