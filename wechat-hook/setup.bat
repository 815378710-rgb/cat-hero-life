@echo off
chcp 65001 >nul
title MaoMaoXia Bot Setup

echo ========================================
echo   Cat Hero WeChat Bot Setup
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install Python 3.9+ first.
    pause
    exit /b 1
)
echo Python OK

:: Install wxhook
echo Installing wxhook...
pip install wxhook requests -q
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed
    pause
    exit /b 1
)
echo wxhook installed

:: Check if WeChat is installed
set WECHAT_FOUND=0
if exist "D:\Weixin\Weixin.exe" set WECHAT_FOUND=1
if exist "C:\Program Files\Tencent\WeChat\WeChat.exe" set WECHAT_FOUND=1
if exist "C:\Program Files\Tencent\Weixin\WeChat.exe" set WECHAT_FOUND=1

if %WECHAT_FOUND%==0 (
    echo.
    echo WeChat not found. Installing WeChat 3.9.5.81...
    if exist "WeChatSetup-3.9.5.81.exe" (
        WeChatSetup-3.9.5.81.exe /S
        echo Installation started. Wait for it to complete.
    ) else (
        echo Download WeChat 3.9.5.81 from:
        echo https://github.com/tom-snow/wechat-windows-versions/releases/tag/v3.9.5.81
        pause
    )
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Run: python bot.py
echo.
echo The bot will:
echo   1. Start WeChat
echo   2. Auto-learn your contact (first message)
echo   3. Only reply to that one person
echo.
pause
