@echo off

cd /d "%USERPROFILE%\Desktop\Gonggamgak\microwave\bridge"

call npm install

node app.js -s COM5 -i 1

pause
