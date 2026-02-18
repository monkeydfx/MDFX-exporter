@echo off
REM ============================================================
REM MDFX-Exporter - Script de instalación y ejecución
REM ============================================================
REM Este script:
REM 1. Detiene procesos en ejecución
REM 2. Limpia configuración antigua
REM 3. Compila si es necesario
REM 4. Instala/actualiza la aplicación
REM ============================================================

echo.
echo [*] Deteniendo procesos en ejecución...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "MDFX-Exporter.exe" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak

echo [*] Limpiando configuración antigua...
rmdir /S /Q "%APPDATA%\mdfx-exporter" >nul 2>&1
rmdir /S /Q "%LocalAppData%\mdfx-exporter" >nul 2>&1

cd /d "C:\Users\Hamza\Desktop\mt-data-bridge"

REM Verificar si el instalador existe
if exist "dist\MDFX-Exporter-1.0.exe" (
    echo [*] Instalador encontrado. Ejecutando...
    timeout /t 1 /nobreak
    start "" "dist\MDFX-Exporter-1.0.exe"
    echo [✓] MDFX-Exporter iniciado
) else (
    echo [!] Instalador no encontrado. Compilando...
    call npm run build:win
    if errorlevel 1 (
        echo [✗] Error en la compilación
        pause
        exit /b 1
    )
    
    if exist "dist\MDFX-Exporter-1.0.exe" (
        echo [*] Compilación completada. Ejecutando...
        timeout /t 1 /nobreak
        start "" "dist\MDFX-Exporter-1.0.exe"
        echo [✓] MDFX-Exporter iniciado
    ) else (
        echo [✗] Error: El archivo no se creó después de compilar
        pause
        exit /b 1
    )
)

echo.
echo [✓] Script completado
timeout /t 2 /nobreak
