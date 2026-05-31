const { app, dialog } = require('electron');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let globalBlocker = null;
let isBlocking = false;

// 音量键列表
const volumeKeys = [
    'VolumeUp', 'VolumeDown', 'VolumeMute',
    'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute',
    'MediaVolumeUp', 'MediaVolumeDown', 'MediaVolumeMute'
];

// 判断是否是音量键
function isVolumeKey(keyName) {
    if (!keyName) return false;
    const keyLower = keyName.toLowerCase();
    return volumeKeys.some(vk => vk.toLowerCase() === keyLower) ||
        keyLower.includes('volume') ||
        keyLower.includes('audio');
}

// ========== Windows 平台 ==========
async function initWindowsBlocker() {
    try {
        // 尝试加载 node-global-key-listener
        const { GlobalKeyboardListener } = require('node-global-key-listener');
        globalBlocker = new GlobalKeyboardListener();

        globalBlocker.addListener((event, down) => {
            if (!isBlocking) return event;

            const keyName = event.name || event.rawKey || '';

            if (isVolumeKey(keyName)) {
                console.log('[KeyboardBlocker] Volume key allowed:', keyName);
                return event;
            }

            console.log('[KeyboardBlocker] Blocked key:', keyName);
            return null;
        });

        console.log('[KeyboardBlocker] Windows global blocker initialized');
        return true;
    } catch (error) {
        // console.error('[KeyboardBlocker] Failed to initialize Windows blocker:', error);
        // console.log('[KeyboardBlocker] Falling back to native Windows API');
        // return initWindowsNativeBlocker();

        console.log('[KeyboardBlocker] Native key listener not available, using fallback');
        return false;
    }
}

// Windows 原生 API 备用方案
function initWindowsNativeBlocker() {
    try {
        const { powertools } = require('node-powertools');
        // 使用 Windows 低级键盘钩子
        globalBlocker = {
            stop: () => {
                if (globalBlocker._hook) {
                    globalBlocker._hook.stop();
                }
            }
        };
        return true;
    } catch (error) {
        console.error('[KeyboardBlocker] Windows native blocker failed:', error);
        return false;
    }
}

// ========== macOS 平台 ==========
let macEventTap = null;

function initMacOSBlocker() {
    try {
        // 检查是否已获得辅助功能权限
        const hasAccess = checkMacOSAccessibility();

        if (!hasAccess) {
            console.log('[KeyboardBlocker] macOS Accessibility permission required');
            requestMacOSAccessibility();
            return false;
        }

        // 尝试加载原生模块
        try {
            const macBlocker = require('../native/mac-keyboard-blocker.node');
            globalBlocker = macBlocker.startBlocking((keyCode, isDown) => {
                if (!isBlocking) return true;

                // 检查是否是音量键 (macOS 音量键码: 100, 101, 102)
                const isVolume = (keyCode >= 100 && keyCode <= 102);

                if (isVolume) {
                    console.log('[KeyboardBlocker] Volume key allowed');
                    return true;
                }

                console.log('[KeyboardBlocker] Blocked key:', keyCode);
                return false;
            });
            return true;
        } catch (error) {
            console.log('[KeyboardBlocker] Native macOS module not available, using fallback');
            return false;
        }
    } catch (error) {
        console.log('[KeyboardBlocker] macOS blocker initialization failed, using fallback');
        return false;
    }
}

// 检查 macOS 辅助功能权限
function checkMacOSAccessibility() {
    try {
        const { execSync } = require('child_process');
        const result = execSync('sqlite3 ~/Library/Application\\ Support/com.apple.TCC/TCC.db "SELECT client FROM access WHERE service=\'kTCCServiceAccessibility\' AND client LIKE \'%\' || \'' + app.getPath('exe') + '\' || \'%\'" 2>/dev/null', { encoding: 'utf8' });
        return result.trim().length > 0;
    } catch (error) {
        return false;
    }
}

// 请求 macOS 辅助功能权限
function requestMacOSAccessibility() {
    dialog.showMessageBox({
        type: 'info',
        title: '需要辅助功能权限',
        message: '为了在锁屏期间阻止键盘操作，需要辅助功能权限。',
        detail: '请在系统设置 > 隐私与安全性 > 辅助功能中，添加并启用本应用。',
        buttons: ['打开系统设置', '稍后']
    }).then((result) => {
        if (result.response === 0) {
            execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
        }
    });
}

