@echo off
cd /d "%~dp0"
python run.py start
if errorlevel 1 pause
