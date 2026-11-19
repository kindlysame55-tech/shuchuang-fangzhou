@echo off
cd /d "%~dp0"
start "" /b node server.mjs
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:5178
echo Shu Chuang Fang Zhou preview server running at http://127.0.0.1:5178
pause
