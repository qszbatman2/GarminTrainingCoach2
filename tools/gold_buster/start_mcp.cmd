@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RECORDER_URL=%GOLD_BUSTER_RECORDER_URL%"
if "%RECORDER_URL%"=="" set "RECORDER_URL=http://127.0.0.1:8765"

set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python313\python.exe"
if exist "%PYTHON_EXE%" goto run

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3.13 -u "%SCRIPT_DIR%mcp_server.py" --recorder-url "%RECORDER_URL%"
  exit /b %ERRORLEVEL%
)

set "PYTHON_EXE=python"

:run
"%PYTHON_EXE%" -u "%SCRIPT_DIR%mcp_server.py" --recorder-url "%RECORDER_URL%"
exit /b %ERRORLEVEL%
