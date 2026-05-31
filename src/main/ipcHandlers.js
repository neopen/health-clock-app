const { ipcMain, app, Notification, powerMonitor } = require('electron');
const path = require('path');
const windowManager = require('./windowManager');

// 初始化 IPC 处理器
function initIpcHandlers() {

    // ========== 锁屏相关 ==========

    ipcMain.on('show-lock', (event, duration, forceLock, systemLock) => {
        console.log('[IPC] show-lock:', duration, forceLock, systemLock);

        // 检查系统是否已锁定
        try {
            const systemIdleState = powerMonitor.getSystemIdleState(60);
            if (systemIdleState === 'locked') {
                console.log('[IPC] System is locked, skipping lock and notifying renderer');
                const mainWindow = windowManager.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setEnabled(true);
                    mainWindow.webContents.send('lock-skipped');
                }
                return;
            }
        } catch (e) {
            console.error('[IPC] Failed to check system lock state:', e);
        }

        const mainWindow = windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setEnabled(false);
            mainWindow.setAlwaysOnTop(false);
        }
        windowManager.createLockWindow(duration, forceLock, systemLock);
    });

    ipcMain.on('lock-complete', () => {
        console.log('[IPC] lock-complete');
        const mainWindow = windowManager.getMainWindow();

        // 先通知主窗口锁屏关闭
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lock-closed');
            mainWindow.webContents.send('stop-sound');
        }

        // 再关闭锁屏窗口（自动关闭，需要系统锁屏）
        windowManager.closeLockWindow(true);
    });

    ipcMain.on('hide-lock', () => {
        console.log('[IPC] hide-lock');
        const mainWindow = windowManager.getMainWindow();

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stop-sound');
            mainWindow.webContents.send('lock-closed');
        }

        // 关闭锁屏窗口（手动关闭，不需要系统锁屏）
        windowManager.closeLockWindow(false);
    });

    // ========== 声音相关 ==========

    ipcMain.on('stop-sound-request', () => {
        console.log('[IPC] stop-sound-request');
        const mainWindow = windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stop-sound');
        }
    });

    // ========== 用户数据路径 ==========

    ipcMain.on('get-user-data-path', (event) => {
        try {
            const userDataPath = app.getPath('userData');
            console.log('[IPC] userData path:', userDataPath);
            event.returnValue = userDataPath;
        } catch (e) {
            console.error('[IPC] Error getting userData path:', e);
            event.returnValue = null;
        }
    });



    // ========== 开机启动 ==========
    // 获取开机自启动状态
    ipcMain.on('get-auto-launch', (event) => {
        try {
            const isEnabled = app.getLoginItemSettings().openAtLogin;
            event.returnValue = isEnabled;
        } catch (e) {
            console.error('[IPC] Failed to get auto launch:', e);
            event.returnValue = false;
        }
    });

    // 设置开机自启动
    ipcMain.on('set-auto-launch', (event, enable) => {
        try {
            app.setLoginItemSettings({
                openAtLogin: enable,
                openAsHidden: false
            });
            console.log('[IPC] Auto launch set to:', enable);
            event.returnValue = true;
        } catch (e) {
            console.error('[IPC] Failed to set auto launch:', e);
            event.returnValue = false;
        }
    });


    // ========== 通知相关 ==========

    // 请求通知权限（同步）
    ipcMain.on('request-notification-permission', (event) => {
        console.log('[IPC] request-notification-permission');
        event.returnValue = Notification.isSupported();
    });

    // 请求通知权限（异步）
    ipcMain.on('request-notification-permission-async', (event) => {
        console.log('[IPC] request-notification-permission-async');
        event.reply('notification-permission-result', Notification.isSupported());
    });

    // 显示通知（同步）- 5秒后自动关闭
    ipcMain.on('show-notification', (event, options) => {
        console.log('[IPC] show-notification:', options?.title);

        if (!Notification.isSupported()) {
            event.returnValue = false;
            return;
        }

        try {
            const notification = new Notification({
                title: options.title || '别坐了',
                body: options.body || '',
                silent: options.silent || false,
                requireInteraction: options.requireInteraction || false
            });

            notification.on('click', () => {
                const mainWindow = windowManager.getMainWindow();
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            });

            notification.show();
            event.returnValue = true;
        } catch (e) {
            console.error('[IPC] Notification failed:', e);
            event.returnValue = false;
        }
    });

    // 显示通知（异步）
    ipcMain.on('show-notification-async', (event, options) => {
        console.log('[IPC] show-notification-async:', options?.title);

        if (!Notification.isSupported()) return;

        try {
            // 设置默认 5 秒后自动关闭
            const autoCloseDelay = 5000;

            const notification = new Notification({
                title: options.title || '别坐了',
                body: options.body || '',
                silent: options.silent || false,
                requireInteraction: options.requireInteraction || false,
                timeoutType: 'default',  // 始终使用 default，让系统决定或手动关闭
                urgency: 'normal'
            });

            notification.on('click', () => {
                const mainWindow = windowManager.getMainWindow();
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
                notification.close();
            });

            notification.show();

            // 设置 5 秒后自动关闭（无论 requireInteraction 是什么）
            setTimeout(() => {
                try {
                    notification.close();
                    console.log('[IPC] Notification auto-closed after 5 seconds');
                } catch (e) {
                    // 通知可能已经被关闭
                }
            }, autoCloseDelay);

        } catch (e) {
            console.error('[IPC] Async notification failed:', e);
        }
    });

    // 同样修复同步通知
    ipcMain.on('show-notification', (event, options) => {
        console.log('[IPC] show-notification:', options?.title);

        if (!Notification.isSupported()) {
            event.returnValue = false;
            return;
        }

        try {
            const autoCloseDelay = 5000;

            const notification = new Notification({
                title: options.title || '别坐了',
                body: options.body || '',
                silent: options.silent || false,
                requireInteraction: options.requireInteraction || false,
                timeoutType: 'default',
                urgency: 'normal'
            });

            notification.on('click', () => {
                const mainWindow = windowManager.getMainWindow();
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
                notification.close();
            });

            notification.show();

            // 5 秒后自动关闭
            setTimeout(() => {
                try {
                    notification.close();
                } catch (e) { }
            }, autoCloseDelay);

            event.returnValue = true;
        } catch (e) {
            console.error('[IPC] Notification failed:', e);
            event.returnValue = false;
        }
    });

    // ========== 版本更新检查 ==========

    const UpdateChecker = require('./utils/updateChecker');

    ipcMain.handle('check-for-update', async () => {
        console.log('[IPC] check-for-update');
        try {
            const result = await UpdateChecker.checkForUpdateWithRetry(2, 1000);
            console.log('[IPC] Update check result:', result);
            return result;
        } catch (e) {
            console.error('[IPC] Update check failed:', e);
            return {
                hasUpdate: false,
                currentVersion: app.getVersion(),
                latestVersion: null,
                releaseUrl: null,
                releaseNotes: null,
                error: e.message
            };
        }
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    console.log('[IPC] All handlers initialized');
}

module.exports = { initIpcHandlers };