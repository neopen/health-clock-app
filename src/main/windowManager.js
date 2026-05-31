const { BrowserWindow, screen, Menu, Tray, app, powerMonitor } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const FaviconManager = require('./utils/favicon.js');
const keyboardBlocker = require('./utils/keyboardBlocker');

// 窗口引用
let mainWindow = null;
let lockWindow = null;
let lockTimer = null;
let tray = null;
let isLockWindowClosing = false;
let isRestoringMain = false;
let wasMainWindowVisible = true; // 保存主窗口的可见状态
let systemLockEnabled = false; // 系统锁屏设置

// 调用系统锁屏
function lockSystem() {
    // 只有当系统锁屏功能启用时才执行
    if (!systemLockEnabled) {
        console.log('[WindowManager] System lock disabled, skipping');
        return;
    }
    
    try {
        console.log('[WindowManager] Locking system');

        switch (process.platform) {
            case 'win32': // Windows
                execSync('rundll32.exe user32.dll,LockWorkStation');
                break;
            case 'darwin': // macOS
                execSync('pmset displaysleepnow');
                break;
            case 'linux': // Linux (GNOME)
                execSync('gnome-screensaver-command -l');
                break;
            default:
                console.log('[WindowManager] System lock not supported on this platform:', process.platform);
        }

        console.log('[WindowManager] System locked successfully');
    } catch (error) {
        console.error('[WindowManager] Failed to lock system:', error.message);
    }
}

// 创建主窗口
function createMainWindow() {
    console.log('[WindowManager] Creating main window');

    mainWindow = new BrowserWindow({
        width: 630,
        height: 750,
        resizable: true,
        frame: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            zoomFactor: 0.8
        }
    });

    mainWindow.setMenu(null);
    // mainWindow.loadFile('src/renderer/index.html');
    mainWindow.loadFile('dist/renderer/index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.setZoomFactor(0.75);
        mainWindow.webContents.setZoomLevel(-1.0);
    });

    mainWindow.on('close', (event) => {
        console.log('[WindowManager] Main window close, quitting:', app.quitting);
        if (app.quitting) {
            // 真正退出应用，让窗口关闭
            // mainWindow.destroy();
        } else {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

// 创建托盘
function createTray() {
    console.log('[WindowManager] Creating tray');

    try {
        tray = FaviconManager.createTrayIcon(__dirname);
        if (!tray) return null;

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示主窗口',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    } else {
                        createMainWindow();
                    }
                }
            },
            {
                label: '退出应用',
                click: () => {
                    app.quitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('起来走走 - 拒绝久坐');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            if (mainWindow) {
                mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
            } else {
                createMainWindow();
            }
        });

        console.log('[WindowManager] Tray created');
        return tray;
    } catch (error) {
        console.error('[WindowManager] Tray creation failed:', error);
        return null;
    }
}

