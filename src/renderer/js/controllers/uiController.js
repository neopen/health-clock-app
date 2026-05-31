/**
 * UI 控制器 - 处理用户交互和事件绑定
 */
const UIController = (function () {
    const logger = typeof Logger !== 'undefined' ? Logger.createLogger('UIController') : console;

    let _elements = {};
    let _isInitialized = false;

    // 切换锁屏设置显示/隐藏
    function toggleLockSettings(notificationType) {
        const contentEl = _elements.lockSettingsContent;

        if (contentEl) {
            if (notificationType === 'desktop') {
                contentEl.style.display = 'none';
            } else {
                contentEl.style.display = 'block';
            }
        }
    }

    // 校验并显示错误
    function validateAndShowErrors() {
        let isValid = true;
        const intervalValue = _elements.intervalMinutes?.value || 40;
        const intervalMin = parseInt(_elements.intervalMinutes?.min) || 10;
        const intervalMax = parseInt(_elements.intervalMinutes?.max) || 300;
        const lockValue = _elements.lockMinutes?.value || 5;
        const lockMin = parseInt(_elements.lockMinutes?.min) || 1;
        const lockMax = parseInt(_elements.lockMinutes?.max) || 30;

        if (!Config.validateInterval(intervalValue, intervalMin, intervalMax)) {
            UIModule.showError('intervalError', '提醒频率范围：10 ~ 300 分钟', true);
            isValid = false;
        } else {
            UIModule.showError('intervalError', '', false);
        }

        if (!Config.validateLockMinutes(lockValue, lockMin, lockMax)) {
            UIModule.showError('lockError', '锁屏时长范围：1 ~ 30 分钟', true);
            isValid = false;
        } else {
            UIModule.showError('lockError', '', false);
        }

        return isValid;
    }

    // 修正输入值
    function fixValues() {
        const intervalValue = _elements.intervalMinutes?.value || 40;
        const intervalMin = parseInt(_elements.intervalMinutes?.min) || 10;
        const intervalMax = parseInt(_elements.intervalMinutes?.max) || 300;
        const intervalStep = parseInt(_elements.intervalMinutes?.step) || 5;
        const lockValue = _elements.lockMinutes?.value || 5;
        const lockMin = parseInt(_elements.lockMinutes?.min) || 1;
        const lockMax = parseInt(_elements.lockMinutes?.max) || 30;

        const fixedInterval = Config.fixIntervalValue(intervalValue, intervalMin, intervalMax, intervalStep);
        const fixedLock = Config.fixLockValue(lockValue, lockMin, lockMax);

        if (_elements.intervalMinutes) _elements.intervalMinutes.value = fixedInterval;
        if (_elements.lockMinutes) _elements.lockMinutes.value = fixedLock;

        validateAndShowErrors();
    }

    // 更新下次提醒显示
    function updateNextReminderAfterConfigChange() {
        if (ReminderModule.isReminderRunning()) {
            const now = new Date();
            const config = Config.load();
            const next = ReminderModule.calculateNextReminder(now, config);
            ReminderModule.setNextReminderTime(next.getTime());
            UIModule.updateNextReminderDisplay(next.getTime());
        }
    }

    // 绑定事件
    function bindEvents() {
        // 提醒间隔
        _elements.intervalMinutes?.addEventListener('blur', () => {
            fixValues();
            updateNextReminderAfterConfigChange();
        });

        // 锁屏时长
        _elements.lockMinutes?.addEventListener('blur', fixValues);

        // 开始时间
        _elements.startTime?.addEventListener('change', () => {
            Config.save();
            updateNextReminderAfterConfigChange();
        });

        // 结束时间
        _elements.endTime?.addEventListener('change', () => {
            Config.save();
            updateNextReminderAfterConfigChange();
        });

        // 声音开关
        _elements.soundToggle?.addEventListener('change', () => {
            Config.save();
            AudioModule.setEnabled(_elements.soundToggle.checked);
        });

        // 强制锁屏
        _elements.forceLockToggle?.addEventListener('change', () => Config.save());

        // 通知类型切换
        if (_elements.desktopNotification && _elements.lockNotification) {
            _elements.desktopNotification.addEventListener('change', (e) => {
                if (e.target.checked) {
                    Config.updateNotificationHint('desktop');
                    toggleLockSettings('desktop');
                    Config.save();
                }
            });

            _elements.lockNotification.addEventListener('change', (e) => {
                if (e.target.checked) {
                    Config.updateNotificationHint('lock');
                    toggleLockSettings('lock');
                    Config.save();
                }
            });
        }

        // 折叠功能
        document.querySelectorAll('.card-title').forEach(title => {
            title.addEventListener('click', () => {
                const targetId = title.dataset.target;
                if (targetId) {
                    const content = document.getElementById(targetId);
                    const icon = title.querySelector('.collapse-icon');
                    if (content && icon) {
                        content.classList.toggle('hidden');
                        icon.textContent = content.classList.contains('hidden') ? '▶' : '▼';
                    }
                }
            });
        });

        logger.info('Events bound');
    }

    // 初始化免打扰设置
    function initDoNotDisturb() {
        const dndToggle = document.getElementById('dndToggle');
        const lunchBreakToggle = document.getElementById('lunchBreakToggle');
        const lunchStart = document.getElementById('lunchStart');
        const lunchEnd = document.getElementById('lunchEnd');
        const addBreakBtn = document.getElementById('addBreakBtn');
        const customBreaksList = document.getElementById('customBreaksList');

        // 加载配置
        const defaultLunchStart = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_LUNCH_START : '12:00';
        const defaultLunchEnd = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_LUNCH_END : '14:00';
        const dnd = config.doNotDisturb || { enabled: false, lunchBreak: { enabled: true, start: defaultLunchStart, end: defaultLunchEnd }, customBreaks: [] };

        if (dndToggle) dndToggle.checked = dnd.enabled;
        if (lunchBreakToggle) lunchBreakToggle.checked = dnd.lunchBreak?.enabled !== false;
        if (lunchStart) lunchStart.value = dnd.lunchBreak?.start || defaultLunchStart;
        if (lunchEnd) lunchEnd.value = dnd.lunchBreak?.end || defaultLunchEnd;

        // 渲染自定义时段列表
        renderCustomBreaks(dnd.customBreaks || []);

        // 事件监听
        if (dndToggle) {
            dndToggle.addEventListener('change', () => {
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                newConfig.doNotDisturb.enabled = dndToggle.checked;
                Config.save();
            });
        }

        if (lunchBreakToggle) {
            lunchBreakToggle.addEventListener('change', () => {
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                newConfig.doNotDisturb.lunchBreak = {
                    enabled: lunchBreakToggle.checked,
                    start: lunchStart?.value || defaultLunchStart,
                    end: lunchEnd?.value || defaultLunchEnd
                };
                Config.save();
            });
        }

        if (lunchStart) {
            lunchStart.addEventListener('change', () => {
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                if (!newConfig.doNotDisturb.lunchBreak) newConfig.doNotDisturb.lunchBreak = { enabled: true, start: defaultLunchStart, end: defaultLunchEnd };
                newConfig.doNotDisturb.lunchBreak.start = lunchStart.value;
                Config.save();
            });
        }

        if (lunchEnd) {
            lunchEnd.addEventListener('change', () => {
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                if (!newConfig.doNotDisturb.lunchBreak) newConfig.doNotDisturb.lunchBreak = { enabled: true, start: defaultLunchStart, end: defaultLunchEnd };
                newConfig.doNotDisturb.lunchBreak.end = lunchEnd.value;
                Config.save();
            });
        }

        if (addBreakBtn) {
            addBreakBtn.addEventListener('click', () => {
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                if (!newConfig.doNotDisturb.customBreaks) newConfig.doNotDisturb.customBreaks = [];
                
                // 限制最多5个自定义时段
                const maxCustomBreaks = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.MAX_CUSTOM_BREAKS : 5;
                
                if (newConfig.doNotDisturb.customBreaks.length >= maxCustomBreaks) {
                    if (typeof AutoCloseDialog !== 'undefined') {
                        AutoCloseDialog.show({
                            title: '提示',
                            message: `最多只能添加${maxCustomBreaks}个自定义时段`,
                            autoClose: 2000,
                            confirmColor: '#f59e0b'
                        });
                    } else {
                        alert(`最多只能添加${maxCustomBreaks}个自定义时段`);
                    }
                    return;
                }
                
                const defaultStart = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_START : '14:00';
                const defaultEnd = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_END : '15:00';
                const defaultName = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_NAME : '新时段';
                
                newConfig.doNotDisturb.customBreaks.push({ start: defaultStart, end: defaultEnd, name: defaultName });
                Config.save();
                renderCustomBreaks(newConfig.doNotDisturb.customBreaks);
            });
        }
    }

    function renderCustomBreaks(breaks) {
        const container = document.getElementById('customBreaksList');
        if (!container) return;

        if (!breaks || breaks.length === 0) {
            container.innerHTML = '<div class="break-empty" style="color:#94a3b8; font-size:12px; text-align:center; padding:8px;">暂无自定义时段，点击 + 添加</div>';
            return;
        }

        container.innerHTML = breaks.map((breakItem, index) => `
        <div class="break-item" data-index="${index}">
            <input type="text" class="break-name" value="${breakItem.name || '时段'}" placeholder="名称" data-field="name">
            <input type="time" class="break-start" value="${breakItem.start}" data-field="start">
            <span>—</span>
            <input type="time" class="break-end" value="${breakItem.end}" data-field="end">
            <button class="remove-break" data-index="${index}">✕</button>
        </div>
    `).join('');

        // 绑定事件
        container.querySelectorAll('.break-name, .break-start, .break-end').forEach(input => {
            input.addEventListener('change', function () {
                const breakItemDiv = this.closest('.break-item');
                const index = parseInt(breakItemDiv.dataset.index);
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                if (newConfig.doNotDisturb.customBreaks[index]) {
                    const field = this.dataset.field;
                    newConfig.doNotDisturb.customBreaks[index][field] = this.value;
                    Config.save();
                }
            });
        });

        container.querySelectorAll('.remove-break').forEach(btn => {
            btn.addEventListener('click', function () {
                const index = parseInt(this.dataset.index);
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) newConfig.doNotDisturb = { enabled: false, lunchBreak: {}, customBreaks: [] };
                newConfig.doNotDisturb.customBreaks.splice(index, 1);
                Config.save();
                renderCustomBreaks(newConfig.doNotDisturb.customBreaks);
            });
        });
    }

    // 初始化
    function init(elements) {
        if (_isInitialized) {
            logger.warn('Already initialized');
            return;
        }

        _elements = elements;

        // 挂载到 window 供 config.js 调用
        window.toggleLockSettings = toggleLockSettings;

        bindEvents();

        _isInitialized = true;
        logger.info('UIController initialized');
    }

    // 获取元素
    function getElements() {
        return _elements;
    }

    return {
        init,
        getElements,
        toggleLockSettings,
        validateAndShowErrors,
        fixValues,
        updateNextReminderAfterConfigChange
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}
if (typeof window !== 'undefined') {
    window.UIController = UIController;
}