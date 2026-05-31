// scripts/build-web.js

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src', 'renderer');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

console.log('🔨 Building web version for GitHub Pages...\n');

// ========== 1. 清空并创建 docs 目录 ==========
if (fs.existsSync(DOCS_DIR)) {
    fs.rmSync(DOCS_DIR, { recursive: true, force: true });
    console.log('  🗑️  Cleared docs/ directory');
}
fs.mkdirSync(DOCS_DIR, { recursive: true });
console.log('  📁 Created docs/ directory\n');

// ========== 2. 复制静态资源 ==========
console.log('📦 Copying static assets...');

const staticItems = [
    { src: 'css', dest: 'css', fromSrc: true },
    { src: 'icons', dest: 'icons', fromSrc: true },
    { src: 'js', dest: 'js', fromSrc: true },
    { src: 'manifest.json', dest: 'manifest.json', fromSrc: false }  // 从根目录复制
];

staticItems.forEach(item => {
    const src = item.fromSrc
        ? path.join(SRC_DIR, item.src)
        : path.join(ROOT_DIR, item.src);
    const dest = path.join(DOCS_DIR, item.dest);

    if (fs.existsSync(src)) {
        if (fs.statSync(src).isDirectory()) {
            copyRecursive(src, dest);
        } else {
            fs.copyFileSync(src, dest);
        }
        console.log(`  ✅ ${item.src}`);
    } else {
        console.log(`  ⚠️  Missing: ${item.src}`);
    }
});

// ========== 3. 创建 Web 适配脚本 ==========
console.log('\n📝 Creating web adapter...');


