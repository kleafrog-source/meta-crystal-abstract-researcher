@echo off
chcp 65001 >nul
pushd "%~dp0"
echo 🚀 Запуск Мета-Кристалл приложения...
python "%~dp0start.py"
set "exitCode=%errorlevel%"
popd
pause
exit /b %exitCode%