// 初始化电源管理事件
function initPowerManagement() {
    console.log('[WindowManager] Initializing power management');

    let isSystemPaused = false; // 追踪系统暂停状态，避免重复发送

    // 系统即将休眠
    powerMonitor.on('suspend', () => {
        console.log('[WindowManager] System is suspending');
        // 清理锁屏相关资源
        if (lockWindow && !lockWindow.isDestroyed()) {
            try {
                lockWindow.destroy();
                lockWindow = null;
            } catch (error) {
                console.error('[WindowManager] Error destroying lock window on suspend:', error);
            }
        }
        if (lockTimer) {
            clearTimeout(lockTimer);
            lockTimer = null;
        }
        // 停止键盘拦截
        if (keyboardBlocker.isActive()) {
            keyboardBlocker.stopBlocking();
        }
        // 通知渲染进程暂停计时器
        if (mainWindow && !mainWindow.isDestroyed() && !isSystemPaused) {
            isSystemPaused = true;
            mainWindow.webContents.send('pause-reminder');
        }
    });

    // 系统从休眠中唤醒
    powerMonitor.on('resume', () => {
        console.log('[WindowManager] System is resuming');
        // 检查是否有锁屏窗口
        if (lockWindow && !lockWindow.isDestroyed()) {
            console.log('[WindowManager] Lock window exists, destroying it');
            try {
                lockWindow.destroy();
                lockWindow = null;
            } catch (error) {
                console.error('[WindowManager] Error destroying lock window on resume:', error);
            }
        }
        // 确保键盘拦截已停止
        if (keyboardBlocker.isActive()) {
            keyboardBlocker.stopBlocking();
        }
        // 重置状态
        isLockWindowClosing = false;
        if (lockTimer) {
            clearTimeout(lockTimer);
            lockTimer = null;
        }
        // 通知渲染进程恢复计时器（从0开始）
        if (mainWindow && !mainWindow.isDestroyed() && isSystemPaused) {
            isSystemPaused = false;
            mainWindow.webContents.send('resume-reminder');
        }
    });

    // 系统锁屏
    powerMonitor.on('lock-screen', () => {
        console.log('[WindowManager] System screen locked');
        // 清理锁屏相关资源
        if (lockWindow && !lockWindow.isDestroyed()) {
            console.log('[WindowManager] Destroying lock window on system lock');
            try {
                lockWindow.destroy();
                lockWindow = null;
            } catch (error) {
                console.error('[WindowManager] Error destroying lock window on system lock:', error);
            }
        }
        if (lockTimer) {
            clearTimeout(lockTimer);
            lockTimer = null;
        }
        if (keyboardBlocker.isActive()) {
            keyboardBlocker.stopBlocking();
        }
        // 通知渲染进程暂停计时器
        if (mainWindow && !mainWindow.isDestroyed() && !isSystemPaused) {
            isSystemPaused = true;
            mainWindow.webContents.send('pause-reminder');
        }
    });

    // 系统解锁
    powerMonitor.on('unlock-screen', () => {
        console.log('[WindowManager] System screen unlocked, isSystemPaused:', isSystemPaused);
        console.log('[WindowManager] Main window exists:', !!mainWindow, 'isDestroyed:', mainWindow?.isDestroyed(), 'isVisible:', mainWindow?.isVisible());
        // 通知渲染进程恢复计时器（从0开始）
        if (mainWindow && !mainWindow.isDestroyed() && isSystemPaused) {
            isSystemPaused = false;
            mainWindow.webContents.send('resume-reminder');
        }
    });

    // 系统即将关机/重启
    powerMonitor.on('shutdown', () => {
        console.log('[WindowManager] System is shutting down');
        // 清理资源：销毁锁屏窗口、停止键盘拦截、暂停计时器
        if (lockWindow && !lockWindow.isDestroyed()) {
            try {
                lockWindow.destroy();
                lockWindow = null;
            } catch (error) {
                console.error('[WindowManager] Error destroying lock window on shutdown:', error);
            }
        }
        if (lockTimer) {
            clearTimeout(lockTimer);
            lockTimer = null;
        }
        if (keyboardBlocker.isActive()) {
            keyboardBlocker.stopBlocking();
        }
        if (mainWindow && !mainWindow.isDestroyed() && !isSystemPaused) {
            isSystemPaused = true;
            mainWindow.webContents.send('pause-reminder');
        }
    });

    // 周期性检查系统空闲/锁屏状态（作为事件监听的补充）
    let lastIdleState = 'unknown';
    const idleCheckInterval = setInterval(() => {
        try {
            const idleState = powerMonitor.getSystemIdleState(30);

            if (idleState === 'locked' && lastIdleState !== 'locked') {
                console.log('[WindowManager] -> Transitioning to LOCKED state');
                lastIdleState = 'locked';
                if (mainWindow && !mainWindow.isDestroyed() && !isSystemPaused) {
                    isSystemPaused = true;
                    mainWindow.webContents.send('pause-reminder');
                }
            } else if (idleState !== 'locked' && lastIdleState === 'locked') {
                console.log('[WindowManager] -> Transitioning to UNLOCKED state');
                lastIdleState = idleState;
                if (mainWindow && !mainWindow.isDestroyed() && isSystemPaused) {
                    isSystemPaused = false;
                    mainWindow.webContents.send('resume-reminder');
                    console.log('[WindowManager] -> Sent resume-reminder');
                }
            } else if (idleState !== 'locked' && lastIdleState === 'unknown') {
                // 初始化状态
                lastIdleState = idleState;
                console.log('[WindowManager] -> Initial idle state:', idleState);
            }
        } catch (e) {
            console.error('[WindowManager] Idle check error:', e.message);
        }
    }, 60000); // 每60秒检查一次
}

