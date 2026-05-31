/**
 * 应用主入口 - 负责初始化和协调各模块
 */
(function () {
    const logger = typeof Logger !== 'undefined' ? Logger.createLogger('App') : console;

    logger.info('=== App Initialization ===');

    // 手动初始化文件系统
    if (typeof FileSystemManager !== 'undefined') {
        FileSystemManager.init();
        logger.info('FileSystemManager initialized, using local file:', FileSystemManager.isUsingLocalFile());
    }

    // DOM 元素收集
    const elements = {
        startTime: document.getElementById('startTime'),
        endTime: document.getElementById('endTime'),
        intervalMinutes: document.getElementById('intervalMinutes'),
        lockMinutes: document.getElementById('lockMinutes'),
        forceLockToggle: document.getElementById('forceLockToggle'),
        soundToggle: document.getElementById('soundToggle'),
        desktopNotification: document.getElementById('desktopNotification'),
        lockNotification: document.getElementById('lockNotification'),
        systemLockToggle: document.getElementById('systemLockToggle'),
        lockSettingsContent: document.getElementById('lockSettingsContent'),
        startBtn: document.getElementById('startBtn'),
        stopBtn: document.getElementById('stopBtn'),
        statusBadge: document.getElementById('statusBadge'),
        nextReminderDiv: document.getElementById('nextReminder'),
        nextTimeText: document.getElementById('nextTimeText'),
        lockOverlay: document.getElementById('lockOverlay'),
        countdownSpan: document.getElementById('countdownSeconds'),
        unlockBtn: document.getElementById('unlockBtn'),
        timerRing: document.getElementById('timerRing'),
        intervalError: document.getElementById('intervalError'),
        lockError: document.getElementById('lockError'),
        todayCount: document.getElementById('todayCount'),
        continuousDays: document.getElementById('continuousDays'),
        weeklyRate: document.getElementById('weeklyRate'),
        resetStatsBtn: document.getElementById('resetStatsBtn'),
        testNotifyBtn: document.getElementById('testNotifyBtn'),
        updateBanner: document.getElementById('updateBanner'),
        updateVersion: document.getElementById('updateVersion'),
        updateLink: document.getElementById('updateLink'),
        updateCloseBtn: document.getElementById('updateCloseBtn')
    };

    // 初始化各模块
    Config.setElements(elements);
    ReminderModule.setElements({
        timerRing: elements.timerRing,
        countdownSpan: elements.countdownSpan,
        unlockBtn: elements.unlockBtn,
        lockOverlay: elements.lockOverlay
    });
    UIModule.setElements(elements);
    ReminderModule.setModules(Config, AudioModule);

    // 设置提醒回调
    ReminderModule.setCallbacks({
        onReminderTrigger: async (notificationType) => {
            logger.info('Reminder triggered, type:', notificationType);
            const result = StatsModule.recordActivity();
            console.log('[App] StatsModule.recordActivity result:', result);

            if (notificationType === 'desktop') {
                await NotificationModule.sendReminder();
            }
        },
        onLockClose: () => {
            logger.info('Lock closed, rescheduling');
            if (ReminderModule.isReminderRunning()) {
                const now = new Date();
                const config = Config.load();
                const next = ReminderModule.calculateNextReminder(now, config);
                ReminderModule.setNextReminderTime(next.getTime());
                UIModule.updateNextReminderDisplay(next.getTime());
                ReminderModule.startCheckLoop();
            }
            AudioModule.stopContinuous();
        }
    });

    // 初始化免打扰设置
    if (typeof UIController !== 'undefined' && UIController.initDoNotDisturb) {
        UIController.initDoNotDisturb();
    }

    AudioModule.setLockedGetter(() => ReminderModule.isCurrentlyLocked());

    // 初始化 UI 控制器
    UIController.init(elements);

    if (typeof DNDController !== 'undefined') {
        DNDController.init();
        logger.info('DNDController initialized');
    }

    // 绑定按钮事件
    elements.startBtn?.addEventListener('click', () => AlarmController.start());
    elements.stopBtn?.addEventListener('click', () => AlarmController.stop());
    elements.unlockBtn?.addEventListener('click', () => LockController.unlock());
    elements.resetStatsBtn?.addEventListener('click', () => StatsController.reset());
    elements.testNotifyBtn?.addEventListener('click', () => NotificationTester.test());

    /**
     * 注册 Service Worker（带环境检测和错误处理）
     */
    async function registerServiceWorker() {
        // 检查是否支持 Service Worker
        if (!('serviceWorker' in navigator)) {
            logger.info('Service Worker not supported by browser');
            return false;
        }

        // 检查是否在 Electron 环境中（Electron 有自己的更新机制）
        if (window.require) {
            logger.info('Running in Electron environment, skipping Service Worker');
            return false;
        }

        // 检查协议是否支持 Service Worker
        const supportedProtocols = ['http:', 'https:'];
        const currentProtocol = window.location.protocol;

        if (!supportedProtocols.includes(currentProtocol)) {
            logger.warn('Service Worker registration skipped: Unsupported protocol', {
                protocol: currentProtocol,
                reason: 'Service Worker requires HTTP/HTTPS protocol'
            });
            return false;
        }

        // 检查是否是安全上下文（HTTPS 或 localhost）
        if (!window.isSecureContext && currentProtocol === 'https:') {
            logger.warn('Service Worker registration may fail: Not a secure context');
        }

        try {
            // 检查 Service Worker 文件是否存在
            const swResponse = await fetch('./sw.js', { method: 'HEAD' });
            if (!swResponse.ok) {
                throw new Error(`Service Worker file not found (${swResponse.status})`);
            }

            // 注册 Service Worker
            const registration = await navigator.serviceWorker.register('./sw.js', {
                scope: './'
            });

            logger.info('Service Worker registered successfully:', {
                scope: registration.scope,
                state: registration.installing?.state || registration.waiting?.state || registration.active?.state
            });

            // 监听更新
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                logger.info('Service Worker update found:', newWorker.state);

                newWorker.addEventListener('statechange', () => {
                    logger.info('Service Worker state changed:', newWorker.state);
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        logger.info('New Service Worker available, please refresh');
                        // 可选：显示更新提示
                        if (typeof AutoCloseDialog !== 'undefined') {
                            AutoCloseDialog.show({
                                title: '应用更新',
                                message: '发现新版本，请刷新页面以获取最新功能',
                                autoClose: 5000,
                                confirmColor: '#3b82f6'
                            });
                        }
                    }
                });
            });

            return true;
        } catch (error) {
            // 只记录非预期的错误，协议错误已经在上层过滤
            if (error.message && !error.message.includes('protocol')) {
                logger.error('Service Worker registration failed:', error);
            } else if (error.message && error.message.includes('fetch')) {
                logger.warn('Service Worker file not found, skipping registration');
            }
            return false;
        }
    }

    // 延迟注册 Service Worker，避免影响主应用启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => registerServiceWorker(), 1000);
        });
    } else {
        setTimeout(() => registerServiceWorker(), 1000);
    }

    // 开机自启动开关
    const autoLaunchToggle = document.getElementById('autoLaunchToggle');
    if (autoLaunchToggle && window.require) {
        const { ipcRenderer } = window.require('electron');

        // 获取当前状态
        const isAutoLaunch = ipcRenderer.sendSync('get-auto-launch');
        autoLaunchToggle.checked = isAutoLaunch;

        // 监听开关变化
        autoLaunchToggle.addEventListener('change', async () => {
            const result = ipcRenderer.sendSync('set-auto-launch', autoLaunchToggle.checked);
            if (!result) {
                autoLaunchToggle.checked = !autoLaunchToggle.checked;
                // 可选：显示错误提示
                if (typeof AutoCloseDialog !== 'undefined') {
                    AutoCloseDialog.show({
                        title: '设置失败',
                        message: '无法设置开机自启动，请检查权限',
                        autoClose: 2000,
                        confirmColor: '#ef4444'
                    });
                }
            }
        });
    }

    // 加载配置和统计数据
    Config.load();
    Config.save();
    StatsModule.load();
    StatsModule.save();
    StatsModule.fixContinuousDays();

    // 根据当前通知类型设置锁屏设置显示状态
    UIController.toggleLockSettings(Config.get('notificationType'));

    // 初始化 UI
    UIController.fixValues();
    UIModule.initStatsSubscription();
    UIModule.updateUI(false);
    ReminderModule.closeLockScreen();
    NotificationModule.initWithoutWait();

    // 初始化版本更新检查
    initUpdateChecker();

    // 页面关闭提醒
    window.addEventListener('beforeunload', (e) => {
        if (ReminderModule.isReminderRunning()) {
            e.preventDefault();
            e.returnValue = '闹铃正在运行，确定要离开吗？';
        }
    });

    // 监听统计更新事件
    window.addEventListener('stats-updated', (event) => {
        logger.info('stats-updated event received:', event.detail);
        UIModule.updateStatsDisplay(event.detail);
    });

    // Electron IPC 监听
    if (window.require) {
        try {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('stop-sound', () => AudioModule.stopContinuous());
            ipcRenderer.on('lock-closed', () => {
                ReminderModule.resetLockStates();
                if (ReminderModule.isReminderRunning()) {
                    const now = new Date();
                    const config = Config.load();
                    const next = ReminderModule.calculateNextReminder(now, config);
                    ReminderModule.setNextReminderTime(next.getTime());
                    UIModule.updateNextReminderDisplay(next.getTime());
                }
                ReminderModule.startCheckLoop();
                AudioModule.stopContinuous();
            });
            // 系统已锁定，跳过锁屏的处理
            ipcRenderer.on('lock-skipped', () => {
                console.log('[APP] Lock skipped due to system lock');
                ReminderModule.resetLockStates();
                if (ReminderModule.isReminderRunning()) {
                    const now = new Date();
                    const config = Config.load();
                    const next = ReminderModule.calculateNextReminder(now, config);
                    ReminderModule.setNextReminderTime(next.getTime());
                    UIModule.updateNextReminderDisplay(next.getTime());
                }
                ReminderModule.startCheckLoop();
                AudioModule.stopContinuous();
            });
            // 系统锁屏，暂停计时器
            ipcRenderer.on('pause-reminder', () => {
                console.log('[APP] System locked, pausing reminder timer');
                ReminderModule.pauseTimer();
            });
            // 系统解锁，恢复计时器（从0开始）
            ipcRenderer.on('resume-reminder', () => {
                console.log('[APP] System unlocked, resuming reminder timer from start');
                ReminderModule.resumeTimerFromStart();
            });
        } catch (e) {
            logger.error('Failed to setup IPC listener:', e);
        }
    }

    // 版本更新检查
    function initUpdateChecker() {
        // 如果不在 Electron 环境中，跳过更新检查
        if (!window.require && !window.electronAPI) {
            console.log('[APP] Not in Electron environment, skipping update check');
            return;
        }

        // 检查更新
        checkForAppUpdate();

        // 绑定关闭按钮事件
        if (elements.updateCloseBtn) {
            elements.updateCloseBtn.addEventListener('click', () => {
                hideUpdateBanner();
                // 记录用户已关闭本次提示
                localStorage.setItem('updateDismissed', 'true');
            });
        }

        // 绑定更新链接点击事件
        if (elements.updateLink) {
            elements.updateLink.addEventListener('click', (e) => {
                e.preventDefault();
                // 打开外部链接
                if (window.electronAPI && window.electronAPI.openExternal) {
                    window.electronAPI.openExternal(elements.updateLink.href);
                } else if (typeof require !== 'undefined') {
                    const { shell } = require('electron');
                    shell.openExternal(elements.updateLink.href);
                } else {
                    window.open(elements.updateLink.href, '_blank');
                }
            });
        }
    }

    async function checkForAppUpdate() {
        try {
            // 检查是否已经显示过
            const lastCheck = localStorage.getItem('lastUpdateCheck');
            const dismissed = localStorage.getItem('updateDismissed');
            const oneDay = 24 * 60 * 60 * 1000;

            // 如果用户已经关闭过提示，且在24小时内，不再显示
            if (dismissed === 'true' && lastCheck && (Date.now() - parseInt(lastCheck)) < oneDay) {
                console.log('[APP] Update banner dismissed recently, skipping check');
                return;
            }

            console.log('[APP] Checking for updates...');

            let result;
            if (window.electronAPI && window.electronAPI.checkForUpdate) {
                result = await window.electronAPI.checkForUpdate();
            } else {
                console.log('[APP] checkForUpdate not available');
                return;
            }

            console.log('[APP] Update check result:', result);

            if (result.hasUpdate) {
                showUpdateBanner(result.latestVersion, result.releaseUrl);
                localStorage.setItem('lastUpdateCheck', Date.now().toString());
                localStorage.removeItem('updateDismissed');
            }
        } catch (e) {
            console.error('[APP] Update check failed:', e);
        }
    }

    function showUpdateBanner(version, url) {
        if (!elements.updateBanner) return;

        elements.updateVersion.textContent = version;
        if (elements.updateLink && url) {
            elements.updateLink.href = url;
        }
        elements.updateBanner.classList.remove('hidden');
        console.log('[APP] Update banner shown for version:', version);
    }

    function hideUpdateBanner() {
        if (!elements.updateBanner) return;
        elements.updateBanner.classList.add('hidden');
    }

    logger.info('App initialized successfully');
})();