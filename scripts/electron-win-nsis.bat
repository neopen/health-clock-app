@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0\.."

:: 1. 初始化日志
if not exist logs mkdir logs
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"') do set "timestamp=%%i"
set "LOG_FILE=logs\build_nsis_%timestamp%.log"

echo ======================================== >> "%LOG_FILE%" 2>&1
echo 构建类型: NSIS 安装版 | date /t >> "%LOG_FILE%" 2>&1
echo ======================================== >> "%LOG_FILE%" 2>&1

echo ========================================
echo   HealthClock NSIS 安装版打包工具（带日志）
echo ========================================
echo 日志文件: %LOG_FILE%
echo.

echo [1/4] 清理旧文件...
rd /s /q dist release 2>nul
echo 清理完成 >> "%LOG_FILE%" 2>&1
echo.

echo [2/4] 编译项目...
call npm run build >> "%LOG_FILE%" 2>&1
if !errorlevel! neq 0 (
    echo 编译失败！详见: %LOG_FILE%
    pause & exit /b 1
)
echo 编译完成 >> "%LOG_FILE%" 2>&1
echo.

echo [3/4] 打包 NSIS 安装版...
call npx electron-builder --win --x64 --config.win.target=nsis >> "%LOG_FILE%" 2>&1
if !errorlevel! neq 0 (
    echo 打包失败！详见: %LOG_FILE%
    pause & exit /b 1
)
echo 打包完成 >> "%LOG_FILE%" 2>&1
echo.
echo ========================================
echo 打包完成！请查看 release 目录：
dir /b release\*Setup*.exe 2>nul
echo 完整日志: %LOG_FILE%
echo ========================================

echo [4/4] 分析 app.asar 结构...
call npx asar list release\win-unpacked\resources\app.asar >> "%LOG_FILE%" 2>&1
echo.


pause