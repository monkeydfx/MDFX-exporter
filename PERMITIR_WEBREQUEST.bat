@echo off
REM Script para permitir WebRequest en MetaTrader 5
REM Este script necesita ejecutarse UNA SOLA VEZ

setlocal enabledelayedexpansion

echo.
echo ============================================
echo Permitir WebRequest en MetaTrader 5
echo ============================================
echo.

REM Buscar la ruta de MetaTrader 5
set "MT5_PATH="

REM Opción 1: Buscar en rutas comunes
if exist "C:\Program Files\MetaTrader 5\terminal.exe" (
    set "MT5_PATH=C:\Program Files\MetaTrader 5"
    goto found
)

if exist "C:\Program Files (x86)\MetaTrader 5\terminal.exe" (
    set "MT5_PATH=C:\Program Files (x86)\MetaTrader 5"
    goto found
)

if exist "%LOCALAPPDATA%\VirtualStore\Program Files\MetaTrader 5\terminal.exe" (
    set "MT5_PATH=%LOCALAPPDATA%\VirtualStore\Program Files\MetaTrader 5"
    goto found
)

echo No se encontró MetaTrader 5 en las rutas estándar.
echo Por favor, ingresa la ruta manualmente:
set /p MT5_PATH="Ruta de MetaTrader 5: "

:found
echo.
echo Ruta encontrada: %MT5_PATH%
echo.

REM Buscar todas las carpetas de terminales
set "TERMINAL_COUNT=0"

for /d %%D in ("%APPDATA%\MetaQuotes\Terminal\*") do (
    set /a TERMINAL_COUNT+=1
    set "TERMINAL_!TERMINAL_COUNT!=%%D"
    echo [!TERMINAL_COUNT!] %%~nxD
)

if %TERMINAL_COUNT% equ 0 (
    echo No se encontraron terminales de MetaTrader.
    pause
    exit /b 1
)

echo.
echo ============================================
echo NOTA IMPORTANTE:
echo ============================================
echo Para permitir WebRequest, debes hacer lo siguiente en CADA terminal:
echo.
echo 1. Abre MetaTrader 5
echo 2. Ve a: Herramientas ^> Opciones ^> Expert Advisors
echo 3. Marca la opcion: "Allow WebRequest for listed URLs"
echo 4. En el campo de URLs, agrega:
echo    https://trading-journal-preprod.monkeydfx-trader.workers.dev
echo 5. Haz click en OK
echo 6. REINICIA MetaTrader 5
echo.
echo Este script NO puede modificar archivos cifrados de MT5.
echo Debe hacerse manualmente.
echo.
pause
