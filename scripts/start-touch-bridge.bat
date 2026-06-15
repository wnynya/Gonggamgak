@echo off

cd /d "%USERPROFILE%\Desktop\Gonggamgak\touch\bridge"

call npm install

node test.js -s

pause
