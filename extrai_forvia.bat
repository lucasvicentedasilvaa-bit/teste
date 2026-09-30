@echo off
REM ============================================================
REM extrai_forvia.bat
REM Coloque este arquivo e o "extrai_forvia.ps1" (mesma pasta)
REM dentro da pasta onde estao os zips de encerramento.
REM
REM Duas formas de usar:
REM   1) Dois cliques neste .bat -> processa TODOS os .zip da pasta.
REM   2) Selecione varios .zip e arraste-os em cima deste .bat
REM      -> processa apenas os zips arrastados.
REM
REM Os zips sao processados em paralelo (varios ao mesmo tempo).
REM O resultado sai em "extracao_forvia.csv" na mesma pasta deste
REM .bat (abre bem no Excel).
REM ============================================================
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist "%SCRIPT_DIR%extrai_forvia.ps1" (
    echo Erro: nao encontrei "extrai_forvia.ps1" na mesma pasta deste .bat.
    echo Coloque os dois arquivos juntos e tente novamente.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%extrai_forvia.ps1" %*
endlocal
