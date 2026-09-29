@echo off
rem Po'lat oshxona printeri agenti — Windows uchun ishga tushirgich.
rem Agent qandaydir sababga ko'ra to'xtab qolsa (masalan kompyuter uyqudan
rem uyg'onganda tarmoq yo'qolsa), 10 soniyadan keyin o'zi qayta ishga tushadi.
title Polat - oshxona printeri agenti
cd /d "%~dp0"

:loop
node print-agent.js
echo.
echo [%date% %time%] Agent to'xtadi. 10 soniyadan keyin qayta ishga tushadi...
timeout /t 10 /nobreak >nul
goto loop
