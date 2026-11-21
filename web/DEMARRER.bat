@echo off
chcp 65001 >nul
title OrbitBond - demarrage
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
set "NEXT_TELEMETRY_DISABLED=1"

rem --- 1. Node.js ---------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto install_node
goto node_ok

:install_node
echo [1/4] Node.js absent : installation via winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto node_missing

:node_ok
echo [1/4] Node.js :
node -v

rem --- 2. Dependances -----------------------------------------------------
if exist node_modules\next\package.json goto deps_ok
echo [2/4] Installation des dependances, 1 a 2 minutes...
call npm install
if errorlevel 1 goto fail
:deps_ok

rem --- 3. Comptes XRPL Testnet --------------------------------------------
if exist .data\state.json findstr /c:"\"setupAt\"" .data\state.json >nul 2>nul
if exist .data\state.json if not errorlevel 1 goto setup_ok
echo [3/4] Creation et configuration des comptes XRPL Testnet, 2 a 4 minutes...
call npm run setup
if errorlevel 1 goto fail
:setup_ok

rem --- 4. Site ---------------------------------------------------------------
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if errorlevel 1 goto start_dev
echo Le site tourne deja sur http://localhost:3000
if not defined OB_NO_BROWSER start "" http://localhost:3000
exit /b 0

:start_dev
echo [4/4] Lancement du site sur http://localhost:3000  -  fermez cette fenetre pour arreter.
if not defined OB_NO_BROWSER start "" cmd /c "timeout /t 10 >nul & start http://localhost:3000"
call npm run dev
pause
exit /b 0

:node_missing
echo.
echo Node.js n'a pas pu etre installe automatiquement.
echo Installez-le depuis https://nodejs.org - bouton LTS - puis relancez DEMARRER.bat
pause
exit /b 1

:fail
echo.
echo ECHEC - voir les messages ci-dessus. Relancez DEMARRER.bat : la configuration reprend la ou elle s'est arretee.
pause
exit /b 1
