const Config = (function () {
    let _config = null;
    let _elements = {};
    let _listeners = [];
    let _logger = Logger ? Logger.createLogger('Config') : console;

    // 从本地文件加载
    function loadFromFile() {
        if (!FileSystemManager || !FileSystemManager.isUsingLocalFile()) return null;

        return ErrorHandler.safeExecute(() => {
            const fileSystemUtil = FileSystemManager.getFileSystemUtil();
            if (!fileSystemUtil) return null;

            const filePath = FileSystemManager.buildFilePath(CONFIG.FILES.CONFIG);
            if (!filePath) return null;

            const data = fileSystemUtil.readFile(filePath);
            if (data) {
                const parsedData = JSON.parse(data);
                _logger.info('Config loaded from file:', parsedData);
                return parsedData;
            }
            return null;
        }, 'Config.loadFromFile');
    }

    // 保存到本地文件
    function saveToFile(data) {
        if (!FileSystemManager || !FileSystemManager.isUsingLocalFile()) return false;

        return ErrorHandler.safeExecute(() => {
            const fileSystemUtil = FileSystemManager.getFileSystemUtil();
            if (!fileSystemUtil) return false;

            const filePath = FileSystemManager.buildFilePath(CONFIG.FILES.CONFIG);
            if (!filePath) return false;

            _logger.info('Config: Attempting to save to:', filePath);
            const result = fileSystemUtil.writeFile(filePath, JSON.stringify(data, null, 2));
            if (result) {
                _logger.info('Config saved to file:', filePath);
            } else {
                _logger.error('Config: Failed to save to file:', filePath);
            }
            return result;
        }, 'Config.saveToFile', false);
    }

    function setElements(elements) {
        _elements = elements;
        // 初始化文件系统
        if (FileSystemManager) {
            FileSystemManager.init();
        }
    }


    function load() {
        // 初始化文件系统
        if (FileSystemManager) {
            FileSystemManager.init();
        }

        // 使用 CONFIG 常量作为默认值
        const defaults = {
            startTime: '08:00',
            endTime: '18:00',
            intervalMinutes: CONFIG ? CONFIG.TIME.DEFAULT_INTERVAL : 40,
            lockMinutes: CONFIG ? CONFIG.TIME.DEFAULT_LOCK : 5,
            forceLock: CONFIG ? CONFIG.DEFAULTS.FORCE_LOCK : false,
            systemLock: CONFIG ? CONFIG.DEFAULTS.SYSTEM_LOCK : false,
            soundEnabled: CONFIG ? CONFIG.DEFAULTS.SOUND_ENABLED : true,
            notificationType: CONFIG ? CONFIG.NOTIFICATION_TYPE.DESKTOP : 'desktop',

            // 免打扰配置
            doNotDisturb: {
                enabled: CONFIG ? CONFIG.DEFAULTS.DO_NOT_DISTURB_ENABLED : false,
                lunchBreak: {
                    start: CONFIG ? CONFIG.DO_NOT_DISTURB.DEFAULT_LUNCH_START : '12:00',
                    end: CONFIG ? CONFIG.DO_NOT_DISTURB.DEFAULT_LUNCH_END : '14:00'
                },
                customBreaks: []  // [{ start: '14:00', end: '15:00', name: '会议' }]
            }
        };

        let saved = null;

        // 优先从本地文件读取
        if (FileSystemManager && FileSystemManager.isUsingLocalFile()) {
            saved = loadFromFile();
        }

        // 回退到 localStorage
        if (!saved) {
            const localStorageData = localStorage.getItem('healthAlarmConfig');
            if (localStorageData) {
                try {
                    saved = JSON.parse(localStorageData);
                } catch (e) {
                    _logger.warn('Failed to parse localStorage data:', e);
                }
            }
        }

        if (saved) {
            _config = { ...defaults, ...saved };
            // 兼容旧版本：如果有 notificationEnabled 字段，转换为 notificationType
            if (_config.notificationEnabled !== undefined) {
                if (!_config.notificationType) {
                    _config.notificationType = _config.notificationEnabled ? 'desktop' : 'lock';
                }
                delete _config.notificationEnabled;
            }
        } else {
            _config = { ...defaults };
        }

        // 同步到DOM
        if (_elements.startTime) _elements.startTime.value = _config.startTime;
        if (_elements.endTime) _elements.endTime.value = _config.endTime;
        if (_elements.intervalMinutes) _elements.intervalMinutes.value = _config.intervalMinutes;
        if (_elements.lockMinutes) _elements.lockMinutes.value = _config.lockMinutes;
        if (_elements.forceLockToggle) _elements.forceLockToggle.checked = _config.forceLock;
        if (_elements.systemLockToggle) _elements.systemLockToggle.checked = _config.systemLock;
        if (_elements.soundToggle) _elements.soundToggle.checked = _config.soundEnabled;

        // 设置通知类型单选按钮
        if (_elements.desktopNotification && _elements.lockNotification) {
            _elements.desktopNotification.checked = (_config.notificationType === 'desktop');
            _elements.lockNotification.checked = (_config.notificationType === 'lock');
            updateNotificationHint(_config.notificationType);

            if (typeof window.toggleLockSettings === 'function') {
                window.toggleLockSettings(_config.notificationType);
            }
        }

        _logger.info('Config loaded:', _config);
        return { ..._config };
    }


    function save() {
        if (!_config) {
            _config = {};
        }

        if (_elements.startTime) _config.startTime = _elements.startTime.value;
        if (_elements.endTime) _config.endTime = _elements.endTime.value;
        if (_elements.intervalMinutes) _config.intervalMinutes = parseInt(_elements.intervalMinutes.value);
        if (_elements.lockMinutes) _config.lockMinutes = parseInt(_elements.lockMinutes.value);
        if (_elements.forceLockToggle) _config.forceLock = _elements.forceLockToggle.checked;
        if (_elements.systemLockToggle) _config.systemLock = _elements.systemLockToggle.checked;
        if (_elements.soundToggle) _config.soundEnabled = _elements.soundToggle.checked;

        // 保存通知类型
        if (_elements.desktopNotification && _elements.desktopNotification.checked) {
            _config.notificationType = 'desktop';
        } else if (_elements.lockNotification && _elements.lockNotification.checked) {
            _config.notificationType = 'lock';
        }

        // 同时保存到 localStorage 和本地文件
        localStorage.setItem('healthAlarmConfig', JSON.stringify(_config));

        if (FileSystemManager && FileSystemManager.isUsingLocalFile()) {
            saveToFile(_config);
        }

        _logger.info('Config saved');
        _listeners.forEach(fn => fn({ ..._config }));

        return { ..._config };
    }

    // 更新通知提示文字
    function updateNotificationHint(type) {
        const hintEl = document.getElementById('notificationHint');
        if (hintEl) {
            if (type === 'desktop') {
                hintEl.innerHTML = '💡 桌面通知：弹窗提醒（需开启系统通知权限）';
            } else {
                hintEl.innerHTML = '💡 锁屏通知：全屏锁屏，强制休息';
            }
        }
    }


    function get(key) {
        return _config ? _config[key] : null;
    }

    function set(key, value) {
        if (_config) {
            _config[key] = value;
            save();
        }
    }

    function subscribe(listener) {
        _listeners.push(listener);
        return () => {
            _listeners = _listeners.filter(l => l !== listener);
        };
    }


    // 校验函数使用 CONFIG 常量
    function validateInterval(value, min, max) {
        const num = parseInt(value);
        const defaultMin = CONFIG ? CONFIG.TIME.MIN_INTERVAL : 10;
        const defaultMax = CONFIG ? CONFIG.TIME.MAX_INTERVAL : 300;
        const finalMin = min !== undefined ? min : defaultMin;
        const finalMax = max !== undefined ? max : defaultMax;
        return !isNaN(num) && num >= finalMin && num <= finalMax;
    }

    function validateLockMinutes(value, min, max) {
        const num = parseInt(value);
        const defaultMin = CONFIG ? CONFIG.TIME.MIN_LOCK : 1;
        const defaultMax = CONFIG ? CONFIG.TIME.MAX_LOCK : 120;
        const finalMin = min !== undefined ? min : defaultMin;
        const finalMax = max !== undefined ? max : defaultMax;
        return !isNaN(num) && num >= finalMin && num <= finalMax;
    }

    function fixIntervalValue(value, min, max, step) {
        let num = parseInt(value);
        const defaultMin = CONFIG ? CONFIG.TIME.MIN_INTERVAL : 10;
        const defaultMax = CONFIG ? CONFIG.TIME.MAX_INTERVAL : 300;
        const defaultInterval = CONFIG ? CONFIG.TIME.DEFAULT_INTERVAL : 40;
        const finalMin = min !== undefined ? min : defaultMin;
        const finalMax = max !== undefined ? max : defaultMax;
        const finalStep = step !== undefined ? step : 5;  // 步长5分钟

        if (isNaN(num)) return defaultInterval;
        if (num < finalMin) return finalMin;
        if (num > finalMax) return finalMax;
        return Math.round(num / finalStep) * finalStep;
    }

    function fixLockValue(value, min, max) {
        let num = parseInt(value);
        const defaultMin = CONFIG ? CONFIG.TIME.MIN_LOCK : 1;
        const defaultMax = CONFIG ? CONFIG.TIME.MAX_LOCK : 120;
        const defaultLock = CONFIG ? CONFIG.TIME.DEFAULT_LOCK : 5;
        const finalMin = min !== undefined ? min : defaultMin;
        const finalMax = max !== undefined ? max : defaultMax;

        if (isNaN(num)) return defaultLock;
        if (num < finalMin) return finalMin;
        if (num > finalMax) return finalMax;
        return num;
    }


    return {
        setElements,
        load,
        save,
        get,
        set,
        subscribe,
        validateInterval,
        validateLockMinutes,
        fixIntervalValue,
        fixLockValue,
        updateNotificationHint
    };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.Config = Config;
}