// 创建锁屏窗口
function createLockWindow(durationSeconds, forceLock, systemLock) {
    console.log('[WindowManager] Creating lock window:', durationSeconds, 's, forceLock:', forceLock, 'systemLock:', systemLock);

    // 存储系统锁屏设置
    systemLockEnabled = systemLock || false;

    // 检查系统是否处于锁屏状态
    const systemIdleState = powerMonitor.getSystemIdleState(60); // 60秒空闲
    if (systemIdleState === 'locked') {
        console.log('[WindowManager] System is locked, skipping lock window creation');
        return;
    }

    isLockWindowClosing = false;

    // 保存主窗口的可见状态
    if (mainWindow && !mainWindow.isDestroyed()) {
        wasMainWindowVisible = mainWindow.isVisible();
        console.log('[WindowManager] Main window was visible:', wasMainWindowVisible);
    } else {
        wasMainWindowVisible = false;
    }

    // 清理现有锁屏窗口
    if (lockWindow && !lockWindow.isDestroyed()) {
        lockWindow.destroy();
        lockWindow = null;
    }
    if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
    }

    // ========== 启动全局键盘拦截 ==========
    keyboardBlocker.startBlocking();

    let validDuration = parseInt(durationSeconds);
    if (isNaN(validDuration) || validDuration < 10) {
        validDuration = 60;
    }

    const display = screen.getPrimaryDisplay();
    const { width, height } = display.bounds;

    lockWindow = new BrowserWindow({
        width, height, x: 0, y: 0,
        fullscreen: true,
        fullscreenable: true,
        kiosk: true,
        alwaysOnTop: true,
        frame: false,
        transparent: false,
        resizable: false,
        closable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        showInTaskbar: false,
        focusable: true,
        autoHideMenuBar: true,
        show: false,
        menuBarVisible: false,
        titleBarStyle: 'hidden',
        disableAutoHideCursor: true,
        thickFrame: false,
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: false,
            nodeIntegration: true,
            sandbox: false,
            webSecurity: false,
            spellcheck: false
        }
    });

    // Windows 特定设置
    if (process.platform === 'win32') {
        lockWindow.setSkipTaskbar(true);
        lockWindow.setVisibleOnAllWorkspaces(true);
    }

    // macOS 特定设置
    if (process.platform === 'darwin') {
        lockWindow.setVisibleOnAllWorkspaces(true);
        lockWindow.setFullScreenable(true);
    }

    lockWindow.loadFile('dist/renderer/lock.html', {
        query: { duration: validDuration, forceLock: forceLock ? 'true' : 'false' }
    });

    lockWindow.once('ready-to-show', () => {
        if (process.platform === 'win32') {
            lockWindow.setVisibleOnAllWorkspaces(true);
            lockWindow.setContentProtection(true);
        }

        lockWindow.setAlwaysOnTop(true, 'screen-saver');
        lockWindow.setSkipTaskbar(true);
        lockWindow.setMovable(false);
        lockWindow.setResizable(false);
        lockWindow.setOpacity(1.0);
        lockWindow.setIgnoreMouseEvents(false);
        lockWindow.setMenu(null);

        // 保留 before-input-event 作为备用（拦截网页内的按键）
        lockWindow.webContents.on('before-input-event', (event, input) => {
            // 如果全局拦截器已激活，这里不需要额外处理
            // 但保留作为备用
            console.log('[LOCK] before-input-event (fallback):', input.key);
        });

        // 阻止右键菜单
        lockWindow.webContents.on('context-menu', (event) => {
            console.log('[LOCK] Context menu blocked');
            event.preventDefault();
        });

        // 渲染进程备用拦截
        lockWindow.webContents.executeJavaScript(`
            (function() {
                const volumeKeys = [
                    'VolumeUp', 'VolumeDown', 'VolumeMute',
                    'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute',
                    'MediaVolumeUp', 'MediaVolumeDown', 'MediaVolumeMute'
                ];
                
                document.addEventListener('keydown', (e) => {
                    if (volumeKeys.includes(e.key)) {
                        console.log('[LOCK Renderer] Volume key allowed:', e.key);
                        return true;
                    }
                    console.log('[LOCK Renderer] Blocked key:', e.key);
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }, { capture: true });
                
                document.addEventListener('keyup', (e) => {
                    if (!volumeKeys.includes(e.key)) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                }, { capture: true });
                
                console.log('[LOCK Renderer] Keyboard lock active');
            })();
        `);

        // 传递参数到渲染进程
        lockWindow.webContents.executeJavaScript(`
            window.__LOCK_PARAMS__ = { duration: ${validDuration}, forceLock: ${forceLock} };
        `);

        lockWindow.show();
        lockWindow.focus();
        lockWindow.moveTop();

        // 持续确保全屏和焦点
        const fullscreenInterval = setInterval(() => {
            if (lockWindow && !lockWindow.isDestroyed()) {
                lockWindow.setKiosk(true);
                lockWindow.setFullScreen(true);
                lockWindow.setAlwaysOnTop(true, 'screen-saver');
                if (process.platform === 'win32') {
                    lockWindow.setSkipTaskbar(true);
                }
                lockWindow.focus();
                lockWindow.moveTop();
            } else {
                clearInterval(fullscreenInterval);
            }
        }, 500);

        lockWindow._fullscreenInterval = fullscreenInterval;
    });

    lockWindow.on('closed', () => {
        // ========== 停止全局键盘拦截 ==========
        keyboardBlocker.stopBlocking();

        if (lockWindow?._fullscreenInterval) {
            clearInterval(lockWindow._fullscreenInterval);
        }
        lockWindow = null;
        isLockWindowClosing = false;
        restoreMainWindow();
    });

    lockWindow.on('blur', () => {
        if (lockWindow && !lockWindow.isDestroyed() && !isLockWindowClosing) {
            lockWindow.focus();
            lockWindow.moveTop();
        }
    });

    // 备用定时器
    lockTimer = setTimeout(() => {
        console.log('[WindowManager] Fallback timer triggered');
        forceCloseLockWindow();
    }, validDuration * 1000 + 3000);

    return lockWindow;
}

