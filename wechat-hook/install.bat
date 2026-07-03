@echo off
chcp 65001 >nul
title MaoMaoXia WeChat-Hook Setup

echo ========================================
echo   MaoMaoXia WeChat-Hook Installer
echo ========================================
echo.

set WECHAT_PATH=
if exist "C:\Program Files\Tencent\WeChat\WeChat.exe" set WECHAT_PATH=C:\Program Files\Tencent\WeChat
if exist "C:\Program Files\Tencent\Weixin\WeChat.exe" set WECHAT_PATH=C:\Program Files\Tencent\Weixin
if exist "C:\Program Files (x86)\Tencent\WeChat\WeChat.exe" set WECHAT_PATH=C:\Program Files (x86)\Tencent\WeChat

if "%WECHAT_PATH%"=="" (
    echo [ERROR] WeChat not found at standard paths
    echo Install WeChat first, then re-run this script
    pause
    exit /b 1
)

echo WeChat found: %WECHAT_PATH%

echo.
echo Copying version.dll to WeChat directory...
copy /Y "%~dp0version.dll" "%WECHAT_PATH%\version.dll"
if %errorlevel% neq 0 (
    echo [ERROR] Copy failed. Run this script as Administrator.
    pause
    exit /b 1
)
echo DLL copied successfully.

set NO_UPDATE_DIR=%WECHAT_PATH%\NoUpdate
if not exist "%NO_UPDATE_DIR%" (
    echo Blocking auto-update...
    mkdir "%NO_UPDATE_DIR%" 2>nul
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo Now start WeChat, then verify:
echo   http://127.0.0.1:30001/QueryDB/status
echo.
echo Response: {"IsLogin":1} = Success!
echo.
pause
