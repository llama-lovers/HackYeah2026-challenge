@echo off
cd /d "%~dp0"
uv run --locked --no-dev run.py start
if errorlevel 1 pause