// 强制关闭锁屏窗口
function forceCloseLockWindow() {
    if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
    }

    // 备用定时器触发，属于自动关闭，需要系统锁屏
    lockSystem();

    if (lockWindow && !lockWindow.isDestroyed()) {
        lockWindow.destroy();
        lockWindow = null;
    }

    // 确保停止键盘拦截
    keyboardBlocker.stopBlocking();

    isLockWindowClosing = false;
    return { lockClosed: true };
}

// 关闭锁屏窗口
// autoClose: 是否是自动关闭（倒计时完成）
function closeLockWindow(autoClose = true) {
    if (isLockWindowClosing || !lockWindow || lockWindow.isDestroyed()) {
        restoreMainWindow();
        return;
    }

    isLockWindowClosing = true;

    if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
    }

    // 只有自动关闭时才调用系统锁屏
    if (autoClose) {
        lockSystem();
    }

    // 停止键盘拦截
    keyboardBlocker.stopBlocking();

    restoreMainWindow();

    try {
        lockWindow.destroy();
    } catch (e) {
        console.error('[WindowManager] Error destroying lock window:', e);
        lockWindow = null;
        isLockWindowClosing = false;
    }
}

// 恢复主窗口
function restoreMainWindow() {
    if (isRestoringMain) return;
    isRestoringMain = true;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setEnabled(true);
        mainWindow.setAlwaysOnTop(false);

        // 只在主窗口之前是可见的时候才显示它
        if (wasMainWindowVisible) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.moveTop();
            console.log('[WindowManager] Restored main window (was visible)');
        } else {
            console.log('[WindowManager] Main window remains hidden (was not visible)');
        }
    }

    setTimeout(() => { isRestoringMain = false; }, 100);
}

// 获取窗口引用
function getMainWindow() { return mainWindow; }
function getLockWindow() { return lockWindow; }
function getTray() { return tray; }
function isLockWindowClosingState() { return isLockWindowClosing; }

module.exports = {
    createMainWindow,
    createTray,
    createLockWindow,
    forceCloseLockWindow,
    closeLockWindow,
    restoreMainWindow,
    initPowerManagement,
    getMainWindow,
    getLockWindow,
    getTray,
    isLockWindowClosingState
};