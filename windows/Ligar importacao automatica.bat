@echo off
rem Importa sozinho sempre que liga o telemovel (fica ativo sempre que inicia sessao no Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-Arranque.ps1"
pause
