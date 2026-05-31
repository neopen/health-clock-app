// scripts/build-web.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src/renderer');
const DOCS = path.join(__dirname, '../docs');

// 清空并创建 docs
if (fs.existsSync(DOCS)) fs.rmSync(DOCS, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });

// 复制所有文件
copyDir(SRC, DOCS);

// 创建 web-adapter.js
const webAdapter = `// Web 适配层
(function() {
    console.log('[Web] Init');
    var _lockWindow = null, _soundInterval = null;
    function stopSound() { if(_soundInterval) clearInterval(_soundInterval); }
    window.require = function(m) {
        if(m==='electron') return { ipcRenderer: {
            send: function(c, d, f) { if(c==='show-lock') _lockWindow = window.open('lock.html?duration='+d+'&forceLock='+f, '_blank'); },
            on: function(c, cb) { if(!window._ipc) window._ipc={}; if(!window._ipc[c]) window._ipc[c]=[]; window._ipc[c].push(cb); }
        }};
        return {};
    };
    window.triggerIPC = function(c) { if(window._ipc&&window._ipc[c]) window._ipc[c].forEach(cb=>cb()); if(c==='lock-closed') stopSound(); };
    window.FileSystemManager = { isUsingLocalFile: ()=>false };
    window.AudioModule = { startContinuous: ()=>{}, stopContinuous: ()=>{}, playAlert: ()=>{} };
    window.NotificationModule = { initWithoutWait: ()=>{}, sendReminder: ()=>{} };
    if('serviceWorker' in navigator) navigator.serviceWorker.register = ()=>Promise.reject();
    console.log('[Web] Ready');
})();`;
fs.writeFileSync(path.join(DOCS, 'js/web-adapter.js'), webAdapter);

// 处理 index.html
let indexHtml = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf-8');
indexHtml = indexHtml.replace(
    '<script src="./js/shared/constants.js">',
    '<script src="./js/web-adapter.js"></script>\n    <script src="./js/shared/constants.js">'
);
indexHtml = indexHtml.replace(
    '<body>',
    '<body data-mode="web">\n<div style="background:#667eea;color:white;text-align:center;padding:8px;position:fixed;top:0;left:0;right:0;z-index:10000;">⚡ Web 演示版 · <a href="https://github.com/neopen/active-break-clock/releases" target="_blank" style="color:white;text-decoration:underline;">下载桌面版</a></div>'
);
indexHtml = indexHtml.replace(
    '<div class="app-container">',
    '<div class="app-container" style="padding-top:45px;">'
);
fs.writeFileSync(path.join(DOCS, 'index.html'), indexHtml);

// 创建配置文件
fs.writeFileSync(path.join(DOCS, 'CNAME'), 'clock.pengline.cn');
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

console.log('Web build complete!');

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
}