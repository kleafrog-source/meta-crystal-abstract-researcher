@echo off
chcp 65001 >nul
pushd "%~dp0"
echo Starting Meta-Crystal production server...
python "%~dp0start.py" --production
set "exitCode=%errorlevel%"
popd
pause
exit /b %exitCode%
