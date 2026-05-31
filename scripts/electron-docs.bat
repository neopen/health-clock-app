@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
echo ========================================
echo   构建 Web 版本到 docs 目录
echo ========================================
echo.

set "SOURCE=src\renderer"
set "TARGET=docs"

:: 检查源目录
if not exist "%SOURCE%" (
    echo [错误] 源目录 %SOURCE% 不存在！
    pause
    exit /b 1
)

:: 删除旧的 docs
if exist "%TARGET%" (
    echo [1/6] 删除旧的 docs 目录...
    rmdir /s /q "%TARGET%"
)

:: 创建 docs
echo [2/6] 创建 docs 目录...
mkdir "%TARGET%"

:: 复制文件
echo [3/6] 复制静态文件...
xcopy "%SOURCE%\*" "%TARGET%\" /E /H /Y /Q >nul

:: 创建 Web 适配脚本
echo [4/6] 创建 Web 适配脚本...
call :createWebAdapter > "%TARGET%\js\web-adapter.js"

:: 修改 index.html
echo [5/6] 处理 index.html...
call :processHTML "%TARGET%\index.html" "index"

:: 修改 lock.html
echo [5/6] 处理 lock.html...
call :processHTML "%TARGET%\lock.html" "lock"

:: 创建配置文件
echo [6/6] 创建配置文件...
echo clock.pengline.cn> "%TARGET%\CNAME"
echo.> "%TARGET%\.nojekyll"
(
echo User-agent: *
echo Allow: /
) > "%TARGET%\robots.txt"

echo.
echo ========================================
echo   构建完成！
echo ========================================
echo.
echo 输出目录: %TARGET%\
echo.
echo 测试: npx serve docs
echo.
pause
exit /b 0

:: ========== 创建 Web 适配脚本 ==========
:createWebAdapter
echo // Web 适配层 - 模拟 Electron 环境并修复锁屏功能
echo (function() {
echo     console.log('[Web Adapter] Initializing...');
echo.
echo     // 存储锁屏窗口引用
echo     var _lockWindow = null;
echo     var _soundInterval = null;
echo     var _audioContext = null;
echo.
echo     // 停止声音
echo     function stopSound() {
echo         if (_soundInterval) { clearInterval(_soundInterval); _soundInterval = null; }
echo         if (_audioContext) { _audioContext.close(); _audioContext = null; }
echo     }
echo.
echo     // 播放声音
echo     function playBeep() {
echo         try {
echo             var AudioContext = window.AudioContext || window.webkitAudioContext;
echo             if (!_audioContext) _audioContext = new AudioContext();
echo             if (_audioContext.state === 'suspended') _audioContext.resume();
echo             var osc = _audioContext.createOscillator();
echo             var gain = _audioContext.createGain();
echo             osc.connect(gain); gain.connect(_audioContext.destination);
echo             osc.frequency.value = 880;
echo             gain.gain.setValueAtTime(0.3, _audioContext.currentTime);
echo             gain.gain.exponentialRampToValueAtTime(0.0001, _audioContext.currentTime + 0.3);
echo             osc.start(); osc.stop(_audioContext.currentTime + 0.3);
echo         } catch(e) { console.warn('[Web] Sound failed:', e); }
echo     }
echo.
echo     // 模拟 require
echo     window.require = function(module) {
echo         if (module === 'electron') {
echo             return {
echo                 ipcRenderer: {
echo                     send: function(channel, ...args) {
echo                         if (channel === 'show-lock') {
echo                             var url = 'lock.html?duration=' + (args[0] || 60) + '^&forceLock=' + (args[1] || false);
echo                             _lockWindow = window.open(url, '_blank', 'width=' + screen.width + ',height=' + screen.height);
echo                         }
echo                     },
echo                     on: function(channel, cb) {
echo                         if (!window._ipcCallbacks) window._ipcCallbacks = {};
echo                         if (!window._ipcCallbacks[channel]) window._ipcCallbacks[channel] = [];
echo                         window._ipcCallbacks[channel].push(cb);
echo                     },
echo                     sendSync: function() { return null; }
echo                 }
echo             };
echo         }
echo         return {};
echo     };
echo.
echo     // 触发 IPC 回调
echo     window.triggerIPC = function(channel) {
echo         if (window._ipcCallbacks && window._ipcCallbacks[channel]) {
echo             window._ipcCallbacks[channel].forEach(function(cb) { try { cb(); } catch(e) {} });
echo         }
echo         if (channel === 'lock-closed') { stopSound(); _lockWindow = null; }
echo     };
echo.
echo     // 模拟文件系统
echo     window.FileSystemManager = { init: function(){}, isUsingLocalFile: function(){ return false; } };
echo     window.FileSystemUtil = { init: function(){}, readFile: function(){}, writeFile: function(){} };
echo.
echo     // 模拟 AudioModule
echo     if (!window.AudioModule) {
echo         window.AudioModule = {
echo             playAlert: function() { playBeep(); },
echo             startContinuous: function() { stopSound(); playBeep(); _soundInterval = setInterval(playBeep, 3000); },
echo             stopContinuous: function() { stopSound(); },
echo             setEnabled: function() {},
echo             resume: function() { return Promise.resolve(); }
echo         };
echo     }
echo.
echo     // 模拟 NotificationModule
echo     if (!window.NotificationModule) {
echo         window.NotificationModule = {
echo             init: function() { return Promise.resolve(false); },
echo             initWithoutWait: function() {},
echo             sendReminder: function() { return Promise.resolve(false); },
echo             sendTest: function() { return Promise.resolve(false); }
echo         };
echo     }
echo.
echo     // 禁用 Service Worker
echo     if ('serviceWorker' in navigator) {
echo         navigator.serviceWorker.register = function() { return Promise.reject(); };
echo     }
echo.
echo     console.log('[Web Adapter] Initialized');
echo })();
goto :eof

:: ========== 处理 HTML 文件 ==========
:processHTML
set "HTMLFILE=%~1"
set "TYPE=%~2"

if not exist "%HTMLFILE%" goto :eof

:: 读取文件并处理（使用 PowerShell）
powershell -Command ^
 "$html = Get-Content '%HTMLFILE%' -Raw -Encoding UTF8;" ^
 "$adapter = '<script src=\"./js/web-adapter.js\"></script>';" ^
 "$html = $html -replace '<script src=\"./js/shared/constants.js\">', ($adapter + '`n    <script src=\"./js/shared/constants.js\">');" ^
 "$notice = '<div style=\"background:#667eea;color:white;text-align:center;padding:8px;position:fixed;top:0;left:0;right:0;z-index:10000;\">⚡ Web 演示版 · <a href=\"https://github.com/neopen/active-break-clock/releases\" target=\"_blank\" style=\"color:white;text-decoration:underline;\">下载桌面版</a></div>';" ^
 "$html = $html -replace '<body>', ('<body data-mode=\"web\">' + \"`n\" + $notice);" ^
 "if ('%TYPE%' -eq 'index') { $html = $html -replace '<div class=\"app-container\">', '<div class=\"app-container\" style=\"padding-top:45px;\">'; }" ^
 "if ('%TYPE%' -eq 'lock') { $html = $html -replace '<body>', '<body style=\"padding-top:45px;\">'; }" ^
 "$html = $html -replace '<div class=\"status-bar-right\">.*?</div>', '<div class=\"status-bar-right\"></div>';" ^
 "[System.IO.File]::WriteAllText('%HTMLFILE%', $html, [System.Text.Encoding]::UTF8)"

goto :eof