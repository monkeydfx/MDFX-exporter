@echo off
REM Script para limpiar y preparar para instalar MDFX-Exporter
REM Ejecutar como Administrador

echo.
echo ================================================
echo Limpiador de MDFX-Exporter
echo ================================================
echo.

echo Paso 1: Deteniendo procesos de Electron...
taskkill /IM electron.exe /F 2>nul
taskkill /IM node.exe /F 2>nul
timeout /t 2 /nobreak

echo.
echo Paso 2: Esperando a liberar recursos...
timeout /t 3 /nobreak

echo.
echo ================================================
echo LISTO PARA INSTALAR
echo ================================================
echo.
echo Ahora ejecuta como Administrador:
echo MDFX-Exporter Setup 1.0.0.exe
echo.
pause