const webAdapter = `// Web 适配层 - 模拟 Electron 环境并修复锁屏功能
(function() {
    console.log('[Web Adapter] Initializing...');
    
    // 存储锁屏窗口引用
    var _lockWindow = null;
    var _soundInterval = null;
    var _audioContext = null;
    
    // ========== 停止声音 ==========
    function stopSound() {
        if (_soundInterval) {
            clearInterval(_soundInterval);
            _soundInterval = null;
        }
        if (_audioContext) {
            _audioContext.close();
            _audioContext = null;
        }
        console.log('[Web Adapter] Sound stopped');
    }
    
    // ========== 播放声音 ==========
    function playBeep() {
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!_audioContext) {
                _audioContext = new AudioContext();
            }
            if (_audioContext.state === 'suspended') {
                _audioContext.resume();
            }
            var osc = _audioContext.createOscillator();
            var gain = _audioContext.createGain();
            osc.connect(gain);
            gain.connect(_audioContext.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, _audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, _audioContext.currentTime + 0.3);
            osc.start();
            osc.stop(_audioContext.currentTime + 0.3);
        } catch(e) {
            console.warn('[Web Adapter] Sound failed:', e);
        }
    }
    
    // ========== 注意：不模拟 require，让代码走 Web 分支 ==========
    // 但是需要保留 ipcRenderer 等功能供其他模块使用
    window._webIPC = {
        send: function(channel, ...args) {
            console.log('[Web Adapter] IPC send:', channel, args);
            if (channel === 'show-lock') {
                var duration = args[0] || 60;
                var forceLock = args[1] || false;
                var url = 'lock.html?duration=' + duration + '&forceLock=' + forceLock;
                _lockWindow = window.open(url, '_blank', 'width=' + screen.width + ',height=' + screen.height + ',top=0,left=0');
            }
            if (channel === 'hide-lock') {
                if (_lockWindow && !_lockWindow.closed) {
                    _lockWindow.close();
                }
                _lockWindow = null;
                stopSound();
            }
            if (channel === 'stop-sound-request') {
                stopSound();
            }
        },
        sendSync: function() { return null; },
        on: function(channel, callback) {
            if (!window._ipcCallbacks) window._ipcCallbacks = {};
            if (!window._ipcCallbacks[channel]) window._ipcCallbacks[channel] = [];
            window._ipcCallbacks[channel].push(callback);
        }
    };
    
    // ========== 触发 IPC 回调 ==========
    window.triggerIPC = function(channel, ...args) {
        console.log('[Web Adapter] triggerIPC:', channel);
        if (window._ipcCallbacks && window._ipcCallbacks[channel]) {
            window._ipcCallbacks[channel].forEach(function(cb) {
                try { cb(null, ...args); } catch(e) {}
            });
        }
        if (channel === 'lock-closed' || channel === 'stop-sound') {
            stopSound();
            _lockWindow = null;
        }
    };
    
    // ========== 模拟文件系统模块 ==========
    window.FileSystemManager = window.FileSystemManager || {
        init: function() { return false; },
        isUsingLocalFile: function() { return false; },
        getFileSystemUtil: function() { return null; },
        buildFilePath: function() { return null; },
        getDataPath: function() { return null; }
    };
    
    window.FileSystemUtil = window.FileSystemUtil || {
        init: function() { return false; },
        getRootPath: function() { return null; },
        ensureDir: function() { return false; },
        readFile: function() { return null; },
        writeFile: function() { return false; }
    };
    
    // ========== 模拟 AudioModule ==========
    if (!window.AudioModule) {
        window.AudioModule = {
            setEnabled: function() {},
            setLockedGetter: function() {},
            playAlert: function() { playBeep(); },
            startContinuous: function() {
                stopSound();
                playBeep();
                _soundInterval = setInterval(function() {
                    playBeep();
                }, 3000);
                console.log('[Web Adapter] Continuous sound started');
            },
            stopContinuous: function() { 
                stopSound(); 
                console.log('[Web Adapter] Continuous sound stopped');
            },
            resume: function() { return Promise.resolve(); }
        };
    }
    
    // ========== 模拟 NotificationModule ==========
    if (!window.NotificationModule) {
        window.NotificationModule = {
            init: function() { return Promise.resolve(false); },
            initWithoutWait: function() {},
            setEnabled: function() {},
            send: function() { return Promise.resolve(false); },
            sendReminder: function() { return Promise.resolve(false); },
            sendTest: function() { return Promise.resolve(false); }
        };
    }
    
    // ========== 修复 ReminderModule ==========
    var fixReminder = function() {
        if (!window.ReminderModule) return false;
        
        console.log('[Web Adapter] Fixing ReminderModule for Web...');
        
        // 保存原始方法
        var originalShowLockScreen = window.ReminderModule.showLockScreen;
        var originalCloseLockScreen = window.ReminderModule.closeLockScreen;
        
        // 重写 showLockScreen - 使用 window.open 而不是 IPC
        window.ReminderModule.showLockScreen = function(minutes, forceLock, onComplete) {
            console.log('[Web Adapter] showLockScreen:', minutes, 'minutes, forceLock:', forceLock);
            
            var totalSeconds = minutes * 60;
            var url = 'lock.html?duration=' + totalSeconds + '&forceLock=' + forceLock;
            
            console.log('[Web Adapter] Opening lock window:', url);
            _lockWindow = window.open(url, '_blank', 'width=' + screen.width + ',height=' + screen.height + ',top=0,left=0');
            
            // 监听窗口关闭
            var checkClosed = setInterval(function() {
                if (_lockWindow && _lockWindow.closed) {
                    clearInterval(checkClosed);
                    console.log('[Web Adapter] Lock window closed by user');
                    stopSound();
                    window.triggerIPC('lock-closed');
                    if (onComplete) onComplete();
                    _lockWindow = null;
                }
            }, 500);
        };
        
        // 重写 closeLockScreen
        window.ReminderModule.closeLockScreen = function() {
            console.log('[Web Adapter] closeLockScreen');
            if (_lockWindow && !_lockWindow.closed) {
                _lockWindow.close();
            }
            _lockWindow = null;
            stopSound();
        };
        
        // 重写 isCurrentlyLocked
        window.ReminderModule.isCurrentlyLocked = function() {
            return _lockWindow && !_lockWindow.closed;
        };
        
        return true;
    };
    
    // 等待 ReminderModule 加载
    if (window.ReminderModule) {
        fixReminder();
    } else {
        var checkCount = 0;
        var checkInterval = setInterval(function() {
            checkCount++;
            if (window.ReminderModule) {
                fixReminder();
                clearInterval(checkInterval);
            } else if (checkCount > 50) {
                clearInterval(checkInterval);
            }
        }, 100);
    }
    
    // ========== 确保 Config 有 updateNotificationHint ==========
    if (window.Config && !window.Config.updateNotificationHint) {
        window.Config.updateNotificationHint = function(type) {
            var hintEl = document.getElementById('notificationHint');
            if (hintEl) {
                hintEl.innerHTML = type === 'desktop' 
                    ? '💡 桌面通知：弹窗提醒，不锁屏' 
                    : '💡 锁屏通知：全屏锁屏，强制休息';
            }
        };
    }
    
    // ========== 禁用 Service Worker ==========
    if ('serviceWorker' in navigator) {
        var originalRegister = navigator.serviceWorker.register;
        navigator.serviceWorker.register = function() {
            console.log('[Web Adapter] Service Worker disabled');
            return Promise.reject(new Error('Service Worker disabled'));
        };
    }
    
    // ========== 全局错误处理 ==========
    window.addEventListener('error', function(e) {
        if (e.message && e.message.includes('require')) {
            console.warn('[Web Adapter] Caught require error:', e.message);
            e.preventDefault();
            return true;
        }
    });
    
    console.log('[Web Adapter] Initialized for Web');
})();`;


fs.writeFileSync(path.join(DOCS_DIR, 'js', 'web-adapter.js'), webAdapter);
console.log('  ✅ js/web-adapter.js');

// ========== 4. 处理 HTML 文件 ==========
console.log('\n📄 Processing HTML files...');

// 处理 index.html
const indexSrc = path.join(SRC_DIR, 'index.html');
const indexDest = path.join(DOCS_DIR, 'index.html');

