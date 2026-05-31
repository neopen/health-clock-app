@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo ========================================
echo   HealthClock 环境清理工具
echo ========================================
echo.
echo 将清理以下目录/文件：
echo   - dist\          (编译产物)
echo   - release\       (安装包输出)
echo   - node_modules\  (依赖包)
echo   - package-lock.json
echo.
set /p confirm="确认执行清理？(Y/N): "
if /i not "%confirm%"=="Y" (
    echo 已取消操作。
    pause
    exit /b 0
)

echo.
echo [1/3] 清理编译与输出目录...
rd /s /q dist release 2>nul && echo 完成 || echo ⚠️ 目录不存在或正被占用，跳过。
echo.

echo [2/3] 清理依赖目录...
rd /s /q node_modules 2>nul && echo 完成 || echo ⚠️ 目录不存在或正被占用，跳过。
echo.

echo [3/3] 清理锁文件...
del /f /q package-lock.json 2>nul && echo 完成 || echo ⚠️ 文件不存在，跳过。
echo.

echo [4/3] 清理缓存...
call npm run clean 2>nul && echo 完成 || echo ⚠️ 缓存不存在，跳过。
echo.
echo ========================================
echo 清理完成！将重新安装依赖
echo ========================================
echo.

echo [5/3] 重新安装依赖...
call npm install || (echo  依赖安装失败！ & pause & exit /b 1)
echo 完成
echo.

echo ========================================
echo  依赖安装完成！请查看 node_modules 目录
echo ========================================
pause