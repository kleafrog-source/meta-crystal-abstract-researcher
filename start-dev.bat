@echo off
chcp 65001 >nul
pushd "%~dp0"
echo Starting Meta-Crystal development server (webpack)...
python "%~dp0start.py" --dev
set "exitCode=%errorlevel%"
popd
pause
exit /b %exitCode%
