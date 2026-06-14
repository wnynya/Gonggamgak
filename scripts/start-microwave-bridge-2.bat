@echo off

cd /d "%USERPROFILE%\Desktop\Gonggamgak\microwave\bridge"

call npm install

node app.js -s COM4 -i 2

pause
