@echo off
setlocal

cd /d "%~dp0.."

if "%PYTHON%"=="" (
    set "PYTHON=python"
)

echo Starting continuous delisting data recorder...
start "delisting recorder" cmd /c ""%PYTHON%" -m src"

echo Starting hourly recommendation report loop...
:report_loop
"%PYTHON%" -m src.scoring.report
if errorlevel 1 (
    echo Recommendation report generation failed; retrying in one hour.
)
"%PYTHON%" -m src.scoring.hip3_report
if errorlevel 1 (
    echo HIP-3 asset report generation failed; retrying in one hour.
)
"%PYTHON%" github_push_hl_delisting_data.py
if errorlevel 1 (
    echo GitHub JSON upload failed; retrying in one hour.
)
timeout /t 3600 /nobreak >nul
goto report_loop
