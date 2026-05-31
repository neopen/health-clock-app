// 提醒核心逻辑模块
const ReminderModule = (function () {
    let isRunning = false;
    let mainIntervalId = null;
    let nextReminderTimestamp = null;
    let currentLockEndTime = null;
    let lockTimerInterval = null;
    let isLocked = false;
    let progressCircle = null;
    let timerRing = null;
    let countdownSpan = null;
    let unlockBtn = null;
    let lockOverlay = null;
    let pendingLock = false;
    let isPaused = false; // 计时器是否被暂停
    let pauseTimestamp = null; // 暂停时的时间戳

    let onReminderTrigger = null;
    let onLockClose = null;

    // 模块引用（将在初始化时注入）
    let ConfigModule = null;
    let AudioModule = null;

    function setModules(config, audio) {
        ConfigModule = config;
        AudioModule = audio;
    }

    function setElements(elements) {
        timerRing = elements.timerRing;
        countdownSpan = elements.countdownSpan;
        unlockBtn = elements.unlockBtn;
        lockOverlay = elements.lockOverlay;
    }

    function setCallbacks(callbacks) {
        onReminderTrigger = callbacks.onReminderTrigger;
        onLockClose = callbacks.onLockClose;
    }

    function getCallbacks() {
        return {
            onReminderTrigger,
            onLockClose
        };
    }

    function isReminderRunning() { return isRunning; }
    function isCurrentlyLocked() { return isLocked; }
    function getNextReminderTime() { return nextReminderTimestamp; }
    function setNextReminderTime(timestamp) { nextReminderTimestamp = timestamp; }

    function getTodayTime(timeStr) {
        if (!timeStr) return new Date();
        const [hours, minutes] = timeStr.split(':').map(Number);
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    }

    function isWithinPeriod(now, config) {
        if (!config || !config.startTime || !config.endTime) return true;
        const start = getTodayTime(config.startTime);
        const end = getTodayTime(config.endTime);
        let endAdjusted = new Date(end);
        if (endAdjusted <= start) {
            endAdjusted.setDate(endAdjusted.getDate() + 1);
        }
        return now >= start && now <= endAdjusted;
    }

    function calculateNextReminder(now, config) {
        console.log('calculateNextReminder called with config:', config);
        if (!config) {
            console.error('No config provided');
            return new Date(now.getTime() + 30 * 60 * 1000);
        }

        const startTime = config.startTime || '08:00';
        const endTime = config.endTime || '18:00';
        const intervalMinutes = config.intervalMinutes || 40;

        const start = getTodayTime(startTime);
        const end = getTodayTime(endTime);
        let endAdjusted = new Date(end);
        if (endAdjusted <= start) {
            endAdjusted.setDate(endAdjusted.getDate() + 1);
        }

        const intervalMs = intervalMinutes * 60 * 1000;

        if (isWithinPeriod(now, config)) {
            let candidate = new Date(now.getTime() + intervalMs);
            if (candidate > endAdjusted) {
                let nextStart = new Date(start);
                nextStart.setDate(nextStart.getDate() + 1);
                return new Date(nextStart.getTime() + intervalMs);
            }
            return candidate;
        }

        if (now < start) {
            return new Date(start.getTime() + intervalMs);
        } else {
            let tomorrowStart = new Date(start);
            tomorrowStart.setDate(tomorrowStart.getDate() + 1);
            return new Date(tomorrowStart.getTime() + intervalMs);
        }
    }

    function updateProgressCircle(remainingSeconds, totalSeconds) {
        if (!progressCircle && timerRing) {
            progressCircle = document.createElement('div');
            progressCircle.className = 'timer-circle-progress';
            const timerCenter = timerRing.querySelector('.timer-center');
            if (timerCenter) {
                timerRing.insertBefore(progressCircle, timerCenter);
            }
        }
        if (progressCircle) {
            const percent = (totalSeconds - remainingSeconds) / totalSeconds;
            const angle = percent * 360;
            progressCircle.style.background = `conic-gradient(from 0deg, #a78bfa 0deg, #a78bfa ${angle}deg, rgba(255, 255, 255, 0.1) ${angle}deg)`;
        }
    }

    function closeLockScreen() {
        console.log('closeLockScreen called');

        // 先停止声音！
        if (AudioModule) {
            console.log('[REMINDER] Stopping continuous sound');
            AudioModule.stopContinuous();
        }

        // 检测是否在 Electron 环境中
        if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                console.log('[REMINDER] Sending hide-lock to main process');
                ipcRenderer.send('hide-lock');
            } catch (e) {
                console.error('[REMINDER] Failed to send hide-lock:', e);
            }
        }

        if (lockTimerInterval) {
            clearInterval(lockTimerInterval);
            lockTimerInterval = null;
        }

        // 恢复页面滚动
        document.body.classList.remove('lock-active');

        if (lockOverlay) {
            lockOverlay.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                lockOverlay.classList.add('hidden');
                lockOverlay.style.animation = '';
                isLocked = false;
                pendingLock = false;
                isCreatingLock = false;
                currentLockEndTime = null;
                if (onLockClose) onLockClose();
            }, 300);
        } else {
            isLocked = false;
            pendingLock = false;
            isCreatingLock = false;
            currentLockEndTime = null;
            if (onLockClose) onLockClose();
        }
    }

    let isCreatingLock = false;

    function showLockScreen(minutes, forceLock, onComplete) {
        console.log('showLockScreen called, minutes:', minutes, 'isLocked:', isLocked, 'isCreatingLock:', isCreatingLock);

        if (isLocked) {
            console.log('Already locked, skip');
            return;
        }

        if (isCreatingLock) {
            console.log('Already creating lock, skip');
            return;
        }

        isCreatingLock = true;

        // 将分钟转换为秒
        const totalSeconds = minutes * 60;
        console.log('[REMINDER] Converting', minutes, 'minutes to', totalSeconds, 'seconds');

        // 检测是否在 Electron 环境中
        if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                const systemLock = Config.get('systemLock');

                console.log('[REMINDER] Setting isLocked to true');
                isLocked = true;
                // 传递秒数、强制锁屏和系统锁屏设置给主进程
                console.log('[REMINDER] Sending show-lock to main process, durationSeconds:', totalSeconds, 'forceLock:', forceLock, 'systemLock:', systemLock);
                ipcRenderer.send('show-lock', totalSeconds, forceLock, systemLock);

                // 注意：在 Electron 环境中，我们不在这里监听事件
                // 而是在 app.js 中通过 ipcRenderer.on('lock-closed') 来处理
                // 因为 lock-complete 事件是从 lock.html 发送的，不同窗口间无法直接通信
                console.log('[REMINDER] Electron environment: lock-closed event will be handled in app.js');
                return;
            } catch (e) {
                console.error('[REMINDER] Failed to send show-lock:', e);
                console.log('[REMINDER] Resetting states after error: isLocked=false, isCreatingLock=false, pendingLock=false');
                isLocked = false;
                isCreatingLock = false;
                pendingLock = false;
            }
        }

        // 非 Electron 环境的处理
        isLocked = true;
        isCreatingLock = false;
        const endTime = Date.now() + (totalSeconds * 1000);
        currentLockEndTime = endTime;

        // 防止页面滚动
        document.body.classList.add('lock-active');

        if (progressCircle) {
            progressCircle.style.background = 'conic-gradient(from 0deg, #a78bfa 0deg, #a78bfa 0deg, rgba(255, 255, 255, 0.1) 0deg)';
        }

        if (lockOverlay) {
            lockOverlay.classList.remove('hidden');
            lockOverlay.style.animation = 'fadeIn 0.3s ease';

            // 确保全屏覆盖，移除任何可能的关闭按钮
            const existingCloseBtn = lockOverlay.querySelector('.close-btn, .close-button, [data-close]');
            if (existingCloseBtn) {
                existingCloseBtn.remove();
            }
        }

        if (lockTimerInterval) clearInterval(lockTimerInterval);

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((currentLockEndTime - now) / 1000));
            if (countdownSpan) countdownSpan.innerText = remaining;
            updateProgressCircle(remaining, totalSeconds);

            if (remaining <= 0) {
                clearInterval(lockTimerInterval);
                lockTimerInterval = null;
                // 倒计时结束，关闭锁屏（会停止声音）
                closeLockScreen();
                if (onComplete) onComplete();
            } else if (unlockBtn) {
                unlockBtn.innerText = `⏳ 请活动 ${remaining} 秒`;
                if (forceLock) {
                    unlockBtn.classList.add('disabled');
                    unlockBtn.disabled = true;
                } else {
                    unlockBtn.classList.remove('disabled');
                    unlockBtn.disabled = false;
                }
            }
        };

        updateTimer();
        lockTimerInterval = setInterval(updateTimer, 100);
    }


    function trigger(config) {
        console.log('[REMINDER] trigger called, isRunning:', isRunning, 'isLocked:', isLocked, 'pendingLock:', pendingLock);
        console.log('[REMINDER] config received:', config);

        if (!isRunning) {
            console.log('[REMINDER] Not running, skip trigger');
            return;
        }
        if (isLocked) {
            console.log('[REMINDER] Already locked, skip trigger');
            return;
        }
        if (pendingLock) {
            console.log('[REMINDER] Pending lock, skip trigger');
            return;
        }

        // ========== 免打扰检查 ==========
        if (isInDoNotDisturbMode(config)) {
            console.log('[REMINDER] In Do Not Disturb mode, skipping reminder');
            // 重新调度下一次提醒
            const callbacks = getCallbacks();
            if (callbacks.onLockClose) {
                callbacks.onLockClose();
            }
            return;
        }

        // 获取通知类型
        const notificationType = config.notificationType || 'desktop';
        console.log('[REMINDER] Notification type:', notificationType);

        // 修复：正确获取 lockMinutes
        let lockMins = 5;
        if (config && config.lockMinutes) {
            lockMins = parseInt(config.lockMinutes);
        } else if (ConfigModule) {
            const currentConfig = ConfigModule.load();
            lockMins = currentConfig.lockMinutes || 5;
        }
        lockMins = Math.min(30, Math.max(1, lockMins));

        const forceLock = (config && config.forceLock) || false;
        const soundEnabled = (config && config.soundEnabled) !== undefined ? config.soundEnabled : true;

        console.log('[REMINDER] Triggering with type:', notificationType, 'duration:', lockMins, 'minutes');

        // 触发提醒回调（记录统计）
        // 注意：通知发送移到下面根据类型处理
        const callbacks = getCallbacks();

        // 先记录统计（无论哪种通知类型都要记录）
        if (callbacks.onReminderTrigger) {
            console.log('[REMINDER] Calling onReminderTrigger with notificationType:', config.notificationType);
            // 传递 notificationType 让回调知道是否需要发送桌面通知
            callbacks.onReminderTrigger(notificationType);
        } else {
            console.error('[REMINDER] onReminderTrigger is null!');
        }

        // 根据通知类型决定行为
        if (notificationType === 'desktop') {
            // 桌面通知模式：不锁屏，只发送桌面通知
            console.log('[REMINDER] Desktop notification mode - no lock screen');

            // 播放提示音
            if (soundEnabled && AudioModule) {
                console.log('[REMINDER] Playing alert sound');
                AudioModule.playAlert();
                // 只播放一次，不循环
            }

            // 直接调度下一次提醒
            pendingLock = false;
            isLocked = false;
            isCreatingLock = false;

            if (callbacks.onLockClose) {
                console.log('[REMINDER] Calling onLockClose to schedule next reminder');
                callbacks.onLockClose();
            }

            return;  // 跳过锁屏
        } else {
            // 锁屏通知模式：显示全屏锁屏
            console.log('[REMINDER] Lock screen mode - showing lock screen');

            pendingLock = true;

            // 先播放声音提示三次，然后再显示锁屏
            if (soundEnabled && AudioModule) {
                console.log('[REMINDER] Playing alert sounds first');
                // 播放第一次
                AudioModule.playAlert();
                // 延迟播放第二次
                setTimeout(() => {
                    AudioModule.playAlert();
                    // 延迟播放第三次
                    setTimeout(() => {
                        AudioModule.playAlert();
                        // 播放完三次后显示锁屏
                        setTimeout(() => {
                            console.log('[REMINDER] Showing lock screen after sound alerts');
                            showLockScreen(lockMins, forceLock, () => {
                                console.log('[REMINDER] Lock screen completed callback');
                                isLocked = false;
                                pendingLock = false;
                                isCreatingLock = false;
                                if (AudioModule) {
                                    AudioModule.stopContinuous();
                                }
                                if (callbacks.onLockClose) callbacks.onLockClose();
                            });
                        }, 1000);
                    }, 2000);
                }, 2000);
            } else {
                // 无声音时直接显示锁屏
                showLockScreen(lockMins, forceLock, () => {
                    console.log('[REMINDER] Lock screen completed callback');
                    isLocked = false;
                    pendingLock = false;
                    isCreatingLock = false;
                    if (AudioModule) {
                        AudioModule.stopContinuous();
                    }
                    if (callbacks.onLockClose) callbacks.onLockClose();
                });
            }
        }
    }


    function start(config) {
        console.log('ReminderModule.start called, config:', config);
        isRunning = true;
        pendingLock = false;
        isLocked = false;
        isCreatingLock = false;
        console.log('[REMINDER] Start state:', { isRunning, pendingLock, isLocked, isCreatingLock });
    }

    function stop() {
        console.log('[REMINDER] stop called, isRunning:', isRunning, 'isLocked:', isLocked);
        isRunning = false;

        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
        }

        // 停止声音
        if (AudioModule) {
            AudioModule.stopContinuous();
        }

        if (isLocked) {
            console.log('[REMINDER] Lock active, sending hide-lock');
            if (typeof window !== 'undefined' && window.require) {
                try {
                    const { ipcRenderer } = window.require('electron');
                    ipcRenderer.send('hide-lock');
                } catch (e) {
                    console.error('[REMINDER] Failed to send hide-lock:', e);
                }
            }
            isLocked = false;
            pendingLock = false;
            isCreatingLock = false;
        }

        // 注意：不要重置 nextReminderTimestamp，否则会导致下一次提醒无法触发
        // nextReminderTimestamp = null;
    }

    function unlock(forceLock) {
        if (!isLocked) return true;

        const now = Date.now();

        if (currentLockEndTime && now >= currentLockEndTime) {
            closeLockScreen();
            return true;
        } else if (!forceLock) {
            return false;
        }
        return true;
    }

    function manualCloseLockScreen() {
        closeLockScreen();
    }

    function resetLockStates() {
        console.log('[REMINDER] resetLockStates called');
        isLocked = false;
        pendingLock = false;
        isCreatingLock = false;
        console.log('[REMINDER] Lock states reset:', { isLocked, pendingLock, isCreatingLock });
    }

    // 暂停计时器（系统锁屏时调用）
    function pauseTimer() {
        console.log('[REMINDER] pauseTimer called');
        if (!isRunning || isPaused) {
            console.log('[REMINDER] Timer not running or already paused, skipping');
            return;
        }
        isPaused = true;
        pauseTimestamp = Date.now();
        console.log('[REMINDER] Timer paused at:', pauseTimestamp);

        // 停止检查循环
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
        }

        // 停止声音
        if (AudioModule) {
            AudioModule.stopContinuous();
        }
    }

    // 从0开始恢复计时器（系统解锁时调用）
    function resumeTimerFromStart() {
        console.log('[REMINDER] resumeTimerFromStart called');
        if (!isRunning) {
            console.log('[REMINDER] Timer not running, skipping');
            return;
        }
        isPaused = false;
        pauseTimestamp = null;

        // 重置下次提醒时间，从当前时间重新计算
        if (ConfigModule) {
            const config = ConfigModule.load();
            const now = new Date();
            const next = calculateNextReminder(now, config);
            nextReminderTimestamp = next.getTime();
            console.log('[REMINDER] Next reminder reset to:', nextReminderTimestamp, 'from:', now.getTime());

            // 更新UI显示
            if (typeof UIModule !== 'undefined' && UIModule.updateNextReminderDisplay) {
                UIModule.updateNextReminderDisplay(nextReminderTimestamp);
            }
        }

        // 重新启动检查循环
        startCheckLoop();
    }

    // 检查系统是否处于锁屏状态
    function isSystemLocked() {
        // 在 Electron 环境中，我们可以通过 powerMonitor 或系统 API 检查
        if (typeof window !== 'undefined' && window.require) {
            try {
                const { powerMonitor } = window.require('electron');
                // 检查系统是否处于空闲状态（通常表示锁屏）
                const systemIdleState = powerMonitor.getSystemIdleState(60); // 60秒空闲
                return systemIdleState === 'locked';
            } catch (e) {
                console.error('[REMINDER] Failed to check system lock state:', e);
                return false;
            }
        }
        return false;
    }

    // 主检查循环
    function checkAndRemind() {
        if (!isRunning) {
            console.log('[REMINDER] Check skipped: not running');
            return;
        }
        if (isLocked) {
            console.log('[REMINDER] Check skipped: locked');
            return;
        }
        if (pendingLock) {
            console.log('[REMINDER] Check skipped: pending lock');
            return;
        }
        if (isPaused) {
            console.log('[REMINDER] Check skipped: paused');
            return;
        }
        if (isSystemLocked()) {
            console.log('[REMINDER] Check skipped: system is locked');
            return;
        }

        const now = Date.now();
        // if (nextReminderTimestamp) {
        //     console.log('[REMINDER] Time difference:', (nextReminderTimestamp - now) / 1000, 'seconds');
        // }

        if (nextReminderTimestamp && now >= nextReminderTimestamp) {
            console.log('[REMINDER] Time to remind!');
            if (ConfigModule) {
                const config = ConfigModule.load();
                trigger(config);
            } else {
                console.error('[REMINDER] ConfigModule not available');
                trigger({ lockMinutes: 5, forceLock: false, soundEnabled: true });
            }
        }
    }

    // 启动检查循环
    function startCheckLoop() {
        if (mainIntervalId) {
            console.log('[REMINDER] Clearing existing interval:', mainIntervalId);
            clearInterval(mainIntervalId);
            mainIntervalId = null;
        }
        if (!isRunning) {
            console.log('[REMINDER] Not running, skipping startCheckLoop');
            return;
        }
        mainIntervalId = setInterval(() => checkAndRemind(), 500);
    }

    // 检查是否在免打扰时段
    function isInDoNotDisturbMode(config) {
        const dnd = config.doNotDisturb;

        // 如果免打扰未启用，返回 false
        if (!dnd || !dnd.enabled) {
            return false;
        }

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        // 检查午休时间
        if (dnd.lunchBreak && dnd.lunchBreak.start && dnd.lunchBreak.end) {
            if (isTimeInRange(currentTime, dnd.lunchBreak.start, dnd.lunchBreak.end)) {
                console.log('[REMINDER] In lunch break:', dnd.lunchBreak.start, '-', dnd.lunchBreak.end);
                return true;
            }
        }

        // 检查自定义免打扰时段
        if (dnd.customBreaks && Array.isArray(dnd.customBreaks)) {
            for (const breakTime of dnd.customBreaks) {
                if (breakTime.start && breakTime.end && isTimeInRange(currentTime, breakTime.start, breakTime.end)) {
                    console.log('[REMINDER] In custom break:', breakTime.name || '未命名', breakTime.start, '-', breakTime.end);
                    return true;
                }
            }
        }

        return false;
    }

    // 检查当前时间是否在指定时间范围内
    function isTimeInRange(current, start, end) {
        if (start <= end) {
            // 同一天内
            return current >= start && current <= end;
        } else {
            // 跨天（如 22:00 - 06:00）
            return current >= start || current <= end;
        }
    }


    return {
        setModules,
        setElements,
        setCallbacks,
        getCallbacks,
        isReminderRunning,
        isCurrentlyLocked,
        getNextReminderTime,
        setNextReminderTime,
        calculateNextReminder,
        trigger,
        start,
        stop,
        startCheckLoop,
        resetLockStates,
        pauseTimer,
        resumeTimerFromStart,
        unlock,
        closeLockScreen: manualCloseLockScreen,
        checkAndRemind
    };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReminderModule;
}