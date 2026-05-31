const NotificationModule = (function () {
    let isEnabled = true;
    let permissionGranted = false;
    let _logger = typeof Logger !== 'undefined' ? Logger.createLogger('Notification') : console;
    let toastContainer = null;

    function isElectron() {
        return typeof window !== 'undefined' && !!window.require;
    }

    // 创建右下角弹框容器
    function ensureToastContainer() {
        if (toastContainer) return toastContainer;

        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    // 显示右下角弹框
    function showToast(title, body, duration = 5000) {
        ensureToastContainer();

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            min-width: 280px;
            max-width: 400px;
            animation: toastSlideIn 0.3s ease;
            pointer-events: auto;
            cursor: pointer;
            transition: all 0.3s ease;
        `;

        const titleEl = document.createElement('div');
        titleEl.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
        `;
        titleEl.textContent = title;

        const bodyEl = document.createElement('div');
        bodyEl.style.cssText = `
            font-size: 14px;
            opacity: 0.9;
            line-height: 1.4;
        `;
        bodyEl.textContent = body;

        toast.appendChild(titleEl);
        toast.appendChild(bodyEl);

        // 点击关闭
        toast.addEventListener('click', () => {
            removeToast(toast);
        });

        // 添加到容器
        toastContainer.appendChild(toast);

        // 自动消失
        setTimeout(() => {
            removeToast(toast);
        }, duration);

        _logger.info('Toast notification shown:', title);

        return toast;
    }

    // 移除弹框
    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;

        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // 添加动画样式
    function addToastStyles() {
        if (document.getElementById('toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes toastSlideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes toastSlideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    async function init() {
        _logger.info('NotificationModule.init called');

        if (isElectron()) {
            // 在 Electron 环境中，直接设为 true，因为主进程有权限
            // 不需要通过 IPC 请求权限
            _logger.info('Electron environment detected, setting permissionGranted = true');
            permissionGranted = true;
            return true;
        }

        // 浏览器环境
        if (!('Notification' in window)) {
            _logger.warn('Notifications not supported');
            return false;
        }

        if (Notification.permission === 'granted') {
            permissionGranted = true;
            _logger.info('Notification permission already granted');
            return true;
        }

        if (Notification.permission !== 'denied') {
            _logger.info('Requesting notification permission');
            try {
                const permission = await Notification.requestPermission();
                permissionGranted = permission === 'granted';
                _logger.info('Notification permission result:', permission);
            } catch (e) {
                _logger.error('Error requesting permission:', e);
                permissionGranted = false;
            }
        } else {
            _logger.warn('Notification permission denied');
            permissionGranted = false;
        }

        return permissionGranted;
    }

    function initWithoutWait() {
        _logger.info('NotificationModule.initWithoutWait called');

        if (isElectron()) {
            _logger.info('Electron environment, setting permissionGranted = true');
            permissionGranted = true;
            return;
        }

        // 浏览器环境
        if (!('Notification' in window)) {
            _logger.warn('Notifications not supported');
            return;
        }

        if (Notification.permission === 'granted') {
            permissionGranted = true;
            _logger.info('Notification permission already granted');
            return;
        }

        if (Notification.permission !== 'denied') {
            _logger.info('Requesting notification permission (non-blocking)');
            Notification.requestPermission().then(permission => {
                permissionGranted = permission === 'granted';
                _logger.info('Notification permission result:', permission);
            }).catch(e => _logger.error('Notification request error:', e));
        }
    }

    function setEnabled(enabled) {
        isEnabled = enabled;
        _logger.info('Notification enabled set to:', enabled);
    }

    async function send(title, options = {}) {
        _logger.info('========== Sending notification ==========');
        _logger.info('Title:', title);
        _logger.info('Options:', options);
        _logger.info('isEnabled:', isEnabled);
        _logger.info('permissionGranted:', permissionGranted);
        _logger.info('isElectron:', isElectron());

        if (!isEnabled) {
            _logger.info('Notifications disabled in settings');
            return false;
        }

        // 在 Electron 环境中，通过主进程发送通知
        if (isElectron()) {
            try {
                const { ipcRenderer } = window.require('electron');

                const notificationOptions = {
                    title: title,
                    body: options.body || '',
                    silent: false,
                    requireInteraction: options.requireInteraction || false
                };

                _logger.info('Sending to main process:', notificationOptions);

                // 使用异步方式发送，避免阻塞
                ipcRenderer.send('show-notification-async', notificationOptions);
                _logger.info('Notification request sent to main process');
                return true;
            } catch (e) {
                _logger.error('Failed to send notification via IPC:', e);
                return false;
            }
        }

        // 浏览器环境 - 使用右下角弹框
        addToastStyles();
        showToast(title, options.body || '', 5000);
        _logger.info('Toast notification sent successfully');
        return true;
    }

    async function sendReminder() {
        _logger.info('Sending reminder notification');
        return await send('🧘 该活动啦！', {
            body: '站起来走走，伸个懒腰，活动一下筋骨吧！',
            tag: 'health-reminder',
            requireInteraction: true
        });
    }

    async function sendTest() {
        _logger.info('Sending test notification');
        return await send('🔔 测试通知', {
            body: '如果你看到这条消息，说明桌面通知已开启！',
            tag: 'test-notification',
            requireInteraction: false
        });
    }

    return {
        init,
        initWithoutWait,
        setEnabled,
        send,
        sendReminder,
        sendTest
    };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationModule;
}

if (typeof window !== 'undefined') {
    window.NotificationModule = NotificationModule;
}