// ========== Linux 平台 ==========
function initLinuxBlocker() {
    try {
        // 检查 X11 或 Wayland
        const sessionType = process.env.XDG_SESSION_TYPE || 'x11';

        if (sessionType === 'x11') {
            return initLinuxX11Blocker();
        } else if (sessionType === 'wayland') {
            console.warn('[KeyboardBlocker] Wayland not fully supported, using fallback');
            return false;
        }

        return false;
    } catch (error) {
        console.log('[KeyboardBlocker] Linux blocker initialization failed, using fallback');
        return false;
    }
}

function initLinuxX11Blocker() {
    try {
        const x11 = require('x11');

        x11.createClient((err, display) => {
            if (err) {
                console.log('[KeyboardBlocker] X11 not available, using fallback');
                return;
            }

            const X = display.client;
            const root = display.screen[0].root;

            // 注册键盘事件捕获
            X.core.GrabKeyboard(root, true, X.eventMask.KeyPress | X.eventMask.KeyRelease, X.GrabModeAsync, X.GrabModeAsync, X.currentTime, (err, reply) => {
                if (err) {
                    console.log('[KeyboardBlocker] Keyboard grab failed, using fallback');
                    return;
                }

                console.log('[KeyboardBlocker] Linux X11 keyboard grabbed');

                X.on('event', (ev) => {
                    if (!isBlocking) return;

                    // 检查是否是音量键 (Linux 通常通过媒体键处理)
                    // 这里放行音量相关按键
                    if (ev.name && isVolumeKey(ev.name)) {
                        return;
                    }

                    // 阻止其他按键
                    ev.stopPropagation();
                });
            });

            globalBlocker = {
                stop: () => {
                    X.core.UngrabKeyboard(root, X.currentTime);
                    display.close();
                }
            };
        });

        return true;
    } catch (error) {
        console.log('[KeyboardBlocker] Linux X11 blocker failed, using fallback');
        return false;
    }
}

// ========== 备用方案：定期检查并强制焦点 ==========
let focusInterval = null;

function startFallbackBlocker() {
    console.log('[KeyboardBlocker] Starting fallback blocker');

    // 定期强制锁屏窗口获得焦点
    focusInterval = setInterval(() => {
        if (!isBlocking) return;

        const lockWindow = require('../windowManager').getLockWindow();
        if (lockWindow && !lockWindow.isDestroyed()) {
            lockWindow.focus();
            lockWindow.moveTop();
        }
    }, 100);

    return true;
}

function stopFallbackBlocker() {
    if (focusInterval) {
        clearInterval(focusInterval);
        focusInterval = null;
    }
}

// ========== 公共 API ==========

// 启动全局拦截
async function startBlocking() {
    if (isBlocking) {
        console.log('[KeyboardBlocker] Already blocking');
        return true;
    }

    console.log('[KeyboardBlocker] Starting global keyboard blocking on', process.platform);

    let success = false;
    switch (process.platform) {
        case 'win32':
            success = await initWindowsBlocker();
            break;
        case 'darwin':
            success = initMacOSBlocker();
            break;
        case 'linux':
            success = initLinuxBlocker();
            break;
        default:
            console.log('[KeyboardBlocker] Unsupported platform:', process.platform);
    }

    // 如果原生拦截失败，启动备用方案
    if (!success) {
        console.log('[KeyboardBlocker] Native blocker failed, using fallback');
        success = startFallbackBlocker();
    }

    if (success) {
        isBlocking = true;
        console.log('[KeyboardBlocker] Global blocking ACTIVE');
    } else {
        console.log('[KeyboardBlocker] All blocking methods failed');
    }

    return success;
}

// 停止全局拦截
function stopBlocking() {
    if (!isBlocking) {
        console.log('[KeyboardBlocker] Not blocking');
        return;
    }

    console.log('[KeyboardBlocker] Stopping global keyboard blocking...');

    if (globalBlocker && typeof globalBlocker.stop === 'function') {
        globalBlocker.stop();
    }

    stopFallbackBlocker();

    globalBlocker = null;
    isBlocking = false;
    console.log('[KeyboardBlocker] Global blocking STOPPED');
}

// 获取拦截状态
function isActive() {
    return isBlocking;
}

module.exports = {
    startBlocking,
    stopBlocking,
    isActive
};