if (fs.existsSync(indexSrc)) {
    let html = fs.readFileSync(indexSrc, 'utf-8');
    html = processHTML(html, 'index');
    fs.writeFileSync(indexDest, html, 'utf-8');
    console.log('  ✅ index.html');
}

// 处理 lock.html
const lockSrc = path.join(SRC_DIR, 'lock.html');
const lockDest = path.join(DOCS_DIR, 'lock.html');

if (fs.existsSync(lockSrc)) {
    let html = fs.readFileSync(lockSrc, 'utf-8');
    html = processHTML(html, 'lock');
    fs.writeFileSync(lockDest, html, 'utf-8');
    console.log('  ✅ lock.html');
}

// ========== 5. 创建配置文件 ==========
console.log('\n⚙️  Creating configuration files...');

fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '');
fs.writeFileSync(path.join(DOCS_DIR, 'robots.txt'), `User-agent: *
Allow: /
`);
// 创建 CNAME 文件
fs.writeFileSync(path.join(DOCS_DIR, 'CNAME'), 'clock.pengline.cn');
console.log('  ✅ .nojekyll, robots.txt, CNAME');

console.log('\n✨ Web build complete!');
console.log(`📂 Output: ${DOCS_DIR}`);
console.log('🌐 Domain: clock.pengline.cn');
console.log('🧪 Test: npx serve docs\n');

// ========== 辅助函数 ==========

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function processHTML(html, type) {
    // 1. 插入 Web 适配脚本
    html = html.replace(
        /<script src="\.\/js\/shared\/constants\.js">/,
        '<script src="./js/web-adapter.js"></script>\n    <script src="./js/shared/constants.js">'
    );

    // 2. 添加 Web 提示条（放在 body 最顶部，所有内容之上）
    const webNotice = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 8px 16px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 16px; position: fixed; top: 0; left: 0; right: 0; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <span>⚡ Web 演示版 - 完整功能请下载桌面版</span>
        <a href="https://github.com/neopen/active-break-clock/releases" target="_blank" style="background: white; color: #667eea; padding: 4px 16px; border-radius: 20px; text-decoration: none; font-weight: 600; font-size: 12px;">📥 下载</a>
    </div>`;

    html = html.replace('<body>', '<body>\n' + webNotice);

    // 添加顶部内边距，防止内容被固定提示条遮挡
    if (type === 'index') {
        html = html.replace(
            '<div class="app-container">',
            '<div class="app-container" style="padding-top: 45px;">'
        );
    }
    if (type === 'lock') {
        html = html.replace(
            '<body>',
            '<body style="padding-top: 45px;">'
        );
    }

    // 3. 移除原有的下载桌面版链接
    html = html.replace(
        /<div class="status-bar-right">[\s\S]*?<\/div>/g,
        '<div class="status-bar-right"></div>'
    );

    // 4. 添加 Web 模式标识
    html = html.replace('<body', '<body data-mode="web"');

    // 5. 处理 lock.html
    // 在 processHTML 函数的 lock 部分
    if (type === 'lock') {
        const lockScript = `
    <script>
        (function() {
            console.log('[Lock Web] Setting up auto-close...');
            
            // 保存原始的 setInterval
            var originalSetInterval = window.setInterval;
            var timerIds = [];
            
            // 拦截 setInterval 以跟踪倒计时
            window.setInterval = function(callback, interval) {
                var id = originalSetInterval.call(window, function() {
                    callback();
                    // 检查倒计时是否结束
                    var secondsEl = document.getElementById('countdownSeconds');
                    if (secondsEl) {
                        var seconds = parseInt(secondsEl.innerText) || 0;
                        if (seconds <= 1) {
                            console.log('[Lock Web] Countdown finished, closing...');
                            setTimeout(function() {
                                if (typeof closeLockWindow === 'function') {
                                    closeLockWindow();
                                } else {
                                    window.close();
                                }
                            }, 200);
                        }
                    }
                }, interval);
                timerIds.push(id);
                return id;
            };
            
            // 重写 closeLockWindow
            var originalClose = window.closeLockWindow;
            window.closeLockWindow = function() {
                console.log('[Lock Web] closeLockWindow called');
                
                // 清理所有定时器
                timerIds.forEach(function(id) {
                    clearInterval(id);
                });
                timerIds = [];
                
                // 通知父窗口
                if (window.opener && !window.opener.closed) {
                    console.log('[Lock Web] Notifying opener');
                    if (window.opener.triggerIPC) {
                        window.opener.triggerIPC('lock-closed');
                        window.opener.triggerIPC('stop-sound');
                    }
                    if (window.opener.AudioModule) {
                        window.opener.AudioModule.stopContinuous();
                    }
                }
                
                if (originalClose) {
                    try { originalClose(); } catch(e) {}
                }
                
                window.close();
            };
            
            console.log('[Lock Web] Auto-close setup complete');
        })();
    </script>`;

        html = html.replace('</body>', lockScript + '\n</body>');
    }

    return html;
}