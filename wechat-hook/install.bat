@echo off
echo ========================================
echo   猫猫侠 WeChat-Hook 一键安装
echo ========================================
echo.

:: 检查微信是否安装
set WECHAT_PATH=
if exist "C:\Program Files\Tencent\Weixin\WeChat.exe" set WECHAT_PATH=C:\Program Files\Tencent\Weixin
if exist "C:\Program Files (x86)\Tencent\WeChat\WeChat.exe" set WECHAT_PATH=C:\Program Files (x86)\Tencent\WeChat

if "%WECHAT_PATH%"=="" (
    echo [错误] 未找到微信安装目录！
    echo 请先安装微信 4.1.10.27 版本
    pause
    exit /b 1
)

echo 找到微信: %WECHAT_PATH%

:: 检查微信版本
echo 检查微信版本...
if exist "%WECHAT_PATH%\WeChat.exe" (
    powershell -Command "(Get-Item '%WECHAT_PATH%\WeChat.exe').VersionInfo.ProductVersion" 2>nul
)

:: 复制 DLL
echo.
echo 复制 version.dll 到微信目录...
copy /Y "%~dp0version.dll" "%WECHAT_PATH%\version.dll"
if %errorlevel% neq 0 (
    echo [错误] 复制失败！请以管理员身份运行此脚本。
    pause
    exit /b 1
)
echo 复制成功！

:: 防止微信自动更新
set NO_UPDATE_DIR=%WECHAT_PATH%\NoUpdate
if not exist "%NO_UPDATE_DIR%" (
    echo 创建防更新目录...
    mkdir "%NO_UPDATE_DIR%"
)

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 现在可以启动微信了。启动后访问以下地址验证：
echo http://127.0.0.1:30001/QueryDB/status
echo.
echo 返回 {"IsLogin":1} 表示成功！
echo.
pause
