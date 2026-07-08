@echo off
SETLOCAL

IF "%~1"=="" GOTO help
IF "%~1"=="start" GOTO start
IF "%~1"=="stop" GOTO stop
IF "%~1"=="restart" GOTO restart
IF "%~1"=="status" GOTO status

:help
echo Warden Control Script
echo.
echo Usage: warden [command]
echo.
echo Commands:
echo   start     Starts the databases, backend, and frontend in the background
echo   stop      Stops the docker containers and background processes
echo   restart   Restarts the background processes
echo   status    Checks process status
GOTO end

:start
echo Starting Warden in the background...
call npm install -g pm2 >nul 2>&1
docker compose up -d
call npx pm2 start ecosystem.config.cjs
echo.
echo Warden is now running in the background!
echo You can close this command prompt safely.
echo UI is available at: http://localhost:5174/
GOTO end

:stop
echo Stopping Warden...
docker compose down
call npx pm2 delete ecosystem.config.cjs >nul 2>&1
echo Warden stopped.
GOTO end

:restart
echo Restarting Warden...
call npx pm2 restart ecosystem.config.cjs
echo Warden restarted!
GOTO end

:status
echo [Docker Status]
docker compose ps
echo.
echo [Process Status]
call npx pm2 status
GOTO end

:end
ENDLOCAL
