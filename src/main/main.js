const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const windowManager = require('./windowManager');
const { initIpcHandlers } = require('./ipcHandlers');

// ========== 日志系统 ==========

let logDir, logFile;
let logBuffer = [];
let logWriteTimer = null;
const LOG_FLUSH_INTERVAL = 1000;

function flushLogBuffer() {
    if (logBuffer.length === 0 || !logFile) return;
    const messages = logBuffer.join('');
    logBuffer = [];
    fs.writeFile(logFile, messages, { flag: 'a' }, (err) => {
        if (err) console.error('Error writing to log file:', err);
    });
}

function scheduleLogFlush() {
    if (logWriteTimer) return;
    logWriteTimer = setTimeout(() => {
        logWriteTimer = null;
        flushLogBuffer();
    }, LOG_FLUSH_INTERVAL);
}

function initLogDir() {
    try {
        logDir = path.join(app.getPath('userData'), 'Logs');
        fs.mkdirSync(logDir, { recursive: true });
        logFile = path.join(logDir, `HealthClock_${new Date().toISOString().split('T')[0]}.log`);
    } catch (error) {
        console.error('[MAIN] Error initializing log directory:', error);
    }
}

// 重写 console 方法以写入日志
const originalConsoleLog = console.log;
console.log = function (...args) {
    const message = `${new Date().toISOString()} - ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ')}\n`;
    originalConsoleLog(...args);
    if (logFile) {
        logBuffer.push(message);
        scheduleLogFlush();
    }
};

const originalConsoleError = console.error;
console.error = function (...args) {
    const message = `${new Date().toISOString()} - ERROR - ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ')}\n`;
    originalConsoleError(...args);
    if (logFile) {
        logBuffer.push(message);
        scheduleLogFlush();
    }
};

// 设置开机自启动
function setAutoLaunch(enable) {
    try {
        app.setLoginItemSettings({
            openAtLogin: enable,
            openAsHidden: false,
            path: process.execPath,
            args: []
        });
        console.log('[MAIN] Auto launch set to:', enable);
        return true;
    } catch (e) {
        console.error('[MAIN] Failed to set auto launch:', e);
        return false;
    }
}

// 获取开机自启动状态
function getAutoLaunchState() {
    try {
        return app.getLoginItemSettings().openAtLogin;
    } catch (e) {
        console.error('[MAIN] Failed to get auto launch state:', e);
        return false;
    }
}

// ========== 应用生命周期 ==========

app.quitting = false;

// 单例模式
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const mainWindow = windowManager.getMainWindow();
        if (mainWindow) {
            // 如果窗口被隐藏，需要先显示再聚焦
            if (!mainWindow.isVisible()) {
                mainWindow.show();
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        console.log('[MAIN] App ready');
        initLogDir();
        initIpcHandlers();
        windowManager.createMainWindow();
        windowManager.createTray();
        windowManager.initPowerManagement();

        // 添加以下两行：获取并记录开机自启动状态
        const isAutoLaunch = getAutoLaunchState();
        console.log('[MAIN] Auto launch enabled:', isAutoLaunch);
    });
}

app.on('before-quit', () => {
    console.log('[MAIN] App is about to quit (user quit or system shutdown)');
    app.quitting = true;
    // 刷新日志缓冲区
    if (logWriteTimer) {
        clearTimeout(logWriteTimer);
        logWriteTimer = null;
    }
    flushLogBuffer();
});

app.on('window-all-closed', () => {
    console.log('[MAIN] All windows closed');
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createMainWindow();
    }
});