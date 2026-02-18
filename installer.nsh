; Custom NSIS installer script for MDFX-Exporter
; Automatically kills running processes and uninstalls previous version

!macro customInstall
  ; Kill any running MDFX-Exporter processes
  DetailPrint "Deteniendo procesos en ejecución..."
  nsExec::Exec "taskkill /F /IM electron.exe"
  nsExec::Exec "taskkill /F /IM MDFX-Exporter.exe"
  nsExec::Exec "taskkill /F /IM node.exe"
  Sleep 2000
  
  ; Limpiar carpetas de configuración antigua
  DetailPrint "Limpiando configuración anterior..."
  SetShellVarContext current
  RMDir /r "$APPDATA\mdfx-exporter"
  RMDir /r "$LOCALAPPDATA\mdfx-exporter"
  Sleep 1000
!macroend

!macro customUnInstall
  ; Kill processes during uninstall too
  DetailPrint "Deteniendo MDFX-Exporter..."
  nsExec::Exec "taskkill /F /IM electron.exe"
  nsExec::Exec "taskkill /F /IM MDFX-Exporter.exe"
  Sleep 1000
  
  ; Opcionalmente limpiar datos del usuario
  DetailPrint "Limpiando datos de configuración..."
  SetShellVarContext current
  RMDir /r "$APPDATA\mdfx-exporter"
!macroend
